import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { InsufficientBalanceError, LedgerError, topUp } from "@/lib/ledger-service";

const schema = z.object({
  amount: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(100),
});

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Data top-up tidak valid" }, { status: 400 });
  }

  try {
    const result = await topUp({
      userId: auth.session.sub,
      amount: parsed.data.amount,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return NextResponse.json({
      transactionId: result.transaction.id,
      idempotentReplay: result.idempotentReplay,
    });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof LedgerError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
