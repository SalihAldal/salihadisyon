"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountingListResponse, AccountingMetaResponse, AccountingOverviewResponse } from "../../lib/api/client";
import { accountingScreens, getAccountingScreen } from "../../lib/accounting-config";
import { subscribeAdminRealtime } from "../../lib/realtime/admin-realtime";
import { getStoredUser, hasStoredPermission } from "../../lib/auth/session";
import {
  createAccountingItem,
  deleteAccountingItem,
  exportAccountingResource,
  fetchAccountingDetail,
  fetchAccountingList,
  fetchAccountingMeta,
  fetchAccountingOverview,
  updateAccountingItem,
} from "../../lib/services/accounting-service";
import { formatTryCurrencySafe } from "../../lib/utils/admin-format";
import { formatJsonFieldForTextarea, formatReadableValue, normalizeJsonFieldsForSubmit } from "../../lib/utils/readable-value";
import { downloadCsv } from "../../lib/utils/download";
import { getValueByPath } from "../../lib/utils/object-path";
import { AdminButton, AdminConfirmDialog, AdminField, AdminFilterPanel, AdminInput, AdminModal, AdminPageHeader, AdminPagination, AdminRowActionMenu, AdminSelect, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminSwitchField, AdminTableCard, AdminTableWrap, AdminTextarea } from "../ui/admin-ui";

