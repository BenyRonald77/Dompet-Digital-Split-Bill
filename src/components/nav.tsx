"use client";

import { useRouter } from "next/navigation";

export function Nav({ name }: { name: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <nav className="mb-8 flex items-center justify-between border-b border-slate-200 pb-4">
      <p className="text-sm text-slate-500">Halo, {name}</p>
      <button
        onClick={handleLogout}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        Keluar
      </button>
    </nav>
  );
}
