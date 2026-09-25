import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getBalance, getLedgerHistory } from "@/lib/ledger-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const [balance, history] = await Promise.all([
    getBalance(auth.session.sub),
    getLedgerHistory(auth.session.sub),
  ]);

  return NextResponse.json({ balance, history });
}
