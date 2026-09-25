import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { createSplitBill, listSplitBillsForUser, SplitBillError } from "@/lib/split-bill-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const bills = await listSplitBillsForUser(auth.session.sub);
  return NextResponse.json({ bills });
}

const schema = z.object({
  title: z.string().min(1).max(150),
  participants: z
    .array(z.object({ email: z.string().email(), shareAmount: z.number().int().positive() }))
    .min(1),
});

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Data split bill tidak valid" }, { status: 400 });
  }

  try {
    const bill = await createSplitBill({ creatorId: auth.session.sub, ...parsed.data });
    return NextResponse.json({ bill });
  } catch (error) {
    if (error instanceof SplitBillError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
