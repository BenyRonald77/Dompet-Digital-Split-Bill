# Dompet Digital + Split Bill

Studi kasus system design: dompet digital dengan **ledger double-entry**,
**transfer atomik**, jaminan **saldo tidak pernah minus**, **idempotency key**
untuk mencegah transaksi dobel, dan **job rekonsiliasi harian**.

Lihat dokumen perencanaan lengkap di [`docs/PRD.md`](./docs/PRD.md).

## Konsep Inti

Saldo **tidak pernah diubah langsung**. Setiap top-up/transfer menulis
minimal 2 baris `LedgerEntry` (satu `DEBIT`, satu `CREDIT`) dengan jumlah
sama persis, dalam satu transaksi database. `Account.balanceCache` hanyalah
cache dari hasil hitung ulang ledger — bukan sumber kebenaran.

- **CREDIT** menambah saldo akun, **DEBIT** menguranginya.
- Akun sistem `EXTERNAL` adalah cermin semua akun pengguna: top-up = `DEBIT EXTERNAL` + `CREDIT user`. Karena setiap transaksi selalu berpasangan, **total debit sistem selalu sama dengan total kredit sistem** — inilah yang diverifikasi job rekonsiliasi.

## Fitur Utama

- **Top-up & transfer** — atomik, saldo pengirim dicek & dikurangi lewat satu `UPDATE` SQL bersyarat (`WHERE balance >= amount`), bukan read-then-write terpisah — inilah yang mencegah saldo minus walau ada beberapa transfer keluar dari akun yang sama berjalan bersamaan.
- **Idempotency key** — setiap top-up/transfer wajib menyertakan `idempotencyKey`. Request kedua dengan key yang sama dikembalikan hasil transaksi pertama (`idempotentReplay: true`), tidak diproses ulang.
- **Split Bill** — buat tagihan patungan dengan beberapa peserta & porsi masing-masing; tiap peserta melunasi porsinya lewat transfer idempotent ke pembuat tagihan.
- **Job rekonsiliasi harian** — memverifikasi total debit = total kredit sistem, serta saldo cache tiap akun = hasil hitung ulang dari ledger-nya.

## Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env
npm run prisma:migrate   # migrasi + seed (3 user: Andi, Budi, Citra, saldo awal 0)
npm run dev
```

Buka `http://localhost:3000/login`. Akun demo:
- `andi@dompet.test` / `andi123`
- `budi@dompet.test` / `budi123`
- `citra@dompet.test` / `citra123`

Gunakan fitur **Top-up** di dashboard untuk mengisi saldo, lalu coba **Transfer**
atau **Split Bill**.

## Verifikasi Invarian (sudah diuji saat pengembangan)

- **Idempotency**: dua request top-up dengan `idempotencyKey` sama hanya menambah saldo sekali.
- **Atomicity/tolak transfer**: transfer melebihi saldo ditolak dengan HTTP 400, saldo kedua pihak tidak berubah sama sekali.
- **Tidak pernah minus di bawah concurrency**: 10 transfer 10.000 dikirim **bersamaan** dari akun bersaldo 70.000 → hanya sejumlah yang bisa ditutupi saldo yang berhasil, saldo akhir tidak pernah negatif, dan total uang (pengirim + penerima) tetap konsisten.
- **Rekonsiliasi**: `npm run job:reconcile` pada data transaksi nyata melaporkan status **SEIMBANG** (total debit = total kredit).

## Job Rekonsiliasi Harian

Dua cara memicu (idempotent — aman dijalankan berkali-kali, tiap run
membuat satu baris `ReconciliationRun` baru untuk audit trail):

```bash
npm run job:reconcile
```

atau lewat endpoint HTTP terproteksi token untuk scheduler eksternal:

```bash
curl -X POST https://domain-anda.com/api/cron/reconcile \
  -H "x-cron-secret: <isi sesuai CRON_SECRET di .env>"
```

Contoh workflow terjadwal: [`.github/workflows/daily-reconciliation.yml`](./.github/workflows/daily-reconciliation.yml).

## Catatan Penting: SQLite vs PostgreSQL

SQLite (default development) mengunci **seluruh database** per penulisan
(single-writer) — di bawah beban tulis yang sangat tinggi dan bersamaan,
sebagian request bisa menunggu lama atau timeout. Ini bukan bug logika
ledger (invarian saldo tidak minus tetap terjamin oleh `UPDATE` atomik
bersyarat), melainkan karakteristik SQLite. **PostgreSQL** (disarankan untuk
production) mengunci per-baris sehingga jauh lebih baik menangani
concurrency tinggi. `.env.example` menyertakan `connection_limit=1` untuk
SQLite dev agar perilakunya stabil di bawah stress-test lokal.

## Struktur Proyek

```
docs/PRD.md                          Dokumen PRD
prisma/schema.prisma                 Skema ledger double-entry
prisma/seed.ts                        Data contoh (3 user, saldo awal 0)
scripts/reconcile.ts                  Script CLI job rekonsiliasi
src/lib/ledger-service.ts             Inti: top-up, transfer, atomicity, idempotency
src/lib/split-bill-service.ts         Logika split bill
src/lib/reconciliation-service.ts     Logika rekonsiliasi
src/app/dashboard, src/app/split-bills  UI
```

## Deployment

1. Set `DATABASE_URL` ke PostgreSQL (ubah `provider` di `prisma/schema.prisma`
   jadi `postgresql`, jalankan `npx prisma migrate deploy`), `JWT_SECRET`, `CRON_SECRET`.
2. Build: `npm run build`, jalankan: `npm start`.
3. Aktifkan scheduler eksternal untuk memanggil `/api/cron/reconcile` setiap hari.

## Catatan Keamanan

- Password di-hash dengan bcrypt.
- Response API split bill hanya mengembalikan field aman (`id`, `name`, `email`) — tidak pernah `passwordHash`.
- Ledger bersifat append-only — tidak ada endpoint yang mengubah/menghapus `LedgerEntry` secara langsung, hanya lewat `topUp`/`transfer` yang tervalidasi.
