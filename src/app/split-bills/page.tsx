"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useAuthGuard } from "@/lib/use-auth-guard";

type Participant = { id: string; userId: string; name: string; shareAmount: number; settled: boolean };
type Bill = {
  id: string;
  title: string;
  totalAmount: number;
  createdAt: string;
  creatorName: string;
  isCreator: boolean;
  settledCount: number;
  totalParticipants: number;
  participants: Participant[];
  myShare: Participant | null;
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `key-${Date.now()}-${Math.random()}`;
}

export default function SplitBillsPage() {
  const { me, checking } = useAuthGuard();
  const [bills, setBills] = useState<Bill[]>([]);
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState([{ email: "", shareAmount: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadBills = useCallback(async () => {
    const res = await fetch("/api/split-bills");
    if (res.ok) setBills((await res.json()).bills);
  }, []);

  useEffect(() => {
    if (me) loadBills();
  }, [me, loadBills]);

  function updateParticipant(index: number, field: "email" | "shareAmount", value: string) {
    setParticipants((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/split-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          participants: participants
            .filter((p) => p.email && p.shareAmount)
            .map((p) => ({ email: p.email, shareAmount: Number(p.shareAmount) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal membuat split bill");
        return;
      }
      setTitle("");
      setParticipants([{ email: "", shareAmount: "" }]);
      setShowForm(false);
      await loadBills();
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setBusy(false);
    }
  }

  async function handleSettle(billId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/split-bills/${billId}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: newIdempotencyKey() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal melunasi");
        return;
      }
      await loadBills();
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <p className="p-10 text-center text-slate-500">Memuat...</p>;
  if (!me) return null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Nav name={me.name} />
      <Link href="/dashboard" className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        ← Kembali ke Dashboard
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-700">Split Bill</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showForm ? "Batal" : "+ Buat Tagihan"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Judul (mis. Makan Siang Tim)"
            required
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          {participants.map((p, index) => (
            <div key={index} className="mb-2 flex gap-2">
              <input
                type="email"
                value={p.email}
                onChange={(event) => updateParticipant(index, "email", event.target.value)}
                placeholder="Email peserta"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
              />
              <input
                type="number"
                min={1}
                value={p.shareAmount}
                onChange={(event) => updateParticipant(index, "shareAmount", event.target.value)}
                placeholder="Porsi (Rp)"
                className="w-32 rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setParticipants((prev) => [...prev, { email: "", shareAmount: "" }])}
            className="mb-3 text-sm text-brand-600 hover:underline"
          >
            + Tambah peserta
          </button>
          {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Menyimpan..." : "Buat Tagihan"}
          </button>
        </form>
      )}

      {!showForm && error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="flex flex-col gap-4">
        {bills.map((bill) => (
          <div key={bill.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">{bill.title}</h3>
              <span className="text-sm text-slate-500">{formatRupiah(bill.totalAmount)}</span>
            </div>
            <p className="mb-3 text-xs text-slate-400">
              Dibuat oleh {bill.creatorName} · {bill.settledCount}/{bill.totalParticipants} lunas
            </p>
            <ul className="mb-3 flex flex-col gap-1 text-sm">
              {bill.participants.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className={p.settled ? "text-brand-600" : "text-amber-600"}>
                    {formatRupiah(p.shareAmount)} {p.settled ? "· Lunas" : "· Belum"}
                  </span>
                </li>
              ))}
            </ul>
            {bill.myShare && !bill.myShare.settled && (
              <button
                onClick={() => handleSettle(bill.id)}
                disabled={busy}
                className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Lunasi Porsi Saya ({formatRupiah(bill.myShare.shareAmount)})
              </button>
            )}
          </div>
        ))}
        {bills.length === 0 && (
          <p className="text-center text-sm text-slate-400">Belum ada split bill.</p>
        )}
      </div>
    </main>
  );
}
