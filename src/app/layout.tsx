import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dompet Digital + Split Bill",
  description: "Dompet digital dengan ledger double-entry, transfer atomik, dan split bill.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
