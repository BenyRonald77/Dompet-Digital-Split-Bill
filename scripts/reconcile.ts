import { prisma } from "../src/lib/prisma";
import { runReconciliation } from "../src/lib/reconciliation-service";

async function main() {
  const run = await runReconciliation();
  const mismatched = JSON.parse(run.mismatchedAccounts) as unknown[];

  console.log(`Rekonsiliasi ${run.runAt.toISOString()}`);
  console.log(`  Total debit : ${run.totalDebit}`);
  console.log(`  Total kredit: ${run.totalCredit}`);
  console.log(`  Status      : ${run.balanced ? "SEIMBANG" : "TIDAK SEIMBANG"}`);
  if (mismatched.length > 0) {
    console.log(`  Akun menyimpang: ${JSON.stringify(mismatched, null, 2)}`);
  }

  if (!run.balanced) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Gagal menjalankan rekonsiliasi:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
