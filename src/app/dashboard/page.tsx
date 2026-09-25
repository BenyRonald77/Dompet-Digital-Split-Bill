"use client";

import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useAuthGuard } from "@/lib/use-auth-guard";

type HistoryItem = {
  id: string;
  direction: "DEBIT" | "CREDIT";
  amount: number;
  createdAt: string;
  transactionType: string;
  description: string | null;
};

type Wallet = { balance: number; history: HistoryItem[] };

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `key-${Date.now()}-${Math.random()}`;
}

export default function DashboardPage() {
  const { me, checking } = useAuthGuard();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [transferEmail, setTransferEmail] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadWallet = useCallback(async () => {
    const res = await fetch("/api/wallet/me");
    if (res.ok) setWallet(await res.json());
  }, []);

  useEffect(() => {
    if (me) loadWallet();
  }, [me, loadWallet]);

  async function handleTopUp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(topUpAmount), idempotencyKey: newIdempotencyKey() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal top-up");
        return;
      }
      setTopUpAmount("");
      await loadWallet();
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: transferEmail,
          amount: Number(transferAmount),
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal transfer");
        return;
      }
      setTransferEmail("");
      setTransferAmount("");
      await loadWallet();
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <p className="p-10 text-center text-slate-500">Memuat...</p>;
  if (!me) return null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Nav name={me.name} />

      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm uppercase tracking-wide text-slate-500">Saldo Anda</p>
        <p className="mt-1 text-4xl font-black text-brand-700">
          {wallet ? formatRupiah(wallet.balance) : "—"}
        </p>
      </section>

      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        <form onSubmit={handleTopUp} className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-800">Top-up</h2>
          <input
            type="number"
            min={1}
            value={topUpAmount}
            onChange={(event) => setTopUpAmount(event.target.value)}
            placeholder="Jumlah (Rp)"
            required
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Memproses..." : "Top-up"}
          </button>
        </form>

        <form onSubmit={handleTransfer} className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-800">Transfer</h2>
          <input
            type="email"
            value={transferEmail}
            onChange={(event) => setTransferEmail(event.target.value)}
            placeholder="Email penerima"
            required
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            type="number"
            min={1}
            value={transferAmount}
            onChange={(event) => setTransferAmount(event.target.value)}
            placeholder="Jumlah (Rp)"
            required
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Memproses..." : "Kirim"}
          </button>
        </form>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <section className="mb-8 rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">
          Riwayat Mutasi
        </h2>
        <ul className="divide-y divide-slate-100">
          {wallet?.history.map((item) => (
            <li key={item.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-700">
                  {item.description ?? item.transactionType}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(item.createdAt).toLocaleString("id-ID")}
                </p>
              </div>
              <span
                className={`font-semibold ${
                  item.direction === "CREDIT" ? "text-brand-600" : "text-rose-600"
                }`}
              >
                {item.direction === "CREDIT" ? "+" : "-"}
                {formatRupiah(item.amount)}
              </span>
            </li>
          ))}
          {wallet?.history.length === 0 && (
            <li className="px-5 py-6 text-center text-slate-400">Belum ada mutasi.</li>
          )}
        </ul>
      </section>

      <a href="/split-bills" className="block rounded-xl border border-slate-200 bg-white p-5 text-center font-medium text-brand-600 hover:bg-brand-50">
        Kelola Split Bill →
      </a>
    </main>
  );
}
