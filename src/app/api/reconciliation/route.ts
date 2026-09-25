import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { listReconciliationRuns } from "@/lib/reconciliation-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const runs = await listReconciliationRuns();
  return NextResponse.json({ runs });
}
