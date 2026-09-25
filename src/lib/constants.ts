export const LedgerDirection = {
  DEBIT: "DEBIT",
  CREDIT: "CREDIT",
} as const;
export type LedgerDirection = (typeof LedgerDirection)[keyof typeof LedgerDirection];

export const TransactionType = {
  TOPUP: "TOPUP",
  TRANSFER: "TRANSFER",
  SPLIT_SETTLE: "SPLIT_SETTLE",
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const EXTERNAL_ACCOUNT_CODE = "EXTERNAL";
