"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PosSettingsListResponse, PosSettingsMetaResponse } from "../../lib/api/client";
import { getStoredUser, hasStoredPermission } from "../../lib/auth/session";
import { getPosSettingsScreen, posSettingsScreens } from "../../lib/pos-settings-config";
import {
  createPosSettingsItem,
  deletePosSettingsItem,
  fetchPosSettingsDetail,
  fetchPosSettingsList,
  fetchPosSettingsMeta,
  updatePosSettingsItem,
} from "../../lib/services/pos-settings-service";
import { formatTryCurrency } from "../../lib/utils/admin-format";
import { getValueByPath } from "../../lib/utils/object-path";
import { formatJsonFieldForTextarea, formatReadableValue, normalizeJsonFieldsForSubmit } from "../../lib/utils/readable-value";
import {
  AdminConfirmDialog,
  AdminFilterPanel,
  AdminButton,
  AdminField,
  AdminInput,
  AdminModal,
  AdminPageHeader,
  AdminPagination,
  AdminRowActionMenu,
  AdminStateCard,
  AdminStatusBadge,
  AdminSwitchField,
  AdminTabs,
  AdminTableCard,
  AdminTableWrap,
  AdminSelect,
  AdminTextarea,
} from "../ui/admin-ui";
import { AdminIcon } from "../ui/admin-icons";
import { PosSettingsShell } from "./pos-settings-shell";

