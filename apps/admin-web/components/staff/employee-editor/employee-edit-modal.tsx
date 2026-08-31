"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { StaffMetaResponse } from "../../../lib/api/client";
import { getStoredUser, hasStoredPermission } from "../../../lib/auth/session";
import { emitAdminToast } from "../../../lib/feedback";
import { fetchAccountingMeta } from "../../../lib/services/accounting-service";
import {
  assignEmployeeOwner,
  createEmployeeShift,
  createEmployeePayment,
  deleteEmployeePayment,
  exportEmployeeShifts,
  fetchEmployeeAccountMovements,
  fetchEmployeeDetail,
  fetchEmployeePayments,
  fetchEmployeeShifts,
  passiveEmployee,
  updateEmployeePayment,
  updateEmployeeAccountSettings,
  updateEmployeeOtherInfo,
  updateEmployeePersonalInfo,
} from "../../../lib/services/staff-service";
import { AdminButton, AdminField, AdminModal, AdminStateCard, AdminStatusBadge, AdminTableCard, AdminTextarea } from "../../ui/admin-ui";
import { AccountMovementsTab } from "./account-movements-tab";
import { AccountSettingsForm } from "./account-settings-form";
import { EmployeeHeader } from "./employee-header";
import { OtherInfoForm } from "./other-info-form";
import { PaymentsTab } from "./payments-tab";
import { PersonalInfoForm } from "./personal-info-form";
import { ShiftsTab } from "./shifts-tab";
import {
  buildAccountSettingsForm,
  buildEmployeeEditorMeta,
  buildOtherInfoForm,
  buildPaymentForm,
  buildPaymentFormFromItem,
  buildPersonalInfoForm,
  buildShiftForm,
} from "./types";
import type {
  EmployeeAccountSettingsFormData,
  EmployeeDetailData,
  EmployeeShiftFilters,
  EmployeeShiftFormData,
  EmployeeEditorTab,
  EmployeeOtherInfoFormData,
  EmployeePaymentFormData,
  EmployeePersonalInfoFormData,
} from "./types";

type CollectionState = {
  items: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  loading: boolean;
  loaded: boolean;
  requestKey: string;
};

const EMPTY_COLLECTION: CollectionState = {
  items: [],
  summary: {},
  loading: false,
  loaded: false,
  requestKey: "",
};

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string) {
  return /^\+?[0-9\s()-]{10,20}$/.test(value);
}

function isFutureDate(value: string) {
  if (!value) return false;
  const target = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target > today;
}

function isValidIban(value: string) {
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(normalized)) {
    return false;
  }

  const rearranged = `${normalized.slice(4)}${normalized.slice(0, 4)}`;
  const converted = rearranged
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        return String(code - 55);
      }
      return char;
    })
    .join("");

  let remainder = 0;
  for (const digit of converted) {
    remainder = Number(`${remainder}${digit}`) % 97;
  }

  return remainder === 1;
}

