import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { InsufficientBalanceError } from "@/lib/ledger-service";
import { settleSplitBillParticipant, SplitBillError } from "@/lib/split-bill-service";

const schema = z.object({ idempotencyKey: z.string().min(8).max(100) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "idempotencyKey wajib diisi" }, { status: 400 });
  }

  try {
    const result = await settleSplitBillParticipant({
      splitBillId: params.id,
      userId: auth.session.sub,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return NextResponse.json({
      settled: result.participant.settled,
      idempotentReplay: result.idempotentReplay,
    });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SplitBillError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
