import {
  AttendanceAction,
  CampaignType,
  DiscountType,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  PosTransactionStatus,
  PrismaClient,
  TableStatus,
  TicketChannel,
  TicketStatus,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { assertSafeDemoEnvironment } from "./demo-safety";
import { permissionCatalog } from "../src/common/auth/permissions";
import { roleMatrix } from "../src/common/auth/rbac";

const prisma = new PrismaClient();

function startOfDay(baseDate = new Date()) {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(baseDate: Date, days: number, hour = 0, minute = 0) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function main() {
  assertSafeDemoEnvironment("seed");

  const today = startOfDay();
  const company = await prisma.company.upsert({
    where: { id: "cmp_aldal_demo" },
    update: {},
    create: {
      id: "cmp_aldal_demo",
      name: "Aldal Demo Hospitality",
      legalName: "Aldal Demo Hospitality A.S.",
      taxNumber: "1234567890",
      timezone: "Europe/Istanbul",
      currency: "TRY",
    },
  });

  const branchA = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: "NIS-01" } },
    update: {},
    create: {
      companyId: company.id,
      name: "Nisantasi Merkez",
      code: "NIS-01",
      city: "Istanbul",
      district: "Sisli",
      addressLine: "Nisantasi / Istanbul",
      phone: "+90 212 000 00 01",
      isActive: true,
    },
  });

  const branchB = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: "ETL-01" } },
    update: {},
    create: {
      companyId: company.id,
      name: "Etiler Subesi",
      code: "ETL-01",
      city: "Istanbul",
      district: "Besiktas",
      addressLine: "Etiler / Istanbul",
      phone: "+90 212 000 00 02",
      isActive: true,
    },
  });

  const permissions = Object.entries(permissionCatalog).flatMap(([module, keys]) =>
    keys.map((key) => ({
      key,
      module,
      action: key.split(".").at(1) ?? "view",
      description: `${module} / ${key}`,
    })),
  );

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: permission,
      create: permission,
    });
  }

  const roleEntries = Object.entries(roleMatrix);
  for (const [key, permissionKeys] of roleEntries) {
    const role = await prisma.role.upsert({
      where: { companyId_key: { companyId: company.id, key } },
      update: {
        name: key,
      },
      create: {
        companyId: company.id,
        key,
        name: key,
        description: `${key} sistem rolu`,
        isSystem: true,
      },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    for (const permissionKey of [...new Set(permissionKeys)]) {
      const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
      if (!permission) continue;

      await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  const ownerPasswordHash = await hash("ChangeMe123!", 10);
  const owner = await prisma.user.upsert({
    where: { email: "owner@aldal.local" },
    update: {
      passwordHash: ownerPasswordHash,
      companyId: company.id,
      defaultBranchId: branchA.id,
    },
    create: {
      companyId: company.id,
      defaultBranchId: branchA.id,
      fullName: "Aldal Owner",
      email: "owner@aldal.local",
      phone: "+90 555 000 00 00",
      passwordHash: ownerPasswordHash,
      isActive: true,
    },
  });

  const branchManagerPasswordHash = await hash("Branch123!", 10);
  const manager = await prisma.user.upsert({
    where: { email: "manager@aldal.local" },
    update: {
      passwordHash: branchManagerPasswordHash,
      companyId: company.id,
      defaultBranchId: branchA.id,
    },
    create: {
      companyId: company.id,
      defaultBranchId: branchA.id,
      fullName: "Nisantasi Branch Manager",
      email: "manager@aldal.local",
      phone: "+90 555 000 00 01",
      passwordHash: branchManagerPasswordHash,
      isActive: true,
    },
  });

  const cashierPasswordHash = await hash("Cashier123!", 10);
  const cashier = await prisma.user.upsert({
    where: { email: "cashier@aldal.local" },
    update: {
      passwordHash: cashierPasswordHash,
      companyId: company.id,
      defaultBranchId: branchA.id,
    },
    create: {
      companyId: company.id,
      defaultBranchId: branchA.id,
      fullName: "Elif Kasiyer",
      email: "cashier@aldal.local",
      phone: "+90 555 000 00 02",
      passwordHash: cashierPasswordHash,
      isActive: true,
    },
  });

  const waiterPasswordHash = await hash("Waiter123!", 10);
  const waiter = await prisma.user.upsert({
    where: { email: "waiter@aldal.local" },
    update: {
      passwordHash: waiterPasswordHash,
      companyId: company.id,
      defaultBranchId: branchB.id,
    },
    create: {
      companyId: company.id,
      defaultBranchId: branchB.id,
      fullName: "Mert Servis",
      email: "waiter@aldal.local",
      phone: "+90 555 000 00 03",
      passwordHash: waiterPasswordHash,
      isActive: true,
    },
  });

  const tenantOwnerRole = await prisma.role.findUnique({
    where: { companyId_key: { companyId: company.id, key: "tenant_owner" } },
  });
  const branchManagerRole = await prisma.role.findUnique({
    where: { companyId_key: { companyId: company.id, key: "branch_manager" } },
  });
  const cashierRole = await prisma.role.findUnique({
    where: { companyId_key: { companyId: company.id, key: "cashier" } },
  });
  const waiterRole = await prisma.role.findUnique({
    where: { companyId_key: { companyId: company.id, key: "waiter" } },
  });

  await prisma.userRole.deleteMany({
    where: {
      userId: {
        in: [owner.id, manager.id, cashier.id, waiter.id],
      },
    },
  });

  if (tenantOwnerRole) {
    await prisma.userRole.create({
      data: {
        userId: owner.id,
        roleId: tenantOwnerRole.id,
      },
    });
  }

  if (branchManagerRole) {
    await prisma.userRole.create({
      data: {
        userId: manager.id,
        roleId: branchManagerRole.id,
        branchId: branchA.id,
      },
    });
  }

  if (cashierRole) {
    await prisma.userRole.create({
      data: {
        userId: cashier.id,
        roleId: cashierRole.id,
        branchId: branchA.id,
      },
    });
  }

  if (waiterRole) {
    await prisma.userRole.create({
      data: {
        userId: waiter.id,
        roleId: waiterRole.id,
        branchId: branchB.id,
      },
    });
  }

  await prisma.subscriptionPlan.upsert({
    where: { code: "starter" },
    update: {
      name: "Starter",
      priceMonthly: 2999,
      priceYearly: 29990,
      featuresJson: {
        dashboard: true,
        pos: true,
        inventory: true,
        reporting: true,
        integrations: true,
        support: true,
        product_ratings: true,
        staff_discounts: true,
        pos_web_access: true,
      },
      branchLimit: 3,
      userLimit: 25,
    },
    create: {
      code: "starter",
      name: "Starter",
      priceMonthly: 2999,
      priceYearly: 29990,
      featuresJson: {
        dashboard: true,
        pos: true,
        inventory: true,
        reporting: true,
        integrations: true,
        support: true,
        product_ratings: true,
        staff_discounts: true,
        pos_web_access: true,
      },
      branchLimit: 3,
      userLimit: 25,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { code: "growth" },
    update: {
      name: "Growth",
      priceMonthly: 5999,
      priceYearly: 59990,
      featuresJson: {
        dashboard: true,
        pos: true,
        inventory: true,
        reporting: true,
        integrations: true,
        support: true,
        product_ratings: true,
        staff_discounts: true,
        pos_web_access: true,
        advanced_reports: true,
      },
      branchLimit: 10,
      userLimit: 100,
    },
    create: {
      code: "growth",
      name: "Growth",
      priceMonthly: 5999,
      priceYearly: 59990,
      featuresJson: {
        dashboard: true,
        pos: true,
        inventory: true,
        reporting: true,
        integrations: true,
        support: true,
        product_ratings: true,
        staff_discounts: true,
        pos_web_access: true,
        advanced_reports: true,
      },
      branchLimit: 10,
      userLimit: 100,
    },
  });

  const starterPlan = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { code: "starter" },
  });

  const companySubscription = await prisma.subscription.upsert({
    where: { companyId: company.id },
    update: {
      planId: starterPlan.id,
      status: "ACTIVE",
      trialEndsAt: addDays(today, 14, 23, 59),
      startsAt: addDays(today, -16, 0, 0),
      endsAt: addDays(today, 30, 23, 59),
    },
    create: {
      companyId: company.id,
      planId: starterPlan.id,
      status: "ACTIVE",
      trialEndsAt: addDays(today, 14, 23, 59),
      startsAt: addDays(today, -16, 0, 0),
      endsAt: addDays(today, 30, 23, 59),
    },
  });

  const subscriptionLimits = [
    { metricKey: "branch_count", currentValue: 2, limitValue: 3 },
    { metricKey: "user_count", currentValue: 4, limitValue: 25 },
    { metricKey: "integration_credentials", currentValue: 1, limitValue: 25 },
    { metricKey: "product_ratings", currentValue: 2, limitValue: 500 },
    { metricKey: "staff_discounts", currentValue: 1, limitValue: 50 },
    { metricKey: "support_tickets", currentValue: 1, limitValue: 100 },
  ] as const;

  for (const limit of subscriptionLimits) {
    await prisma.usageLimit.upsert({
      where: {
        subscriptionId_metricKey: {
          subscriptionId: companySubscription.id,
          metricKey: limit.metricKey,
        },
      },
      update: {
        currentValue: limit.currentValue,
        limitValue: limit.limitValue,
      },
      create: {
        subscriptionId: companySubscription.id,
        metricKey: limit.metricKey,
        currentValue: limit.currentValue,
        limitValue: limit.limitValue,
      },
    });
  }

  await prisma.billingRecord.upsert({
    where: { id: "billing_record_starter_1" },
    update: {
      subscriptionId: companySubscription.id,
      amount: 2999,
      currency: "TRY",
      periodStart: addDays(today, -30, 0, 0),
      periodEnd: addDays(today, -1, 23, 59),
      paidAt: addDays(today, -29, 12, 0),
      providerRef: "inv_demo_2999",
    },
    create: {
      id: "billing_record_starter_1",
      subscriptionId: companySubscription.id,
      amount: 2999,
      currency: "TRY",
      periodStart: addDays(today, -30, 0, 0),
      periodEnd: addDays(today, -1, 23, 59),
      paidAt: addDays(today, -29, 12, 0),
      providerRef: "inv_demo_2999",
    },
  });

  const mainWarehouse = await prisma.warehouse.upsert({
    where: { id: "wh_nis_main" },
    update: {
      branchId: branchA.id,
      name: "Ana Depo",
      code: "ANA-DEPO",
      description: "Nisantasi ana stok deposu",
      isActive: true,
    },
    create: {
      id: "wh_nis_main",
      branchId: branchA.id,
      name: "Ana Depo",
      code: "ANA-DEPO",
      description: "Nisantasi ana stok deposu",
      isActive: true,
    },
  });

  const branchWarehouse = await prisma.warehouse.upsert({
    where: { id: "wh_etl_main" },
    update: {
      branchId: branchB.id,
      name: "Servis Depo",
      code: "SERVIS-DEPO",
      description: "Etiler servis stok deposu",
      isActive: true,
    },
    create: {
      id: "wh_etl_main",
      branchId: branchB.id,
      name: "Servis Depo",
      code: "SERVIS-DEPO",
      description: "Etiler servis stok deposu",
      isActive: true,
    },
  });

  const kilogramUnit = await prisma.inventoryUnit.upsert({
    where: { id: "unit_kg" },
    update: {
      companyId: company.id,
      name: "Kilogram",
      symbol: "kg",
    },
    create: {
      id: "unit_kg",
      companyId: company.id,
      name: "Kilogram",
      symbol: "kg",
    },
  });

  const hotDrinksCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_hot" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      name: "Sicak Icecekler",
      slug: "sicak-icecekler",
      sortOrder: 1,
      isVisible: true,
      showInQr: true,
    },
    create: {
      id: "menu_cat_hot",
      companyId: company.id,
      branchId: branchA.id,
      name: "Sicak Icecekler",
      slug: "sicak-icecekler",
      sortOrder: 1,
      isVisible: true,
      showInQr: true,
    },
  });

  const dessertsCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_dessert" },
    update: {
      companyId: company.id,
      branchId: branchB.id,
      name: "Tatli",
      slug: "tatli",
      sortOrder: 2,
      isVisible: true,
      showInQr: true,
    },
    create: {
      id: "menu_cat_dessert",
      companyId: company.id,
      branchId: branchB.id,
      name: "Tatli",
      slug: "tatli",
      sortOrder: 2,
      isVisible: true,
      showInQr: true,
    },
  });

  const coldDrinksCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_cold" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      name: "Soguk Icecekler",
      slug: "soguk-icecekler",
      sortOrder: 2,
      isVisible: true,
      showInQr: true,
    },
    create: {
      id: "menu_cat_cold",
      companyId: company.id,
      branchId: branchA.id,
      name: "Soguk Icecekler",
      slug: "soguk-icecekler",
      sortOrder: 2,
      isVisible: true,
      showInQr: true,
    },
  });

  const bakeryCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_bakery" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      name: "Firindan",
      slug: "firindan",
      sortOrder: 3,
      isVisible: true,
      showInQr: true,
    },
    create: {
      id: "menu_cat_bakery",
      companyId: company.id,
      branchId: branchA.id,
      name: "Firindan",
      slug: "firindan",
      sortOrder: 3,
      isVisible: true,
      showInQr: true,
    },
  });

  const chickenPastaCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_chicken_pasta" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      name: "Tavuk Makarna",
      slug: "tavuk-makarna",
      sortOrder: 4,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
    create: {
      id: "menu_cat_chicken_pasta",
      companyId: company.id,
      branchId: branchA.id,
      name: "Tavuk Makarna",
      slug: "tavuk-makarna",
      sortOrder: 4,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
  });

  const breakfastCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_breakfast" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      name: "Kahvalti",
      slug: "kahvalti",
      sortOrder: 5,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
    create: {
      id: "menu_cat_breakfast",
      companyId: company.id,
      branchId: branchA.id,
      name: "Kahvalti",
      slug: "kahvalti",
      sortOrder: 5,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
  });

  const sweetsCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_sweets" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      name: "Tatli",
      slug: "tatli-menu",
      sortOrder: 6,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
    create: {
      id: "menu_cat_sweets",
      companyId: company.id,
      branchId: branchA.id,
      name: "Tatli",
      slug: "tatli-menu",
      sortOrder: 6,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
  });

  const breakfastSpreadCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_breakfast_spread" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      parentId: breakfastCategory.id,
      name: "Serpme Kahvalti",
      slug: "serpme-kahvalti",
      sortOrder: 1,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
    create: {
      id: "menu_cat_breakfast_spread",
      companyId: company.id,
      branchId: branchA.id,
      parentId: breakfastCategory.id,
      name: "Serpme Kahvalti",
      slug: "serpme-kahvalti",
      sortOrder: 1,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
  });

  const breakfastPlateCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_breakfast_plate" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      parentId: breakfastCategory.id,
      name: "Kahvalti Tabagi",
      slug: "kahvalti-tabagi",
      sortOrder: 2,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
    create: {
      id: "menu_cat_breakfast_plate",
      companyId: company.id,
      branchId: branchA.id,
      parentId: breakfastCategory.id,
      name: "Kahvalti Tabagi",
      slug: "kahvalti-tabagi",
      sortOrder: 2,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
  });

  const breakfastExtrasCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_breakfast_extras" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      parentId: breakfastCategory.id,
      name: "Kahvalti Extralari",
      slug: "kahvalti-extralari",
      sortOrder: 3,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
    create: {
      id: "menu_cat_breakfast_extras",
      companyId: company.id,
      branchId: branchA.id,
      parentId: breakfastCategory.id,
      name: "Kahvalti Extralari",
      slug: "kahvalti-extralari",
      sortOrder: 3,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
  });

  const goviBoxCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_govi_box" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Govi Box",
      slug: "govi-box",
      sortOrder: 1,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
    create: {
      id: "menu_cat_govi_box",
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Govi Box",
      slug: "govi-box",
      sortOrder: 1,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
  });

  const pancakeCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_pancake" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Pancake",
      slug: "pancake",
      sortOrder: 2,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
    create: {
      id: "menu_cat_pancake",
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Pancake",
      slug: "pancake",
      sortOrder: 2,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
  });

  const waffleCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_waffle" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Waffle",
      slug: "waffle",
      sortOrder: 3,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
    create: {
      id: "menu_cat_waffle",
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Waffle",
      slug: "waffle",
      sortOrder: 3,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
  });

  const cupDessertCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_cup_dessert" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Cup Tatlilar",
      slug: "cup-tatlilar",
      sortOrder: 4,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
    create: {
      id: "menu_cat_cup_dessert",
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Cup Tatlilar",
      slug: "cup-tatlilar",
      sortOrder: 4,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
  });

  const crepeCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_crepe" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Crepe",
      slug: "crepe",
      sortOrder: 5,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
    create: {
      id: "menu_cat_crepe",
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Crepe",
      slug: "crepe",
      sortOrder: 5,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
  });

  const magnoliaCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_magnolia" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Magnolia ve Tiramisu",
      slug: "magnolia-ve-tiramisu",
      sortOrder: 6,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
    create: {
      id: "menu_cat_magnolia",
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Magnolia ve Tiramisu",
      slug: "magnolia-ve-tiramisu",
      sortOrder: 6,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
  });

  const sweetsExtrasCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_sweet_extras" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Tatli Extralari",
      slug: "tatli-extralari",
      sortOrder: 7,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
    create: {
      id: "menu_cat_sweet_extras",
      companyId: company.id,
      branchId: branchA.id,
      parentId: sweetsCategory.id,
      name: "Tatli Extralari",
      slug: "tatli-extralari",
      sortOrder: 7,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
  });

  await prisma.menuProduct.upsert({
    where: { id: "product_flat_white" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      categoryId: hotDrinksCategory.id,
      name: "Flat White",
      slug: "flat-white",
      basePrice: 165,
      isVisible: true,
      showInQr: true,
    },
    create: {
      id: "product_flat_white",
      companyId: company.id,
      branchId: branchA.id,
      categoryId: hotDrinksCategory.id,
      name: "Flat White",
      slug: "flat-white",
      basePrice: 165,
      isVisible: true,
      showInQr: true,
    },
  });

  const dessertExtrasGroup = await prisma.modifierGroup.upsert({
    where: { id: "modifier_tatli_extras" },
    update: {
      companyId: company.id,
      name: "Tatli Extralari",
      selectionMin: 0,
      selectionMax: 5,
    },
    create: {
      id: "modifier_tatli_extras",
      companyId: company.id,
      name: "Tatli Extralari",
      selectionMin: 0,
      selectionMax: 5,
    },
  });

  await prisma.modifierOption.deleteMany({ where: { groupId: dessertExtrasGroup.id } });
  await prisma.modifierOption.createMany({
    data: [
      { groupId: dessertExtrasGroup.id, name: "Pot Cikolata", priceDiff: 0, sortOrder: 1 },
      { groupId: dessertExtrasGroup.id, name: "Fransiz Biscuit", priceDiff: 0, sortOrder: 2 },
      { groupId: dessertExtrasGroup.id, name: "Muz", priceDiff: 0, sortOrder: 3 },
      { groupId: dessertExtrasGroup.id, name: "Cilek", priceDiff: 0, sortOrder: 4 },
      { groupId: dessertExtrasGroup.id, name: "Ananas", priceDiff: 0, sortOrder: 5 },
      { groupId: dessertExtrasGroup.id, name: "Sade Waffle", priceDiff: 0, sortOrder: 6 },
      { groupId: dessertExtrasGroup.id, name: "Sade Mini Pancake", priceDiff: 0, sortOrder: 7 },
    ],
  });

  const menuProducts = [
    {
      id: "product_kekikli_tavuk_pasta",
      categoryId: chickenPastaCategory.id,
      name: "Kekikli Tavuk",
      slug: "kekikli-tavuk",
      description: "Kekik tavuk, penne makarna, salata",
    },
    {
      id: "product_kremali_mantarli_tavuk",
      categoryId: chickenPastaCategory.id,
      name: "Kremali Mantarli Tavuk",
      slug: "kremali-mantarli-tavuk",
      description: "Kremali mantarli tavuk, penne makarna, salata",
    },
    {
      id: "product_acili_tavuk",
      categoryId: chickenPastaCategory.id,
      name: "Acili Tavuk",
      slug: "acili-tavuk",
      description: "Aci soslu tavuk, penne makarna, salata",
    },
    {
      id: "product_koz_biberli_tavuk",
      categoryId: chickenPastaCategory.id,
      name: "Koz Biberli Tavuk",
      slug: "koz-biberli-tavuk",
      description: "Koz kapyali tavuk, penne makarna, salata",
    },
    {
      id: "product_korili_tavuk",
      categoryId: chickenPastaCategory.id,
      name: "Korili Tavuk",
      slug: "korili-tavuk",
      description: "Kori soslu tavuk, penne makarna, salata",
    },
    {
      id: "product_barbeku_tavuk",
      categoryId: chickenPastaCategory.id,
      name: "Barbeku Tavuk",
      slug: "barbeku-tavuk",
      description: "Barbeku soslu tavuk, penne makarna, salata",
    },
    {
      id: "product_serpme_kahvalti",
      categoryId: breakfastSpreadCategory.id,
      name: "Serpme Kahvalti",
      slug: "serpme-kahvalti",
      description:
        "Ezine peyniri, beyaz peynir, kasar peyniri, izgara hellim, isli peynir, bal, kaymak, cilek receli, sut receli, visne receli, cikolata, yesil ve siyah zeytin, sigara boregi, sosis, yumurtali ekmek, patates kizartmasi, yesillik, sucuk, cirpilmis yumurta, menemen, sinirsiz cay.",
    },
    {
      id: "product_kahvalti_tabagi",
      categoryId: breakfastPlateCategory.id,
      name: "Kahvalti Tabagi",
      slug: "kahvalti-tabagi",
      description: "Bos",
    },
    {
      id: "product_kahvalti_menemen",
      categoryId: breakfastExtrasCategory.id,
      name: "Menemen",
      slug: "kahvalti-menemen",
      description: "Kahvalti extra",
    },
    {
      id: "product_kahvalti_sucuk",
      categoryId: breakfastExtrasCategory.id,
      name: "Sucuk",
      slug: "kahvalti-sucuk",
      description: "Kahvalti extra",
    },
    {
      id: "product_kahvalti_yumurta",
      categoryId: breakfastExtrasCategory.id,
      name: "Yumurta",
      slug: "kahvalti-yumurta",
      description: "Kahvalti extra",
    },
    {
      id: "product_govi_box_2_3",
      categoryId: goviBoxCategory.id,
      name: "Govi Box 2-3",
      slug: "govi-box-2-3",
      description: "Mini pankek, waffle, brownie, muz, cilek, sutlu ve beyaz 2 pot cikolata",
    },
    {
      id: "product_govi_box_4_6",
      categoryId: goviBoxCategory.id,
      name: "Govi Box 4-6",
      slug: "govi-box-4-6",
      description: "Mini pankek, waffle, kruvasan, krep, brownie, muz, cilek, ananas, 4 pot cikolata",
    },
    {
      id: "product_pancake_mix",
      categoryId: pancakeCategory.id,
      name: "Pancake Mix",
      slug: "pancake-mix",
      description: "Mini pankek, muz, cilek, fransiz biscuit, sutlu cikolata, antep fistigi",
    },
    {
      id: "product_pancake_sis",
      categoryId: pancakeCategory.id,
      name: "Pancake Sis",
      slug: "pancake-sis",
      description: "Cubukta mini pankek, muz, cilek, fransiz biscuit, sutlu cikolata, antep fistigi",
    },
    {
      id: "product_pancake_fondue",
      categoryId: pancakeCategory.id,
      name: "Pancake Fondue",
      slug: "pancake-fondue",
      description: "Mini pankek, muz, cilek, 2 pot cikolata",
    },
    {
      id: "product_waffle_bruksel",
      categoryId: waffleCategory.id,
      name: "Waffle Bruksel",
      slug: "waffle-bruksel",
      description: "Muz, cilek, sutlu cikolata, fransiz biscuit, antep fistigi",
    },
    {
      id: "product_waffle_lotus",
      categoryId: waffleCategory.id,
      name: "Waffle Lotus",
      slug: "waffle-lotus",
      description: "Muz, lotus sos, lotus biskuvi parcalari, sutlu cikolata (istege gore dondurma)",
    },
    {
      id: "product_waffle_fondue",
      categoryId: waffleCategory.id,
      name: "Waffle Fondue",
      slug: "waffle-fondue",
      description: "Waffle parcalari, muz, cilek, 2 pot cikolata",
    },
    {
      id: "product_double_waffle",
      categoryId: waffleCategory.id,
      name: "Double Waffle",
      slug: "double-waffle",
      description: "Cift kat waffle, muz, cilek, sutlu cikolata, fransiz biscuit, antep fistigi",
    },
    {
      id: "product_klasik_cup",
      categoryId: cupDessertCategory.id,
      name: "Klasik Cup",
      slug: "klasik-cup",
      description: "Muz, cilek, diplomat krema, fransiz biscuit, sutlu cikolata, antep fistigi",
    },
    {
      id: "product_pancake_cup",
      categoryId: cupDessertCategory.id,
      name: "Pancake Cup",
      slug: "pancake-cup",
      description: "Mini pankek, cilek, muz, sutlu cikolata, antep fistigi",
    },
    {
      id: "product_crepe_cup",
      categoryId: cupDessertCategory.id,
      name: "Crepe Cup",
      slug: "crepe-cup",
      description: "Fettucini krep, muz, cilek, sutlu cikolata, antep fistigi",
    },
    {
      id: "product_dondurmali_cup",
      categoryId: cupDessertCategory.id,
      name: "Dondurmali Cup",
      slug: "dondurmali-cup",
      description: "Vanilyali dondurma, muz, cilek, sutlu cikolata, antep fistigi",
    },
    {
      id: "product_brownie_cup",
      categoryId: cupDessertCategory.id,
      name: "Brownie Cup",
      slug: "brownie-cup",
      description: "Brownie parcalari, muz, cilek, ananas, sutlu cikolata, antep fistigi",
    },
    {
      id: "product_oreo_cup",
      categoryId: cupDessertCategory.id,
      name: "Oreo Cup",
      slug: "oreo-cup",
      description: "Oreo parcalari, muz, cilek, diplomat krema, fransiz biscuit, sutlu cikolata, antep fistigi",
    },
    {
      id: "product_spoonful",
      categoryId: cupDessertCategory.id,
      name: "Spoonful",
      slug: "spoonful",
      description: "Cikolatali kek parcalari, diplomat krema, pirinc patlagi, sutlu cikolata, antep fistigi",
    },
    {
      id: "product_lotus_cup",
      categoryId: cupDessertCategory.id,
      name: "Lotus Cup",
      slug: "lotus-cup",
      description: "Lotus kirintisi, diplomat krema, lotus sos, muz, fransiz biscuit",
    },
    {
      id: "product_dubai_cup",
      categoryId: cupDessertCategory.id,
      name: "Dubai Cup",
      slug: "dubai-cup",
      description: "Antep fistigli citir kadaif harci, diplomat krema, sutlu cikolata, antep fistigi",
    },
    {
      id: "product_crepe_wraps",
      categoryId: crepeCategory.id,
      name: "Crepe Wraps",
      slug: "crepe-wraps",
      description: "Krep, dondurma, muz, cilek, sutlu cikolata, fransiz biscuit, antep fistigi",
    },
    {
      id: "product_crepe_fondue",
      categoryId: crepeCategory.id,
      name: "Crepe Fondue",
      slug: "crepe-fondue",
      description: "Muza sarilmis krep, 1 pot cikolata, fransiz biscuit, antep fistigi",
    },
    {
      id: "product_tiramisu",
      categoryId: magnoliaCategory.id,
      name: "Tiramisu",
      slug: "tiramisu",
      description: "Espresso, kedi dili, tiramisu kremasi, kakao",
    },
    {
      id: "product_klasik_magnolia",
      categoryId: magnoliaCategory.id,
      name: "Klasik Magnolia",
      slug: "klasik-magnolia",
      description: "Muz, cilek, diplomat krema, fransiz biscuit, antep fistigi",
    },
    {
      id: "product_oreo_magnolia",
      categoryId: magnoliaCategory.id,
      name: "Oreo Magnolia",
      slug: "oreo-magnolia",
      description: "Oreo parcalari, diplomat krema, fransiz biscuit, antep fistigi",
    },
    {
      id: "product_lotus_magnolia",
      categoryId: magnoliaCategory.id,
      name: "Lotus Magnolia",
      slug: "lotus-magnolia",
      description: "Lotus parcalari, diplomat krema, fransiz biscuit, antep fistigi",
    },
    {
  ] as const;

  await prisma.menuProduct.deleteMany({
    where: {
      id: {
        in: [
          "product_pot_cikolata",
          "product_fransiz_biscuit",
          "product_muz_extra",
          "product_cilek_extra",
          "product_ananas_extra",
          "product_sade_waffle",
          "product_sade_mini_pancake",
        ],
      },
    },
  });

  for (const product of menuProducts) {
    await prisma.menuProduct.upsert({
      where: { id: product.id },
      update: {
        companyId: company.id,
        branchId: branchA.id,
        categoryId: product.categoryId,
        name: product.name,
        slug: product.slug,
        description: product.description,
        basePrice: 0,
        isVisible: true,
        showInQr: true,
      },
      create: {
        id: product.id,
        companyId: company.id,
        branchId: branchA.id,
        categoryId: product.categoryId,
        name: product.name,
        slug: product.slug,
        description: product.description,
        basePrice: 0,
        isVisible: true,
        showInQr: true,
      },
    });
  }

  await prisma.menuProduct.upsert({
    where: { id: "product_iced_latte" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      categoryId: coldDrinksCategory.id,
      name: "Iced Latte",
      slug: "iced-latte",
      basePrice: 185,
      isVisible: true,
      showInQr: true,
    },
    create: {
      id: "product_iced_latte",
      companyId: company.id,
      branchId: branchA.id,
      categoryId: coldDrinksCategory.id,
      name: "Iced Latte",
      slug: "iced-latte",
      basePrice: 185,
      isVisible: true,
      showInQr: true,
    },
  });

  await prisma.menuProduct.upsert({
    where: { id: "product_butter_croissant" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      categoryId: bakeryCategory.id,
      name: "Tereyagli Kruvasan",
      slug: "tereyagli-kruvasan",
      basePrice: 110,
      isVisible: true,
      showInQr: true,
    },
    create: {
      id: "product_butter_croissant",
      companyId: company.id,
      branchId: branchA.id,
      categoryId: bakeryCategory.id,
      name: "Tereyagli Kruvasan",
      slug: "tereyagli-kruvasan",
      basePrice: 110,
      isVisible: true,
      showInQr: true,
    },
  });

  await prisma.menuProduct.upsert({
    where: { id: "product_san_sebastian" },
    update: {
      companyId: company.id,
      branchId: branchB.id,
      categoryId: dessertsCategory.id,
      name: "San Sebastian",
      slug: "san-sebastian",
      basePrice: 210,
      isVisible: true,
      showInQr: true,
    },
    create: {
      id: "product_san_sebastian",
      companyId: company.id,
      branchId: branchB.id,
      categoryId: dessertsCategory.id,
      name: "San Sebastian",
      slug: "san-sebastian",
      basePrice: 210,
      isVisible: true,
      showInQr: true,
    },
  });

  await prisma.productVariant.deleteMany({ where: { productId: "product_flat_white" } });
  await prisma.productVariant.createMany({
    data: [
      { productId: "product_flat_white", name: "Medium", priceDiff: 0, sortOrder: 0 },
      { productId: "product_flat_white", name: "Large", priceDiff: 20, sortOrder: 1 },
    ],
  });

  const customerA = await prisma.customer.upsert({
    where: { id: "customer_aysenur" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      fullName: "Aysenur Kaya",
      phone: "+90 555 010 10 10",
      email: "aysenur@example.com",
      notes: "Paket serviste zile basilmamali.",
    },
    create: {
      id: "customer_aysenur",
      companyId: company.id,
      branchId: branchA.id,
      fullName: "Aysenur Kaya",
      phone: "+90 555 010 10 10",
      email: "aysenur@example.com",
      notes: "Paket serviste zile basilmamali.",
    },
  });

  await prisma.customerAddress.upsert({
    where: { id: "addr_aysenur_home" },
    update: {
      customerId: customerA.id,
      title: "Ev",
      city: "Istanbul",
      district: "Sisli",
      addressLine: "Nisantasi Mah. Demo Sok. No:12",
      latitude: 41.0521,
      longitude: 28.9952,
      isDefault: true,
    },
    create: {
      id: "addr_aysenur_home",
      customerId: customerA.id,
      title: "Ev",
      city: "Istanbul",
      district: "Sisli",
      addressLine: "Nisantasi Mah. Demo Sok. No:12",
      latitude: 41.0521,
      longitude: 28.9952,
      isDefault: true,
    },
  });

  await prisma.modifierGroup.upsert({
    where: { id: "modifier_milk" },
    update: {
      companyId: company.id,
      name: "Sut Secimi",
      selectionMin: 0,
      selectionMax: 1,
    },
    create: {
      id: "modifier_milk",
      companyId: company.id,
      name: "Sut Secimi",
      selectionMin: 0,
      selectionMax: 1,
    },
  });

  await prisma.modifierOption.deleteMany({ where: { groupId: "modifier_milk" } });
  await prisma.modifierOption.createMany({
    data: [
      { groupId: "modifier_milk", name: "Yulaf Sutu", priceDiff: 18, sortOrder: 0 },
      { groupId: "modifier_milk", name: "Laktozsuz Sut", priceDiff: 14, sortOrder: 1 },
    ],
  });

  await prisma.requiredChoiceGroup.upsert({
    where: { id: "required_size" },
    update: {
      companyId: company.id,
      name: "Boy Secimi",
      selectionMin: 1,
      selectionMax: 1,
    },
    create: {
      id: "required_size",
      companyId: company.id,
      name: "Boy Secimi",
      selectionMin: 1,
      selectionMax: 1,
    },
  });

  await prisma.requiredChoiceOption.deleteMany({ where: { groupId: "required_size" } });
  await prisma.requiredChoiceOption.createMany({
    data: [
      { groupId: "required_size", name: "Medium", priceDiff: 0 },
      { groupId: "required_size", name: "Large", priceDiff: 20 },
    ],
  });

  await prisma.paymentMethodConfig.upsert({
    where: { id: "pay_credit_card" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      name: "Kredi Karti POS",
      code: "credit-card-pos",
      paymentMethod: PaymentMethod.CREDIT_CARD,
      feeRate: 2.99,
      sortOrder: 1,
      isActive: true,
    },
    create: {
      id: "pay_credit_card",
      companyId: company.id,
      branchId: branchA.id,
      name: "Kredi Karti POS",
      code: "credit-card-pos",
      paymentMethod: PaymentMethod.CREDIT_CARD,
      feeRate: 2.99,
      sortOrder: 1,
      isActive: true,
    },
  });

  await prisma.paymentMethodConfig.upsert({
    where: { id: "pay_cash_main" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      name: "Nakit",
      code: "cash-main",
      paymentMethod: PaymentMethod.CASH,
      feeRate: 0,
      sortOrder: 0,
      isActive: true,
    },
    create: {
      id: "pay_cash_main",
      companyId: company.id,
      branchId: branchA.id,
      name: "Nakit",
      code: "cash-main",
      paymentMethod: PaymentMethod.CASH,
      feeRate: 0,
      sortOrder: 0,
      isActive: true,
    },
  });

  await prisma.paymentMethodConfig.upsert({
    where: { id: "pay_meal_card" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      name: "Yemek Karti",
      code: "meal-card-pos",
      paymentMethod: PaymentMethod.MEAL_CARD,
      feeRate: 3.25,
      sortOrder: 2,
      isActive: true,
    },
    create: {
      id: "pay_meal_card",
      companyId: company.id,
      branchId: branchA.id,
      name: "Yemek Karti",
      code: "meal-card-pos",
      paymentMethod: PaymentMethod.MEAL_CARD,
      feeRate: 3.25,
      sortOrder: 2,
      isActive: true,
    },
  });

  await prisma.posDevice.upsert({
    where: { id: "device_ipad_01" },
    update: {
      branchId: branchA.id,
      name: "Kasa 1 POS",
      code: "POS-NIS1-000001",
      deviceType: "payment_pos",
      platform: "Ingenico",
      ipAddress: "192.168.1.21",
      brand: "Ingenico",
      model: "IWE280",
      serialNumber: "ING-000001",
      registryNumber: "SCL-0001",
      connectionType: "NETWORK",
      port: 9100,
      pinCodeEnc: Buffer.from("1234", "utf8").toString("base64"),
      capabilitiesJson: { sale: true, refund: true, void: true, slip: true, qr: false, contactless: true, installment: true },
      settingsJson: { timeout: 30, retry: 2, local_app_mode: true, integration_mode: "mock", mockMode: "success" },
      status: "online",
      isActive: true,
      lastTestStatus: "success",
      lastTestedAt: addDays(today, -1, 9, 0),
      lastSeenAt: addDays(today, 0, 10, 30),
      createdBy: owner.id,
      updatedBy: owner.id,
      deletedAt: null,
    },
    create: {
      id: "device_ipad_01",
      branchId: branchA.id,
      name: "Kasa 1 POS",
      code: "POS-NIS1-000001",
      deviceType: "payment_pos",
      platform: "Ingenico",
      ipAddress: "192.168.1.21",
      brand: "Ingenico",
      model: "IWE280",
      serialNumber: "ING-000001",
      registryNumber: "SCL-0001",
      connectionType: "NETWORK",
      port: 9100,
      pinCodeEnc: Buffer.from("1234", "utf8").toString("base64"),
      capabilitiesJson: { sale: true, refund: true, void: true, slip: true, qr: false, contactless: true, installment: true },
      settingsJson: { timeout: 30, retry: 2, local_app_mode: true, integration_mode: "mock", mockMode: "success" },
      status: "online",
      isActive: true,
      lastTestStatus: "success",
      lastTestedAt: addDays(today, -1, 9, 0),
      lastSeenAt: addDays(today, 0, 10, 30),
      createdBy: owner.id,
      updatedBy: owner.id,
      deletedAt: null,
    },
  });

  const paytrProvider = await prisma.integrationProvider.upsert({
    where: { key: "paytr" },
    update: {
      name: "PayTR",
      category: "payment",
      configSchema: {
        fields: ["merchantId", "merchantKey", "merchantSalt"],
      },
    },
    create: {
      key: "paytr",
      name: "PayTR",
      category: "payment",
      configSchema: {
        fields: ["merchantId", "merchantKey", "merchantSalt"],
      },
    },
  });

  await prisma.integrationProvider.upsert({
    where: { key: "trendyol" },
    update: {
      name: "Trendyol Yemek",
      category: "marketplace",
      configSchema: {
        fields: ["apiKey", "secretKey", "storeId"],
      },
    },
    create: {
      key: "trendyol",
      name: "Trendyol Yemek",
      category: "marketplace",
      configSchema: {
        fields: ["apiKey", "secretKey", "storeId"],
      },
    },
  });

  await prisma.integrationCredential.upsert({
    where: { id: "integration_paytr_main" },
    update: {
      branchId: branchA.id,
      providerId: paytrProvider.id,
      displayName: "Nisantasi PayTR",
      encryptedData: Buffer.from(JSON.stringify({ merchantId: "demo-mid", merchantKey: "demo-key", merchantSalt: "demo-salt" }), "utf8").toString("base64"),
      isActive: true,
    },
    create: {
      id: "integration_paytr_main",
      branchId: branchA.id,
      providerId: paytrProvider.id,
      displayName: "Nisantasi PayTR",
      encryptedData: Buffer.from(JSON.stringify({ merchantId: "demo-mid", merchantKey: "demo-key", merchantSalt: "demo-salt" }), "utf8").toString("base64"),
      isActive: true,
    },
  });

  await prisma.terminal.upsert({
    where: { id: "terminal_main" },
    update: {
      branchId: branchA.id,
      name: "Ana Terminal",
      code: "TERM-01",
      ipAddress: "192.168.1.10",
      status: "online",
      heartbeatAt: new Date(),
    },
    create: {
      id: "terminal_main",
      branchId: branchA.id,
      name: "Ana Terminal",
      code: "TERM-01",
      ipAddress: "192.168.1.10",
      status: "online",
      heartbeatAt: new Date(),
    },
  });

  const posBrandModels = [
    { id: "pos_brand_ingenico_iwe280", brand: "Ingenico", model: "IWE280", requiresIp: true, requiresPort: true, requiresPin: true },
    { id: "pos_brand_ingenico_ve280", brand: "Ingenico", model: "VE280", requiresIp: true, requiresPort: true, requiresPin: true },
    { id: "pos_brand_ingenico_move5000f", brand: "Ingenico", model: "MOVE 5000F", requiresIp: false, requiresPort: false, requiresPin: true },
    { id: "pos_brand_ingenico_paxa910f", brand: "Ingenico", model: "PAX A910F", requiresIp: false, requiresPort: false, requiresPin: true },
    { id: "pos_brand_pavo_e200", brand: "Pavo", model: "Pavo E200", requiresIp: true, requiresPort: true, requiresPin: false },
    { id: "pos_brand_inpos_s1", brand: "InPOS", model: "InPOS S1", requiresIp: true, requiresPort: true, requiresPin: true },
    { id: "pos_brand_beko_x30", brand: "Beko", model: "Beko X30", requiresIp: true, requiresPort: true, requiresPin: true },
    { id: "pos_brand_hugin_t300", brand: "Hugin", model: "Hugin T300", requiresIp: true, requiresPort: true, requiresPin: true },
    { id: "pos_brand_puggo_lite", brand: "PugGo", model: "PugGo Lite", requiresIp: false, requiresPort: false, requiresPin: false },
    { id: "pos_brand_bekocloud_pay", brand: "Beko Cloud", model: "BC Pay", requiresIp: true, requiresPort: false, requiresPin: true },
  ] as const;

  for (const row of posBrandModels) {
    await prisma.posBrandModel.upsert({
      where: { id: row.id },
      update: {
        brand: row.brand,
        model: row.model,
        supportedConnectionTypesJson: row.requiresIp || row.requiresPort ? ["NETWORK", "USB"] : ["USB"],
        requiresIp: row.requiresIp,
        requiresPort: row.requiresPort,
        requiresPin: row.requiresPin,
        isActive: true,
        capabilitiesJson: { sale: true, refund: true, void: true, slip: true, qr: false, contactless: true, installment: true },
      },
      create: {
        id: row.id,
        brand: row.brand,
        model: row.model,
        supportedConnectionTypesJson: row.requiresIp || row.requiresPort ? ["NETWORK", "USB"] : ["USB"],
        requiresIp: row.requiresIp,
        requiresPort: row.requiresPort,
        requiresPin: row.requiresPin,
        isActive: true,
        capabilitiesJson: { sale: true, refund: true, void: true, slip: true, qr: false, contactless: true, installment: true },
      },
    });
  }

  await prisma.posDeviceAssignment.upsert({
    where: { id: "pos_assign_terminal_main" },
    update: {
      posDeviceId: "device_ipad_01",
      branchId: branchA.id,
      terminalId: "terminal_main",
      isDefault: true,
      isActive: true,
    },
    create: {
      id: "pos_assign_terminal_main",
      posDeviceId: "device_ipad_01",
      branchId: branchA.id,
      terminalId: "terminal_main",
      isDefault: true,
      isActive: true,
    },
  });

  await prisma.posDeviceLog.upsert({
    where: { id: "pos_log_seed_test" },
    update: {
      posDeviceId: "device_ipad_01",
      branchId: branchA.id,
      level: "info",
      eventType: "test",
      message: "Seed baglanti testi basarili.",
      contextJson: { latencyMs: 42 },
    },
    create: {
      id: "pos_log_seed_test",
      posDeviceId: "device_ipad_01",
      branchId: branchA.id,
      level: "info",
      eventType: "test",
      message: "Seed baglanti testi basarili.",
      contextJson: { latencyMs: 42 },
    },
  });

  await prisma.printer.upsert({
    where: { id: "printer_kitchen" },
    update: {
      branchId: branchA.id,
      name: "Mutfak Yazici",
      type: "network",
      connectionUri: "tcp://192.168.1.51:9100",
      isKitchen: true,
    },
    create: {
      id: "printer_kitchen",
      branchId: branchA.id,
      name: "Mutfak Yazici",
      type: "network",
      connectionUri: "tcp://192.168.1.51:9100",
      isKitchen: true,
    },
  });

  await prisma.qrMenuSetting.upsert({
    where: { branchId: branchA.id },
    update: {
      themeName: "minimal-dark",
      accentColor: "#ff7a00",
      welcomeTitle: "QR Menu'ye Hos Geldiniz",
      welcomeText: "Masanizdan siparisinizi hizlica olusturun.",
      isPublished: true,
    },
    create: {
      branchId: branchA.id,
      themeName: "minimal-dark",
      accentColor: "#ff7a00",
      welcomeTitle: "QR Menu'ye Hos Geldiniz",
      welcomeText: "Masanizdan siparisinizi hizlica olusturun.",
      isPublished: true,
    },
  });

  await prisma.tableArea.upsert({
    where: { id: "area_garden" },
    update: {
      branchId: branchA.id,
      name: "Bahce",
      sortOrder: 1,
    },
    create: {
      id: "area_garden",
      branchId: branchA.id,
      name: "Bahce",
      sortOrder: 1,
    },
  });

  await prisma.diningTable.upsert({
    where: { id: "table_a1" },
    update: {
      branchId: branchA.id,
      areaId: "area_garden",
      code: "A1",
      name: "Bahce 1",
      colorHex: "#22c55e",
      capacity: 4,
      status: TableStatus.AVAILABLE,
    },
    create: {
      id: "table_a1",
      branchId: branchA.id,
      areaId: "area_garden",
      code: "A1",
      name: "Bahce 1",
      colorHex: "#22c55e",
      capacity: 4,
      status: TableStatus.AVAILABLE,
    },
  });

  await prisma.diningTable.upsert({
    where: { id: "table_a2" },
    update: {
      branchId: branchA.id,
      areaId: "area_garden",
      code: "A2",
      name: "Bahce 2",
      colorHex: "#f59e0b",
      capacity: 4,
      status: TableStatus.AVAILABLE,
      activeTicketId: null,
    },
    create: {
      id: "table_a2",
      branchId: branchA.id,
      areaId: "area_garden",
      code: "A2",
      name: "Bahce 2",
      colorHex: "#f59e0b",
      capacity: 4,
      status: TableStatus.AVAILABLE,
      activeTicketId: null,
    },
  });

  await prisma.backScreenSlide.upsert({
    where: { id: "slide_1" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      title: "Cold Brew Sezonu",
      subtitle: "Yeni tatlar ile yaz menusu aktif.",
      mediaUrl: "https://example.com/slide-1.jpg",
      ctaLabel: "Incele",
      ctaUrl: "https://example.com/menu",
      sortOrder: 1,
      isActive: true,
    },
    create: {
      id: "slide_1",
      companyId: company.id,
      branchId: branchA.id,
      title: "Cold Brew Sezonu",
      subtitle: "Yeni tatlar ile yaz menusu aktif.",
      mediaUrl: "https://example.com/slide-1.jpg",
      ctaLabel: "Incele",
      ctaUrl: "https://example.com/menu",
      sortOrder: 1,
      isActive: true,
    },
  });

  await prisma.tableColorRule.upsert({
    where: { id: "table_color_available" },
    update: {
      branchId: branchA.id,
      name: "Musait Yesil",
      tableStatus: TableStatus.AVAILABLE,
      colorHex: "#22c55e",
      textColorHex: "#ffffff",
      isDefault: true,
    },
    create: {
      id: "table_color_available",
      branchId: branchA.id,
      name: "Musait Yesil",
      tableStatus: TableStatus.AVAILABLE,
      colorHex: "#22c55e",
      textColorHex: "#ffffff",
      isDefault: true,
    },
  });

  await prisma.discountTypeConfig.upsert({
    where: { id: "discount_staff" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      name: "Personel Indirimi",
      code: "staff-discount",
      discountType: DiscountType.PERCENTAGE,
      defaultValue: 15,
      approvalRequired: true,
      isActive: true,
    },
    create: {
      id: "discount_staff",
      companyId: company.id,
      branchId: branchA.id,
      name: "Personel Indirimi",
      code: "staff-discount",
      discountType: DiscountType.PERCENTAGE,
      defaultValue: 15,
      approvalRequired: true,
      isActive: true,
    },
  });

  await prisma.presetNote.upsert({
    where: { id: "preset_note_1" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      title: "Sekersiz",
      content: "Siparis sekersiz hazirlansin.",
      noteType: "service",
      sortOrder: 1,
      isActive: true,
    },
    create: {
      id: "preset_note_1",
      companyId: company.id,
      branchId: branchA.id,
      title: "Sekersiz",
      content: "Siparis sekersiz hazirlansin.",
      noteType: "service",
      sortOrder: 1,
      isActive: true,
    },
  });

  await prisma.posSetting.upsert({
    where: { companyId_branchId_key: { companyId: company.id, branchId: branchA.id, key: "auto_print_kitchen" } },
    update: {
      valueJson: { enabled: true },
      description: "Mutfak fislerini otomatik yazdir",
      isActive: true,
    },
    create: {
      companyId: company.id,
      branchId: branchA.id,
      key: "auto_print_kitchen",
      valueJson: { enabled: true },
      description: "Mutfak fislerini otomatik yazdir",
      isActive: true,
    },
  });

  const pieceUnit = await prisma.inventoryUnit.upsert({
    where: { id: "unit_piece" },
    update: {
      companyId: company.id,
      name: "Adet",
      symbol: "adet",
    },
    create: {
      id: "unit_piece",
      companyId: company.id,
      name: "Adet",
      symbol: "adet",
    },
  });

  const coffeeCategory = await prisma.inventoryCategory.upsert({
    where: { id: "cat_coffee" },
    update: {
      companyId: company.id,
      name: "Kahve ve Hammadde",
      description: "Kahve cekirdegi ve cekirdek bazli hammaddeler",
    },
    create: {
      id: "cat_coffee",
      companyId: company.id,
      name: "Kahve ve Hammadde",
      description: "Kahve cekirdegi ve cekirdek bazli hammaddeler",
    },
  });

  const milkCategory = await prisma.inventoryCategory.upsert({
    where: { id: "cat_milk" },
    update: {
      companyId: company.id,
      name: "Sut ve Yan Urunler",
      description: "Sut ve bitkisel sut urunleri",
    },
    create: {
      id: "cat_milk",
      companyId: company.id,
      name: "Sut ve Yan Urunler",
      description: "Sut ve bitkisel sut urunleri",
    },
  });

  const espressoBeans = await prisma.inventoryItem.upsert({
    where: { id: "inv_espresso" },
    update: {
      warehouseId: mainWarehouse.id,
      categoryId: coffeeCategory.id,
      unitId: kilogramUnit.id,
      name: "Espresso Cekirdegi",
      barcode: "869100000001",
      minimumLevel: 10,
      currentStock: 6,
      isActive: true,
      notes: "Flat White ve espresso bazli iceceklerde kullanilir.",
    },
    create: {
      id: "inv_espresso",
      warehouseId: mainWarehouse.id,
      categoryId: coffeeCategory.id,
      unitId: kilogramUnit.id,
      name: "Espresso Cekirdegi",
      sku: "ESP-001",
      barcode: "869100000001",
      minimumLevel: 10,
      currentStock: 6,
      isActive: true,
      notes: "Flat White ve espresso bazli iceceklerde kullanilir.",
    },
  });

  const wholeMilk = await prisma.inventoryItem.upsert({
    where: { id: "inv_whole_milk_nis" },
    update: {
      warehouseId: mainWarehouse.id,
      categoryId: milkCategory.id,
      unitId: pieceUnit.id,
      name: "Tam Yagli Sut",
      sku: "MILK-001",
      barcode: "869100000002",
      minimumLevel: 20,
      currentStock: 32,
      isActive: true,
      notes: "Flat White ve cappuccino icin.",
    },
    create: {
      id: "inv_whole_milk_nis",
      warehouseId: mainWarehouse.id,
      categoryId: milkCategory.id,
      unitId: pieceUnit.id,
      name: "Tam Yagli Sut",
      sku: "MILK-001",
      barcode: "869100000002",
      minimumLevel: 20,
      currentStock: 32,
      isActive: true,
      notes: "Flat White ve cappuccino icin.",
    },
  });

  const oatMilk = await prisma.inventoryItem.upsert({
    where: { id: "inv_oat_milk" },
    update: {
      warehouseId: branchWarehouse.id,
      categoryId: milkCategory.id,
      unitId: pieceUnit.id,
      name: "Yulaf Sutu",
      barcode: "869100000003",
      minimumLevel: 24,
      currentStock: 9,
      isActive: true,
      notes: "Bitkisel sut opsiyonu.",
    },
    create: {
      id: "inv_oat_milk",
      warehouseId: branchWarehouse.id,
      categoryId: milkCategory.id,
      unitId: pieceUnit.id,
      name: "Yulaf Sutu",
      sku: "OAT-001",
      barcode: "869100000003",
      minimumLevel: 24,
      currentStock: 9,
      isActive: true,
      notes: "Bitkisel sut opsiyonu.",
    },
  });

  await prisma.recipe.upsert({
    where: { productId: "product_flat_white" },
    update: {},
    create: {
      productId: "product_flat_white",
    },
  });

  const flatWhiteRecipe = await prisma.recipe.findUniqueOrThrow({
    where: { productId: "product_flat_white" },
  });

  await prisma.recipeItem.deleteMany({ where: { recipeId: flatWhiteRecipe.id } });
  await prisma.recipeItem.createMany({
    data: [
      { recipeId: flatWhiteRecipe.id, inventoryItemId: espressoBeans.id, quantity: 0.018 },
      { recipeId: flatWhiteRecipe.id, inventoryItemId: wholeMilk.id, quantity: 1 },
    ],
  });

  await prisma.stockEntry.upsert({
    where: { id: "stock_entry_espresso_purchase" },
    update: {
      warehouseId: mainWarehouse.id,
      inventoryItemId: espressoBeans.id,
      entryType: "purchase",
      quantity: 12,
      unitCost: 420,
      referenceType: "manual_seed",
      referenceId: "espresso_purchase",
      createdAt: addDays(today, -12, 9, 0),
      notes: "Aylik cekirdek alimi",
    },
    create: {
      id: "stock_entry_espresso_purchase",
      warehouseId: mainWarehouse.id,
      inventoryItemId: espressoBeans.id,
      entryType: "purchase",
      quantity: 12,
      unitCost: 420,
      referenceType: "manual_seed",
      referenceId: "espresso_purchase",
      createdAt: addDays(today, -12, 9, 0),
      notes: "Aylik cekirdek alimi",
    },
  });

  await prisma.stockEntry.upsert({
    where: { id: "stock_entry_milk_purchase" },
    update: {
      warehouseId: mainWarehouse.id,
      inventoryItemId: wholeMilk.id,
      entryType: "purchase",
      quantity: 40,
      unitCost: 34,
      referenceType: "manual_seed",
      referenceId: "milk_purchase",
      createdAt: addDays(today, -8, 10, 0),
      notes: "Sut alimi",
    },
    create: {
      id: "stock_entry_milk_purchase",
      warehouseId: mainWarehouse.id,
      inventoryItemId: wholeMilk.id,
      entryType: "purchase",
      quantity: 40,
      unitCost: 34,
      referenceType: "manual_seed",
      referenceId: "milk_purchase",
      createdAt: addDays(today, -8, 10, 0),
      notes: "Sut alimi",
    },
  });

  await prisma.stockTransfer.upsert({
    where: { id: "stock_transfer_oat" },
    update: {
      inventoryItemId: oatMilk.id,
      fromWarehouseId: branchWarehouse.id,
      toWarehouseId: mainWarehouse.id,
      quantity: 6,
      transferDate: addDays(today, -3, 16, 0),
      status: "pending",
      note: "Nisantasi subesine destek transferi",
    },
    create: {
      id: "stock_transfer_oat",
      inventoryItemId: oatMilk.id,
      fromWarehouseId: branchWarehouse.id,
      toWarehouseId: mainWarehouse.id,
      quantity: 6,
      transferDate: addDays(today, -3, 16, 0),
      status: "pending",
      note: "Nisantasi subesine destek transferi",
    },
  });

  await prisma.wasteRecord.upsert({
    where: { id: "waste_milk_spoil" },
    update: {
      inventoryItemId: wholeMilk.id,
      quantity: 3,
      reason: "Sicaklik kaynakli bozulma",
      notes: "Dolap kapa gi acik kaldi",
      recordedAt: addDays(today, -1, 19, 30),
    },
    create: {
      id: "waste_milk_spoil",
      inventoryItemId: wholeMilk.id,
      quantity: 3,
      reason: "Sicaklik kaynakli bozulma",
      notes: "Dolap kapa gi acik kaldi",
      recordedAt: addDays(today, -1, 19, 30),
    },
  });

  await prisma.stockAlert.upsert({
    where: { id: "stock_alert_espresso" },
    update: {
      branchId: branchA.id,
      inventoryItemId: espressoBeans.id,
      threshold: 10,
      status: "open",
    },
    create: {
      id: "stock_alert_espresso",
      branchId: branchA.id,
      inventoryItemId: espressoBeans.id,
      threshold: 10,
      status: "open",
    },
  });

  await prisma.stockAlert.upsert({
    where: { id: "stock_alert_oat_milk" },
    update: {
      branchId: branchB.id,
      inventoryItemId: oatMilk.id,
      threshold: 24,
      status: "open",
      resolvedAt: null,
    },
    create: {
      id: "stock_alert_oat_milk",
      branchId: branchB.id,
      inventoryItemId: oatMilk.id,
      threshold: 24,
      status: "open",
      resolvedAt: null,
    },
  });

  await prisma.employeeProfile.upsert({
    where: { id: "emp_manager" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      userId: manager.id,
      employeeCode: "EMP-001",
      department: "Yonetim",
      title: "Sube Muduru",
      birthDate: addDays(today, 2),
      hireDate: addDays(today, -540),
      salary: 32000,
      isActive: true,
      pinCodeEnc: Buffer.from("1111", "utf8").toString("base64"),
    },
    create: {
      id: "emp_manager",
      companyId: company.id,
      branchId: branchA.id,
      userId: manager.id,
      employeeCode: "EMP-001",
      department: "Yonetim",
      title: "Sube Muduru",
      birthDate: addDays(today, 2),
      hireDate: addDays(today, -540),
      salary: 32000,
      isActive: true,
      pinCodeEnc: Buffer.from("1111", "utf8").toString("base64"),
    },
  });

  await prisma.employeeProfile.upsert({
    where: { id: "emp_cashier" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      userId: cashier.id,
      employeeCode: "EMP-002",
      department: "Kasa",
      title: "Kasiyer",
      birthDate: addDays(today, 5),
      hireDate: addDays(today, -300),
      salary: 24000,
      isActive: true,
      pinCodeEnc: Buffer.from("2222", "utf8").toString("base64"),
    },
    create: {
      id: "emp_cashier",
      companyId: company.id,
      branchId: branchA.id,
      userId: cashier.id,
      employeeCode: "EMP-002",
      department: "Kasa",
      title: "Kasiyer",
      birthDate: addDays(today, 5),
      hireDate: addDays(today, -300),
      salary: 24000,
      isActive: true,
      pinCodeEnc: Buffer.from("2222", "utf8").toString("base64"),
    },
  });

  await prisma.employeeProfile.upsert({
    where: { id: "emp_waiter" },
    update: {
      companyId: company.id,
      branchId: branchB.id,
      userId: waiter.id,
      employeeCode: "EMP-003",
      department: "Servis",
      title: "Garson",
      birthDate: addDays(today, 9),
      hireDate: addDays(today, -220),
      salary: 22000,
      isActive: true,
      pinCodeEnc: Buffer.from("3333", "utf8").toString("base64"),
    },
    create: {
      id: "emp_waiter",
      companyId: company.id,
      branchId: branchB.id,
      userId: waiter.id,
      employeeCode: "EMP-003",
      department: "Servis",
      title: "Garson",
      birthDate: addDays(today, 9),
      hireDate: addDays(today, -220),
      salary: 22000,
      isActive: true,
      pinCodeEnc: Buffer.from("3333", "utf8").toString("base64"),
    },
  });

  const shifts = [
    {
      id: "shift_manager_today",
      branchId: branchA.id,
      employeeProfileId: "emp_manager",
      scheduledStartAt: addDays(today, 0, 8, 0),
      scheduledEndAt: addDays(today, 0, 17, 0),
      actualStartAt: addDays(today, 0, 7, 56),
      totalBreakMinutes: 30,
      lateMinutes: 0,
      overtimeMinutes: 0,
      approvalStatus: "approved",
    },
    {
      id: "shift_cashier_today",
      branchId: branchA.id,
      employeeProfileId: "emp_cashier",
      scheduledStartAt: addDays(today, 0, 10, 0),
      scheduledEndAt: addDays(today, 0, 19, 0),
      actualStartAt: addDays(today, 0, 10, 18),
      totalBreakMinutes: 20,
      lateMinutes: 18,
      overtimeMinutes: 0,
      approvalStatus: "pending",
      notes: "QR ile gec giris kaydi",
    },
    {
      id: "shift_waiter_today",
      branchId: branchB.id,
      employeeProfileId: "emp_waiter",
      scheduledStartAt: addDays(today, 0, 14, 0),
      scheduledEndAt: addDays(today, 0, 23, 0),
      actualStartAt: addDays(today, 0, 14, 1),
      actualEndAt: addDays(today, 0, 23, 42),
      totalBreakMinutes: 15,
      lateMinutes: 1,
      overtimeMinutes: 42,
      approvalStatus: "pending",
      notes: "Aksam kapanis fazla mesai",
    },
  ];

  for (const shift of shifts) {
    await prisma.shift.upsert({
      where: { id: shift.id },
      update: shift,
      create: shift,
    });
  }

  await prisma.breakRecord.upsert({
    where: { id: "break_cashier_open" },
    update: {
      employeeProfileId: "emp_cashier",
      shiftId: "shift_cashier_today",
      startedAt: addDays(today, 0, 15, 0),
      endedAt: addDays(today, 0, 15, 42),
      totalMinutes: 42,
      approvalStatus: "pending",
      notes: "Uzun mola kontrolu gerekli",
    },
    create: {
      id: "break_cashier_open",
      employeeProfileId: "emp_cashier",
      shiftId: "shift_cashier_today",
      startedAt: addDays(today, 0, 15, 0),
      endedAt: addDays(today, 0, 15, 42),
      totalMinutes: 42,
      approvalStatus: "pending",
      notes: "Uzun mola kontrolu gerekli",
    },
  });

  const attendanceEvents = [
    {
      id: "attendance_cashier_late",
      branchId: branchA.id,
      employeeProfileId: "emp_cashier",
      shiftId: "shift_cashier_today",
      action: AttendanceAction.SHIFT_IN,
      occurredAt: addDays(today, 0, 10, 18),
      source: "qr",
      lateMinutes: 18,
      overtimeMinutes: 0,
      approvalStatus: "pending",
      note: "Gec kalma onayi bekliyor",
    },
    {
      id: "attendance_waiter_overtime",
      branchId: branchB.id,
      employeeProfileId: "emp_waiter",
      shiftId: "shift_waiter_today",
      action: AttendanceAction.SHIFT_OUT,
      occurredAt: addDays(today, 0, 23, 42),
      source: "qr",
      lateMinutes: 0,
      overtimeMinutes: 42,
      approvalStatus: "pending",
      note: "Fazla mesai onayi bekliyor",
    },
  ];

  for (const event of attendanceEvents) {
    await prisma.attendanceEvent.upsert({
      where: { id: event.id },
      update: event,
      create: event,
    });
  }

  await prisma.goal.upsert({
    where: { id: "goal_monthly_sales" },
    update: {
      branchId: branchA.id,
      employeeProfileId: "emp_cashier",
      title: "Aylik Satis Hedefi",
      description: "Kasiyer bazli ciro hedefi",
      goalScope: "employee",
      goalType: "revenue",
      targetValue: 120000,
      currentValue: 84500,
      bonusBaseValue: 84500,
      progressRate: 70.42,
      status: "active",
      bonusType: "fixed",
      bonusValue: 2500,
      bonusApprovalRequired: true,
      startsAt: addDays(today, -10, 0, 0),
      endsAt: addDays(today, 20, 23, 59),
    },
    create: {
      id: "goal_monthly_sales",
      branchId: branchA.id,
      employeeProfileId: "emp_cashier",
      title: "Aylik Satis Hedefi",
      description: "Kasiyer bazli ciro hedefi",
      goalScope: "employee",
      goalType: "revenue",
      targetValue: 120000,
      currentValue: 84500,
      bonusBaseValue: 84500,
      progressRate: 70.42,
      status: "active",
      bonusType: "fixed",
      bonusValue: 2500,
      bonusApprovalRequired: true,
      startsAt: addDays(today, -10, 0, 0),
      endsAt: addDays(today, 20, 23, 59),
    },
  });

  await prisma.notification.upsert({
    where: { id: "notif_attendance_1" },
    update: {
      branchId: branchA.id,
      userId: manager.id,
      type: NotificationType.ATTENDANCE,
      title: "Gec kalma onayi",
      message: "Elif Kasiyer icin gec kalma kaydi onay bekliyor.",
      isRead: false,
    },
    create: {
      id: "notif_attendance_1",
      branchId: branchA.id,
      userId: manager.id,
      type: NotificationType.ATTENDANCE,
      title: "Gec kalma onayi",
      message: "Elif Kasiyer icin gec kalma kaydi onay bekliyor.",
      isRead: false,
    },
  });

  await prisma.operationalAuditQuestion.upsert({
    where: { id: "audit_question_1" },
    update: {
      branchId: branchA.id,
      question: "Kasada gun sonu raporu dogru sekilde kapatildi mi?",
      category: "Kasa",
      weight: 5,
      sortOrder: 1,
      isActive: true,
    },
    create: {
      id: "audit_question_1",
      branchId: branchA.id,
      question: "Kasada gun sonu raporu dogru sekilde kapatildi mi?",
      category: "Kasa",
      weight: 5,
      sortOrder: 1,
      isActive: true,
    },
  });

  await prisma.operationalAuditSurvey.upsert({
    where: { id: "audit_survey_today" },
    update: {
      branchId: branchA.id,
      assignedToUserId: manager.id,
      title: "Gun Sonu Operasyon Denetimi",
      description: "Nisantasi subesi kapanis kontrol listesi",
      status: "pending",
      dueAt: addDays(today, 0, 23, 30),
      answersJson: {
        sections: [
          { questionId: "audit_question_1", answer: null },
        ],
      },
    },
    create: {
      id: "audit_survey_today",
      branchId: branchA.id,
      assignedToUserId: manager.id,
      title: "Gun Sonu Operasyon Denetimi",
      description: "Nisantasi subesi kapanis kontrol listesi",
      status: "pending",
      dueAt: addDays(today, 0, 23, 30),
      answersJson: {
        sections: [
          { questionId: "audit_question_1", answer: null },
        ],
      },
    },
  });

  const tasks = [
    {
      id: "task_1",
      branchId: branchA.id,
      userId: owner.id,
      title: "Happy hour kampanyasini 16:00 oncesi kontrol et",
      description: "Nisantasi ve Etiler subelerinde kampanya fiyatlarini dogrula.",
      dueAt: addDays(today, 0, 15, 30),
      status: "todo",
    },
    {
      id: "task_2",
      branchId: branchA.id,
      userId: owner.id,
      title: "Kritik stoklar icin satin alma onayi ver",
      description: "Espresso cekirdegi ve yulaf sutu siparislerini ac.",
      dueAt: addDays(today, 0, 13, 0),
      status: "in_progress",
    },
    {
      id: "task_3",
      branchId: branchA.id,
      userId: owner.id,
      title: "Aksam kapanis vardiyalarini takip et",
      description: "Sube bazli kasa farklarini rapora ekle.",
      dueAt: addDays(today, 0, 21, 0),
      status: "todo",
    },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    });
  }

  const campaigns = [
    {
      id: "campaign_1",
      branchId: branchA.id,
      name: "Sabah Kahvesi %15",
      type: CampaignType.TIMED,
      discountType: DiscountType.PERCENTAGE,
      priority: 10,
      isAutomatic: true,
      startsAt: addDays(today, -3, 8, 0),
      endsAt: addDays(today, 4, 12, 0),
      conditionsJson: { startHour: "08:00", endHour: "12:00" },
      benefitsJson: { rate: 15 },
    },
    {
      id: "campaign_2",
      branchId: branchB.id,
      name: "2. Icecekte Yari Fiyat",
      type: CampaignType.BUY_ONE_GET_ONE,
      discountType: DiscountType.AMOUNT,
      priority: 8,
      isAutomatic: true,
      startsAt: addDays(today, -1, 10, 0),
      endsAt: addDays(today, 7, 23, 0),
      conditionsJson: { minCount: 2 },
      benefitsJson: { secondItemRate: 50 },
    },
  ];

  for (const campaign of campaigns) {
    await prisma.campaign.upsert({
      where: { id: campaign.id },
      update: campaign,
      create: campaign,
    });
  }

  const cashAccountA = await prisma.account.upsert({
    where: { branchId_code: { branchId: branchA.id, code: "100.01" } },
    update: {
      name: "Nakit Kasa",
      type: "cash",
    },
    create: {
      branchId: branchA.id,
      code: "100.01",
      name: "Nakit Kasa",
      type: "cash",
    },
  });

  const bankAccountA = await prisma.account.upsert({
    where: { branchId_code: { branchId: branchA.id, code: "102.01" } },
    update: {
      name: "POS / Banka",
      type: "bank",
    },
    create: {
      branchId: branchA.id,
      code: "102.01",
      name: "POS / Banka",
      type: "bank",
    },
  });

  const expenseAccountA = await prisma.account.upsert({
    where: { branchId_code: { branchId: branchA.id, code: "770.01" } },
    update: {
      name: "Genel Giderler",
      type: "expense",
    },
    create: {
      branchId: branchA.id,
      code: "770.01",
      name: "Genel Giderler",
      type: "expense",
    },
  });

  const cashAccountB = await prisma.account.upsert({
    where: { branchId_code: { branchId: branchB.id, code: "100.01" } },
    update: {
      name: "Nakit Kasa",
      type: "cash",
    },
    create: {
      branchId: branchB.id,
      code: "100.01",
      name: "Nakit Kasa",
      type: "cash",
    },
  });

  await prisma.cashClosure.upsert({
    where: { id: "closure_branch_a" },
    update: {
      branchId: branchA.id,
      accountId: cashAccountA.id,
      closureDate: addDays(today, 0, 23, 0),
      expectedAmount: 25480,
      countedAmount: 25320,
      varianceAmount: -160,
      notes: "Gun sonu sayim farki",
    },
    create: {
      id: "closure_branch_a",
      branchId: branchA.id,
      accountId: cashAccountA.id,
      closureDate: addDays(today, 0, 23, 0),
      expectedAmount: 25480,
      countedAmount: 25320,
      varianceAmount: -160,
      notes: "Gun sonu sayim farki",
    },
  });

  const ticketSeed = [
    { id: "ticket_a_1", branchId: branchA.id, openedAt: addDays(today, -6, 9, 10), closedAt: addDays(today, -6, 9, 45), grandTotal: 1280, method: "CREDIT_CARD" },
    { id: "ticket_a_2", branchId: branchA.id, openedAt: addDays(today, -4, 12, 20), closedAt: addDays(today, -4, 12, 55), grandTotal: 1640, method: "CASH" },
    { id: "ticket_a_3", branchId: branchA.id, openedAt: addDays(today, -2, 18, 0), closedAt: addDays(today, -2, 18, 32), grandTotal: 2150, method: "CREDIT_CARD" },
    { id: "ticket_a_4", branchId: branchA.id, openedAt: addDays(today, 0, 11, 5), closedAt: addDays(today, 0, 11, 42), grandTotal: 1780, method: "MEAL_CARD" },
    { id: "ticket_b_1", branchId: branchB.id, openedAt: addDays(today, -5, 10, 15), closedAt: addDays(today, -5, 10, 48), grandTotal: 980, method: "CASH" },
    { id: "ticket_b_2", branchId: branchB.id, openedAt: addDays(today, -3, 15, 40), closedAt: addDays(today, -3, 16, 8), grandTotal: 1420, method: "CREDIT_CARD" },
    { id: "ticket_b_3", branchId: branchB.id, openedAt: addDays(today, -1, 19, 10), closedAt: addDays(today, -1, 19, 39), grandTotal: 1975, method: "CASH" },
    { id: "ticket_b_4", branchId: branchB.id, openedAt: addDays(today, 0, 13, 0), closedAt: addDays(today, 0, 13, 35), grandTotal: 1560, method: "CREDIT_CARD" },
  ] as const;

  for (const ticket of ticketSeed) {
    await prisma.ticket.upsert({
      where: { id: ticket.id },
      update: {
        companyId: company.id,
        branchId: ticket.branchId,
        customerId: ticket.branchId === branchA.id ? customerA.id : null,
        channel: TicketChannel.TABLE,
        status: TicketStatus.PAID,
        ticketName: `Demo ${ticket.id}`,
        coverCount: 2,
        openedAt: ticket.openedAt,
        closedAt: ticket.closedAt,
        subtotal: ticket.grandTotal,
        discountTotal: 80,
        taxTotal: 0,
        grandTotal: ticket.grandTotal,
      },
      create: {
        id: ticket.id,
        companyId: company.id,
        branchId: ticket.branchId,
        customerId: ticket.branchId === branchA.id ? customerA.id : null,
        channel: TicketChannel.TABLE,
        status: TicketStatus.PAID,
        ticketName: `Demo ${ticket.id}`,
        coverCount: 2,
        openedAt: ticket.openedAt,
        closedAt: ticket.closedAt,
        subtotal: ticket.grandTotal,
        discountTotal: 80,
        taxTotal: 0,
        grandTotal: ticket.grandTotal,
      },
    });

    await prisma.payment.upsert({
      where: { id: `payment_${ticket.id}` },
      update: {
        ticketId: ticket.id,
        accountId:
          ticket.method === "CASH"
            ? ticket.branchId === branchA.id
              ? cashAccountA.id
              : cashAccountB.id
            : bankAccountA.id,
        method: ticket.method as PaymentMethod,
        status: PaymentStatus.COMPLETED,
        amount: ticket.grandTotal,
        paidAt: ticket.closedAt,
        notes: "Seed tahsilat kaydi",
      },
      create: {
        id: `payment_${ticket.id}`,
        ticketId: ticket.id,
        accountId:
          ticket.method === "CASH"
            ? ticket.branchId === branchA.id
              ? cashAccountA.id
              : cashAccountB.id
            : bankAccountA.id,
        method: ticket.method as PaymentMethod,
        status: PaymentStatus.COMPLETED,
        amount: ticket.grandTotal,
        paidAt: ticket.closedAt,
        notes: "Seed tahsilat kaydi",
      },
    });

    await prisma.ticketItem.upsert({
      where: { id: `item_${ticket.id}_flatwhite` },
      update: {
        ticketId: ticket.id,
        productId: "product_flat_white",
        productName: "Flat White",
        quantity: 2,
        unitPrice: 195,
        discountTotal: 0,
        taxTotal: 19.5,
        lineTotal: 390,
      },
      create: {
        id: `item_${ticket.id}_flatwhite`,
        ticketId: ticket.id,
        productId: "product_flat_white",
        productName: "Flat White",
        quantity: 2,
        unitPrice: 195,
        discountTotal: 0,
        taxTotal: 19.5,
        lineTotal: 390,
      },
    });
  }

  await prisma.ticket.upsert({
    where: { id: "ticket_live_open" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      createdByUserId: waiter.id,
      customerId: customerA.id,
      tableId: "table_a2",
      channel: TicketChannel.TABLE,
      status: TicketStatus.OPEN,
      ticketName: "Masa A2 / Canli Demo",
      coverCount: 2,
      openedAt: addDays(today, 0, 14, 5),
      closedAt: null,
      subtotal: 295,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 295,
    },
    create: {
      id: "ticket_live_open",
      companyId: company.id,
      branchId: branchA.id,
      createdByUserId: waiter.id,
      customerId: customerA.id,
      tableId: "table_a2",
      channel: TicketChannel.TABLE,
      status: TicketStatus.OPEN,
      ticketName: "Masa A2 / Canli Demo",
      coverCount: 2,
      openedAt: addDays(today, 0, 14, 5),
      closedAt: null,
      subtotal: 295,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 295,
    },
  });

  await prisma.ticketItem.upsert({
    where: { id: "item_ticket_live_open_1" },
    update: {
      ticketId: "ticket_live_open",
      productId: "product_flat_white",
      productName: "Flat White",
      quantity: 1,
      unitPrice: 195,
      discountTotal: 0,
      taxTotal: 0,
      lineTotal: 195,
    },
    create: {
      id: "item_ticket_live_open_1",
      ticketId: "ticket_live_open",
      productId: "product_flat_white",
      productName: "Flat White",
      quantity: 1,
      unitPrice: 195,
      discountTotal: 0,
      taxTotal: 0,
      lineTotal: 195,
    },
  });

  await prisma.ticketItem.upsert({
    where: { id: "item_ticket_live_open_2" },
    update: {
      ticketId: "ticket_live_open",
      productId: "product_butter_croissant",
      productName: "Tereyagli Kruvasan",
      quantity: 1,
      unitPrice: 100,
      discountTotal: 0,
      taxTotal: 0,
      lineTotal: 100,
    },
    create: {
      id: "item_ticket_live_open_2",
      ticketId: "ticket_live_open",
      productId: "product_butter_croissant",
      productName: "Tereyagli Kruvasan",
      quantity: 1,
      unitPrice: 100,
      discountTotal: 0,
      taxTotal: 0,
      lineTotal: 100,
    },
  });

  await prisma.ticket.upsert({
    where: { id: "ticket_live_pending" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      createdByUserId: cashier.id,
      customerId: customerA.id,
      tableId: null,
      channel: TicketChannel.SELF_SERVICE,
      status: TicketStatus.PAYMENT_PENDING,
      ticketName: "Self Service / Odeme Bekliyor",
      coverCount: 1,
      openedAt: addDays(today, 0, 15, 10),
      closedAt: null,
      subtotal: 185,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 185,
    },
    create: {
      id: "ticket_live_pending",
      companyId: company.id,
      branchId: branchA.id,
      createdByUserId: cashier.id,
      customerId: customerA.id,
      tableId: null,
      channel: TicketChannel.SELF_SERVICE,
      status: TicketStatus.PAYMENT_PENDING,
      ticketName: "Self Service / Odeme Bekliyor",
      coverCount: 1,
      openedAt: addDays(today, 0, 15, 10),
      closedAt: null,
      subtotal: 185,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 185,
    },
  });

  await prisma.ticketItem.upsert({
    where: { id: "item_ticket_live_pending_1" },
    update: {
      ticketId: "ticket_live_pending",
      productId: "product_iced_latte",
      productName: "Iced Latte",
      quantity: 1,
      unitPrice: 185,
      discountTotal: 0,
      taxTotal: 0,
      lineTotal: 185,
    },
    create: {
      id: "item_ticket_live_pending_1",
      ticketId: "ticket_live_pending",
      productId: "product_iced_latte",
      productName: "Iced Latte",
      quantity: 1,
      unitPrice: 185,
      discountTotal: 0,
      taxTotal: 0,
      lineTotal: 185,
    },
  });

  await prisma.payment.upsert({
    where: { id: "payment_ticket_live_pending" },
    update: {
      ticketId: "ticket_live_pending",
      accountId: bankAccountA.id,
      method: PaymentMethod.CREDIT_CARD,
      status: PaymentStatus.PENDING,
      amount: 185,
      paidAt: null,
      notes: "Demo bekleyen POS odemesi",
    },
    create: {
      id: "payment_ticket_live_pending",
      ticketId: "ticket_live_pending",
      accountId: bankAccountA.id,
      method: PaymentMethod.CREDIT_CARD,
      status: PaymentStatus.PENDING,
      amount: 185,
      paidAt: null,
      notes: "Demo bekleyen POS odemesi",
    },
  });

  await prisma.diningTable.update({
    where: { id: "table_a2" },
    data: {
      status: TableStatus.OCCUPIED,
      activeTicketId: "ticket_live_open",
    },
  });

  await prisma.registerClosing.upsert({
    where: { id: "register_demo_closed" },
    update: {
      branchId: branchA.id,
      userId: cashier.id,
      terminalId: "terminal_main",
      openingCash: 1200,
      expectedCash: 3280,
      countedCash: 3250,
      difference: -30,
      isOpen: false,
      createdAt: addDays(today, -1, 8, 0),
      closedAt: addDays(today, -1, 23, 10),
    },
    create: {
      id: "register_demo_closed",
      branchId: branchA.id,
      userId: cashier.id,
      terminalId: "terminal_main",
      openingCash: 1200,
      expectedCash: 3280,
      countedCash: 3250,
      difference: -30,
      isOpen: false,
      createdAt: addDays(today, -1, 8, 0),
      closedAt: addDays(today, -1, 23, 10),
    },
  });

  await prisma.paymentBreakdown.upsert({
    where: { closingId: "register_demo_closed" },
    update: {
      cash: 1540,
      card: 1310,
      mobile: 430,
    },
    create: {
      closingId: "register_demo_closed",
      cash: 1540,
      card: 1310,
      mobile: 430,
    },
  });

  await prisma.cashDenomination.deleteMany({
    where: { closingId: "register_demo_closed" },
  });

  await prisma.cashDenomination.createMany({
    data: [
      { closingId: "register_demo_closed", denomination: 200, quantity: 10, total: 2000 },
      { closingId: "register_demo_closed", denomination: 100, quantity: 8, total: 800 },
      { closingId: "register_demo_closed", denomination: 50, quantity: 5, total: 250 },
      { closingId: "register_demo_closed", denomination: 20, quantity: 10, total: 200 },
    ],
  });

  await prisma.registerClosing.upsert({
    where: { id: "register_demo_open" },
    update: {
      branchId: branchA.id,
      userId: cashier.id,
      terminalId: "terminal_main",
      openingCash: 800,
      expectedCash: 985,
      countedCash: null,
      difference: null,
      isOpen: true,
      createdAt: addDays(today, 0, 8, 0),
      closedAt: null,
    },
    create: {
      id: "register_demo_open",
      branchId: branchA.id,
      userId: cashier.id,
      terminalId: "terminal_main",
      openingCash: 800,
      expectedCash: 985,
      countedCash: null,
      difference: null,
      isOpen: true,
      createdAt: addDays(today, 0, 8, 0),
      closedAt: null,
    },
  });

  await prisma.paymentBreakdown.upsert({
    where: { closingId: "register_demo_open" },
    update: {
      cash: 185,
      card: 430,
      mobile: 120,
    },
    create: {
      closingId: "register_demo_open",
      cash: 185,
      card: 430,
      mobile: 120,
    },
  });

  const registerTransactions = [
    {
      id: "register_tx_sale_cash_demo",
      branchId: branchA.id,
      closingId: "register_demo_closed",
      userId: cashier.id,
      type: "sale",
      amount: 1640,
      paymentType: "cash",
      orderId: "ticket_a_2",
      createdAt: addDays(today, -1, 12, 55),
    },
    {
      id: "register_tx_sale_card_demo",
      branchId: branchA.id,
      closingId: "register_demo_closed",
      userId: cashier.id,
      type: "sale",
      amount: 1280,
      paymentType: "card",
      orderId: "ticket_a_1",
      createdAt: addDays(today, -1, 9, 45),
    },
    {
      id: "register_tx_expense_demo",
      branchId: branchA.id,
      closingId: "register_demo_closed",
      userId: cashier.id,
      type: "expense",
      amount: 140,
      paymentType: "cash",
      orderId: null,
      createdAt: addDays(today, -1, 18, 10),
    },
    {
      id: "register_tx_refund_demo",
      branchId: branchA.id,
      closingId: "register_demo_closed",
      userId: cashier.id,
      type: "refund",
      amount: 60,
      paymentType: "card",
      orderId: "ticket_a_3",
      createdAt: addDays(today, -1, 20, 30),
    },
    {
      id: "register_tx_sale_open_demo",
      branchId: branchA.id,
      closingId: "register_demo_open",
      userId: cashier.id,
      type: "sale",
      amount: 185,
      paymentType: "cash",
      orderId: "ticket_live_pending",
      createdAt: addDays(today, 0, 15, 12),
    },
  ] as const;

  for (const transaction of registerTransactions) {
    await prisma.registerTransaction.upsert({
      where: { id: transaction.id },
      update: transaction,
      create: transaction,
    });
  }

  await prisma.expense.upsert({
    where: { id: "expense_pos_demo" },
    update: {
      branchId: branchA.id,
      accountId: expenseAccountA.id,
      userId: cashier.id,
      title: "Anlik Market Alimi",
      description: "Bardak kapagi ve pecete alimi",
      expenseType: "pos_expense",
      category: "Operasyon",
      amount: 140,
      recurrenceType: "once",
      note: "Kasa uzerinden odendi",
      expenseDate: addDays(today, -1, 18, 5),
      isActive: true,
    },
    create: {
      id: "expense_pos_demo",
      branchId: branchA.id,
      accountId: expenseAccountA.id,
      userId: cashier.id,
      title: "Anlik Market Alimi",
      description: "Bardak kapagi ve pecete alimi",
      expenseType: "pos_expense",
      category: "Operasyon",
      amount: 140,
      recurrenceType: "once",
      note: "Kasa uzerinden odendi",
      expenseDate: addDays(today, -1, 18, 5),
      isActive: true,
    },
  });

  await prisma.posDeviceTransaction.upsert({
    where: { id: "pos_tx_seed_1" },
    update: {
      posDeviceId: "device_ipad_01",
      branchId: branchA.id,
      terminalId: "terminal_main",
      ticketId: "ticket_a_1",
      transactionType: "sale",
      amount: 1280,
      currency: "TRY",
      referenceNo: "REF-123456",
      rrnNo: "RRN-123456",
      stanNo: "STAN-123456",
      batchNo: "BATCH-123456",
      authCode: "AUTH-123456",
      maskedCardNo: "**** **** **** 1234",
      cardBrand: "VISA",
      responseCode: "00",
      responseMessage: "Satis onaylandi.",
      providerStatus: "success",
      providerPayloadJson: { status: "success", code: "00" },
      requestPayloadJson: { paymentMethod: "CREDIT_CARD" },
      status: PosTransactionStatus.SUCCESS,
      startedAt: addDays(today, -6, 9, 30),
      completedAt: addDays(today, -6, 9, 30),
      createdBy: cashier.id,
    },
    create: {
      id: "pos_tx_seed_1",
      posDeviceId: "device_ipad_01",
      branchId: branchA.id,
      terminalId: "terminal_main",
      ticketId: "ticket_a_1",
      transactionType: "sale",
      amount: 1280,
      currency: "TRY",
      referenceNo: "REF-123456",
      rrnNo: "RRN-123456",
      stanNo: "STAN-123456",
      batchNo: "BATCH-123456",
      authCode: "AUTH-123456",
      maskedCardNo: "**** **** **** 1234",
      cardBrand: "VISA",
      responseCode: "00",
      responseMessage: "Satis onaylandi.",
      providerStatus: "success",
      providerPayloadJson: { status: "success", code: "00" },
      requestPayloadJson: { paymentMethod: "CREDIT_CARD" },
      status: PosTransactionStatus.SUCCESS,
      startedAt: addDays(today, -6, 9, 30),
      completedAt: addDays(today, -6, 9, 30),
      createdBy: cashier.id,
    },
  });

  const businessCustomer = await prisma.customer.upsert({
    where: { id: "customer_demo_b2b" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      customerType: "business",
      fullName: "Melis Demir",
      businessName: "Demir Creative Studio",
      phone: "+90 555 010 20 20",
      email: "ofis@demircreative.com",
      taxNumber: "9988776655",
      taxOffice: "Besiktas",
      billingAddress: "Tesvikiye Cad. No:21 Sisli / Istanbul",
      notes: "Aylik toplu toplantilar icin kurumsal musteri",
    },
    create: {
      id: "customer_demo_b2b",
      companyId: company.id,
      branchId: branchA.id,
      customerType: "business",
      fullName: "Melis Demir",
      businessName: "Demir Creative Studio",
      phone: "+90 555 010 20 20",
      email: "ofis@demircreative.com",
      taxNumber: "9988776655",
      taxOffice: "Besiktas",
      billingAddress: "Tesvikiye Cad. No:21 Sisli / Istanbul",
      notes: "Aylik toplu toplantilar icin kurumsal musteri",
    },
  });

  const supplier = await prisma.supplier.upsert({
    where: { id: "supplier_demo_roastery" },
    update: {
      companyId: company.id,
      name: "Roastery Tedarik A.S.",
      taxNumber: "1122334455",
      taxOffice: "Maslak",
      phone: "+90 212 555 44 33",
      email: "tedarik@roastery.com",
      addressLine: "Maslak Mah. Buyukdere Cad. No:101",
    },
    create: {
      id: "supplier_demo_roastery",
      companyId: company.id,
      name: "Roastery Tedarik A.S.",
      taxNumber: "1122334455",
      taxOffice: "Maslak",
      phone: "+90 212 555 44 33",
      email: "tedarik@roastery.com",
      addressLine: "Maslak Mah. Buyukdere Cad. No:101",
    },
  });

  await prisma.invoice.upsert({
    where: { branchId_invoiceNo: { branchId: branchA.id, invoiceNo: "ALD-2026-0001" } },
    update: {
      supplierId: supplier.id,
      branchId: branchA.id,
      accountId: expenseAccountA.id,
      invoiceNo: "ALD-2026-0001",
      issueDate: addDays(today, -2, 9, 0),
      totalBase: 2500,
      totalVat: 500,
      grandTotal: 3000,
      notes: "Cekirdek ve sut alimi",
    },
    create: {
      supplierId: supplier.id,
      branchId: branchA.id,
      accountId: expenseAccountA.id,
      invoiceNo: "ALD-2026-0001",
      issueDate: addDays(today, -2, 9, 0),
      totalBase: 2500,
      totalVat: 500,
      grandTotal: 3000,
      notes: "Cekirdek ve sut alimi",
    },
  });

  const seededInvoice = await prisma.invoice.findFirstOrThrow({
    where: { branchId: branchA.id, invoiceNo: "ALD-2026-0001" },
  });

  await prisma.invoiceItem.upsert({
    where: { id: "invoice_item_beans" },
    update: {
      invoiceId: seededInvoice.id,
      description: "Espresso cekirdegi",
      quantity: 10,
      unitPrice: 150,
      vatRate: 20,
      lineTotal: 1500,
    },
    create: {
      id: "invoice_item_beans",
      invoiceId: seededInvoice.id,
      description: "Espresso cekirdegi",
      quantity: 10,
      unitPrice: 150,
      vatRate: 20,
      lineTotal: 1500,
    },
  });

  await prisma.invoiceItem.upsert({
    where: { id: "invoice_item_milk" },
    update: {
      invoiceId: seededInvoice.id,
      description: "Yulaf sut",
      quantity: 20,
      unitPrice: 50,
      vatRate: 20,
      lineTotal: 1000,
    },
    create: {
      id: "invoice_item_milk",
      invoiceId: seededInvoice.id,
      description: "Yulaf sut",
      quantity: 20,
      unitPrice: 50,
      vatRate: 20,
      lineTotal: 1000,
    },
  });

  await prisma.unitCost.upsert({
    where: { id: "unit_cost_flatwhite" },
    update: {
      productId: "product_flat_white",
      cost: 68,
      effectiveAt: addDays(today, -3, 0, 0),
    },
    create: {
      id: "unit_cost_flatwhite",
      productId: "product_flat_white",
      cost: 68,
      effectiveAt: addDays(today, -3, 0, 0),
    },
  });

  await prisma.expense.upsert({
    where: { id: "expense_rent" },
    update: {
      branchId: branchA.id,
      accountId: expenseAccountA.id,
      title: "Sube Kirasi",
      expenseType: "fixed_cost",
      category: "Kira",
      amount: 45000,
      note: "Mart ayi kira odemesi",
      expenseDate: addDays(today, -5, 10, 0),
    },
    create: {
      id: "expense_rent",
      branchId: branchA.id,
      accountId: expenseAccountA.id,
      title: "Sube Kirasi",
      expenseType: "fixed_cost",
      category: "Kira",
      amount: 45000,
      note: "Mart ayi kira odemesi",
      expenseDate: addDays(today, -5, 10, 0),
    },
  });

  await prisma.payrollPayment.upsert({
    where: { id: "payroll_manager_march" },
    update: {
      branchId: branchA.id,
      employeeProfileId: "emp_manager",
      accountId: bankAccountA.id,
      amount: 38000,
      paymentDate: addDays(today, -1, 17, 0),
      notes: "Mart maasi",
    },
    create: {
      id: "payroll_manager_march",
      branchId: branchA.id,
      employeeProfileId: "emp_manager",
      accountId: bankAccountA.id,
      amount: 38000,
      paymentDate: addDays(today, -1, 17, 0),
      notes: "Mart maasi",
    },
  });

  await prisma.otherPayment.upsert({
    where: { id: "other_payment_marketing" },
    update: {
      branchId: branchA.id,
      accountId: expenseAccountA.id,
      title: "Instagram Reklam",
      category: "Pazarlama",
      amount: 12500,
      paymentDate: addDays(today, -4, 14, 0),
      notes: "Aylik reklam butcesi",
    },
    create: {
      id: "other_payment_marketing",
      branchId: branchA.id,
      accountId: expenseAccountA.id,
      title: "Instagram Reklam",
      category: "Pazarlama",
      amount: 12500,
      paymentDate: addDays(today, -4, 14, 0),
      notes: "Aylik reklam butcesi",
    },
  });

  await prisma.supplierVatReport.upsert({
    where: { id: "supplier_vat_march" },
    update: {
      supplierId: supplier.id,
      periodStart: addDays(today, -30, 0, 0),
      periodEnd: addDays(today, 0, 23, 59),
      totalBase: 2500,
      totalVat: 500,
    },
    create: {
      id: "supplier_vat_march",
      supplierId: supplier.id,
      periodStart: addDays(today, -30, 0, 0),
      periodEnd: addDays(today, 0, 23, 59),
      totalBase: 2500,
      totalVat: 500,
    },
  });

  await prisma.customerVatReport.upsert({
    where: { id: "customer_vat_march" },
    update: {
      customerId: businessCustomer.id,
      periodStart: addDays(today, -30, 0, 0),
      periodEnd: addDays(today, 0, 23, 59),
      totalBase: 8200,
      totalVat: 1640,
    },
    create: {
      id: "customer_vat_march",
      customerId: businessCustomer.id,
      periodStart: addDays(today, -30, 0, 0),
      periodEnd: addDays(today, 0, 23, 59),
      totalBase: 8200,
      totalVat: 1640,
    },
  });

  await prisma.productRating.upsert({
    where: { id: "product_rating_1" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      productId: "product_flat_white",
      customerId: customerA.id,
      score: 5,
      comment: "Kopuk yapisi cok basarili, sunum premium.",
      source: "qr_feedback",
    },
    create: {
      id: "product_rating_1",
      companyId: company.id,
      branchId: branchA.id,
      productId: "product_flat_white",
      customerId: customerA.id,
      score: 5,
      comment: "Kopuk yapisi cok basarili, sunum premium.",
      source: "qr_feedback",
    },
  });

  await prisma.productRating.upsert({
    where: { id: "product_rating_2" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      productId: "product_flat_white",
      customerId: businessCustomer.id,
      score: 4,
      comment: "Toplu sipariste bile kalite stabil.",
      source: "manual",
    },
    create: {
      id: "product_rating_2",
      companyId: company.id,
      branchId: branchA.id,
      productId: "product_flat_white",
      customerId: businessCustomer.id,
      score: 4,
      comment: "Toplu sipariste bile kalite stabil.",
      source: "manual",
    },
  });

  await prisma.staffDiscount.upsert({
    where: { id: "staff_discount_cashier" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      employeeProfileId: "emp_cashier",
      title: "Kasiyer Ozel Indirim",
      discountType: "percentage",
      value: 20,
      dailyLimit: 1500,
      monthlyLimit: 15000,
      approvalRequired: true,
      isActive: true,
    },
    create: {
      id: "staff_discount_cashier",
      companyId: company.id,
      branchId: branchA.id,
      employeeProfileId: "emp_cashier",
      title: "Kasiyer Ozel Indirim",
      discountType: "percentage",
      value: 20,
      dailyLimit: 1500,
      monthlyLimit: 15000,
      approvalRequired: true,
      isActive: true,
    },
  });

  await prisma.supportTicket.upsert({
    where: { id: "support_ticket_demo" },
    update: {
      companyId: company.id,
      branchId: branchA.id,
      subject: "PayTR callback gecikmesi",
      category: "entegrasyon",
      priority: "high",
      status: "in_progress",
      description: "Bazi siparislerde callback gecikmeli dusuyor, webhook log kontrolu isteniyor.",
      assigneeEmail: "support@aldal.local",
      messagesJson: [
        { from: "branch", message: "Sorun sabah saatlerinde tekrar etti." },
        { from: "support", message: "Webhook imzasi ve timeout degerleri inceleniyor." },
      ],
    },
    create: {
      id: "support_ticket_demo",
      companyId: company.id,
      branchId: branchA.id,
      subject: "PayTR callback gecikmesi",
      category: "entegrasyon",
      priority: "high",
      status: "in_progress",
      description: "Bazi siparislerde callback gecikmeli dusuyor, webhook log kontrolu isteniyor.",
      assigneeEmail: "support@aldal.local",
      messagesJson: [
        { from: "branch", message: "Sorun sabah saatlerinde tekrar etti." },
        { from: "support", message: "Webhook imzasi ve timeout degerleri inceleniyor." },
      ],
    },
  });

  console.log("Seed tamamlandi:", {
    company: company.name,
    branches: [branchA.name, branchB.name],
    users: [owner.email, manager.email, cashier.email, waiter.email],
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
