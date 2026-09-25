import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { EXTERNAL_ACCOUNT_CODE } from "../src/lib/constants";

const prisma = new PrismaClient();

async function main() {
  await prisma.account.upsert({
    where: { code: EXTERNAL_ACCOUNT_CODE },
    update: {},
    create: { code: EXTERNAL_ACCOUNT_CODE, balanceCache: 0 },
  });

  const users = [
    { name: "Andi", email: "andi@dompet.test", password: "andi123" },
    { name: "Budi", email: "budi@dompet.test", password: "budi123" },
    { name: "Citra", email: "citra@dompet.test", password: "citra123" },
  ];

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash },
    });
    await prisma.account.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, balanceCache: 0 },
    });
  }

  console.log("Seed selesai:");
  console.log("- Login: andi@dompet.test / andi123 (dkk, lihat prisma/seed.ts)");
  console.log("- Semua saldo awal 0 — gunakan fitur Top-up di dashboard untuk mengisi saldo.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
