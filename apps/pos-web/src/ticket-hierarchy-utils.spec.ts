import { describe, expect, it } from "vitest";
import {
  buildTicketSummary,
  formatTicketLabel,
  getOpenTicketsForTable,
  getTicketItemDetailLines,
  groupTicketItemsByCategory,
  groupTicketItemsByStation,
  isOpenTicketStatus,
} from "./ticket-hierarchy-utils";

describe("ticket-hierarchy-utils", () => {
  const categories = [
    { id: "cat-coffee", name: "Kahveler", printerType: "bar" },
    { id: "cat-food", name: "Yemekler", printerType: "kitchen" },
  ];
  const products = new Map<string, Record<string, any>>([
    [
      "prod-latte",
      {
        id: "prod-latte",
        categoryId: "cat-coffee",
        variants: [{ id: "var-large", name: "Buyuk" }],
        modifierGroups: [{ options: [{ id: "mod-almond", name: "Badem sutu" }] }],
        requiredChoiceGroups: [],
      },
    ],
    ["prod-burger", { id: "prod-burger", categoryId: "cat-food", variants: [], modifierGroups: [], requiredChoiceGroups: [] }],
  ]);

  it("filters open tickets by table", () => {
    const tickets = [
      { id: "t1", tableId: "table-1", status: "OPEN" },
      { id: "t2", tableId: "table-1", status: "PAYMENT_PENDING" },
      { id: "t3", tableId: "table-2", status: "OPEN" },
      { id: "t4", tableId: "table-1", status: "PAID" },
    ];
    const result = getOpenTicketsForTable(tickets, "table-1");
    expect(result.map((ticket) => ticket.id)).toEqual(["t1", "t2"]);
  });

  it("groups ticket items by category", () => {
    const items = [
      {
        id: "i1",
        productId: "prod-latte",
        productName: "Latte",
        quantity: 2,
        lineTotal: 240,
        discountTotal: 0,
        modifiersJson: { variantIds: ["var-large"], modifierOptionIds: ["mod-almond"] },
        notes: "Cok sicak",
      },
      {
        id: "i2",
        productId: "prod-burger",
        productName: "Burger",
        quantity: 1,
        lineTotal: 180,
        discountTotal: 0,
        modifiersJson: {},
      },
    ];
    const groups = groupTicketItemsByCategory(items, products, categories);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.title === "Kahveler")?.items).toHaveLength(1);
    expect(groups.find((group) => group.title === "Yemekler")?.items).toHaveLength(1);
  });

  it("groups ticket items by station using printerType", () => {
    const items = [
      { id: "i1", productId: "prod-latte", productName: "Latte", quantity: 2, lineTotal: 240, discountTotal: 0 },
      { id: "i2", productId: "prod-burger", productName: "Burger", quantity: 1, lineTotal: 180, discountTotal: 0 },
    ];
    const groups = groupTicketItemsByStation(items, products, categories);
    expect(groups.map((group) => group.title)).toEqual(["Bar", "Mutfak"]);
  });

  it("extracts modifier and note detail lines", () => {
    const lines = getTicketItemDetailLines(
      {
        productId: "prod-latte",
        notes: "Cok sicak",
        modifiersJson: { variantIds: ["var-large"], modifierOptionIds: ["mod-almond"] },
      },
      products,
    );
    expect(lines.some((line) => line.kind === "note" && line.label === "Cok sicak")).toBe(true);
    expect(lines.some((line) => line.label === "Buyuk")).toBe(true);
    expect(lines.some((line) => line.label === "Badem sutu")).toBe(true);
  });

  it("builds ticket summary from backend fields only", () => {
    const summary = buildTicketSummary({
      status: "PAYMENT_PENDING",
      subtotal: 420,
      discountTotal: 20,
      taxTotal: 40,
      grandTotal: 440,
      paidTotal: 100,
      remainingAmount: 340,
      items: [{ id: "i1" }, { id: "i2" }],
      tableName: "Masa 12",
      customerName: "Ali",
    });
    expect(summary.itemCount).toBe(2);
    expect(summary.grandTotal).toBe(440);
    expect(summary.remainingAmount).toBe(340);
    expect(summary.customerName).toBe("Ali");
  });

  it("formats ticket labels", () => {
    expect(formatTicketLabel({ ticketName: "Masa 12 / Ahsap" })).toBe("Masa 12 / Ahsap");
    expect(formatTicketLabel({ id: "abc123def456" })).toBe("Adisyon #DEF456");
  });

  it("detects open ticket statuses", () => {
    expect(isOpenTicketStatus("OPEN")).toBe(true);
    expect(isOpenTicketStatus("PAID")).toBe(false);
  });
});
