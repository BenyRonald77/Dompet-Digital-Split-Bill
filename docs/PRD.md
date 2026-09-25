# PRD — Dompet Digital + Split Bill

| | |
|---|---|
| **Produk** | Dompet Digital + Split Bill |
| **Versi** | 1.0 |
| **Tanggal** | 25 September 2026 |
| **Pemilik Produk** | BenyRonald77 |

---

## 1. Tujuan

Studi kasus **system design** untuk sistem keuangan: dompet digital antar
pengguna dengan jaminan konsistensi data yang ketat.

1. Saldo dicatat lewat **ledger double-entry** — tidak ada satu angka
   "saldo" yang diubah langsung; saldo selalu turunan dari jumlah entri
   debit/kredit, sehingga setiap rupiah bisa ditelusuri asal-usulnya.
2. Transfer antar pengguna **atomik** — top-up/transfer tidak boleh membuat
   sistem berada di kondisi "uang hilang" atau "uang muncul dari udara".
3. Saldo **tidak boleh minus** — dicek dalam transaksi database yang sama
   dengan penulisan ledger (tidak ada celah race condition).
4. **Idempotency key** — top-up/transfer yang dikirim ulang (mis. karena
   client retry akibat timeout jaringan) tidak boleh tercatat dua kali.
5. **Job rekonsiliasi harian** — memverifikasi invarian akuntansi (total
   debit = total kredit, saldo cache konsisten dengan ledger) setiap hari.

## 2. Konsep Ledger

Setiap `Account` (dompet pengguna, atau akun sistem `EXTERNAL` untuk
top-up/withdrawal) punya baris `LedgerEntry` dengan arah `DEBIT`/`CREDIT`.
Konvensi yang dipakai (dari sudut pandang akun *pengguna*):

- **CREDIT** menambah saldo pengguna (uang masuk).
- **DEBIT** mengurangi saldo pengguna (uang keluar).

Akun `EXTERNAL` adalah cermin dari semua akun pengguna: setiap top-up
adalah `DEBIT EXTERNAL` + `CREDIT user`; setiap transfer adalah
`DEBIT pengirim` + `CREDIT penerima`. Karena setiap transaksi selalu punya
pasangan debit-kredit dengan jumlah sama, **total debit sistem = total
kredit sistem** setiap saat — inilah yang diverifikasi job rekonsiliasi.

## 3. Fitur MVP

1. Registrasi/login pengguna, setiap pengguna otomatis punya satu `Account`.
2. **Top-up**: menambah saldo dari luar sistem (simulasi, tanpa payment gateway sungguhan), idempotent.
3. **Transfer**: kirim saldo ke pengguna lain, atomik, menolak bila saldo tidak cukup, idempotent.
4. **Split Bill**: seseorang membuat tagihan patungan dengan beberapa peserta beserta porsi masing-masing; tiap peserta "melunasi" porsinya lewat transfer ke pembuat tagihan (idempotent per peserta).
5. Riwayat transaksi & mutasi ledger per pengguna.
6. **Job rekonsiliasi harian**: menjumlahkan seluruh ledger, memverifikasi total debit = total kredit dan saldo cache tiap akun = jumlah ledgernya; hasil dicatat & bisa dilihat admin.

## 4. Kebutuhan Fungsional

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-1 | Top-up & transfer selalu menulis ≥2 `LedgerEntry` yang jumlah debit & kreditnya sama, dalam satu transaksi database | Must |
| FR-2 | Transfer ditolak (tanpa efek samping) bila saldo pengirim tidak cukup, dicek dalam transaksi yang sama dengan penulisan ledger (bukan dicek lalu ditulis terpisah) | Must |
| FR-3 | Setiap operasi top-up/transfer menerima `idempotencyKey`; permintaan berulang dengan key sama mengembalikan hasil transaksi pertama, bukan memprosesnya lagi | Must |
| FR-4 | Split bill: peserta melunasi porsi via transfer idempotent; tagihan menampilkan status lunas/belum per peserta | Must |
| FR-5 | Job rekonsiliasi harian menghasilkan laporan: total debit, total kredit, status seimbang/tidak, daftar akun yang saldo cache-nya menyimpang dari ledger (seharusnya selalu kosong) | Must |
| FR-6 | Riwayat transaksi & saldo bisa dilihat pengguna yang login | Should |

## 5. Kebutuhan Non-Fungsional

| Kategori | Kebutuhan |
|---|---|
| **Konsistensi** | Balance check + penulisan ledger + update saldo cache terjadi dalam satu transaksi database (Prisma `$transaction` dengan isolation yang mencegah race condition saldo minus saat dua transfer bersamaan) |
| **Idempotensi** | `idempotencyKey` punya constraint unik di level database — percobaan kedua dengan key sama gagal insert dan sistem mengembalikan transaksi lama |
| **Auditability** | Ledger bersifat append-only (tidak ada update/delete entri); riwayat selalu bisa direkonstruksi ulang dari nol |

## 6. Arsitektur Teknis

- Next.js (TypeScript, App Router) + Prisma ORM (SQLite dev / PostgreSQL production).
- Entitas: `User`, `Account`, `LedgerTransaction` (header, menyimpan `idempotencyKey` unik), `LedgerEntry` (baris debit/kredit), `SplitBill`, `SplitBillParticipant`, `ReconciliationRun`.
- Job rekonsiliasi: script CLI (`npm run job:reconcile`) + endpoint HTTP terproteksi token untuk scheduler eksternal (pola sama seperti cron tagihan di project Manajemen Kos-kosan).

## 7. Kriteria Penerimaan

- [ ] Transfer dua kali dengan `idempotencyKey` sama hanya mengeksekusi sekali (diverifikasi: saldo hanya berubah sekali).
- [ ] Transfer melebihi saldo pengirim ditolak, saldo kedua pihak tidak berubah sama sekali.
- [ ] 100 transfer kecil berurutan pada akun yang sama tidak pernah membuat saldo negatif.
- [ ] Job rekonsiliasi pada data yang konsisten melaporkan status seimbang; total debit selalu sama dengan total kredit.
- [ ] Split bill: saldo pembuat tagihan bertambah sesuai jumlah peserta yang sudah melunasi.

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Race condition dua transfer keluar bersamaan dari akun yang sama membuat saldo minus | Update saldo cache akun memakai operasi atomik `decrement`/`increment` di dalam transaksi DB serta pengecekan saldo terakhir di dalam transaksi yang sama sebelum menulis ledger |
| Klien mengirim ulang request top-up/transfer karena timeout | `idempotencyKey` unik per transaksi; request kedua dikembalikan hasil yang sama tanpa efek ganda |
| Bug pada logika transfer membuat ledger tidak seimbang tanpa disadari | Job rekonsiliasi harian mendeteksi ketidakseimbangan lebih awal, bukan menunggu komplain pengguna |
