import { PrismaClient, TableStatus } from "@prisma/client";
import { hash } from "bcryptjs";
import { assertSafeDemoEnvironment } from "./demo-safety";
import { permissionCatalog } from "../src/common/auth/permissions";
import { roleMatrix } from "../src/common/auth/rbac";

const prisma = new PrismaClient();

function slugifyTr(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function seedId(prefix: string, name: string) {
  const slug = slugifyTr(name).slice(0, 60) || "item";
  return `${prefix}_${slug}`;
}

async function main() {
  assertSafeDemoEnvironment("seed");

  // ----------------------------------------------------------------------------
  // Tenant + Şube (tek şube: Dazkırı)
  // ----------------------------------------------------------------------------
  const company = await prisma.company.upsert({
    where: { id: "cmp_aldal_demo" },
    update: {},
    create: {
      id: "cmp_aldal_demo",
      name: "Aldal",
      legalName: "Aldal",
      taxNumber: "1234567890",
      timezone: "Europe/Istanbul",
      currency: "TRY",
    },
  });

  const branch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: "DAZ-01" } },
    update: {
      name: "Dazkırı",
      city: "Afyonkarahisar",
      district: "Dazkırı",
      addressLine: "Dazkırı / Afyonkarahisar",
      phone: "+90 212 000 00 01",
      isActive: true,
    },
    create: {
      companyId: company.id,
      name: "Dazkırı",
      code: "DAZ-01",
      city: "Afyonkarahisar",
      district: "Dazkırı",
      addressLine: "Dazkırı / Afyonkarahisar",
      phone: "+90 212 000 00 01",
      isActive: true,
    },
  });

  // ----------------------------------------------------------------------------
  // RBAC (permission + role matrix) — sistem için gerekli
  // ----------------------------------------------------------------------------
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
      update: { name: key },
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
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  // ----------------------------------------------------------------------------
  // Kullanıcılar (admin panel + POS login için gerekli)
  // ----------------------------------------------------------------------------
  const ownerPasswordHash = await hash("ChangeMe123!", 10);
  const owner = await prisma.user.upsert({
    where: { email: "owner@aldal.local" },
    update: { passwordHash: ownerPasswordHash, companyId: company.id, defaultBranchId: branch.id },
    create: {
      companyId: company.id,
      defaultBranchId: branch.id,
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
    update: { passwordHash: branchManagerPasswordHash, companyId: company.id, defaultBranchId: branch.id },
    create: {
      companyId: company.id,
      defaultBranchId: branch.id,
      fullName: "Dazkırı Branch Manager",
      email: "manager@aldal.local",
      phone: "+90 555 000 00 01",
      passwordHash: branchManagerPasswordHash,
      isActive: true,
    },
  });

  const cashierPasswordHash = await hash("Cashier123!", 10);
  const cashier = await prisma.user.upsert({
    where: { email: "cashier@aldal.local" },
    update: { passwordHash: cashierPasswordHash, companyId: company.id, defaultBranchId: branch.id },
    create: {
      companyId: company.id,
      defaultBranchId: branch.id,
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
    update: { passwordHash: waiterPasswordHash, companyId: company.id, defaultBranchId: branch.id },
    create: {
      companyId: company.id,
      defaultBranchId: branch.id,
      fullName: "Mert Servis",
      email: "waiter@aldal.local",
      phone: "+90 555 000 00 03",
      passwordHash: waiterPasswordHash,
      isActive: true,
    },
  });

  const superAdminPasswordHash = await hash("SuperAdmin123!", 10);
  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@aldal.local" },
    update: { passwordHash: superAdminPasswordHash, companyId: company.id, defaultBranchId: branch.id },
    create: {
      companyId: company.id,
      defaultBranchId: branch.id,
      fullName: "Platform Super Admin",
      email: "superadmin@aldal.local",
      phone: "+90 555 000 00 99",
      passwordHash: superAdminPasswordHash,
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
  const superAdminRole = await prisma.role.findUnique({
    where: { companyId_key: { companyId: company.id, key: "super_admin" } },
  });

  await prisma.userRole.deleteMany({
    where: { userId: { in: [owner.id, manager.id, cashier.id, waiter.id, superAdmin.id] } },
  });

  if (tenantOwnerRole) await prisma.userRole.create({ data: { userId: owner.id, roleId: tenantOwnerRole.id } });
  if (superAdminRole) await prisma.userRole.create({ data: { userId: superAdmin.id, roleId: superAdminRole.id } });
  if (branchManagerRole)
    await prisma.userRole.create({ data: { userId: manager.id, roleId: branchManagerRole.id, branchId: branch.id } });
  if (cashierRole)
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id, branchId: branch.id } });
  if (waiterRole)
    await prisma.userRole.create({ data: { userId: waiter.id, roleId: waiterRole.id, branchId: branch.id } });

  // ----------------------------------------------------------------------------
  // Menü — yalnızca DOCX menüleri (4 kategori)
  // ----------------------------------------------------------------------------
  const simpleDrinksCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_simple_icecekler" },
    update: {
      companyId: company.id,
      branchId: branch.id,
      name: "İçecekler",
      slug: "icecekler",
      sortOrder: 1,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
    create: {
      id: "menu_cat_simple_icecekler",
      companyId: company.id,
      branchId: branch.id,
      name: "İçecekler",
      slug: "icecekler",
      sortOrder: 1,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
  });

  const simpleBreakfastCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_simple_kahvalti" },
    update: {
      companyId: company.id,
      branchId: branch.id,
      name: "Kahvaltı",
      slug: "kahvalti",
      sortOrder: 2,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
    create: {
      id: "menu_cat_simple_kahvalti",
      companyId: company.id,
      branchId: branch.id,
      name: "Kahvaltı",
      slug: "kahvalti",
      sortOrder: 2,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
  });

  const simplePastaCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_simple_makarna" },
    update: {
      companyId: company.id,
      branchId: branch.id,
      name: "Makarna",
      slug: "makarna",
      sortOrder: 3,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
    create: {
      id: "menu_cat_simple_makarna",
      companyId: company.id,
      branchId: branch.id,
      name: "Makarna",
      slug: "makarna",
      sortOrder: 3,
      isVisible: true,
      showInQr: true,
      printerType: "kitchen",
    },
  });

  const simpleDessertCategory = await prisma.menuCategory.upsert({
    where: { id: "menu_cat_simple_tatli" },
    update: {
      companyId: company.id,
      branchId: branch.id,
      name: "Tatlı",
      slug: "tatli",
      sortOrder: 4,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
    create: {
      id: "menu_cat_simple_tatli",
      companyId: company.id,
      branchId: branch.id,
      name: "Tatlı",
      slug: "tatli",
      sortOrder: 4,
      isVisible: true,
      showInQr: true,
      printerType: "bar",
    },
  });

  const docxMenuItems: Array<{
    id: string;
    categoryId: string;
    name: string;
    slug: string;
    description?: string;
  }> = [];

  const addMenuItem = (categoryId: string, name: string, description?: string) => {
    const id = seedId("docx_product", `${categoryId}_${name}`);
    const slug = slugifyTr(name);
    docxMenuItems.push({ id, categoryId, name, slug: slug || id, description });
  };

  // İçecekler
  addMenuItem(simpleDrinksCategory.id, "Türk kahvesi");
  addMenuItem(simpleDrinksCategory.id, "Filtre Kahve");
  addMenuItem(simpleDrinksCategory.id, "Sütlü Filtre Kahve");
  addMenuItem(simpleDrinksCategory.id, "Americano");
  addMenuItem(simpleDrinksCategory.id, "Latte");
  addMenuItem(simpleDrinksCategory.id, "Flat White");
  addMenuItem(simpleDrinksCategory.id, "Cappuccino");
  addMenuItem(simpleDrinksCategory.id, "Espresso");
  addMenuItem(simpleDrinksCategory.id, "Double Espresso");
  addMenuItem(simpleDrinksCategory.id, "Ice Filtre Kahve");
  addMenuItem(simpleDrinksCategory.id, "Ice Sütlü Filtre Kahve");
  addMenuItem(simpleDrinksCategory.id, "Ice Americano");
  addMenuItem(simpleDrinksCategory.id, "Ice Latte");
  addMenuItem(simpleDrinksCategory.id, "Ice Flat White");
  addMenuItem(simpleDrinksCategory.id, "Ice Cappuccino");
  addMenuItem(simpleDrinksCategory.id, "Cocostar Latte", "Hindistan cevizi, çikolata");
  addMenuItem(simpleDrinksCategory.id, "Toffee Nut Latte", "Karamel, fındık");
  addMenuItem(simpleDrinksCategory.id, "Lotus Latte");
  addMenuItem(simpleDrinksCategory.id, "Cookie Latte");
  addMenuItem(simpleDrinksCategory.id, "Mocha");
  addMenuItem(simpleDrinksCategory.id, "White Mocha");
  addMenuItem(simpleDrinksCategory.id, "Karamel Macchiato");
  addMenuItem(simpleDrinksCategory.id, "Chai Tea Latte");
  addMenuItem(simpleDrinksCategory.id, "Oreo Latte");
  addMenuItem(simpleDrinksCategory.id, "Cool Lime", "Küba nanesi, lime özü");
  addMenuItem(simpleDrinksCategory.id, "Berry Hibiscus", "Hibiscus çayı, hibiscus özü");
  addMenuItem(simpleDrinksCategory.id, "Mango Orange", "Mango, portakal");
  addMenuItem(simpleDrinksCategory.id, "Cindy", "Çilek, ahududu, hibiscus, lime");
  addMenuItem(simpleDrinksCategory.id, "Churchill", "Soda, limon, tuz");
  addMenuItem(simpleDrinksCategory.id, "Çay");
  addMenuItem(simpleDrinksCategory.id, "Salep");
  addMenuItem(simpleDrinksCategory.id, "Sıcak Çikolata");
  addMenuItem(simpleDrinksCategory.id, "Sıcak Süt");
  addMenuItem(simpleDrinksCategory.id, "Ihlamur Çayı");
  addMenuItem(simpleDrinksCategory.id, "Ada Çayı");
  addMenuItem(simpleDrinksCategory.id, "Nane Limon Çayı");
  addMenuItem(simpleDrinksCategory.id, "Yeşil Çay");
  addMenuItem(simpleDrinksCategory.id, "Kuşburnu Çayı");
  addMenuItem(simpleDrinksCategory.id, "Su");
  addMenuItem(simpleDrinksCategory.id, "Sade soda");
  addMenuItem(simpleDrinksCategory.id, "Limonata");
  addMenuItem(simpleDrinksCategory.id, "Portakal Suyu");
  addMenuItem(simpleDrinksCategory.id, "Meyveli soda (Elma)");
  addMenuItem(simpleDrinksCategory.id, "Meyveli soda (Limon)");
  addMenuItem(simpleDrinksCategory.id, "Meyveli soda (Çilek)");
  addMenuItem(simpleDrinksCategory.id, "Coca Cola");
  addMenuItem(simpleDrinksCategory.id, "Fanta");
  addMenuItem(simpleDrinksCategory.id, "Sprite");
  addMenuItem(simpleDrinksCategory.id, "Soğuk çay (Mango)");
  addMenuItem(simpleDrinksCategory.id, "Soğuk çay (Şeftali)");
  addMenuItem(simpleDrinksCategory.id, "Soğuk çay (Limon)");
  addMenuItem(simpleDrinksCategory.id, "Soğuk çay (Karpuz)");
  addMenuItem(simpleDrinksCategory.id, "Çikolatalı Milkshake");
  addMenuItem(simpleDrinksCategory.id, "Çilekli Milkshake");
  addMenuItem(simpleDrinksCategory.id, "Vanilyalı Milkshake");
  addMenuItem(simpleDrinksCategory.id, "Oreolu Milkshake");
  addMenuItem(simpleDrinksCategory.id, "Lotus Milkshake");
  addMenuItem(simpleDrinksCategory.id, "Cocostar Milkshake", "Hindistan cevizi, çikolata");
  addMenuItem(simpleDrinksCategory.id, "Snow White", "Hindistan cevizi, beyaz çikolata, fındık");
  addMenuItem(simpleDrinksCategory.id, "Frozen Mango");
  addMenuItem(simpleDrinksCategory.id, "Frozen Çarkıfelek");
  addMenuItem(simpleDrinksCategory.id, "Frozen Orman meyveli");
  addMenuItem(simpleDrinksCategory.id, "Frozen Çilek");
  addMenuItem(simpleDrinksCategory.id, "Frozen Mango Portakal");

  // Kahvaltı
  addMenuItem(
    simpleBreakfastCategory.id,
    "Serpme Kahvaltı",
    "Ezine peyniri, beyaz peynir, kaşar peyniri, ızgara hellim, bal, kaymak, çilek reçeli, süt reçeli, vişne reçeli, yeşil ve siyah zeytin, sigara böreği, sosis, yumurtalı ekmek, patates kızartması, yeşillik, sahanda sucuk, menemen veya çırpılmış yumurta, sınırsız çay.",
  );
  addMenuItem(
    simpleBreakfastCategory.id,
    "Tek kişilik kahvaltı",
    "Domates, salatalık, siyah ve yeşil zeytin, sucuk ve yumurta, kaşar peynir, beyaz peynir, ezine peynir, bal, çay.",
  );
  addMenuItem(simpleBreakfastCategory.id, "Sahanda Menemen");
  addMenuItem(simpleBreakfastCategory.id, "Sahanda Sucuk");

  // Makarna
  for (const sauce of ["Barbekü soslu", "Körili soslu", "Köz biberli", "Kekikli", "Kremalı Mantarlı", "Acılı", "Pesto soslu"]) {
    addMenuItem(simplePastaCategory.id, `Tavuk Makarna (${sauce})`);
  }

  // Tatlı
  const dessertItems: Array<{ name: string; description?: string }> = [
    { name: "Govi Box 2-3", description: "Mini pankek, waffle, brownie, muz, çilek, sütlü ve beyaz 2 pot çikolata" },
    { name: "Govi Box 4-6", description: "Mini pankek, waffle, kruvasan, krep, brownie, muz, çilek, ananas, 4 pot çikolata" },
    { name: "Pancake Mix", description: "Mini pankek, muz, çilek, fransız biscuit, sütlü çikolata, antep fıstığı" },
    { name: "Pancake Şiş", description: "Çubukta mini pankek, muz, çilek, fransız biscuit, sütlü çikolata, antep fıstığı" },
    { name: "Pancake Fondue", description: "Mini pankek, muz, çilek, 2 pot çikolata" },
    { name: "Waffle Brüksel", description: "Muz, çilek, sütlü çikolata, fransız biscuit, antep fıstığı" },
    { name: "Waffle Lotus", description: "Muz, lotus sos, lotus bisküvi parçaları, sütlü çikolata (isteğe göre dondurma)" },
    { name: "Waffle Fondue", description: "Waffle parçaları, muz, çilek, 2 pot çikolata" },
    { name: "Double Waffle", description: "Çift kat waffle, muz, çilek, sütlü çikolata, fransız biscuit, antep fıstığı" },
    { name: "Klasik Cup", description: "Muz, çilek, diplomat krema, fransız biscuit, sütlü çikolata, antep fıstığı" },
    { name: "Pancake Cup", description: "Mini pankek, çilek, muz, sütlü çikolata, antep fıstığı" },
    { name: "Crepe Cup", description: "Fettucini krep, muz, çilek, sütlü çikolata, antep fıstığı" },
    { name: "Dondurmalı Cup", description: "Vanilyalı dondurma, muz, çilek, sütlü çikolata, antep fıstığı" },
    { name: "Brownie Cup", description: "Brownie parçaları, muz, çilek, ananas, sütlü çikolata, antep fıstığı" },
    { name: "Oreo Cup", description: "Oreo parçaları, muz, çilek, diplomat krema, fransız biscuit, sütlü çikolata, antep fıstığı" },
    { name: "Spoonful", description: "Çikolatalı kek parçaları, diplomat krema, pirinç patlağı, sütlü çikolata, antep fıstığı" },
    { name: "Lotus Cup", description: "Lotus kırıntısı, diplomat krema, lotus sos, muz, fransız biscuit" },
    { name: "Dubai Cup", description: "Antep fıstıklı çıtır kadayıf harcı, diplomat krema, sütlü çikolata, antep fıstığı" },
    { name: "Crepe Wraps", description: "Krep, dondurma, muz, çilek, sütlü çikolata, fransız biscuit, antep fıstığı" },
    { name: "Crepe Fondue", description: "Muza sarılmış krep, 1 pot çikolata, fransız biscuit, antep fıstığı" },
    { name: "Tiramisu", description: "Espresso, kedi dili, tiramisu kreması, kakao" },
    { name: "Klasik Magnolia", description: "Muz, çilek, diplomat krema, fransız biscuit, antep fıstığı" },
    { name: "Oreo Magnolia", description: "Oreo parçaları, diplomat krema, fransız biscuit, antep fıstığı" },
    { name: "Lotus Magnolia", description: "Lotus parçaları, diplomat krema, fransız biscuit, antep fıstığı" },
  ];
  for (const item of dessertItems) addMenuItem(simpleDessertCategory.id, item.name, item.description);

  for (const product of docxMenuItems) {
    await prisma.menuProduct.upsert({
      where: { id: product.id },
      update: {
        companyId: company.id,
        branchId: branch.id,
        categoryId: product.categoryId,
        name: product.name,
        slug: product.slug,
        description: product.description ?? null,
        basePrice: 0,
        isActive: true,
        isVisible: true,
        showInQr: true,
      },
      create: {
        id: product.id,
        companyId: company.id,
        branchId: branch.id,
        categoryId: product.categoryId,
        name: product.name,
        slug: product.slug,
        description: product.description ?? null,
        basePrice: 0,
        isActive: true,
        isVisible: true,
        showInQr: true,
      },
    });
  }

  // ----------------------------------------------------------------------------
  // Modifiers + Required choices (ürüne göre scope’lanıyor)
  // ----------------------------------------------------------------------------
  await prisma.modifierGroup.upsert({
    where: { id: "modifier_milk" },
    update: { companyId: company.id, name: "Süt Seçimi", selectionMin: 0, selectionMax: 1 },
    create: { id: "modifier_milk", companyId: company.id, name: "Süt Seçimi", selectionMin: 0, selectionMax: 1 },
  });
  await prisma.modifierOption.deleteMany({ where: { groupId: "modifier_milk" } });
  await prisma.modifierOption.createMany({
    data: [
      { groupId: "modifier_milk", name: "Yulaf Sütü", priceDiff: 0, sortOrder: 0 },
      { groupId: "modifier_milk", name: "Laktozsuz Süt", priceDiff: 0, sortOrder: 1 },
    ],
  });

  await prisma.modifierGroup.upsert({
    where: { id: "modifier_syrup" },
    update: { companyId: company.id, name: "Şurup", selectionMin: 0, selectionMax: 2 },
    create: { id: "modifier_syrup", companyId: company.id, name: "Şurup", selectionMin: 0, selectionMax: 2 },
  });
  await prisma.modifierOption.deleteMany({ where: { groupId: "modifier_syrup" } });
  await prisma.modifierOption.createMany({
    data: [
      { groupId: "modifier_syrup", name: "Vanilya", priceDiff: 0, sortOrder: 0 },
      { groupId: "modifier_syrup", name: "Karamel", priceDiff: 0, sortOrder: 1 },
      { groupId: "modifier_syrup", name: "Fındık", priceDiff: 0, sortOrder: 2 },
      { groupId: "modifier_syrup", name: "Lotus", priceDiff: 0, sortOrder: 3 },
    ],
  });

  await prisma.modifierGroup.upsert({
    where: { id: "modifier_pasta_extras" },
    update: { companyId: company.id, name: "Makarna Ekstraları", selectionMin: 0, selectionMax: 4 },
    create: {
      id: "modifier_pasta_extras",
      companyId: company.id,
      name: "Makarna Ekstraları",
      selectionMin: 0,
      selectionMax: 4,
    },
  });
  await prisma.modifierOption.deleteMany({ where: { groupId: "modifier_pasta_extras" } });
  await prisma.modifierOption.createMany({
    data: [
      { groupId: "modifier_pasta_extras", name: "Ekstra Tavuk", priceDiff: 0, sortOrder: 0 },
      { groupId: "modifier_pasta_extras", name: "Ekstra Mantar", priceDiff: 0, sortOrder: 1 },
      { groupId: "modifier_pasta_extras", name: "Ekstra Peynir", priceDiff: 0, sortOrder: 2 },
      { groupId: "modifier_pasta_extras", name: "Acı Sos", priceDiff: 0, sortOrder: 3 },
    ],
  });

  await prisma.modifierGroup.upsert({
    where: { id: "modifier_breakfast_extras" },
    update: { companyId: company.id, name: "Kahvaltı Ekstraları", selectionMin: 0, selectionMax: 4 },
    create: {
      id: "modifier_breakfast_extras",
      companyId: company.id,
      name: "Kahvaltı Ekstraları",
      selectionMin: 0,
      selectionMax: 4,
    },
  });
  await prisma.modifierOption.deleteMany({ where: { groupId: "modifier_breakfast_extras" } });
  await prisma.modifierOption.createMany({
    data: [
      { groupId: "modifier_breakfast_extras", name: "Ekstra Menemen", priceDiff: 0, sortOrder: 0 },
      { groupId: "modifier_breakfast_extras", name: "Ekstra Sucuk", priceDiff: 0, sortOrder: 1 },
      { groupId: "modifier_breakfast_extras", name: "Ekstra Peynir", priceDiff: 0, sortOrder: 2 },
      { groupId: "modifier_breakfast_extras", name: "Ekstra Çay", priceDiff: 0, sortOrder: 3 },
    ],
  });

  await prisma.modifierGroup.upsert({
    where: { id: "modifier_tatli_extras" },
    update: { companyId: company.id, name: "Tatlı Ekstraları", selectionMin: 0, selectionMax: 5 },
    create: {
      id: "modifier_tatli_extras",
      companyId: company.id,
      name: "Tatlı Ekstraları",
      selectionMin: 0,
      selectionMax: 5,
    },
  });
  await prisma.modifierOption.deleteMany({ where: { groupId: "modifier_tatli_extras" } });
  await prisma.modifierOption.createMany({
    data: [
      { groupId: "modifier_tatli_extras", name: "Pot çikolata", priceDiff: 0, sortOrder: 0 },
      { groupId: "modifier_tatli_extras", name: "Fransız biscuit", priceDiff: 0, sortOrder: 1 },
      { groupId: "modifier_tatli_extras", name: "Muz", priceDiff: 0, sortOrder: 2 },
      { groupId: "modifier_tatli_extras", name: "Çilek", priceDiff: 0, sortOrder: 3 },
      { groupId: "modifier_tatli_extras", name: "Ananas", priceDiff: 0, sortOrder: 4 },
    ],
  });

  await prisma.requiredChoiceGroup.upsert({
    where: { id: "required_size" },
    update: { companyId: company.id, name: "Boy", selectionMin: 1, selectionMax: 1 },
    create: { id: "required_size", companyId: company.id, name: "Boy", selectionMin: 1, selectionMax: 1 },
  });
  await prisma.requiredChoiceOption.deleteMany({ where: { groupId: "required_size" } });
  await prisma.requiredChoiceOption.createMany({
    data: [
      { groupId: "required_size", name: "Medium", priceDiff: 0 },
      { groupId: "required_size", name: "Large", priceDiff: 0 },
    ],
  });

  // ----------------------------------------------------------------------------
  // Masalar — her kat için 10 masa
  // ----------------------------------------------------------------------------
  await prisma.tableArea.upsert({
    where: { id: "area_ground" },
    update: { branchId: branch.id, name: "Zemin Kat", sortOrder: 1 },
    create: { id: "area_ground", branchId: branch.id, name: "Zemin Kat", sortOrder: 1 },
  });
  await prisma.tableArea.upsert({
    where: { id: "area_floor1" },
    update: { branchId: branch.id, name: "1. Kat", sortOrder: 2 },
    create: { id: "area_floor1", branchId: branch.id, name: "1. Kat", sortOrder: 2 },
  });
  await prisma.tableArea.upsert({
    where: { id: "area_floor2" },
    update: { branchId: branch.id, name: "2. Kat", sortOrder: 3 },
    create: { id: "area_floor2", branchId: branch.id, name: "2. Kat", sortOrder: 3 },
  });

  const tablePlan: Array<{ areaId: string; prefix: string; labelPrefix: string }> = [
    { areaId: "area_ground", prefix: "A", labelPrefix: "Salon" },
    { areaId: "area_floor1", prefix: "B", labelPrefix: "Salon" },
    { areaId: "area_floor2", prefix: "C", labelPrefix: "Salon" },
  ];
  for (const plan of tablePlan) {
    for (let i = 1; i <= 10; i += 1) {
      const code = `${plan.prefix}${i}`;
      const id = `table_${plan.prefix.toLowerCase()}${i}`;
      await prisma.diningTable.upsert({
        where: { id },
        update: {
          branchId: branch.id,
          areaId: plan.areaId,
          code,
          name: `${plan.labelPrefix} ${code}`,
          capacity: 4,
          status: TableStatus.AVAILABLE,
          activeTicketId: null,
        },
        create: {
          id,
          branchId: branch.id,
          areaId: plan.areaId,
          code,
          name: `${plan.labelPrefix} ${code}`,
          capacity: 4,
          status: TableStatus.AVAILABLE,
          activeTicketId: null,
        },
      });
    }
  }

  console.log("Seed tamamlandi (minimal):", {
    company: company.name,
    branch: branch.name,
    users: [owner.email, manager.email, cashier.email, waiter.email, superAdmin.email],
    superAdmin: { email: superAdmin.email, password: "SuperAdmin123!" },
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

