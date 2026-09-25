import { prisma } from "@/lib/prisma";
import { TransactionType } from "@/lib/constants";
import { LedgerError, transfer } from "@/lib/ledger-service";

export class SplitBillError extends Error {}

export async function createSplitBill(params: {
  creatorId: string;
  title: string;
  participants: { email: string; shareAmount: number }[];
}) {
  if (params.participants.length === 0) {
    throw new SplitBillError("Minimal harus ada 1 peserta");
  }
  if (params.participants.some((p) => p.shareAmount <= 0)) {
    throw new SplitBillError("Porsi setiap peserta harus lebih dari 0");
  }

  const users = await prisma.user.findMany({
    where: { email: { in: params.participants.map((p) => p.email) } },
  });
  const userByEmail = new Map(users.map((u) => [u.email, u]));

  const missing = params.participants.filter((p) => !userByEmail.has(p.email));
  if (missing.length > 0) {
    throw new SplitBillError(
      `Peserta tidak ditemukan: ${missing.map((p) => p.email).join(", ")}`,
    );
  }
  if (params.participants.some((p) => userByEmail.get(p.email)!.id === params.creatorId)) {
    throw new SplitBillError("Pembuat tagihan tidak perlu dimasukkan sebagai peserta");
  }

  const totalAmount = params.participants.reduce((sum, p) => sum + p.shareAmount, 0);

  const bill = await prisma.splitBill.create({
    data: {
      creatorId: params.creatorId,
      title: params.title,
      totalAmount,
      participants: {
        create: params.participants.map((p) => ({
          userId: userByEmail.get(p.email)!.id,
          shareAmount: p.shareAmount,
        })),
      },
    },
    include: {
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  return bill;
}

export async function listSplitBillsForUser(userId: string) {
  const bills = await prisma.splitBill.findMany({
    where: {
      OR: [{ creatorId: userId }, { participants: { some: { userId } } }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { name: true } },
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  return bills.map((bill) => {
    const participants = bill.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.user.name,
      shareAmount: p.shareAmount,
      settled: p.settled,
    }));

    return {
      id: bill.id,
      title: bill.title,
      totalAmount: bill.totalAmount,
      createdAt: bill.createdAt,
      creatorName: bill.creator.name,
      isCreator: bill.creatorId === userId,
      settledCount: participants.filter((p) => p.settled).length,
      totalParticipants: participants.length,
      participants,
      myShare: participants.find((p) => p.userId === userId) ?? null,
    };
  });
}

export async function settleSplitBillParticipant(params: {
  splitBillId: string;
  userId: string;
  idempotencyKey: string;
}) {
  const participant = await prisma.splitBillParticipant.findUnique({
    where: { splitBillId_userId: { splitBillId: params.splitBillId, userId: params.userId } },
    include: { splitBill: true },
  });
  if (!participant) throw new SplitBillError("Anda bukan peserta tagihan ini");
  if (participant.settled) {
    return { participant, idempotentReplay: true as const };
  }

  try {
    const result = await transfer({
      fromUserId: params.userId,
      toUserId: participant.splitBill.creatorId,
      amount: participant.shareAmount,
      idempotencyKey: params.idempotencyKey,
      type: TransactionType.SPLIT_SETTLE,
      description: `Split bill: ${participant.splitBill.title}`,
    });

    const updated = await prisma.splitBillParticipant.update({
      where: { id: participant.id },
      data: { settled: true, settledTransactionId: result.transaction.id },
    });

    return { participant: updated, idempotentReplay: result.idempotentReplay };
  } catch (error) {
    if (error instanceof LedgerError) throw new SplitBillError(error.message);
    throw error;
  }
}
