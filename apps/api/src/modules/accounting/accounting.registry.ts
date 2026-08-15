import type { AccountingResource } from "./accounting.resources";

export interface AccountingFieldOption {
  label: string;
  value: string;
}

export interface AccountingFieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "textarea" | "switch" | "select" | "datetime" | "json";
  required?: boolean;
  options?: AccountingFieldOption[];
}

export interface AccountingColumnConfig {
  key: string;
  label: string;
}

export interface AccountingFilterConfig {
  key: string;
  label: string;
  type: "text" | "select" | "date";
  options?: AccountingFieldOption[];
}

export interface AccountingResourceConfig {
  key: AccountingResource;
  title: string;
  description: string;
  delegate?: string;
  readOnly?: boolean;
  companyScoped?: boolean;
  branchScoped?: boolean;
  exportable: boolean;
  include?: Record<string, unknown>;
  fields: AccountingFieldConfig[];
  columns: AccountingColumnConfig[];
  filters: AccountingFilterConfig[];
  searchFields?: string[];
  relationOptionKeys?: Array<"branches" | "accounts" | "suppliers" | "customers" | "invoices" | "products" | "employees" | "tickets" | "terminals">;
  numberFields?: string[];
  booleanFields?: string[];
  jsonFields?: string[];
  dateFields?: string[];
}

const paymentMethodOptions = [
  { label: "CASH", value: "CASH" },
  { label: "CREDIT_CARD", value: "CREDIT_CARD" },
  { label: "MEAL_CARD", value: "MEAL_CARD" },
  { label: "BANK_TRANSFER", value: "BANK_TRANSFER" },
  { label: "OTHER", value: "OTHER" },
];

const paymentStatusOptions = [
  { label: "PENDING", value: "PENDING" },
  { label: "COMPLETED", value: "COMPLETED" },
  { label: "FAILED", value: "FAILED" },
  { label: "REFUNDED", value: "REFUNDED" },
];

const fixedCostCategoryOptions = [
  { label: "Kira", value: "rent" },
  { label: "Maas", value: "salary" },
  { label: "Elektrik", value: "electricity" },
  { label: "Su", value: "water" },
  { label: "Internet", value: "internet" },
  { label: "Abonelik", value: "subscription" },
  { label: "Aidat", value: "dues" },
  { label: "Genel Gider", value: "general" },
];

const fixedCostRecurrenceOptions = [
  { label: "Tek Seferlik", value: "once" },
  { label: "Gunluk", value: "daily" },
  { label: "Haftalik", value: "weekly" },
  { label: "Aylik", value: "monthly" },
  { label: "3 Aylik", value: "quarterly" },
  { label: "Yillik", value: "yearly" },
];

const activeStatusOptions = [
  { label: "Aktif", value: "true" },
  { label: "Pasif", value: "false" },
];

