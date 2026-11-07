// Cash-basis finance statement: only money actually received or paid counts toward totals.
export type Section = "income" | "expenses";
export type Txn = {
  key: string;            // unique across all categories (prevents double counting)
  section: Section;
  category: string;
  date: string;           // ISO
  ref: string;
  party: string;          // supplier / crew / user / provider
  project: string;
  description: string;
  amount: number;         // gross amount in ZAR
  paid: number;           // cash actually moved in ZAR (0 when unpaid)
  status: string;
  tokens?: number | null;
  link?: string;
  sourceId?: string;
  sourceType?: "invoice" | "booking" | "gig" | "ai";
};

export const CATEGORIES: { section: Section; name: string }[] = [
  { section: "income", name: "Invoice payments received" },
  { section: "income", name: "Gig securing fees received" },
  { section: "income", name: "Platform commissions and service fees" },
  { section: "income", name: "Other income" },
  { section: "expenses", name: "Crew payouts released" },
  { section: "expenses", name: "AI API usage and token costs" },
  { section: "expenses", name: "Supplier invoices and payments" },
  { section: "expenses", name: "Payment gateway transaction fees" },
  { section: "expenses", name: "Refunds and other expenses" },
];

/** Cash that counts: refunds/reversals are negative `paid`; unpaid items contribute 0. */
export function cashOf(t: Txn) {
  return Number.isFinite(t.paid) ? t.paid : 0;
}

export function dedupe(txns: Txn[]) {
  const seen = new Set<string>();
  return txns.filter((t) => (seen.has(t.key) ? false : (seen.add(t.key), true)));
}

export function totals(txns: Txn[]) {
  const unique = dedupe(txns);
  const income = unique.filter((t) => t.section === "income").reduce((a, t) => a + cashOf(t), 0);
  const expenses = unique.filter((t) => t.section === "expenses").reduce((a, t) => a + cashOf(t), 0);
  return { income, expenses, net: income - expenses };
}
