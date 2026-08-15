import { describe, expect, it } from "vitest";
import {
  aggregatePaymentMethods,
  buildCategoryDistribution,
  roundCurrency,
  summarizeRegisterTransactions,
  sumRefundAmount,
  sumTicketDiscount,
  sumTicketRevenue,
} from "./accounting.utils";

describe("accounting.utils", () => {
  it("satis ve indirim toplamini kurus hassasiyetiyle hesaplar", () => {
    const tickets = [
      { grandTotal: 100.105, discountTotal: 10.005 },
      { grandTotal: 49.994, discountTotal: 4.994 },
    ];

    expect(sumTicketRevenue(tickets)).toBe(150.1);
    expect(sumTicketDiscount(tickets)).toBe(15);
  });

  it("odeme yontemlerini tek kaynaktan toplar", () => {
    const payments = [
      { method: "CASH", amount: 100, status: "COMPLETED" },
      { method: "CASH", amount: 50.125, status: "COMPLETED" },
      { method: "CREDIT_CARD", amount: 20, status: "COMPLETED" },
    ];

    const result = aggregatePaymentMethods(payments);

    expect(result.get("CASH")?.amount).toBe(150.13);
    expect(result.get("CASH")?.count).toBe(2);
    expect(result.get("CREDIT_CARD")?.amount).toBe(20);
  });

  it("register hareketlerinde satis gider iade etkisini netlestirir", () => {
    const summary = summarizeRegisterTransactions([
      { type: "sale", paymentType: "cash", amount: 100 },
      { type: "sale", paymentType: "card", amount: 40 },
      { type: "refund", paymentType: "cash", amount: 10 },
      { type: "expense", paymentType: "cash", amount: 5.25 },
      { type: "refund", paymentType: "card", amount: 4.5 },
    ]);

    expect(summary.sales).toBe(140);
    expect(summary.refunds).toBe(14.5);
    expect(summary.expenses).toBe(5.25);
    expect(summary.net.cash).toBe(84.75);
    expect(summary.net.card).toBe(35.5);
    expect(summary.net.total).toBe(120.25);
  });

  it("kategori dagilimini net ciroya birebir dagitir", () => {
    const tickets = [
      {
        subtotal: 100,
        discountTotal: 10,
        taxTotal: 8,
        grandTotal: 98,
        items: [
          {
            quantity: 1,
            lineTotal: 60,
            product: { category: { id: "food", name: "Yemek" } },
          },
          {
            quantity: 2,
            lineTotal: 40,
            product: { category: { id: "drink", name: "Icecek" } },
          },
        ],
      },
    ];

    const rows = buildCategoryDistribution(tickets).sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    const totalNet = roundCurrency(rows.reduce((sum, row) => sum + row.revenue, 0));
    const totalDiscount = roundCurrency(rows.reduce((sum, row) => sum + row.discount, 0));
    const totalTax = roundCurrency(rows.reduce((sum, row) => sum + row.tax, 0));

    expect(totalNet).toBe(98);
    expect(totalDiscount).toBe(10);
    expect(totalTax).toBe(8);
    expect(rows[0]).toMatchObject({
      categoryName: "Icecek",
      grossRevenue: 40,
      revenue: 39.2,
      discount: 4,
      tax: 3.2,
      quantity: 2,
    });
    expect(rows[1]).toMatchObject({
      categoryName: "Yemek",
      grossRevenue: 60,
      revenue: 58.8,
      discount: 6,
      tax: 4.8,
      quantity: 1,
    });
  });

  it("refund toplamini guvenli sekilde yuvarlar", () => {
    expect(sumRefundAmount([{ amount: 10.005 }, { amount: 4.994 }])).toBe(15);
  });
});
