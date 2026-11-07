import { describe, expect, it } from "vitest";
import { totals, type Txn } from "./finance";

const t = (p: Partial<Txn>): Txn => ({ key: Math.random().toString(), section: "income", category: "x", date: "", ref: "", party: "", project: "", description: "", amount: 0, paid: 0, status: "", ...p });

describe("cash flow totals", () => {
  it("excludes unpaid invoices from income", () => {
    expect(totals([t({ amount: 1000, paid: 0 })]).income).toBe(0);
  });
  it("counts only the paid part of a partially paid invoice", () => {
    expect(totals([t({ amount: 1000, paid: 400 })]).income).toBe(400);
  });
  it("reduces income for refunds", () => {
    expect(totals([t({ paid: 500 }), t({ paid: -200 })]).income).toBe(300);
  });
  it("never double counts the same transaction", () => {
    expect(totals([t({ key: "a", paid: 100 }), t({ key: "a", paid: 100 })]).income).toBe(100);
  });
  it("net is income less expenses", () => {
    expect(totals([t({ paid: 900 }), t({ section: "expenses", paid: 300 })]).net).toBe(600);
  });
});
