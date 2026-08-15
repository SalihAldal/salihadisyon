import { describe, expect, it, vi } from "vitest";
import { InventoryConsumptionService } from "./inventory-consumption.service";

const actor = {
  tenantId: "tenant-1",
  userId: "user-1",
  branchIds: ["branch-1"],
};

function createService() {
  const inventoryItems = [
    {
      id: "inv-product",
      name: "Burger Stok",
      currentStock: 10,
      minimumLevel: 3,
      warehouseId: "wh-1",
      warehouse: { branchId: "branch-1" },
      unit: { symbol: "adet" },
      stockEntries: [{ unitCost: 12 }],
    },
    {
      id: "inv-modifier",
      name: "Ek Peynir",
      currentStock: 8,
      minimumLevel: 1,
      warehouseId: "wh-1",
      warehouse: { branchId: "branch-1" },
      unit: { symbol: "adet" },
      stockEntries: [{ unitCost: 2 }],
    },
  ];

  const ticket = {
    id: "ticket-1",
    companyId: "tenant-1",
    branchId: "branch-1",
    status: "PAID",
    items: [
      {
        id: "item-1",
        quantity: 2,
        productName: "Burger",
        modifiersJson: {
          modifierOptionIds: ["mod-1"],
        },
        product: {
          id: "product-1",
          stockItem: inventoryItems[0],
          recipe: { items: [] },
        },
      },
    ],
  };

  const stockEntries: Array<Record<string, unknown>> = [];
  const inventoryUpdates: Array<{ id: string; currentStock: number }> = [];
  const createdAlerts: Array<Record<string, unknown>> = [];

  const tx = {
    ticket: {
      findUnique: vi.fn().mockResolvedValue(ticket),
    },
    modifierOption: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "mod-1",
          name: "Peynir",
          stockQuantity: 1,
          inventoryItem: inventoryItems[1],
        },
      ]),
    },
    requiredChoiceOption: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    stockEntry: {
      findMany: vi.fn(({ where }: { where: Record<string, any> }) => {
        const referenceType = where.referenceType;
        return stockEntries.filter((entry) => {
          if (referenceType && entry.referenceType !== referenceType) return false;
          const ids = where.referenceId?.in as string[] | undefined;
          return ids ? ids.includes(String(entry.referenceId)) : true;
        });
      }),
      createMany: vi.fn(({ data }: { data: Array<Record<string, unknown>> }) => {
        stockEntries.push(...data);
        return { count: data.length };
      }),
    },
    inventoryItem: {
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) => {
        return inventoryItems.filter((item) => where.id.in.includes(item.id));
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: { currentStock: number } }) => {
        const item = inventoryItems.find((row) => row.id === where.id);
        if (item) {
          item.currentStock = data.currentStock;
          inventoryUpdates.push({ id: where.id, currentStock: data.currentStock });
        }
        return item;
      }),
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        return inventoryItems.find((item) => item.id === where.id) ?? null;
      }),
    },
    stockAlert: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        createdAlerts.push(data);
        return data;
      }),
      update: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (callback: (innerTx: typeof tx) => unknown) => callback(tx)),
  };

  const auditLogService = {
    create: vi.fn(),
  };
  const posGateway = {
    emitToBranch: vi.fn(),
  };

  return {
    service: new InventoryConsumptionService(prisma as any, auditLogService as any, posGateway as any),
    tx,
    inventoryItems,
    stockEntries,
    inventoryUpdates,
    createdAlerts,
  };
}

describe("InventoryConsumptionService", () => {
  it("payment sonrasi stok dusumu yapar ve ikinci calismada tekrar dusmez", async () => {
    const { service, tx, inventoryItems, stockEntries } = createService();

    const first = await service.applySaleConsumptionWithinTransaction(tx as any, "ticket-1", actor);
    const second = await service.applySaleConsumptionWithinTransaction(tx as any, "ticket-1", actor);

    expect(first).toMatchObject({
      entryCount: 2,
      inventoryItemCount: 2,
      theoreticalCost: 28,
    });
    expect(second).toMatchObject({
      entryCount: 0,
      inventoryItemCount: 0,
      theoreticalCost: 0,
    });
    expect(inventoryItems.find((item) => item.id === "inv-product")?.currentStock).toBe(8);
    expect(inventoryItems.find((item) => item.id === "inv-modifier")?.currentStock).toBe(6);
    expect(stockEntries).toHaveLength(2);
  });

  it("full refund sonrasi stogu geri yukler", async () => {
    const { service, tx, inventoryItems } = createService();

    await service.applySaleConsumptionWithinTransaction(tx as any, "ticket-1", actor);
    const reversal = await service.reverseSaleConsumptionWithinTransaction(tx as any, "ticket-1", actor, "refund", "Musteri iadesi");

    expect(reversal).toMatchObject({
      entryCount: 2,
      inventoryItemCount: 2,
      theoreticalCost: 28,
    });
    expect(inventoryItems.find((item) => item.id === "inv-product")?.currentStock).toBe(10);
    expect(inventoryItems.find((item) => item.id === "inv-modifier")?.currentStock).toBe(8);
  });
});
