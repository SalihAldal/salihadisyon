import type { StaffMetaResponse } from "../../../lib/api/client";

export type EmployeeEditorTab = "account-settings" | "personal-info" | "other-info" | "payments" | "shifts" | "account-movements";

export interface EmployeeSelectOption {
  label: string;
  value: string;
}

export interface EmployeeMainInfo {
  id: string;
  businessId: string;
  branchId: string;
  branchName: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  email: string;
  phone: string;
  pinCodeMasked: string;
  restaurantRole: string;
  staffRoleId: string | null;
  staffRoleName: string;
  hireDate: string | null;
  isActive: boolean;
  isOwner: boolean;
  overtimeEnabled: boolean;
  dailyFreeDrinkLimit: number;
  totalBreakMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDetailData {
  main: EmployeeMainInfo;
  personalInfo: Record<string, unknown>;
  contactInfo: Record<string, unknown>;
  financialInfo: Record<string, unknown>;
  emergencyContact: Record<string, unknown>;
  shiftSummary: Record<string, unknown>;
  paymentSummary: Record<string, unknown>;
  accountMovementSummary: Record<string, unknown>;
  rolePermissions: {
    primaryStaffRole?: Record<string, unknown> | null;
    assignedRoles?: Array<Record<string, unknown>>;
    effectivePermissions?: string[];
  };
  statusLogs: Array<Record<string, unknown>>;
}

export interface EmployeeEditorMeta {
  branchOptions: EmployeeSelectOption[];
  staffRoleOptions: EmployeeSelectOption[];
  accountOptions: EmployeeSelectOption[];
}

export interface EmployeeAccountSettingsFormData {
  branchId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  restaurantRole: string;
  staffRoleId: string;
  pinCode: string;
  hireDate: string;
  overtimeEnabled: boolean;
  dailyFreeDrinkLimit: string;
  totalBreakMinutes: string;
}

export interface EmployeePersonalInfoFormData {
  photo: string;
  photoFileName: string;
  nationality: string;
  identityNumber: string;
  identityNumberMasked: string;
  gender: string;
  bloodType: string;
  disabilityStatus: string;
  educationStatus: string;
  highestEducationLevel: string;
  lastEducationSchool: string;
  maritalStatus: string;
  childrenCount: string;
  birthDate: string;
  phone: string;
}

export interface EmployeeOtherInfoFormData {
  address: string;
  country: string;
  city: string;
  district: string;
  postalCode: string;
  homePhone: string;
  salary: string;
  salaryPaymentDay: string;
  bankName: string;
  accountType: string;
  accountNumber: string;
  accountNumberMasked: string;
  iban: string;
  ibanMasked: string;
  contactName: string;
  contactPhone: string;
  relation: string;
}

export interface EmployeePaymentFormData {
  id?: string;
  accountId: string;
  amount: string;
  movementType: "PAYMENT" | "RECEIVABLE";
  transactionType: string;
  paymentMethod: string;
  documentUrl: string;
  paymentDate: string;
  notes: string;
}

export interface EmployeeShiftFormData {
  branchId: string;
  shiftType: "WORK" | "LEAVE" | "OFF_DAY";
  scheduledStartAt: string;
  scheduledEndAt: string;
  notes: string;
}

export interface EmployeeShiftFilters {
  viewMode: "month" | "week" | "day" | "list";
  focusDate: string;
  shiftType: string;
}

function normalizeDateInput(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  return value.slice(0, 10);
}

export function buildEmployeeEditorMeta(meta: StaffMetaResponse | null): EmployeeEditorMeta {
  const branchOptions = meta?.fields.find((field) => field.key === "branchId")?.options ?? [];
  const staffRoleOptions = meta?.fields.find((field) => field.key === "staffRoleId")?.options ?? [];
  return { branchOptions, staffRoleOptions, accountOptions: [] };
}

export function buildAccountSettingsForm(detail: EmployeeDetailData): EmployeeAccountSettingsFormData {
  return {
    branchId: detail.main.branchId ?? "",
    firstName: detail.main.firstName ?? "",
    lastName: detail.main.lastName ?? "",
    email: detail.main.email ?? "",
    password: "",
    phone: detail.main.phone ?? "",
    restaurantRole: detail.main.restaurantRole ?? "",
    staffRoleId: detail.main.staffRoleId ?? "",
    pinCode: "",
    hireDate: normalizeDateInput(detail.main.hireDate),
    overtimeEnabled: Boolean(detail.main.overtimeEnabled),
    dailyFreeDrinkLimit: String(detail.main.dailyFreeDrinkLimit ?? 0),
    totalBreakMinutes: String(detail.main.totalBreakMinutes ?? 0),
  };
}

export function buildPersonalInfoForm(detail: EmployeeDetailData): EmployeePersonalInfoFormData {
  return {
    photo: String(detail.personalInfo.photo ?? ""),
    photoFileName: "",
    nationality: String(detail.personalInfo.nationality ?? ""),
    identityNumber: "",
    identityNumberMasked: String(detail.personalInfo.identityNumberMasked ?? ""),
    gender: String(detail.personalInfo.gender ?? ""),
    bloodType: String(detail.personalInfo.bloodType ?? ""),
    disabilityStatus: String(detail.personalInfo.disabilityStatus ?? ""),
    educationStatus: String(detail.personalInfo.educationStatus ?? ""),
    highestEducationLevel: String(detail.personalInfo.highestEducationLevel ?? ""),
    lastEducationSchool: String(detail.personalInfo.lastEducationSchool ?? ""),
    maritalStatus: String(detail.personalInfo.maritalStatus ?? ""),
    childrenCount: detail.personalInfo.childrenCount == null ? "" : String(detail.personalInfo.childrenCount),
    birthDate: normalizeDateInput(detail.personalInfo.birthDate),
    phone: detail.main.phone ?? "",
  };
}

export function buildOtherInfoForm(detail: EmployeeDetailData): EmployeeOtherInfoFormData {
  return {
    address: String(detail.contactInfo.address ?? ""),
    country: String(detail.contactInfo.country ?? ""),
    city: String(detail.contactInfo.city ?? ""),
    district: String(detail.contactInfo.district ?? ""),
    postalCode: String(detail.contactInfo.postalCode ?? ""),
    homePhone: String(detail.contactInfo.homePhone ?? ""),
    salary: detail.financialInfo.salary == null ? "" : String(detail.financialInfo.salary),
    salaryPaymentDay: detail.financialInfo.salaryPaymentDay == null ? "" : String(detail.financialInfo.salaryPaymentDay),
    bankName: String(detail.financialInfo.bankName ?? ""),
    accountType: String(detail.financialInfo.accountType ?? ""),
    accountNumber: "",
    accountNumberMasked: String(detail.financialInfo.accountNumberMasked ?? ""),
    iban: "",
    ibanMasked: String(detail.financialInfo.ibanMasked ?? ""),
    contactName: String(detail.emergencyContact.contactName ?? ""),
    contactPhone: String(detail.emergencyContact.contactPhone ?? ""),
    relation: String(detail.emergencyContact.relation ?? ""),
  };
}

export function buildPaymentForm(): EmployeePaymentFormData {
  return {
    id: undefined,
    accountId: "",
    amount: "",
    movementType: "PAYMENT",
    transactionType: "salary",
    paymentMethod: "",
    documentUrl: "",
    paymentDate: "",
    notes: "",
  };
}

export function buildShiftForm(detail?: EmployeeDetailData | null): EmployeeShiftFormData {
  return {
    branchId: detail?.main.branchId ?? "",
    shiftType: "WORK",
    scheduledStartAt: "",
    scheduledEndAt: "",
    notes: "",
  };
}

export function buildPaymentFormFromItem(item: Record<string, unknown>): EmployeePaymentFormData {
  return {
    id: String(item.id ?? ""),
    accountId: String(item.accountId ?? ""),
    amount: item.amount == null ? "" : String(item.amount),
    movementType: String(item.movementType ?? "PAYMENT") === "RECEIVABLE" ? "RECEIVABLE" : "PAYMENT",
    transactionType: String(item.transactionType ?? ""),
    paymentMethod: String(item.paymentMethod ?? ""),
    documentUrl: String(item.documentUrl ?? ""),
    paymentDate: normalizeDateInput(item.paymentDate),
    notes: String(item.notes ?? ""),
  };
}