function normalizeDateTimeValue(value: unknown) {
  if (!value || typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildDefaultTableRows(branchId: string) {
  const floors = [
    { label: "Zemin Kat", code: "ZK" },
    { label: "1. Kat", code: "K1" },
    { label: "2. Kat", code: "K2" },
  ];
  const rows: Array<Record<string, unknown>> = [];
  for (const floor of floors) {
    for (let index = 1; index <= 20; index += 1) {
      rows.push({
        branchId,
        code: `${floor.code}-M${index}`,
        name: `${floor.label} M${index}`,
        capacity: 4,
        status: "AVAILABLE",
      });
    }
  }
  return rows;
}

function getMenuProductDefaults() {
  return {
    isActive: true,
    isVisible: true,
    showInQr: true,
    isVatAuto: true,
    stockTracked: false,
    recipeEnabled: false,
    recipeItemsJson: [],
  };
}

function normalizeRecipeEditorItems(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => ({
      inventoryItemId: String((item as Record<string, unknown>).inventoryItemId ?? ""),
      quantity: String((item as Record<string, unknown>).quantity ?? ""),
    }));
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map((item) => ({
            inventoryItemId: String((item as Record<string, unknown>).inventoryItemId ?? ""),
            quantity: String((item as Record<string, unknown>).quantity ?? ""),
          }))
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function PosSettingsScreen({ slug }: { slug?: string }) {
  const screen = useMemo(() => getPosSettingsScreen(slug), [slug]);
  const sessionUser = useMemo(() => getStoredUser(), []);
  const [meta, setMeta] = useState<PosSettingsMetaResponse | null>(null);
  const [list, setList] = useState<PosSettingsListResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(screen));
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [debouncedFilters, setDebouncedFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<"detail" | "edit" | "create">("edit");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMenuRowId, setActionMenuRowId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const groupedFields = useMemo(() => {
    const result = new Map<string, NonNullable<PosSettingsMetaResponse["fields"]>>();
    for (const field of meta?.fields ?? []) {
      const section = field.section ?? "Genel";
      result.set(section, [...(result.get(section) ?? []), field]);
    }
    return [...result.entries()];
  }, [meta?.fields]);

  const categoryFieldOptions = useMemo(
    () => meta?.fields.find((field) => field.key === "categoryId")?.options ?? [],
    [meta?.fields],
  );
  const inventoryFieldOptions = useMemo(
    () => meta?.fields.find((field) => field.key === "stockItemId")?.options ?? [],
    [meta?.fields],
  );
  const isMenuProductResource = screen?.resource === "menu-management" || screen?.resource === "menu-products";
  const isMenuCategoryResource = screen?.resource === "menu-categories";
  const isCalibrationResource = isMenuProductResource || isMenuCategoryResource;

  const productTabs = useMemo(() => {
    if (!isMenuProductResource) return [];
    return [
      { key: "base", label: "Temel Bilgiler" },
      { key: "pricing", label: "Fiyatlandırma" },
      { key: "channels", label: "Kanal Ayarları" },
      { key: "stock", label: "Stok & Reçete" },
      { key: "advanced", label: "Ek Bilgiler" },
    ] as const;
  }, [isMenuProductResource]);

  function resolveProductTabKey(section: string) {
    const normalized = String(section ?? "").toLowerCase();
    if (normalized.includes("temel")) return "base";
    if (normalized.includes("fiyat") || normalized.includes("kdv") || normalized.includes("maliyet")) return "pricing";
    if (normalized.includes("kanal") || normalized.includes("pos") || normalized.includes("qr") || normalized.includes("aktif")) return "channels";
    if (normalized.includes("stok") || normalized.includes("reçete") || normalized.includes("recete")) return "stock";
    return "advanced";
  }

  const [activeProductTab, setActiveProductTab] = useState<"base" | "pricing" | "channels" | "stock" | "advanced">("base");

  const resourcePermissions = useMemo(() => {
    if (!screen) {
      return { canView: false, canManage: false, canManagePrice: false };
    }

    const canViewPosSettings = hasStoredPermission(sessionUser, "pos_settings.view");
    const canManagePosSettings = hasStoredPermission(sessionUser, "pos_settings.manage");

    if (["menu-management", "menu-products", "menu-categories"].includes(screen.resource)) {
      return {
        canView: canViewPosSettings && hasStoredPermission(sessionUser, "product.manage"),
        canManage: canManagePosSettings && hasStoredPermission(sessionUser, "product.manage"),
        canManagePrice: isMenuProductResource ? hasStoredPermission(sessionUser, "product.price.manage") : false,
      };
    }

    if (screen.resource === "payment-methods") {
      return {
        canView: canViewPosSettings && hasStoredPermission(sessionUser, "payment_method.view"),
        canManage: canManagePosSettings && hasStoredPermission(sessionUser, "payment_method.manage"),
        canManagePrice: false,
      };
    }

    if (["defined-devices", "terminals", "printers"].includes(screen.resource)) {
      return {
        canView: canViewPosSettings && hasStoredPermission(sessionUser, "device.view"),
        canManage: canManagePosSettings && hasStoredPermission(sessionUser, "device.manage"),
        canManagePrice: false,
      };
    }

    return {
      canView: canViewPosSettings,
      canManage: canManagePosSettings,
      canManagePrice: false,
    };
  }, [screen, sessionUser]);

  function applyMenuVatDefault(nextCategoryId: string, nextFormData?: Record<string, unknown>) {
    const target = nextFormData ?? formData;
    const autoVatEnabled = Boolean(target.isVatAuto);
    if (!autoVatEnabled) return target;

    const category = categoryFieldOptions.find((option) => option.value === nextCategoryId);
    const defaultVatRateId = category?.meta?.defaultVatRateId;
    if (!defaultVatRateId) return target;

    return {
      ...target,
      vatRateId: String(defaultVatRateId),
    };
  }

  function handleFieldChange(fieldKey: string, value: unknown) {
    setFormData((current) => {
      let next = { ...current, [fieldKey]: value };

      if (isMenuProductResource || isMenuCategoryResource) {
        if (fieldKey === "name" && (!current.slug || !String(current.slug).trim())) {
          next.slug = slugify(String(value ?? ""));
        }
      }

      if (isMenuProductResource) {
        if (fieldKey === "categoryId") {
          next = applyMenuVatDefault(String(value ?? ""), next);
        }

        if (fieldKey === "isVatAuto" && value === true && next.categoryId) {
          next = applyMenuVatDefault(String(next.categoryId), next);
        }

        if (fieldKey === "stockTracked" && value === false) {
          next.stockItemId = "";
        }

        if (fieldKey === "recipeEnabled" && value === false) {
          next.recipeItemsJson = [];
        }

        if (fieldKey === "recipeItemsJson") {
          const nextRecipeItems = Array.isArray(value) ? value : [];
          next.recipeEnabled = nextRecipeItems.length > 0;
        }
      }

      return next;
    });
  }

  function validateBeforeSubmit() {
    if (!isMenuProductResource) {
      return null;
    }

    const name = String(formData.name ?? "").trim();
    const categoryId = String(formData.categoryId ?? "").trim();
    const slug = String(formData.slug ?? "").trim();
    const basePrice = Number(formData.basePrice ?? 0);
    const currentCost = formData.currentCost === "" || formData.currentCost === undefined || formData.currentCost === null ? null : Number(formData.currentCost);
    const calories = formData.calories === "" || formData.calories === undefined || formData.calories === null ? null : Number(formData.calories);
    const stockTracked = Boolean(formData.stockTracked);
    const stockItemId = String(formData.stockItemId ?? "").trim();
    const imageUrl = String(formData.imageUrl ?? "").trim();
    const recipeEnabled = Boolean(formData.recipeEnabled);
    const recipeItems = normalizeRecipeEditorItems(formData.recipeItemsJson);

    if (!name) return "Urun adi zorunlu.";
    if (!categoryId) return "Kategori secmelisin.";
    if (!slug) return "Slug alani zorunlu.";
    if (!Number.isFinite(basePrice) || basePrice < 0) return "Satis fiyati 0 veya daha buyuk olmali.";
    if (currentCost !== null && (!Number.isFinite(currentCost) || currentCost < 0)) return "Maliyet bilgisi 0 veya daha buyuk olmali.";
    if (calories !== null && (!Number.isInteger(calories) || calories < 0)) return "Kalori bilgisi 0 veya daha buyuk tam sayi olmali.";
    if (stockTracked && !stockItemId) return "Stok takipli urun icin stok kalemi secmelisin.";
    if (imageUrl && !isValidUrl(imageUrl)) return "Urun gorseli icin gecerli bir URL gir.";
    if (recipeEnabled && recipeItems.length === 0) return "Recete aktifse en az bir hammadde satiri eklemelisin.";
    for (const [index, recipeItem] of recipeItems.entries()) {
      const quantity = Number(recipeItem.quantity);
      if (!recipeItem.inventoryItemId) return `Recete satiri #${index + 1} icin hammadde sec.`;
      if (!Number.isFinite(quantity) || quantity <= 0) return `Recete satiri #${index + 1} icin miktar sifirdan buyuk olmali.`;
    }

    return null;
  }

  async function refreshList(resource: string, nextFilters: Record<string, string>, nextPage: number, nextLimit: number) {
    const listResponse = await fetchPosSettingsList(resource, {
      ...nextFilters,
      page: nextPage,
      limit: nextLimit,
    });
    setList(listResponse);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedFilters(filters);
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [filters]);

  useEffect(() => {
    if (!screen) return;
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchPosSettingsMeta(screen.resource),
      fetchPosSettingsList(screen.resource, {
        ...debouncedFilters,
        page,
        limit,
      }),
    ])
      .then(([metaResponse, listResponse]) => {
        if (!active) return;
        setMeta(metaResponse);
        setList(listResponse);
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : "Modul verisi alinamadi.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [screen, debouncedFilters, page, limit]);

  useEffect(() => {
    if (!actionMenuRowId) return;
    const close = () => setActionMenuRowId(null);
    window.addEventListener("click", close, { capture: true });
    window.addEventListener("scroll", close, { capture: true });
    return () => {
      window.removeEventListener("click", close, { capture: true } as any);
      window.removeEventListener("scroll", close, { capture: true } as any);
    };
  }, [actionMenuRowId]);

  async function handleSelect(id: string, mode: "detail" | "edit" = "edit") {
    if (!screen) return;
    try {
      setError(null);
      setDetailMode(mode);
      const detail = await fetchPosSettingsDetail(screen.resource, id);
      setSelectedId(id);
      setFormData(detail);
      setActiveProductTab("base");
      setIsFormModalOpen(true);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Detay getirilemedi.");
    }
  }

  function handleNew() {
    setSelectedId(null);
    setDetailMode("create");
    setFormData(isMenuProductResource ? getMenuProductDefaults() : {});
    setActiveProductTab("base");
    setIsFormModalOpen(true);
  }

  function handleCloseModal() {
    if (submitting) return;
    setIsFormModalOpen(false);
    setDetailMode("edit");
  }

  async function handleSubmit() {
    if (!screen) return;
    const validationError = validateBeforeSubmit();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = normalizeJsonFieldsForSubmit(meta?.fields ?? [], formData);

    try {
      if (selectedId) {
        await updatePosSettingsItem(screen.resource, selectedId, payload);
      } else {
        await createPosSettingsItem(screen.resource, payload);
      }

      setSelectedId(null);
      setFormData({});
      setIsFormModalOpen(false);
      await refreshList(screen.resource, filters, page, limit);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Kayit islemi basarisiz.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!screen || !selectedId) return;
    setSubmitting(true);
    setError(null);

    try {
      await deletePosSettingsItem(screen.resource, selectedId);
      setSelectedId(null);
      setFormData({});
      setIsFormModalOpen(false);
      await refreshList(screen.resource, filters, page, limit);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Silme islemi basarisiz.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteById(id: string) {
    if (!screen) return;
    setSubmitting(true);
    setError(null);
    try {
      await deletePosSettingsItem(screen.resource, id);
      if (selectedId === id) {
        setSelectedId(null);
        setFormData({});
        setIsFormModalOpen(false);
      }
      await refreshList(screen.resource, filters, page, limit);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Silme islemi basarisiz.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedBranchIdForTables = useMemo(() => {
    if (screen?.resource !== "table-sections") return "";
    const fromFilter = String(filters.branchId ?? "").trim();
    if (fromFilter) return fromFilter;
    const branchFilter = meta?.filters.find((item) => item.key === "branchId");
    return String(branchFilter?.options?.[0]?.value ?? "").trim();
  }, [screen?.resource, filters.branchId, meta?.filters]);

  async function handleSeedDefaultTables() {
    if (screen?.resource !== "table-sections") return;
    const branchId = selectedBranchIdForTables;
    if (!branchId) {
      setError("Toplu masa olusturmak icin once bir sube sec.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const currentList = await fetchPosSettingsList("table-sections", { branchId, page: 1, limit: 500 });
      const existingCodes = new Set(
        (currentList.items as Array<Record<string, unknown>>).map((item) => String((item as Record<string, unknown>).code ?? "").toUpperCase()),
      );
      const defaults = buildDefaultTableRows(branchId);
      const missingRows = defaults.filter((row) => !existingCodes.has(String(row.code ?? "").toUpperCase()));
      let createdCount = 0;
      let failedCount = 0;
      for (const row of missingRows) {
        try {
          await createPosSettingsItem("table-sections", row);
          createdCount += 1;
        } catch {
          failedCount += 1;
        }
      }
      await refreshList("table-sections", filters, page, limit);
      if (failedCount > 0) {
        setError(`${createdCount} masa olusturuldu, ${failedCount} kayit atlandi. Kod cakismasi veya zorunlu alan kontrolu olabilir.`);
      }
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Toplu masa olusturma basarisiz.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearDefaultTables() {
    if (screen?.resource !== "table-sections") return;
    const branchId = selectedBranchIdForTables;
    if (!branchId) {
      setError("Toplu masa silmek icin once bir sube sec.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const currentList = await fetchPosSettingsList("table-sections", { branchId, page: 1, limit: 500 });
      const candidates = (currentList.items as Array<Record<string, unknown>>).filter((item) => {
        const name = String(item.name ?? "");
        const code = String(item.code ?? "").toUpperCase();
        return /^(Zemin Kat|1\. Kat|2\. Kat)\sM([1-9]|1\d|20)$/i.test(name) || /^(ZK|K1|K2)-M([1-9]|1\d|20)$/.test(code);
      });
      for (const item of candidates) {
        await deletePosSettingsItem("table-sections", String(item.id));
      }
      await refreshList("table-sections", filters, page, limit);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Toplu masa silme basarisiz.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!screen) {
    return (
      <div className="admin-page-stack admin-pos-settings-page">
        <AdminPageHeader
          kicker="POS Ayarlari"
          title="POS Ayarlari"
          description="Menu, satis, servis ve cihaz ayarlarinizi tek merkezden yonetin."
        />
        <PosSettingsShell activeSlug={null}>
            <section className="admin-module-grid">
              {posSettingsScreens.map((item) => (
                <Link key={item.slug} href={`/pos-ayarlari/${item.slug}`} className="admin-module-card">
                  <p className="admin-kicker">POS Ayarlari</p>
                  <h3>{item.title}</h3>
                  <p className="admin-subtle-text">{item.description}</p>
                </Link>
              ))}
            </section>
        </PosSettingsShell>
      </div>
    );
  }

  if (loading) {
    return <AdminStateCard message="Modul yukleniyor..." tone="info" />;
  }

  if (screen && !resourcePermissions.canView) {
    return <AdminStateCard message="Bu modulu gormek icin yetkin yok." tone="danger" />;
  }

  if (error && !meta) {
    return <AdminStateCard message={error} tone="danger" />;
  }

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader
        kicker="Pano > POS Ayarlari"
        title={screen.title}
        description={screen.description}
        className="admin-pos-settings-toolbar"
        actions={
          <>
            <AdminButton variant="outline" onClick={() => void refreshList(screen.resource, filters, page, limit)}>
              Yenile
            </AdminButton>
            {screen.resource === "table-sections" ? (
              <>
                <AdminButton variant="outline" onClick={() => void handleSeedDefaultTables()} disabled={submitting || !resourcePermissions.canManage} loading={submitting}>
                  3 Kat M1-M20 Olustur
                </AdminButton>
                <AdminButton variant="outline" onClick={() => void handleClearDefaultTables()} disabled={submitting || !resourcePermissions.canManage} loading={submitting}>
                  M1-M20 Kalibini Sil
                </AdminButton>
              </>
            ) : null}
            <AdminButton variant="primary" onClick={handleNew} disabled={!resourcePermissions.canManage}>
              {screen.resource === "menu-products" ? "Yeni Ürün" : screen.resource === "menu-categories" ? "Yeni Kategori" : "Yeni Kayıt"}
            </AdminButton>
          </>
        }
      />

      {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}

      <PosSettingsShell
        activeSlug={screen.slug}
        aside={
          isCalibrationResource && meta ? (
            <AdminFilterPanel
              title="Filtreler"
              description="Listeyi hızlıca daralt."
              className="admin-filter-panel--sidebar"
              actions={
                <AdminButton variant="outline" onClick={() => setFilters({})}>
                  Temizle
                </AdminButton>
              }
            >
              <div className="admin-form-grid">
                {meta.filters.map((filter) => (
                  <AdminField key={filter.key} label={filter.label}>
                    {filter.type === "select" ? (
                      <AdminSelect
                        value={filters[filter.key] ?? ""}
                        onChange={(event) => {
                          setFilters((current) => ({ ...current, [filter.key]: event.target.value }));
                          setPage(1);
                        }}
                      >
                        <option value="">Tum Kayitlar</option>
                        {(filter.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </AdminSelect>
                    ) : (
                      <AdminInput
                        value={filters[filter.key] ?? ""}
                        onChange={(event) => {
                          setFilters((current) => ({ ...current, [filter.key]: event.target.value }));
                          setPage(1);
                        }}
                        placeholder={`${filter.label} ile filtrele`}
                      />
                    )}
                  </AdminField>
                ))}
                <AdminField label="Sayfa Boyutu">
                  <AdminSelect
                    value={String(limit)}
                    onChange={(event) => {
                      setLimit(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </AdminSelect>
                </AdminField>
              </div>
            </AdminFilterPanel>
          ) : null
        }
      >
          {isCalibrationResource ? null : meta ? (
            <AdminFilterPanel title="Liste filtreleri" className="admin-pos-settings-filters">
              <div className="admin-form-grid">
                {meta.filters.map((filter) => (
                  <AdminField key={filter.key} label={filter.label}>
                    {filter.type === "select" ? (
                      <AdminSelect
                        value={filters[filter.key] ?? ""}
                        onChange={(event) => {
                          setFilters((current) => ({ ...current, [filter.key]: event.target.value }));
                          setPage(1);
                        }}
                      >
                        <option value="">Tum Kayitlar</option>
                        {(filter.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </AdminSelect>
                    ) : (
                      <AdminInput
                        value={filters[filter.key] ?? ""}
                        onChange={(event) => {
                          setFilters((current) => ({ ...current, [filter.key]: event.target.value }));
                          setPage(1);
                        }}
                        placeholder={`${filter.label} ile filtrele`}
                      />
                    )}
                  </AdminField>
                ))}
                <AdminField label="Sayfa Boyutu">
                  <AdminSelect
                    value={String(limit)}
                    onChange={(event) => {
                      setLimit(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </AdminSelect>
                </AdminField>
              </div>
            </AdminFilterPanel>
          ) : null}

          <AdminTableCard
            title={`${screen.title} Kayitlari`}
            badge={<AdminStatusBadge tone="info">{list?.pagination.total ?? 0} toplam</AdminStatusBadge>}
            footer={
              <AdminPagination
                page={list?.pagination.page ?? 1}
                totalPages={list?.pagination.totalPages ?? 1}
                onPrev={() => setPage((current) => Math.max(1, current - 1))}
                onNext={() => setPage((current) => current + 1)}
              />
            }
          >
            <AdminTableWrap>
              <table className="admin-table">
                <thead>
                  <tr>
                    {meta?.columns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                    {resourcePermissions.canManage ? <th className="admin-th--actions">İşlemler</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {(list?.items ?? []).map((item) => {
                    const record = item as Record<string, unknown>;
                    const rowId = String(record.id);
                    return (
                      <tr
                        key={rowId}
                        onClick={() => handleSelect(rowId, "edit")}
                        className={`admin-table__row--clickable ${selectedId === rowId ? "is-selected" : ""}`}
                      >
                        {meta?.columns.map((column) => {
                          const value = getValueByPath(record, column.key);

                          if (isMenuProductResource && ["isActive", "showInQr"].includes(column.key)) {
                            return (
                              <td key={column.key}>
                                <AdminStatusBadge tone={value ? "success" : "neutral"}>{value ? "Acik" : "Kapali"}</AdminStatusBadge>
                              </td>
                            );
                          }

                          if (isMenuProductResource && ["visibilityLabel", "stockTrackingLabel", "recipeStatus"].includes(column.key)) {
                            const tone =
                              column.key === "visibilityLabel"
                                ? value === "Gorunur"
                                  ? "success"
                                  : "warning"
                                : column.key === "recipeStatus"
                                  ? value === "Bagli"
                                    ? "info"
                                    : "neutral"
                                  : value === "Takipli"
                                    ? "info"
                                    : "neutral";
                            return (
                              <td key={column.key}>
                                <AdminStatusBadge tone={tone as "success" | "warning" | "info" | "neutral"}>{String(value ?? "-")}</AdminStatusBadge>
                              </td>
                            );
                          }

                          if (isMenuProductResource && ["basePrice", "currentCost", "theoreticalCost"].includes(column.key)) {
                            const amount = Number(value ?? 0);
                            return (
                              <td key={column.key} className="admin-td--num">
                                {Number.isFinite(amount) ? formatTryCurrency(amount, { maximumFractionDigits: 2 }) : "-"}
                              </td>
                            );
                          }

                          return <td key={column.key}>{String(formatReadableValue(value))}</td>;
                        })}
                        {resourcePermissions.canManage ? (
                          <td className="admin-td--actions" onClick={(event) => event.stopPropagation()}>
                            <AdminRowActionMenu
                              open={actionMenuRowId === rowId}
                              onToggle={() => setActionMenuRowId((current) => (current === rowId ? null : rowId))}
                              onClose={() => setActionMenuRowId(null)}
                              items={[
                                  {
                                    key: "detail",
                                    label: "Detay",
                                    onSelect: () => {
                                      void handleSelect(rowId, "detail");
                                    },
                                  },
                                {
                                  key: "edit",
                                  label: "Düzenle",
                                  onSelect: () => {
                                      void handleSelect(rowId, "edit");
                                  },
                                },
                                {
                                  key: "delete",
                                  label: "Sil",
                                  tone: "danger",
                                  onSelect: () => setConfirmDeleteId(rowId),
                                },
                              ]}
                            />
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AdminTableWrap>
          </AdminTableCard>
      </PosSettingsShell>

      {isFormModalOpen ? (
        <AdminModal
          open={isFormModalOpen}
          size={isMenuProductResource ? "lg" : "md"}
          icon={<AdminIcon name={isMenuProductResource ? "package" : isMenuCategoryResource ? "badge-percent" : "settings-2"} size={18} />}
          kicker={isMenuProductResource ? "Menü / Ürün" : isMenuCategoryResource ? "Menü / Kategori" : "Kayıt"}
          title={
            isMenuProductResource
              ? selectedId
                ? detailMode === "detail"
                  ? "Ürün Detay"
                  : "Ürün Düzenle"
                : "Yeni Ürün"
              : isMenuCategoryResource
                ? selectedId
                  ? detailMode === "detail"
                    ? "Kategori Detay"
                    : "Kategori Düzenle"
                  : "Yeni Kategori"
                : selectedId
                  ? "Detay / Güncelle"
                  : "Yeni Kayıt"
          }
          description={
            isMenuProductResource
              ? formData.name
                ? String(formData.name)
                : undefined
              : isMenuCategoryResource
                ? formData.name
                  ? String(formData.name)
                  : undefined
                : undefined
          }
          subHeader={
            isMenuProductResource ? <div className="admin-modal__tabs"><AdminTabs items={productTabs} active={activeProductTab} onChange={setActiveProductTab} /></div> : null
          }
          onClose={handleCloseModal}
          closeDisabled={submitting}
          footer={
            <div className="admin-modal__footer-content">
              <div className="admin-modal__footer-left">
                <AdminButton variant="text" onClick={handleCloseModal} disabled={submitting}>
                  {detailMode === "detail" ? "Kapat" : "Vazgec"}
                </AdminButton>
                {selectedId && detailMode !== "detail" ? (
                  <AdminButton variant="outline" className="admin-outline-button--danger" onClick={handleDelete} disabled={submitting || !resourcePermissions.canManage} loading={submitting}>
                    Kaydi Sil
                  </AdminButton>
                ) : null}
              </div>
              <div className="admin-modal__footer-right">
                {detailMode !== "detail" ? (
                  <AdminButton variant="primary" disabled={submitting || !resourcePermissions.canManage} onClick={handleSubmit} loading={submitting}>
                    {submitting ? "Kaydediliyor..." : selectedId ? "Guncelle" : "Olustur"}
                  </AdminButton>
                ) : null}
              </div>
            </div>
          }
        >
          {isMenuProductResource ? (
                <>
                  {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}

                  {activeProductTab === "base" && formData.imageUrl ? (
                    <div className="admin-product-image-preview">
                      <img src={String(formData.imageUrl)} alt={String(formData.name ?? "Urun gorseli")} />
                    </div>
                  ) : null}

                  <div className="admin-form-sections admin-form-sections--flat">
                    {groupedFields
                      .filter(([section]) => resolveProductTabKey(section) === activeProductTab)
                      .map(([section, fields]) => (
                        <section key={section} className="admin-form-block">
                          <div className="admin-form-block__head">
                            <h4>{section}</h4>
                          </div>
                          <div className="admin-form-grid admin-form-grid--modal">
                            {fields.map((field) => {
                              const currentValue = formData[field.key];

                              if (isMenuProductResource && field.key === "stockItemId" && !formData.stockTracked) {
                                return null;
                              }

                              if (isMenuProductResource && field.key === "recipeItemsJson" && !formData.recipeEnabled) {
                                return null;
                              }

                              const isReadOnlyField =
                                detailMode === "detail" ||
                                !resourcePermissions.canManage ||
                                ((field.key === "basePrice" || field.key === "currentCost") && !resourcePermissions.canManagePrice);

                              if (field.type === "textarea") {
                                return (
                                  <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                    <AdminTextarea
                                      value={String(currentValue ?? "")}
                                      placeholder={field.placeholder}
                                      disabled={isReadOnlyField}
                                      onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                    />
                                  </AdminField>
                                );
                              }

                              if (isMenuProductResource && field.key === "recipeItemsJson") {
                                const recipeItems = normalizeRecipeEditorItems(currentValue);
                                const theoreticalCost = recipeItems.reduce((sum, recipeItem) => {
                                  const selectedItem = inventoryFieldOptions.find((option) => option.value === recipeItem.inventoryItemId);
                                  const unitCost = Number(selectedItem?.meta?.latestUnitCost ?? 0);
                                  const quantity = Number(recipeItem.quantity ?? 0);
                                  return sum + (Number.isFinite(quantity) ? quantity : 0) * unitCost;
                                }, 0);

                                return (
                                  <div key={field.key} className={`admin-field ${field.fullWidth ? "admin-field--full" : ""}`}>
                                    <span>{field.label}</span>
                                    <div className="admin-recipe-editor">
                                      {recipeItems.length ? (
                                        <div className="admin-recipe-editor__rows">
                                          {recipeItems.map((recipeItem, index) => {
                                            const selectedItem = inventoryFieldOptions.find((option) => option.value === recipeItem.inventoryItemId);
                                            return (
                                              <div key={`${field.key}-${index}`} className="admin-recipe-editor__row">
                                                <label className="admin-recipe-editor__field">
                                                  <span>Hammadde</span>
                                                  <AdminSelect
                                                    value={recipeItem.inventoryItemId}
                                                    disabled={isReadOnlyField}
                                                    onChange={(event) => {
                                                      const nextRecipeItems = recipeItems.map((row, rowIndex) =>
                                                        rowIndex === index ? { ...row, inventoryItemId: event.target.value } : row,
                                                      );
                                                      handleFieldChange(field.key, nextRecipeItems);
                                                    }}
                                                  >
                                                    <option value="">Hammadde sec</option>
                                                    {inventoryFieldOptions.map((option) => (
                                                      <option key={option.value} value={option.value}>
                                                        {option.label}
                                                      </option>
                                                    ))}
                                                  </AdminSelect>
                                                </label>
                                                <label className="admin-recipe-editor__field admin-recipe-editor__field--quantity">
                                                  <span>Miktar</span>
                                                  <AdminInput
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={recipeItem.quantity}
                                                    disabled={isReadOnlyField}
                                                    onChange={(event) => {
                                                      const nextRecipeItems = recipeItems.map((row, rowIndex) =>
                                                        rowIndex === index ? { ...row, quantity: event.target.value } : row,
                                                      );
                                                      handleFieldChange(field.key, nextRecipeItems);
                                                    }}
                                                  />
                                                </label>
                                                <div className="admin-recipe-editor__meta">
                                                  <span className="admin-recipe-editor__unit">{String(selectedItem?.meta?.unitSymbol ?? "-")}</span>
                                                  <small>
                                                    Stok: {String(selectedItem?.meta?.currentStock ?? "-")} / Kritik:{" "}
                                                    {String(selectedItem?.meta?.minimumLevel ?? "-")}
                                                  </small>
                                                </div>
                                                <AdminButton
                                                  variant="outline"
                                                  disabled={isReadOnlyField}
                                                  onClick={() => handleFieldChange(field.key, recipeItems.filter((_, rowIndex) => rowIndex !== index))}
                                                >
                                                  Sil
                                                </AdminButton>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <div className="admin-recipe-editor__empty">
                                          <p>Bu urun icin henuz recete satiri eklenmedi.</p>
                                        </div>
                                      )}

                                      <div className="admin-recipe-editor__footer">
                                        <AdminButton
                                          variant="outline"
                                          disabled={isReadOnlyField}
                                          onClick={() => handleFieldChange(field.key, [...recipeItems, { inventoryItemId: "", quantity: "" }])}
                                        >
                                          Hammadde Ekle
                                        </AdminButton>
                                        <div className="admin-recipe-editor__summary">
                                          <span>Teorik maliyet</span>
                                          <strong>{formatTryCurrency(theoreticalCost, { maximumFractionDigits: 2 })}</strong>
                                        </div>
                                      </div>
                                    </div>
                                    {field.helperText ? <small className="admin-field__helper">{field.helperText}</small> : null}
                                  </div>
                                );
                              }

                              if (field.type === "json") {
                                return (
                                  <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                    <AdminTextarea
                                      value={formatJsonFieldForTextarea(currentValue)}
                                      placeholder={field.placeholder || "Satir satir veya anahtar: deger formatinda girin"}
                                      disabled={isReadOnlyField}
                                      onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                    />
                                  </AdminField>
                                );
                              }

                              if (field.type === "switch") {
                                return (
                                  <AdminSwitchField
                                    key={field.key}
                                    label={field.label}
                                    checked={Boolean(currentValue)}
                                    disabled={isReadOnlyField}
                                    helper={field.helperText}
                                    className={field.fullWidth ? "admin-field--full" : ""}
                                    onChange={(next) => handleFieldChange(field.key, next)}
                                  />
                                );
                              }

                              if (field.type === "select") {
                                return (
                                  <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                    <AdminSelect value={String(currentValue ?? "")} disabled={isReadOnlyField} onChange={(event) => handleFieldChange(field.key, event.target.value)}>
                                      <option value="">Seciniz</option>
                                      {(field.options ?? []).map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </AdminSelect>
                                  </AdminField>
                                );
                              }

                              return (
                                <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                  <AdminInput
                                    type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"}
                                    value={field.type === "datetime" ? normalizeDateTimeValue(currentValue) : String(currentValue ?? "")}
                                    placeholder={field.placeholder}
                                    disabled={isReadOnlyField}
                                    onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                  />
                                </AdminField>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                  </div>
                </>
          ) : (
                <>
                  {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}
                  {isMenuCategoryResource ? (
                    <div className="admin-form-sections admin-form-sections--flat">
                      {groupedFields.map(([section, fields]) => (
                        <section key={section} className="admin-form-block">
                          <div className="admin-form-block__head">
                            <h4>{section}</h4>
                          </div>
                          <div className="admin-form-grid admin-form-grid--modal-sm">
                            {fields.map((field) => {
                              const currentValue = formData[field.key];

                              const isReadOnlyField =
                                detailMode === "detail" ||
                                !resourcePermissions.canManage ||
                                ((field.key === "basePrice" || field.key === "currentCost") && !resourcePermissions.canManagePrice);

                              if (field.type === "textarea") {
                                return (
                                  <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                    <AdminTextarea
                                      value={String(currentValue ?? "")}
                                      placeholder={field.placeholder}
                                      disabled={isReadOnlyField}
                                      onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                    />
                                  </AdminField>
                                );
                              }

                              if (field.type === "json") {
                                return (
                                  <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                    <AdminTextarea
                                      value={formatJsonFieldForTextarea(currentValue)}
                                      placeholder={field.placeholder || "Satir satir veya anahtar: deger formatinda girin"}
                                      disabled={isReadOnlyField}
                                      onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                    />
                                  </AdminField>
                                );
                              }

                              if (field.type === "switch") {
                                return (
                                  <AdminSwitchField
                                    key={field.key}
                                    label={field.label}
                                    checked={Boolean(currentValue)}
                                    disabled={isReadOnlyField}
                                    helper={field.helperText}
                                    className={field.fullWidth ? "admin-field--full" : ""}
                                    onChange={(next) => handleFieldChange(field.key, next)}
                                  />
                                );
                              }

                              if (field.type === "select") {
                                const selectOptions =
                                  isMenuCategoryResource && field.key === "parentId" && selectedId
                                    ? (field.options ?? []).filter((option) => option.value !== selectedId)
                                    : (field.options ?? []);
                                return (
                                  <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                    <AdminSelect value={String(currentValue ?? "")} disabled={isReadOnlyField} onChange={(event) => handleFieldChange(field.key, event.target.value)}>
                                      <option value="">Seciniz</option>
                                      {selectOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </AdminSelect>
                                  </AdminField>
                                );
                              }

                              return (
                                <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                  <AdminInput
                                    type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"}
                                    value={field.type === "datetime" ? normalizeDateTimeValue(currentValue) : String(currentValue ?? "")}
                                    placeholder={field.placeholder}
                                    disabled={isReadOnlyField}
                                    onChange={(event) => handleFieldChange(field.key, field.type === "number" ? event.target.value : event.target.value)}
                                  />
                                </AdminField>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="admin-form-sections">
                      {groupedFields.map(([section, fields]) => (
                        <section key={section} className="admin-form-section">
                          <div className="admin-section-head admin-section-head--compact">
                            <div>
                              <p className="admin-kicker">Form</p>
                              <h3>{section}</h3>
                            </div>
                          </div>
                          <div className="admin-form-grid">
                            {fields.map((field) => {
                              const currentValue = formData[field.key];

                              const isReadOnlyField =
                                detailMode === "detail" ||
                                !resourcePermissions.canManage ||
                                ((field.key === "basePrice" || field.key === "currentCost") && !resourcePermissions.canManagePrice);

                              if (field.type === "textarea") {
                                return (
                                  <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                    <AdminTextarea
                                      value={String(currentValue ?? "")}
                                      placeholder={field.placeholder}
                                      disabled={isReadOnlyField}
                                      onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                    />
                                  </AdminField>
                                );
                              }

                              if (field.type === "json") {
                                return (
                                  <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                    <AdminTextarea
                                      value={formatJsonFieldForTextarea(currentValue)}
                                      placeholder={field.placeholder || "Satir satir veya anahtar: deger formatinda girin"}
                                      disabled={isReadOnlyField}
                                      onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                    />
                                  </AdminField>
                                );
                              }

                              if (field.type === "switch") {
                                return (
                                  <AdminSwitchField
                                    key={field.key}
                                    label={field.label}
                                    checked={Boolean(currentValue)}
                                    disabled={isReadOnlyField}
                                    helper={field.helperText}
                                    className={field.fullWidth ? "admin-field--full" : ""}
                                    onChange={(next) => handleFieldChange(field.key, next)}
                                  />
                                );
                              }

                              if (field.type === "select") {
                                const selectOptions =
                                  isMenuCategoryResource && field.key === "parentId" && selectedId
                                    ? (field.options ?? []).filter((option) => option.value !== selectedId)
                                    : (field.options ?? []);
                                return (
                                  <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                    <AdminSelect value={String(currentValue ?? "")} disabled={isReadOnlyField} onChange={(event) => handleFieldChange(field.key, event.target.value)}>
                                      <option value="">Seciniz</option>
                                      {selectOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </AdminSelect>
                                  </AdminField>
                                );
                              }

                              return (
                                <AdminField key={field.key} label={field.label} helper={field.helperText} fullWidth={field.fullWidth}>
                                  <AdminInput
                                    type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"}
                                    value={field.type === "datetime" ? normalizeDateTimeValue(currentValue) : String(currentValue ?? "")}
                                    placeholder={field.placeholder}
                                    disabled={isReadOnlyField}
                                    onChange={(event) => handleFieldChange(field.key, field.type === "number" ? event.target.value : event.target.value)}
                                  />
                                </AdminField>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </>
          )}
        </AdminModal>
      ) : null}

      <AdminConfirmDialog
        open={Boolean(confirmDeleteId)}
        title="Kaydı silmek istiyor musun?"
        description="Bu işlem geri alınamaz."
        confirmLabel="Sil"
        cancelLabel="İptal"
        busy={submitting}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          const id = confirmDeleteId;
          if (!id) return;
          setConfirmDeleteId(null);
          void handleDeleteById(id);
        }}
      />
    </div>
  );
}