export function EmployeeEditModal({
  employeeId,
  meta,
  onClose,
  onRefreshList,
}: {
  employeeId: string;
  meta: StaffMetaResponse | null;
  onClose: () => void;
  onRefreshList: () => Promise<void>;
}) {
  const currentUser = useMemo(() => getStoredUser(), []);
  const canManageEmployee = hasStoredPermission(currentUser, "staff.manage");
  const canAssignOwner = useMemo(() => {
    if (!canManageEmployee) return false;
    const role = String(currentUser?.role ?? "").trim();
    return role === "tenant_owner" || role === "super_admin";
  }, [canManageEmployee, currentUser?.role]);
  const [accountOptions, setAccountOptions] = useState<Array<{ label: string; value: string }>>([]);
  const editorMeta = useMemo(() => ({ ...buildEmployeeEditorMeta(meta), accountOptions }), [meta, accountOptions]);
  const [activeTab, setActiveTab] = useState<EmployeeEditorTab>("account-settings");
  const [detail, setDetail] = useState<EmployeeDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [personalPhotoError, setPersonalPhotoError] = useState<string | null>(null);
  const [showThisMonthOnly, setShowThisMonthOnly] = useState(true);
  const [paymentModalMode, setPaymentModalMode] = useState<"create" | "edit" | "view" | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Record<string, unknown> | null>(null);
  const [actionModal, setActionModal] = useState<null | "passive" | "assign-owner">(null);
  const [actionNote, setActionNote] = useState("");
  const [accountMovementFilters, setAccountMovementFilters] = useState({ search: "", sourceType: "all" });
  const [shiftFilters, setShiftFilters] = useState<EmployeeShiftFilters>({
    viewMode: "week",
    focusDate: new Date().toISOString().slice(0, 10),
    shiftType: "all",
  });
  const [shiftForm, setShiftForm] = useState<EmployeeShiftFormData>(buildShiftForm());
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Record<string, unknown> | null>(null);
  const [accountSettings, setAccountSettings] = useState<EmployeeAccountSettingsFormData | null>(null);
  const [personalInfo, setPersonalInfo] = useState<EmployeePersonalInfoFormData | null>(null);
  const [otherInfo, setOtherInfo] = useState<EmployeeOtherInfoFormData | null>(null);
  const [paymentForm, setPaymentForm] = useState<EmployeePaymentFormData>(buildPaymentForm());
  const [payments, setPayments] = useState<CollectionState>(EMPTY_COLLECTION);
  const [shifts, setShifts] = useState<CollectionState>(EMPTY_COLLECTION);
  const [accountMovements, setAccountMovements] = useState<CollectionState>(EMPTY_COLLECTION);
  const mountedRef = useRef(true);
  const detailRequestSeqRef = useRef(0);
  const paymentsRequestSeqRef = useRef(0);
  const shiftsRequestSeqRef = useRef(0);
  const movementsRequestSeqRef = useRef(0);
  const accountingMetaLoadedRef = useRef(false);
  const accountingMetaLoadingRef = useRef(false);

  function syncDetailState(nextDetail: EmployeeDetailData, options?: { keepShiftDraft?: boolean }) {
    setDetail(nextDetail);
    setAccountSettings(buildAccountSettingsForm(nextDetail));
    setPersonalInfo(buildPersonalInfoForm(nextDetail));
    setOtherInfo(buildOtherInfoForm(nextDetail));
    if (!options?.keepShiftDraft) {
      setShiftForm(buildShiftForm(nextDetail));
    }
  }

  function runListRefreshInBackground() {
    void onRefreshList().catch(() => {});
  }

  function handleSectionSuccess(message: string, nextDetail: EmployeeDetailData) {
    syncDetailState(nextDetail, { keepShiftDraft: shiftModalOpen });
    runListRefreshInBackground();
    emitAdminToast({
      tone: "success",
      title: "Kaydedildi",
      message,
    });
  }

  async function loadDetail(showLoading = true) {
    const requestSeq = ++detailRequestSeqRef.current;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const response = await fetchEmployeeDetail(employeeId);
      if (!mountedRef.current || requestSeq !== detailRequestSeqRef.current) return;
      const nextDetail = response.data as EmployeeDetailData;
      syncDetailState(nextDetail);
    } catch (detailError) {
      if (!mountedRef.current || requestSeq !== detailRequestSeqRef.current) return;
      setError(toErrorMessage(detailError, "Personel detay bilgisi getirilemedi."));
    } finally {
      if (showLoading && mountedRef.current && requestSeq === detailRequestSeqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [employeeId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "payments" || accountingMetaLoadedRef.current || accountingMetaLoadingRef.current) {
      return;
    }
    accountingMetaLoadingRef.current = true;
    fetchAccountingMeta("payroll")
      .then((response) => {
        if (!mountedRef.current) return;
        const options = response.fields.find((field) => field.key === "accountId")?.options ?? [];
        setAccountOptions(options);
        accountingMetaLoadedRef.current = true;
      })
      .catch(() => {
        if (mountedRef.current) setAccountOptions([]);
      })
      .finally(() => {
        accountingMetaLoadingRef.current = false;
      });
  }, [activeTab]);

  async function loadPayments(force = false) {
    const requestKey = `${employeeId}:${showThisMonthOnly ? "month" : "all"}`;
    if (payments.loading && payments.requestKey === requestKey) return;
    if (payments.loaded && payments.requestKey === requestKey && !force) return;
    const requestSeq = ++paymentsRequestSeqRef.current;
    setPayments((current) => ({ ...current, loading: true, requestKey }));
    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
      const response = await fetchEmployeePayments(
        employeeId,
        showThisMonthOnly
          ? {
              dateFrom: startOfMonth,
              dateTo: endOfMonth,
            }
          : undefined,
      );
      if (!mountedRef.current || requestSeq !== paymentsRequestSeqRef.current) return;
      setPayments({
        items: response.data.items ?? [],
        summary: response.data.summary ?? {},
        loaded: true,
        loading: false,
        requestKey,
      });
      setDetail((current) => (current ? { ...current, paymentSummary: response.data.summary ?? current.paymentSummary } : current));
    } catch (collectionError) {
      if (!mountedRef.current || requestSeq !== paymentsRequestSeqRef.current) return;
      setError(toErrorMessage(collectionError, "Personel odeme kayitlari getirilemedi."));
      setPayments((current) => ({ ...current, loading: false, requestKey }));
    }
  }

  async function loadShifts(force = false) {
    const requestKey = `${employeeId}:${shiftFilters.viewMode}:${shiftFilters.focusDate}:${shiftFilters.shiftType}`;
    if (shifts.loading && shifts.requestKey === requestKey) return;
    if (shifts.loaded && shifts.requestKey === requestKey && !force) return;
    const requestSeq = ++shiftsRequestSeqRef.current;
    setShifts((current) => ({ ...current, loading: true, requestKey }));
    try {
      const focus = shiftFilters.focusDate ? new Date(shiftFilters.focusDate) : new Date();
      const range = (() => {
        const start = new Date(focus);
        const end = new Date(focus);
        if (shiftFilters.viewMode === "month") {
          start.setDate(1);
          end.setMonth(end.getMonth() + 1, 0);
        } else if (shiftFilters.viewMode === "week") {
          const day = start.getDay();
          const diff = day === 0 ? -6 : 1 - day;
          start.setDate(start.getDate() + diff);
          end.setDate(start.getDate() + 6);
        }
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return {
          dateFrom: start.toISOString().slice(0, 10),
          dateTo: end.toISOString().slice(0, 10),
        };
      })();
      const response = await fetchEmployeeShifts(employeeId, {
        ...range,
        shiftType: shiftFilters.shiftType !== "all" ? shiftFilters.shiftType : undefined,
      });
      if (!mountedRef.current || requestSeq !== shiftsRequestSeqRef.current) return;
      setShifts({
        items: response.data.items ?? [],
        summary: response.data.summary ?? {},
        loaded: true,
        loading: false,
        requestKey,
      });
      setDetail((current) => (current ? { ...current, shiftSummary: response.data.summary ?? current.shiftSummary } : current));
    } catch (collectionError) {
      if (!mountedRef.current || requestSeq !== shiftsRequestSeqRef.current) return;
      setError(toErrorMessage(collectionError, "Personel vardiya kayitlari getirilemedi."));
      setShifts((current) => ({ ...current, loading: false, requestKey }));
    }
  }

  async function loadAccountMovements(force = false) {
    const requestKey = `${employeeId}:${accountMovementFilters.search}:${accountMovementFilters.sourceType}`;
    if (accountMovements.loading && accountMovements.requestKey === requestKey) return;
    if (accountMovements.loaded && accountMovements.requestKey === requestKey && !force) return;
    const requestSeq = ++movementsRequestSeqRef.current;
    setAccountMovements((current) => ({ ...current, loading: true, requestKey }));
    try {
      const response = await fetchEmployeeAccountMovements(employeeId, {
        search: accountMovementFilters.search || undefined,
        sourceType: accountMovementFilters.sourceType !== "all" ? accountMovementFilters.sourceType : undefined,
      });
      if (!mountedRef.current || requestSeq !== movementsRequestSeqRef.current) return;
      setAccountMovements({
        items: response.data.items ?? [],
        summary: response.data.summary ?? {},
        loaded: true,
        loading: false,
        requestKey,
      });
      setDetail((current) =>
        current ? { ...current, accountMovementSummary: response.data.summary ?? current.accountMovementSummary } : current,
      );
    } catch (collectionError) {
      if (!mountedRef.current || requestSeq !== movementsRequestSeqRef.current) return;
      setError(toErrorMessage(collectionError, "Personel hesap hareketleri getirilemedi."));
      setAccountMovements((current) => ({ ...current, loading: false, requestKey }));
    }
  }

  useEffect(() => {
    if (activeTab === "payments") {
      void loadPayments();
    }
    if (activeTab === "shifts") {
      void loadShifts();
    }
    if (activeTab === "account-movements") {
      void loadAccountMovements();
    }
  }, [activeTab, showThisMonthOnly, accountMovementFilters.search, accountMovementFilters.sourceType, shiftFilters.focusDate, shiftFilters.shiftType, shiftFilters.viewMode]);

  function openShiftModal() {
    if (!detail?.main.isActive) {
      setError("Pasif personel icin yeni vardiya eklenemez.");
      return;
    }
    setShiftForm(buildShiftForm(detail));
    setShiftModalOpen(true);
  }

  function closeShiftModal() {
    if (savingKey === "shifts") return;
    setShiftModalOpen(false);
    setShiftForm(buildShiftForm(detail));
  }

  async function handleSubmitShift() {
    if (!detail) return;
    if (!detail.main.isActive) {
      setError("Pasif personel icin yeni vardiya eklenemez.");
      return;
    }
    if (!shiftForm.scheduledStartAt || !shiftForm.scheduledEndAt) {
      setError("Baslangic ve bitis saatleri zorunlu.");
      return;
    }
    if (new Date(shiftForm.scheduledEndAt) <= new Date(shiftForm.scheduledStartAt)) {
      setError("Bitis saati baslangictan sonra olmali.");
      return;
    }

    setSavingKey("shifts");
    setError(null);
    try {
      const response = await createEmployeeShift(employeeId, {
        branchId: shiftForm.branchId || detail.main.branchId,
        shiftType: shiftForm.shiftType,
        scheduledStartAt: shiftForm.scheduledStartAt,
        scheduledEndAt: shiftForm.scheduledEndAt,
        notes: shiftForm.notes.trim() || undefined,
      });
      closeShiftModal();
      setShifts((current) => ({ ...current, loaded: false }));
      setSelectedShift((response.data ?? null) as Record<string, unknown> | null);
      void loadShifts(true);
      runListRefreshInBackground();
      emitAdminToast({
        tone: "success",
        title: "Kaydedildi",
        message: "Yeni vardiya kaydi olusturuldu.",
      });
    } catch (shiftError) {
      setError(toErrorMessage(shiftError, "Vardiya kaydi olusturulamadi."));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleExportShifts() {
    try {
      setSavingKey("shifts-export");
      setError(null);
      const focus = shiftFilters.focusDate ? new Date(shiftFilters.focusDate) : new Date();
      const range = (() => {
        const start = new Date(focus);
        const end = new Date(focus);
        if (shiftFilters.viewMode === "month") {
          start.setDate(1);
          end.setMonth(end.getMonth() + 1, 0);
        } else if (shiftFilters.viewMode === "week") {
          const day = start.getDay();
          const diff = day === 0 ? -6 : 1 - day;
          start.setDate(start.getDate() + diff);
          end.setDate(start.getDate() + 6);
        }
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return {
          dateFrom: start.toISOString().slice(0, 10),
          dateTo: end.toISOString().slice(0, 10),
        };
      })();
      const response = await exportEmployeeShifts(employeeId, {
        ...range,
        shiftType: shiftFilters.shiftType !== "all" ? shiftFilters.shiftType : undefined,
      });
      const exportData = (response.data ?? {}) as Record<string, unknown>;
      const content = String(exportData.content ?? "");
      const fileName = String(exportData.fileName ?? `employee-shifts-${employeeId}.csv`);
      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      emitAdminToast({
        tone: "success",
        title: "Export hazir",
        message: `${focus.toLocaleDateString("tr-TR")} odakli vardiya export indirildi.`,
      });
    } catch (shiftError) {
      setError(toErrorMessage(shiftError, "Vardiya export alinamadi."));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleAccountSettingsSubmit() {
    if (!accountSettings) return;
    if (!accountSettings.firstName.trim()) {
      setError("Personel adi zorunlu.");
      return;
    }
    if (!accountSettings.lastName.trim()) {
      setError("Personel soyadi zorunlu.");
      return;
    }
    if (!accountSettings.email.trim()) {
      setError("E-posta zorunlu.");
      return;
    }
    if (!isValidEmail(accountSettings.email.trim())) {
      setError("Gecerli bir e-posta adresi gir.");
      return;
    }
    if (accountSettings.password.trim() && accountSettings.password.trim().length < 8) {
      setError("Parola en az 8 karakter olmali.");
      return;
    }
    if (accountSettings.pinCode.trim() && !/^\d{4}$/.test(accountSettings.pinCode.trim())) {
      setError("Satis ekrani pin kodu 4 haneli ve sadece sayi olmali.");
      return;
    }
    if (toOptionalNumber(accountSettings.dailyFreeDrinkLimit) === undefined) {
      setError("Gunluk ucretsiz icecek alani sayisal olmali.");
      return;
    }
    if (accountSettings.overtimeEnabled && toOptionalNumber(accountSettings.totalBreakMinutes) === undefined) {
      setError("Toplam mola suresi sayisal olmali.");
      return;
    }

    setSavingKey("account-settings");
    setError(null);
    try {
      const response = await updateEmployeeAccountSettings(employeeId, {
        firstName: accountSettings.firstName.trim(),
        lastName: accountSettings.lastName.trim(),
        email: accountSettings.email.trim(),
        password: accountSettings.password.trim() || undefined,
        restaurantRole: accountSettings.restaurantRole.trim(),
        staffRoleId: accountSettings.staffRoleId || undefined,
        pinCode: accountSettings.pinCode.trim() || undefined,
        hireDate: accountSettings.hireDate || undefined,
        overtimeEnabled: accountSettings.overtimeEnabled,
        dailyFreeDrinkLimit: toOptionalNumber(accountSettings.dailyFreeDrinkLimit),
        totalBreakMinutes: accountSettings.overtimeEnabled ? toOptionalNumber(accountSettings.totalBreakMinutes) : 0,
      });
      handleSectionSuccess("Hesap ayarlari guncellendi.", response.data as EmployeeDetailData);
    } catch (saveError) {
      setError(toErrorMessage(saveError, "Hesap ayarlari guncellenemedi."));
    } finally {
      setSavingKey(null);
    }
  }

  async function handlePersonalInfoSubmit() {
    if (!personalInfo || !detail) return;
    if (personalInfo.childrenCount.trim() && (toOptionalNumber(personalInfo.childrenCount) ?? -1) < 0) {
      setError("Cocuk sayisi negatif olamaz.");
      return;
    }
    if (personalInfo.birthDate && isFutureDate(personalInfo.birthDate)) {
      setError("Dogum tarihi ileri tarih olamaz.");
      return;
    }
    if (personalInfo.phone.trim() && !isValidPhone(personalInfo.phone.trim())) {
      setError("Telefon formati gecersiz.");
      return;
    }

    setSavingKey("personal-info");
    setError(null);
    try {
      const response = await updateEmployeePersonalInfo(employeeId, {
        phone: personalInfo.phone.trim() || undefined,
        photo: personalInfo.photo.trim() || undefined,
        nationality: personalInfo.nationality.trim() || undefined,
        identityNumber: personalInfo.identityNumber.trim() || undefined,
        gender: personalInfo.gender.trim() || undefined,
        bloodType: personalInfo.bloodType.trim() || undefined,
        disabilityStatus: personalInfo.disabilityStatus.trim() || undefined,
        educationStatus: personalInfo.educationStatus.trim() || undefined,
        highestEducationLevel: personalInfo.highestEducationLevel.trim() || undefined,
        lastEducationSchool: personalInfo.lastEducationSchool.trim() || undefined,
        maritalStatus: personalInfo.maritalStatus.trim() || undefined,
        childrenCount: toOptionalNumber(personalInfo.childrenCount),
        birthDate: personalInfo.birthDate || undefined,
      });
      handleSectionSuccess("Kisisel bilgiler guncellendi.", response.data as EmployeeDetailData);
    } catch (saveError) {
      setError(toErrorMessage(saveError, "Kisisel bilgiler guncellenemedi."));
    } finally {
      setSavingKey(null);
    }
  }

  function handlePersonalPhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    if (!personalInfo) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setPersonalPhotoError("Sadece PNG, JPG, JPEG veya WEBP dosyalari kabul edilir.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPersonalPhotoError("Profil fotografi maksimum 2 MB olabilir.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:image/")) {
        setPersonalPhotoError("Fotograf verisi okunamadi.");
        return;
      }
      setPersonalPhotoError(null);
      setPersonalInfo({
        ...personalInfo,
        photo: result,
        photoFileName: file.name,
      });
    };
    reader.onerror = () => {
      setPersonalPhotoError("Fotograf okunurken hata olustu.");
    };
    reader.readAsDataURL(file);
  }

  function handlePersonalPhotoRemove() {
    if (!personalInfo) return;
    setPersonalPhotoError(null);
    setPersonalInfo({
      ...personalInfo,
      photo: "",
      photoFileName: "",
    });
  }

  function openCreatePaymentModal() {
    setSelectedPayment(null);
    setPaymentForm({
      ...buildPaymentForm(),
      movementType: "PAYMENT",
      transactionType: "salary",
    });
    setPaymentModalMode("create");
  }

  function openCreateReceivableModal() {
    setSelectedPayment(null);
    setPaymentForm({
      ...buildPaymentForm(),
      movementType: "RECEIVABLE",
      transactionType: "receivable",
    });
    setPaymentModalMode("create");
  }

  function openPaymentView(item: Record<string, unknown>) {
    setSelectedPayment(item);
    setPaymentForm(buildPaymentFormFromItem(item));
    setPaymentModalMode("view");
  }

  function openPaymentEdit(item: Record<string, unknown>) {
    setSelectedPayment(item);
    setPaymentForm(buildPaymentFormFromItem(item));
    setPaymentModalMode("edit");
  }

  function closePaymentModal() {
    if (savingKey === "payments") return;
    setPaymentModalMode(null);
    setSelectedPayment(null);
    setPaymentForm(buildPaymentForm());
  }

  async function handleOtherInfoSubmit() {
    if (!otherInfo) return;
    const normalizedSalaryDay = toOptionalNumber(otherInfo.salaryPaymentDay);
    const normalizedSalary = toOptionalNumber(otherInfo.salary);
    const normalizedHomePhone = otherInfo.homePhone.trim();
    const normalizedContactPhone = otherInfo.contactPhone.trim();
    const normalizedBankName = otherInfo.bankName.trim();
    const normalizedAccountType = otherInfo.accountType.trim();
    const normalizedAccountNumber = otherInfo.accountNumber.replace(/\s+/g, "").trim();
    const normalizedIban = otherInfo.iban.replace(/\s+/g, "").toUpperCase().trim();
    const hasBankPayload = [normalizedBankName, normalizedAccountType, normalizedAccountNumber, normalizedIban].some(Boolean);

    if (otherInfo.salary.trim() && normalizedSalary === undefined) {
      setError("Maas alani sayisal olmali.");
      return;
    }
    if (normalizedSalaryDay !== undefined && (normalizedSalaryDay < 1 || normalizedSalaryDay > 31)) {
      setError("Maas odeme gunu 1 ile 31 arasinda olmali.");
      return;
    }
    if (normalizedHomePhone && !isValidPhone(normalizedHomePhone)) {
      setError("Ev telefonu formati gecersiz.");
      return;
    }
    if (normalizedContactPhone && !isValidPhone(normalizedContactPhone)) {
      setError("Acil durum telefonu formati gecersiz.");
      return;
    }
    if (hasBankPayload) {
      if (!normalizedBankName || !normalizedAccountType) {
        setError("Banka bilgisi girilecekse banka adi ve hesap turu zorunlu.");
        return;
      }
      if (!normalizedAccountNumber && !normalizedIban) {
        setError("Banka bilgisi girilecekse hesap numarasi veya IBAN zorunlu.");
        return;
      }
    }
    if (normalizedIban && !isValidIban(normalizedIban)) {
      setError("IBAN formati gecersiz.");
      return;
    }

    setSavingKey("other-info");
    setError(null);
    try {
      const response = await updateEmployeeOtherInfo(employeeId, {
        address: otherInfo.address.trim() || undefined,
        country: otherInfo.country.trim() || undefined,
        city: otherInfo.city.trim() || undefined,
        district: otherInfo.district.trim() || undefined,
        postalCode: otherInfo.postalCode.trim() || undefined,
        homePhone: normalizedHomePhone || undefined,
        salary: normalizedSalary,
        salaryPaymentDay: normalizedSalaryDay,
        bankName: normalizedBankName || undefined,
        accountType: normalizedAccountType || undefined,
        accountNumber: normalizedAccountNumber || undefined,
        iban: normalizedIban || undefined,
        contactName: otherInfo.contactName.trim() || undefined,
        contactPhone: normalizedContactPhone || undefined,
        relation: otherInfo.relation.trim() || undefined,
      });
      handleSectionSuccess("Diger bilgiler guncellendi.", response.data as EmployeeDetailData);
    } catch (saveError) {
      setError(toErrorMessage(saveError, "Diger bilgiler guncellenemedi."));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleSubmitPayment() {
    if (!paymentForm.amount.trim()) {
      setError(paymentForm.movementType === "RECEIVABLE" ? "Alacak tutari zorunlu." : "Odeme tutari zorunlu.");
      return;
    }
    if (!toOptionalNumber(paymentForm.amount) || Number(paymentForm.amount) <= 0) {
      setError("Tutar sifirdan buyuk olmali.");
      return;
    }
    if (paymentForm.documentUrl.trim() && !/^(https?:\/\/|\/)[^\s]+$/i.test(paymentForm.documentUrl.trim())) {
      setError("Belge alani gecersiz.");
      return;
    }
    if (!paymentForm.transactionType.trim()) {
      setError("Islem turu zorunlu.");
      return;
    }

    setSavingKey("payments");
    setError(null);
    try {
      const payload = {
        accountId: paymentForm.accountId || undefined,
        amount: Number(paymentForm.amount),
        movementType: paymentForm.movementType,
        transactionType: paymentForm.transactionType.trim(),
        paymentMethod: paymentForm.paymentMethod || undefined,
        documentUrl: paymentForm.documentUrl.trim() || undefined,
        paymentDate: paymentForm.paymentDate || undefined,
        notes: paymentForm.notes.trim() || undefined,
      };

      if (paymentModalMode === "edit" && paymentForm.id) {
        await updateEmployeePayment(employeeId, paymentForm.id, payload);
      } else {
        await createEmployeePayment(employeeId, payload);
      }
      closePaymentModal();
      setPayments((current) => ({ ...current, loaded: false }));
      setAccountMovements((current) => ({ ...current, loaded: false }));
      void loadPayments(true);
      if (activeTab === "account-movements") {
        void loadAccountMovements(true);
      }
      runListRefreshInBackground();
      emitAdminToast({
        tone: "success",
        title: "Kaydedildi",
        message: paymentForm.movementType === "RECEIVABLE" ? "Alacak kaydi olusturuldu." : "Odeme kaydi olusturuldu.",
      });
    } catch (paymentError) {
      setError(toErrorMessage(paymentError, "Hareket kaydi kaydedilemedi."));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleDeletePayment(item: Record<string, unknown>) {
    const paymentId = String(item.id ?? "");
    if (!paymentId) return;
    const note = window.prompt("Silme nedeni", "Kayit iptal edildi");
    if (note === null) return;

    setSavingKey("payments");
    setError(null);
    try {
      await deleteEmployeePayment(employeeId, paymentId, { note });
      if (paymentForm.id === paymentId) {
        closePaymentModal();
      }
      setPayments((current) => ({ ...current, loaded: false }));
      setAccountMovements((current) => ({ ...current, loaded: false }));
      void loadPayments(true);
      if (activeTab === "account-movements") {
        void loadAccountMovements(true);
      }
      runListRefreshInBackground();
      emitAdminToast({
        tone: "success",
        title: "Kaydedildi",
        message: "Hareket kaydi kaldirildi.",
      });
    } catch (paymentError) {
      setError(toErrorMessage(paymentError, "Hareket kaydi silinemedi."));
    } finally {
      setSavingKey(null);
    }
  }

  function openPassiveConfirm() {
    if (!detail?.main.isActive || !canManageEmployee) return;
    setActionNote("Durum guncellemesi");
    setActionModal("passive");
  }

  function openAssignOwnerConfirm() {
    if (!detail?.main.isActive || detail?.main.isOwner || !canAssignOwner) return;
    setActionNote("Sahiplik yetkisi guncellendi");
    setActionModal("assign-owner");
  }

  function closeActionModal(force = false) {
    if (actionBusy && !force) return;
    setActionModal(null);
    setActionNote("");
  }

  async function handleConfirmAction() {
    if (!actionModal) return;
    setActionBusy(true);
    setError(null);
    try {
      if (actionModal === "passive") {
        await passiveEmployee(employeeId, { note: actionNote.trim() || undefined });
        await loadDetail(false);
        runListRefreshInBackground();
        emitAdminToast({
          tone: "success",
          title: "Kaydedildi",
          message: "Personel pasif duruma alindi.",
        });
      } else {
        await assignEmployeeOwner(employeeId, { note: actionNote.trim() || undefined });
        await loadDetail(false);
        runListRefreshInBackground();
        emitAdminToast({
          tone: "success",
          title: "Kaydedildi",
          message: "Personel isletme sahibi olarak atandi.",
        });
      }
      closeActionModal(true);
    } catch (actionError) {
      setError(
        toErrorMessage(actionError, actionModal === "passive" ? "Personel pasife alinamadi." : "Isletme sahibi atamasi yapilamadi."),
      );
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <>
      <AdminModal
        open
        size="xl"
        kicker="Personel Düzenleme"
        title={detail?.main.fullName ?? "Personel bilgileri"}
        onClose={onClose}
        closeDisabled={actionBusy}
      >
        {loading ? <AdminStateCard message="Personel ekrani yukleniyor..." tone="info" /> : null}
        {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}

        {!loading && detail && accountSettings && personalInfo && otherInfo ? (
          <div className="admin-employee-editor">
            <EmployeeHeader
              detail={detail}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onPassive={openPassiveConfirm}
              onAssignOwner={openAssignOwnerConfirm}
              canManageEmployee={canManageEmployee}
              canAssignOwner={canAssignOwner}
              busy={actionBusy}
            />

            <section className="admin-employee-editor__summary">
              <AdminTableCard title="Rol ve Yetki Ozeti" description="Personelin aktif rolu ve efektif izinleri.">
                <div className="admin-employee-editor__summary-grid">
                  <div className="admin-employee-editor__summary-block">
                    <strong>Ana Rol</strong>
                    <p>{detail.main.staffRoleName || "Rol secilmemis"}</p>
                  </div>
                  <div className="admin-employee-editor__summary-block">
                    <strong>Atanan Roller</strong>
                    <p>{(detail.rolePermissions.assignedRoles ?? []).map((role) => String(role.name ?? role.key ?? "")).filter(Boolean).join(", ") || "-"}</p>
                  </div>
                </div>
              </AdminTableCard>
            </section>

            {activeTab === "account-settings" ? (
              <AccountSettingsForm
                value={accountSettings}
                meta={editorMeta}
                currentPinMasked={detail.main.pinCodeMasked}
                onChange={setAccountSettings}
                onSubmit={() => void handleAccountSettingsSubmit()}
                saving={savingKey === "account-settings"}
              />
            ) : null}

            {activeTab === "personal-info" ? (
              <PersonalInfoForm
                employeeName={detail.main.fullName}
                value={personalInfo}
                error={personalPhotoError}
                onChange={setPersonalInfo}
                onPhotoSelect={handlePersonalPhotoSelect}
                onPhotoRemove={handlePersonalPhotoRemove}
                onSubmit={() => void handlePersonalInfoSubmit()}
                saving={savingKey === "personal-info"}
              />
            ) : null}

            {activeTab === "other-info" ? (
              <OtherInfoForm
                value={otherInfo}
                onChange={setOtherInfo}
                onSubmit={() => void handleOtherInfoSubmit()}
                saving={savingKey === "other-info"}
              />
            ) : null}

            {activeTab === "payments" ? (
              <PaymentsTab
                summary={payments.loaded ? payments.summary : (detail.paymentSummary ?? {})}
                items={payments.items}
                loading={payments.loading}
                showThisMonthOnly={showThisMonthOnly}
                onToggleThisMonth={() => setShowThisMonthOnly((current) => !current)}
                paymentForm={paymentForm}
                accountOptions={editorMeta.accountOptions}
                onPaymentFormChange={setPaymentForm}
                paymentModalMode={paymentModalMode}
                selectedPayment={selectedPayment}
                onOpenCreatePayment={openCreatePaymentModal}
                onOpenCreateReceivable={openCreateReceivableModal}
                onOpenPaymentView={openPaymentView}
                onOpenPaymentEdit={openPaymentEdit}
                onClosePaymentModal={closePaymentModal}
                onSubmitPayment={() => void handleSubmitPayment()}
                onDeletePayment={(item) => void handleDeletePayment(item)}
                creating={savingKey === "payments"}
              />
            ) : null}

            {activeTab === "shifts" ? (
              <ShiftsTab
                employeeName={detail.main.fullName}
                employeeActive={detail.main.isActive}
                overtimeEnabled={detail.main.overtimeEnabled}
                summary={shifts.loaded ? shifts.summary : (detail.shiftSummary ?? {})}
                items={shifts.items}
                loading={shifts.loading}
                filters={shiftFilters}
                shiftForm={shiftForm}
                shiftModalOpen={shiftModalOpen}
                selectedShift={selectedShift}
                saving={savingKey === "shifts" || savingKey === "shifts-export"}
                onFilterChange={(next) => {
                  setShiftFilters(next);
                  setShifts((current) => ({ ...current, loaded: false }));
                }}
                onShiftFormChange={setShiftForm}
                onOpenCreateShift={openShiftModal}
                onCloseShiftModal={closeShiftModal}
                onSubmitShift={() => void handleSubmitShift()}
                onExport={() => void handleExportShifts()}
                onSelectShift={setSelectedShift}
              />
            ) : null}

            {activeTab === "account-movements" ? (
              <AccountMovementsTab
                summary={accountMovements.loaded ? accountMovements.summary : (detail.accountMovementSummary ?? {})}
                items={accountMovements.items}
                loading={accountMovements.loading}
                filters={accountMovementFilters}
                onFilterChange={(next) => {
                  setAccountMovementFilters(next);
                  setAccountMovements((current) => ({ ...current, loaded: false }));
                }}
              />
            ) : null}
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        open={Boolean(actionModal)}
        size="sm"
        kicker="Güvenli İşlem Onayı"
        title={actionModal === "passive" ? "Personeli pasifleştir" : "İşletme sahibi ataması"}
        description={
          actionModal
            ? actionModal === "passive"
              ? "Bu işlem personelin kritik akışlarını kilitler. Devam etmeden önce onay ver."
              : "Bu işlem mevcut sahip kaydını değiştirir. Sadece yetkili kullanıcılar devam edebilir."
            : undefined
        }
        onClose={() => closeActionModal()}
        closeDisabled={actionBusy}
        footer={
          <div className="admin-modal__footer-content">
            <div className="admin-modal__footer-left">
              <AdminButton variant="text" onClick={() => closeActionModal()} disabled={actionBusy}>
                Vazgeç
              </AdminButton>
            </div>
            <div className="admin-modal__footer-right">
              <AdminButton variant="primary" onClick={() => void handleConfirmAction()} disabled={actionBusy} loading={actionBusy}>
                {actionBusy ? "İşleniyor..." : "Onayla"}
              </AdminButton>
            </div>
          </div>
        }
      >
        <AdminField label="İşlem Notu" fullWidth>
          <AdminTextarea rows={3} value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder="Audit log için not ekleyebilirsin." />
        </AdminField>
      </AdminModal>
    </>
  );
}
