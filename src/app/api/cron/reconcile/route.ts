import { NextResponse } from "next/server";
import { runReconciliation } from "@/lib/reconciliation-service";

export const dynamic = "force-dynamic";

/** Dipicu scheduler eksternal setiap hari — dilindungi token, bukan sesi login. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  const run = await runReconciliation();
  return NextResponse.json(run);
}
