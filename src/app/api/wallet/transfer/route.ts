import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { InsufficientBalanceError, LedgerError, transfer } from "@/lib/ledger-service";

const schema = z.object({
  toEmail: z.string().email(),
  amount: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(100),
});

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Data transfer tidak valid" }, { status: 400 });
  }

  const recipient = await prisma.user.findUnique({ where: { email: parsed.data.toEmail } });
  if (!recipient) {
    return NextResponse.json({ error: "Penerima tidak ditemukan" }, { status: 404 });
  }

  try {
    const result = await transfer({
      fromUserId: auth.session.sub,
      toUserId: recipient.id,
      amount: parsed.data.amount,
      idempotencyKey: parsed.data.idempotencyKey,
      description: `Transfer ke ${recipient.name}`,
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