function normalizeDateTimeValue(value: unknown) {
  if (!value || typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function getFixedCostDefaults() {
  return {
    recurrenceType: "monthly",
    isActive: true,
  };
}

const accountingColumnOrder: Partial<Record<string, string[]>> = {
  "ticket-ledger": ["ticketName", "branch.name", "customer.fullName", "status", "closedAt", "grandTotal"],
  payments: ["ticket.ticketName", "ticket.branch.name", "method", "status", "amount", "account.name"],
  "cash-closures": ["branch.name", "closureDate", "expectedAmount", "countedAmount", "varianceAmount"],
};

export function AccountingScreen({ slug }: { slug?: string }) {
  const screen = useMemo(() => getAccountingScreen(slug), [slug]);
  const canManage = hasStoredPermission(getStoredUser(), "accounting.manage");
  const canManageCashClosure = hasStoredPermission(getStoredUser(), "cash_closure.manage");
  const canMutate = screen?.resource === "cash-closures" ? canManageCashClosure : canManage;
  const [overview, setOverview] = useState<AccountingOverviewResponse | null>(null);
  const [meta, setMeta] = useState<AccountingMetaResponse | null>(null);
  const [list, setList] = useState<AccountingListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMenuRowId, setActionMenuRowId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadAccountingData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    const requests = screen
      ? Promise.all([
          fetchAccountingOverview(filters.branchId ? { branchId: filters.branchId } : undefined),
          fetchAccountingMeta(screen.resource),
          fetchAccountingList(screen.resource, {
            ...filters,
            page,
            limit,
          }),
        ])
      : Promise.all([fetchAccountingOverview(), Promise.resolve(null), Promise.resolve(null)]);

    const [overviewResponse, metaResponse, listResponse] = await requests;
    setOverview(overviewResponse as AccountingOverviewResponse);
    setMeta((metaResponse as AccountingMetaResponse | null) ?? null);
    setList((listResponse as AccountingListResponse | null) ?? null);
    if (showLoading) {
      setLoading(false);
    }
  }, [screen, filters, page, limit]);

  const orderedColumns = useMemo(() => {
    if (!meta?.columns || !screen) return meta?.columns ?? [];
    const preferred = accountingColumnOrder[screen.resource] ?? [];
    if (!preferred.length) return meta.columns;
    const rank = new Map(preferred.map((key, index) => [key, index]));
    return [...meta.columns].sort((a, b) => {
      const aRank = rank.get(a.key);
      const bRank = rank.get(b.key);
      if (aRank === undefined && bRank === undefined) return 0;
      if (aRank === undefined) return 1;
      if (bRank === undefined) return -1;
      return aRank - bRank;
    });
  }, [meta?.columns, screen]);

  const fixedCostSummaryCards = useMemo(() => {
    if (screen?.resource !== "fixed-costs" || !overview?.fixedCostSummary) return [];
    return [
      { key: "active", label: "Aktif Plan", value: overview.fixedCostSummary.activeCount },
      { key: "monthly", label: "Aylik Sabit Yuk", value: overview.fixedCostSummary.recurringMonthlyEstimate },
      { key: "actual", label: "Bu Ay Islenen", value: overview.fixedCostSummary.currentMonthActual },
      { key: "recurring", label: "Periyodik Kalem", value: overview.fixedCostSummary.recurringCount },
    ];
  }, [overview?.fixedCostSummary, screen?.resource]);

  async function refreshList(resource: string, nextFilters: Record<string, string>, nextPage: number, nextLimit: number) {
    const response = await fetchAccountingList(resource, {
      ...nextFilters,
      page: nextPage,
      limit: nextLimit,
    });
    setList(response);
  }

  useEffect(() => {
    let active = true;
    loadAccountingData(true)
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "Muhasebe verisi alinamadi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadAccountingData]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return subscribeAdminRealtime((detail) => {
      if (!["payment.completed", "register.updated", "cash.closure.created"].includes(detail.event)) {
        return;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        void loadAccountingData(false).catch((fetchError) => {
          setError(fetchError instanceof Error ? fetchError.message : "Muhasebe verisi alinamadi.");
        });
      }, 350);
    });
  }, [loadAccountingData]);

  async function handleSelect(id: string) {
    if (!screen) return;
    try {
      const detail = await fetchAccountingDetail(screen.resource, id);
      setSelectedId(id);
      setFormData(detail);
      setIsFormModalOpen(true);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Detay getirilemedi.");
    }
  }

  async function handleSubmit() {
    if (!screen || !meta || meta.readOnly) return;
    setSubmitting(true);
    setError(null);
    const validationError = validateBeforeSubmit();
    if (validationError) {
      setError(validationError);
      setSubmitting(false);
      return;
    }
    const payload = normalizeJsonFieldsForSubmit(meta.fields, formData);

    try {
      if (selectedId) {
        await updateAccountingItem(screen.resource, selectedId, payload);
      } else {
        await createAccountingItem(screen.resource, payload);
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
    if (!screen || !selectedId || !meta || meta.readOnly) return;
    setSubmitting(true);
    try {
      await deleteAccountingItem(screen.resource, selectedId);
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
    if (!screen || !meta || meta.readOnly) return;
    setSubmitting(true);
    try {
      await deleteAccountingItem(screen.resource, id);
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

  async function handleExport() {
    if (!screen || !meta?.exportable) return;
    const csv = await exportAccountingResource(screen.resource, filters);
    downloadCsv(`${screen.slug}.csv`, csv);
  }

  function validateBeforeSubmit() {
    if (meta) {
      for (const field of meta.fields) {
        if (!field.required) continue;
        const value = formData[field.key];
        if (field.type === "switch") continue;
        if (value === undefined || value === null || String(value).trim() === "") {
          return `${field.label} zorunlu.`;
        }
      }
    }
    if (screen?.resource !== "fixed-costs") return null;
    const title = String(formData.title ?? "").trim();
    const category = String(formData.category ?? "").trim();
    const amount = Number(formData.amount ?? 0);
    const recurrenceType = String(formData.recurrenceType ?? "").trim();
    const expenseDate = String(formData.expenseDate ?? "").trim();
    const startDate = String(formData.startDate ?? "").trim();
    const endDate = String(formData.endDate ?? "").trim();

    if (!title) return "Gider adi zorunlu.";
    if (!category) return "Kategori secmelisin.";
    if (!Number.isFinite(amount) || amount <= 0) return "Tutar sifirdan buyuk olmali.";
    if (!recurrenceType) return "Tekrar tipi secmelisin.";
    if (!expenseDate) return "Ilk finans kayit tarihi zorunlu.";
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) return "Bitis tarihi baslangic tarihinden once olamaz.";
    return null;
  }

  function handleNew() {
    setSelectedId(null);
    setFormData(screen?.resource === "fixed-costs" ? getFixedCostDefaults() : {});
    setIsFormModalOpen(true);
  }

  function handleCloseModal() {
    if (submitting) return;
    setIsFormModalOpen(false);
  }

  if (loading) return <AdminStateCard message="Muhasebe ekranlari yukleniyor..." tone="info" />;

  return (
    <div className={`admin-page-stack ${screen ? `admin-accounting--${screen.resource}` : "admin-accounting--root"}`}>
      <AdminPageHeader
        kicker="Muhasebe"
        title={screen ? screen.title : "Muhasebe Kayitlari"}
        description={screen ? screen.description : "Iliskili finansal hareketler, export ve raporlama altyapisi."}
        className="admin-accounting-toolbar"
        actions={
          <div className="admin-button-row admin-accounting-actions">
            {screen && meta?.exportable ? (
              <AdminButton variant="outline" onClick={handleExport}>
                CSV Export
              </AdminButton>
            ) : null}
            {screen && !meta?.readOnly && canMutate ? (
              <AdminButton variant="primary" onClick={handleNew}>
                Yeni Kayit
              </AdminButton>
            ) : null}
          </div>
        }
      />

      {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}

      {!screen ? (
        <AdminStatsGrid>
          {(overview?.cards ?? []).map((card) => (
            <AdminStatCard key={card.key} label={card.label} value={card.value} />
          ))}
        </AdminStatsGrid>
      ) : null}

      {!screen ? (
        <section className="admin-module-grid">
          {accountingScreens.map((item) => (
            <Link key={item.slug} href={`/muhasebe/${item.slug}`} className="admin-module-card">
              <p className="admin-kicker">Muhasebe</p>
              <h3>{item.title}</h3>
              <p className="admin-subtle-text">{item.description}</p>
            </Link>
          ))}
        </section>
      ) : (
        <>
          {meta ? (
            <AdminFilterPanel
              kicker="Filtreler"
              title="Finans hareketlerini tarih ve subeye gore filtrele"
              className="admin-reference-filters"
              actions={
                <AdminButton variant="outline" onClick={() => void refreshList(screen.resource, filters, page, limit)}>
                  Filtrele
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
                        type={filter.type === "date" ? "date" : "text"}
                        value={filters[filter.key] ?? ""}
                        onChange={(event) => {
                          setFilters((current) => ({ ...current, [filter.key]: event.target.value }));
                          setPage(1);
                        }}
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

          {screen.resource === "fixed-costs" && fixedCostSummaryCards.length ? (
            <AdminStatsGrid>
              {fixedCostSummaryCards.map((card) => (
                <AdminStatCard
                  key={card.key}
                  label={card.label}
                  value={card.key === "active" || card.key === "recurring" ? card.value : formatTryCurrencySafe(card.value, { maximumFractionDigits: 2 })}
                />
              ))}
            </AdminStatsGrid>
          ) : null}

          <section className="admin-detail-grid admin-detail-grid--single">
            <AdminTableCard
              kicker="Liste"
              title={screen.title}
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
                <table className={`admin-table ${screen ? `admin-table--${screen.resource}` : ""}`}>
                  <thead>
                    <tr>
                      {orderedColumns.map((column) => (
                        <th key={column.key} className={column.key.toLowerCase().includes("amount") || column.key.toLowerCase().includes("total") ? "admin-th--num" : undefined}>
                          {column.label}
                        </th>
                      ))}
                      {!meta?.readOnly ? <th>Islem</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {(list?.items ?? []).map((item) => {
                      const record = item as Record<string, unknown>;
                      const rowId = String(record.id);
                      return (
                        <tr key={rowId} onClick={() => handleSelect(rowId)} className="admin-table__row--clickable">
                          {orderedColumns.map((column) => {
                            const value = getValueByPath(record, column.key);
                            if (screen.resource === "cash-closures" && column.key === "varianceAmount") {
                              const variance = Number(value ?? 0);
                              return (
                                <td key={column.key} className={`admin-td--num ${variance < 0 ? "admin-money--negative" : "admin-money--positive"}`}>
                                  {formatTryCurrencySafe(value, { maximumFractionDigits: 2 })}
                                </td>
                              );
                            }
                            if (screen.resource === "fixed-costs" && column.key === "activeStatusLabel") {
                              return (
                                <td key={column.key}>
                                  <AdminStatusBadge tone={value === "Aktif" ? "success" : "neutral"}>{String(value ?? "-")}</AdminStatusBadge>
                                </td>
                              );
                            }
                            if (column.key.toLowerCase().includes("amount") || column.key.toLowerCase().includes("total")) {
                              return <td key={column.key} className="admin-td--num">{formatTryCurrencySafe(value, { maximumFractionDigits: 2 })}</td>;
                            }
                            if (screen.resource === "fixed-costs" && column.key === "monthlyEstimate") {
                              return <td key={column.key} className="admin-td--num">{formatTryCurrencySafe(value, { maximumFractionDigits: 2 })}</td>;
                            }
                            return <td key={column.key}>{formatReadableValue(value)}</td>;
                          })}
                          {!meta?.readOnly ? (
                            <td className="admin-td--actions" onClick={(event) => event.stopPropagation()}>
                              <AdminRowActionMenu
                                open={actionMenuRowId === rowId}
                                onToggle={() => setActionMenuRowId((current) => (current === rowId ? null : rowId))}
                                onClose={() => setActionMenuRowId(null)}
                                items={[
                                  { key: "edit", label: "Düzenle", onSelect: () => void handleSelect(rowId) },
                                  { key: "delete", label: "Sil", tone: "danger", onSelect: () => setConfirmDeleteId(rowId) },
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
          </section>

          {screen.resource === "cash-closures" || screen.resource === "ticket-ledger" || screen.resource === "payments" ? null : (
            <section className="dashboard-grid dashboard-grid--secondary">
            <article className="admin-surface">
              <div className="admin-section-head">
                <div>
                  <p className="admin-kicker">Finans Ozet</p>
                  <h3>Ledger snapshot</h3>
                </div>
              </div>
              <div className="admin-metric-row">
                <div>
                  <span className="admin-kicker">Sabit Gider</span>
                  <strong>{overview?.ledgerSnapshot.fixedCosts ?? 0}</strong>
                </div>
                <div>
                  <span className="admin-kicker">Personel</span>
                  <strong>{overview?.ledgerSnapshot.payroll ?? 0}</strong>
                </div>
                <div>
                  <span className="admin-kicker">Diger</span>
                  <strong>{overview?.ledgerSnapshot.otherPayments ?? 0}</strong>
                </div>
                <div>
                  <span className="admin-kicker">Kasa Farki</span>
                  <strong>{overview?.ledgerSnapshot.cashVariance ?? 0}</strong>
                </div>
              </div>
            </article>
            </section>
          )}

          {!meta?.readOnly && isFormModalOpen ? (
            <AdminModal
              open={isFormModalOpen}
              size="lg"
              kicker="Muhasebe"
              title={selectedId ? "Kayıt Düzenle" : "Yeni Kayıt"}
              onClose={handleCloseModal}
              closeDisabled={submitting}
              footer={
                <div className="admin-modal__footer-content">
                  <div className="admin-modal__footer-left">
                    <AdminButton variant="text" onClick={handleCloseModal} disabled={submitting}>
                      Vazgeç
                    </AdminButton>
                    {selectedId && canMutate ? (
                      <AdminButton variant="outline" className="admin-outline-button--danger" onClick={() => setConfirmDeleteId(selectedId)} disabled={submitting}>
                        Kaydı Sil
                      </AdminButton>
                    ) : null}
                  </div>
                  <div className="admin-modal__footer-right">
                    {canMutate ? (
                      <AdminButton variant="primary" disabled={submitting} onClick={handleSubmit} loading={submitting}>
                        {submitting ? "Kaydediliyor..." : selectedId ? "Güncelle" : "Oluştur"}
                      </AdminButton>
                    ) : null}
                  </div>
                </div>
              }
            >
              <div className="admin-form-grid admin-form-grid--modal">
                {meta?.fields.map((field) => {
                  const currentValue = formData[field.key];
                  if (field.type === "textarea") {
                    return (
                      <AdminField key={field.key} label={field.label} fullWidth>
                        <AdminTextarea value={String(currentValue ?? "")} onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))} />
                      </AdminField>
                    );
                  }
                  if (field.type === "json") {
                    return (
                      <AdminField key={field.key} label={field.label} fullWidth>
                        <AdminTextarea value={formatJsonFieldForTextarea(currentValue)} placeholder="JSON girin" onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))} />
                      </AdminField>
                    );
                  }
                  if (field.type === "switch") {
                    return (
                      <AdminSwitchField
                        key={field.key}
                        label={field.label}
                        checked={Boolean(currentValue)}
                        disabled={!canMutate}
                        onChange={(next) => setFormData((current) => ({ ...current, [field.key]: next }))}
                      />
                    );
                  }
                  if (field.type === "select") {
                    return (
                      <AdminField key={field.key} label={field.label}>
                        <AdminSelect value={String(currentValue ?? "")} onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))} disabled={!canMutate}>
                          <option value="">Seçiniz</option>
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
                    <AdminField key={field.key} label={field.label}>
                      <AdminInput
                        type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"}
                        value={field.type === "datetime" ? normalizeDateTimeValue(currentValue) : String(currentValue ?? "")}
                        disabled={!canMutate}
                        onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    </AdminField>
                  );
                })}
              </div>
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
        </>
      )}
    </div>
  );
}
