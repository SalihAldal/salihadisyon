import { describe, expect, it } from "vitest";
import { formatTicketStatus, getTableLobbyMeta, isTableBusy, resolveActiveTicketId } from "./waiter-pos-utils";

describe("waiter-pos-utils", () => {
  it("masa doluluk durumunu activeTicket ile belirler", () => {
    expect(isTableBusy({ status: "AVAILABLE", activeTicketId: "t1" })).toBe(true);
    expect(isTableBusy({ status: "AVAILABLE" })).toBe(false);
    expect(isTableBusy({ status: "OCCUPIED" })).toBe(true);
  });

  it("activeTicketId yedegi olarak activeTicket.id kullanir", () => {
    expect(resolveActiveTicketId({ activeTicket: { id: "ticket-2" } })).toBe("ticket-2");
  });

  it("ticket status etiketlerini dondurur", () => {
    expect(formatTicketStatus("PREPARING")).toBe("Hazirlaniyor");
    expect(formatTicketStatus("OPEN")).toBe("Acik");
  });

  it("masa lobisi meta bilgisini hesaplar", () => {
    const meta = getTableLobbyMeta({
      id: "table-1",
      code: "T12",
      name: "Teras 12",
      status: "OCCUPIED",
      activeTicket: {
        status: "OPEN",
        grandTotal: 250,
        items: [{ id: "i1" }, { id: "i2" }],
      },
    });
    expect(meta.busy).toBe(true);
    expect(meta.itemCount).toBe(2);
    expect(meta.grandTotal).toBe(250);
    expect(meta.ticketStatusLabel).toBe("Acik");
  });
});