export const accountingRegistry: Record<AccountingResource, AccountingResourceConfig> = {
  accounts: {
    key: "accounts",
    title: "Hesaplar",
    description: "Finansal hareketlerin baglandigi hesap kartlari",
    delegate: "account",
    branchScoped: true,
    exportable: true,
    include: { branch: true },
    fields: [
      { key: "branchId", label: "Sube", type: "select", required: true },
      { key: "code", label: "Kod", type: "text", required: true },
      { key: "name", label: "Hesap Adi", type: "text", required: true },
      { key: "type", label: "Tip", type: "text", required: true },
    ],
    columns: [
      { key: "code", label: "Kod" },
      { key: "name", label: "Hesap" },
      { key: "type", label: "Tip" },
      { key: "branch.name", label: "Sube" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
    ],
    searchFields: ["code", "name", "type"],
    relationOptionKeys: ["branches"],
  },
  "ticket-ledger": {
    key: "ticket-ledger",
    title: "Fisler",
    description: "Fis hareketleri ve odeme ozetleri",
    readOnly: true,
    branchScoped: true,
    exportable: true,
    columns: [
      { key: "ticketName", label: "Fis No" },
      { key: "branch.name", label: "Sube" },
      { key: "customer.fullName", label: "Musteri" },
      { key: "status", label: "Durum" },
      { key: "closedAt", label: "Kapanis Saati" },
      { key: "grandTotal", label: "Toplam Tutar" },
    ],
    fields: [],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["branches"],
  },
  "sold-products": {
    key: "sold-products",
    title: "Satilan Urunler",
    description: "Urun bazli satis, vergi ve ciro kirilimi",
    readOnly: true,
    exportable: true,
    columns: [
      { key: "productName", label: "Urun" },
      { key: "branchName", label: "Sube" },
      { key: "quantity", label: "Miktar" },
      { key: "unitPrice", label: "Birim" },
      { key: "taxTotal", label: "KDV" },
      { key: "lineTotal", label: "Net" },
    ],
    fields: [],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["branches"],
  },
  payments: {
    key: "payments",
    title: "Odemeler",
    description: "Odeme listesi ve kasa baglantilari",
    delegate: "payment",
    exportable: true,
    include: { ticket: { include: { branch: true, customer: true } }, account: true },
    fields: [
      { key: "ticketId", label: "Adisyon", type: "select", required: true },
      { key: "accountId", label: "Hesap", type: "select" },
      { key: "method", label: "Yontem", type: "select", options: paymentMethodOptions, required: true },
      { key: "status", label: "Durum", type: "select", options: paymentStatusOptions, required: true },
      { key: "amount", label: "Tutar", type: "number", required: true },
      { key: "referenceNumber", label: "Referans", type: "text" },
      { key: "paidAt", label: "Odeme Tarihi", type: "datetime" },
      { key: "notes", label: "Not", type: "textarea" },
    ],
    columns: [
      { key: "ticket.ticketName", label: "Fis No" },
      { key: "ticket.branch.name", label: "Sube" },
      { key: "method", label: "Odeme Turu" },
      { key: "status", label: "Durum" },
      { key: "amount", label: "Odenen Tutar" },
      { key: "account.name", label: "Kasa / Hesap" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["accounts", "tickets"],
    numberFields: ["amount"],
    dateFields: ["paidAt"],
  },
  "vat-rates": {
    key: "vat-rates",
    title: "Urun KDV Oranlari",
    description: "Menu urunleri icin KDV tanimlari",
    delegate: "vatRate",
    companyScoped: true,
    exportable: true,
    fields: [
      { key: "name", label: "Ad", type: "text", required: true },
      { key: "rate", label: "Oran", type: "number", required: true },
    ],
    columns: [
      { key: "name", label: "KDV" },
      { key: "rate", label: "Oran" },
    ],
    filters: [{ key: "search", label: "Ara", type: "text" }],
    searchFields: ["name"],
    numberFields: ["rate"],
  },
  suppliers: {
    key: "suppliers",
    title: "Tedarikciler",
    description: "Fatura ve alim operasyonlari tedarikci havuzu",
    delegate: "supplier",
    companyScoped: true,
    exportable: true,
    include: { invoices: true },
    fields: [
      { key: "name", label: "Firma", type: "text", required: true },
      { key: "taxNumber", label: "Vergi No", type: "text" },
      { key: "taxOffice", label: "Vergi Dairesi", type: "text" },
      { key: "phone", label: "Telefon", type: "text" },
      { key: "email", label: "E-posta", type: "text" },
      { key: "addressLine", label: "Adres", type: "textarea" },
    ],
    columns: [
      { key: "name", label: "Firma" },
      { key: "taxNumber", label: "Vergi No" },
      { key: "phone", label: "Telefon" },
      { key: "email", label: "E-posta" },
    ],
    filters: [{ key: "search", label: "Ara", type: "text" }],
    searchFields: ["name", "taxNumber", "email", "phone"],
  },
  "supplier-vat": {
    key: "supplier-vat",
    title: "Tedarikci KDV Raporlari",
    description: "Tedarikci bazli donemsel KDV raporlari",
    delegate: "supplierVatReport",
    exportable: true,
    include: { supplier: true },
    fields: [
      { key: "supplierId", label: "Tedarikci", type: "select", required: true },
      { key: "periodStart", label: "Donem Baslangic", type: "datetime", required: true },
      { key: "periodEnd", label: "Donem Bitis", type: "datetime", required: true },
      { key: "totalBase", label: "Matrah", type: "number", required: true },
      { key: "totalVat", label: "KDV", type: "number", required: true },
    ],
    columns: [
      { key: "supplier.name", label: "Tedarikci" },
      { key: "periodStart", label: "Baslangic" },
      { key: "periodEnd", label: "Bitis" },
      { key: "totalBase", label: "Matrah" },
      { key: "totalVat", label: "KDV" },
    ],
    filters: [{ key: "search", label: "Ara", type: "text" }],
    relationOptionKeys: ["suppliers"],
    numberFields: ["totalBase", "totalVat"],
    dateFields: ["periodStart", "periodEnd"],
  },
  "business-customers": {
    key: "business-customers",
    title: "Musteri Isletmeler",
    description: "Kurumsal fatura kesilen musteri havuzu",
    delegate: "customer",
    companyScoped: true,
    exportable: true,
    include: { branch: true },
    fields: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "fullName", label: "Yetkili Kisi", type: "text", required: true },
      { key: "businessName", label: "Firma", type: "text", required: true },
      { key: "phone", label: "Telefon", type: "text" },
      { key: "email", label: "E-posta", type: "text" },
      { key: "taxNumber", label: "Vergi No", type: "text" },
      { key: "taxOffice", label: "Vergi Dairesi", type: "text" },
      { key: "billingAddress", label: "Fatura Adresi", type: "textarea" },
      { key: "notes", label: "Not", type: "textarea" },
    ],
    columns: [
      { key: "businessName", label: "Firma" },
      { key: "fullName", label: "Yetkili" },
      { key: "taxNumber", label: "Vergi No" },
      { key: "branch.name", label: "Sube" },
      { key: "phone", label: "Telefon" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
    ],
    relationOptionKeys: ["branches"],
    searchFields: ["fullName", "businessName", "taxNumber", "email"],
  },
  "customer-vat": {
    key: "customer-vat",
    title: "Musteri KDV Raporlari",
    description: "Kurumsal musteri bazli KDV ozetleri",
    delegate: "customerVatReport",
    exportable: true,
    include: { customer: true },
    fields: [
      { key: "customerId", label: "Musteri", type: "select", required: true },
      { key: "periodStart", label: "Donem Baslangic", type: "datetime", required: true },
      { key: "periodEnd", label: "Donem Bitis", type: "datetime", required: true },
      { key: "totalBase", label: "Matrah", type: "number", required: true },
      { key: "totalVat", label: "KDV", type: "number", required: true },
    ],
    columns: [
      { key: "customer.businessName", label: "Firma" },
      { key: "periodStart", label: "Baslangic" },
      { key: "periodEnd", label: "Bitis" },
      { key: "totalBase", label: "Matrah" },
      { key: "totalVat", label: "KDV" },
    ],
    filters: [{ key: "search", label: "Ara", type: "text" }],
    relationOptionKeys: ["customers"],
    numberFields: ["totalBase", "totalVat"],
    dateFields: ["periodStart", "periodEnd"],
  },
  invoices: {
    key: "invoices",
    title: "Faturalar",
    description: "Tedarikci faturasi ve kalemleri",
    delegate: "invoice",
    branchScoped: true,
    exportable: true,
    include: { branch: true, supplier: true, account: true, items: true },
    fields: [
      { key: "branchId", label: "Sube", type: "select", required: true },
      { key: "supplierId", label: "Tedarikci", type: "select" },
      { key: "accountId", label: "Hesap", type: "select" },
      { key: "invoiceNo", label: "Fatura No", type: "text", required: true },
      { key: "issueDate", label: "Tarih", type: "datetime", required: true },
      { key: "itemsJson", label: "Kalemler JSON", type: "json" },
      { key: "notes", label: "Not", type: "textarea" },
    ],
    columns: [
      { key: "invoiceNo", label: "Fatura No" },
      { key: "supplier.name", label: "Tedarikci" },
      { key: "branch.name", label: "Sube" },
      { key: "grandTotal", label: "Genel Toplam" },
      { key: "issueDate", label: "Tarih" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["branches", "suppliers", "accounts"],
    jsonFields: ["itemsJson"],
    dateFields: ["issueDate"],
  },
  "invoice-items": {
    key: "invoice-items",
    title: "Fatura Kalemleri",
    description: "Fatura satir detaylari",
    delegate: "invoiceItem",
    readOnly: true,
    exportable: true,
    include: { invoice: { include: { branch: true, supplier: true } } },
    fields: [],
    columns: [
      { key: "invoice.invoiceNo", label: "Fatura No" },
      { key: "invoice.supplier.name", label: "Tedarikci" },
      { key: "description", label: "Kalem" },
      { key: "quantity", label: "Miktar" },
      { key: "lineTotal", label: "Toplam" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
    ],
    relationOptionKeys: ["branches"],
  },
  "unit-costs": {
    key: "unit-costs",
    title: "Birim Maliyetler",
    description: "Urun bazli guncel birim maliyet kayitlari",
    delegate: "unitCost",
    exportable: true,
    include: { product: true },
    fields: [
      { key: "productId", label: "Urun", type: "select", required: true },
      { key: "cost", label: "Maliyet", type: "number", required: true },
      { key: "effectiveAt", label: "Gecerlilik", type: "datetime", required: true },
    ],
    columns: [
      { key: "product.name", label: "Urun" },
      { key: "cost", label: "Maliyet" },
      { key: "effectiveAt", label: "Gecerlilik" },
    ],
    filters: [{ key: "search", label: "Ara", type: "text" }],
    relationOptionKeys: ["products"],
    numberFields: ["cost"],
    dateFields: ["effectiveAt"],
  },
  "cash-closures": {
    key: "cash-closures",
    title: "Kasa Kapanislari",
    description: "Kasa kapanis ve fark tablosu",
    delegate: "cashClosure",
    branchScoped: true,
    exportable: true,
    include: { branch: true, account: true },
    fields: [
      { key: "branchId", label: "Sube", type: "select", required: true },
      { key: "terminalId", label: "Terminal", type: "select" },
      { key: "accountId", label: "Hesap", type: "select" },
      { key: "closureDate", label: "Kapanis Tarihi", type: "datetime", required: true },
      { key: "expectedAmount", label: "Beklenen", type: "number", required: true },
      { key: "countedAmount", label: "Sayilan", type: "number", required: true },
      { key: "notes", label: "Not", type: "textarea" },
    ],
    columns: [
      { key: "branch.name", label: "Kasa / Sube" },
      { key: "closureDate", label: "Kapanis Tarihi" },
      { key: "expectedAmount", label: "Beklenen" },
      { key: "countedAmount", label: "Sayilan" },
      { key: "varianceAmount", label: "Kasa Farki" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["branches", "accounts", "terminals"],
    numberFields: ["expectedAmount", "countedAmount"],
    dateFields: ["closureDate"],
  },
  "fixed-costs": {
    key: "fixed-costs",
    title: "Sabit Maliyetler",
    description: "Kira, aidat, maas ve periyodik sabit gider planlari",
    delegate: "expense",
    branchScoped: true,
    exportable: true,
    include: { branch: true, account: true },
    fields: [
      { key: "branchId", label: "Sube", type: "select", required: true },
      { key: "accountId", label: "Hesap", type: "select" },
      { key: "title", label: "Gider Adi", type: "text", required: true },
      { key: "category", label: "Kategori", type: "select", required: true, options: fixedCostCategoryOptions },
      { key: "amount", label: "Tutar", type: "number", required: true },
      { key: "recurrenceType", label: "Tekrar Tipi", type: "select", required: true, options: fixedCostRecurrenceOptions },
      { key: "expenseDate", label: "Ilk Finans Kayit Tarihi", type: "datetime", required: true },
      { key: "startDate", label: "Baslangic Tarihi", type: "datetime" },
      { key: "endDate", label: "Bitis Tarihi", type: "datetime" },
      { key: "isActive", label: "Aktif", type: "switch" },
      { key: "note", label: "Not", type: "textarea" },
    ],
    columns: [
      { key: "title", label: "Gider" },
      { key: "category", label: "Kategori" },
      { key: "recurrenceLabel", label: "Tekrar" },
      { key: "branch.name", label: "Sube" },
      { key: "amount", label: "Tutar" },
      { key: "monthlyEstimate", label: "Aylik Etki" },
      { key: "activeStatusLabel", label: "Durum" },
      { key: "expenseDate", label: "Tarih" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
      { key: "category", label: "Kategori", type: "select", options: fixedCostCategoryOptions },
      { key: "recurrenceType", label: "Tekrar Tipi", type: "select", options: fixedCostRecurrenceOptions },
      { key: "isActive", label: "Durum", type: "select", options: activeStatusOptions },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["branches", "accounts"],
    searchFields: ["title", "category", "note"],
    numberFields: ["amount"],
    booleanFields: ["isActive"],
    dateFields: ["expenseDate", "startDate", "endDate"],
  },
  payroll: {
    key: "payroll",
    title: "Personel Odemeleri",
    description: "Personel maas ve ek odeme kayitlari",
    delegate: "payrollPayment",
    branchScoped: true,
    exportable: true,
    include: { branch: true, employeeProfile: { include: { user: true } }, account: true },
    fields: [
      { key: "branchId", label: "Sube", type: "select", required: true },
      { key: "employeeProfileId", label: "Personel", type: "select", required: true },
      { key: "accountId", label: "Hesap", type: "select" },
      { key: "amount", label: "Tutar", type: "number", required: true },
      { key: "paymentDate", label: "Odeme Tarihi", type: "datetime", required: true },
      { key: "notes", label: "Not", type: "textarea" },
    ],
    columns: [
      { key: "employeeProfile.user.fullName", label: "Personel" },
      { key: "branch.name", label: "Sube" },
      { key: "amount", label: "Tutar" },
      { key: "paymentDate", label: "Tarih" },
      { key: "account.name", label: "Hesap" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["branches", "employees", "accounts"],
    numberFields: ["amount"],
    dateFields: ["paymentDate"],
  },
  "other-payments": {
    key: "other-payments",
    title: "Diger Odemeler",
    description: "Tek seferlik ya da operasyonel diger odemeler",
    delegate: "otherPayment",
    branchScoped: true,
    exportable: true,
    include: { branch: true, account: true },
    fields: [
      { key: "branchId", label: "Sube", type: "select", required: true },
      { key: "accountId", label: "Hesap", type: "select" },
      { key: "title", label: "Baslik", type: "text", required: true },
      { key: "category", label: "Kategori", type: "text" },
      { key: "amount", label: "Tutar", type: "number", required: true },
      { key: "paymentDate", label: "Odeme Tarihi", type: "datetime", required: true },
      { key: "notes", label: "Not", type: "textarea" },
    ],
    columns: [
      { key: "title", label: "Odeme" },
      { key: "category", label: "Kategori" },
      { key: "branch.name", label: "Sube" },
      { key: "amount", label: "Tutar" },
      { key: "paymentDate", label: "Tarih" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["branches", "accounts"],
    searchFields: ["title", "category", "notes"],
    numberFields: ["amount"],
    dateFields: ["paymentDate"],
  },
};
