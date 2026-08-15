"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { InventoryListResponse, InventoryMetaResponse, InventoryOverviewResponse } from "../../lib/api/client";
import { getInventoryScreen, inventoryScreens } from "../../lib/inventory-config";
import { subscribeAdminRealtime } from "../../lib/realtime/admin-realtime";
import {
  createInventoryItem,
  deleteInventoryItem,
  exportInventoryResource,
  fetchInventoryDetail,
  fetchInventoryList,
  fetchInventoryMeta,
  fetchInventoryOverview,
  syncInventorySales,
  updateInventoryItem,
} from "../../lib/services/inventory-service";
import { getValueByPath } from "../../lib/utils/object-path";
import { downloadCsv } from "../../lib/utils/download";
import { formatReadableValue, normalizeJsonFieldsForSubmit } from "../../lib/utils/readable-value";
import { AdminFilterPanel, AdminPageHeader, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../ui/admin-ui";

const inventoryColumnOrder: Partial<Record<string, string[]>> = {
  "stock-status": ["name", "warehouse", "category", "unit", "currentStock", "minimumLevel", "status"],
  "stock-cards": ["itemName", "warehouseName", "entryType", "quantity", "unitCost", "createdAt"],
  "stock-entry": ["inventoryItem.name", "warehouse.name", "entryType", "quantity", "unitCost", "createdAt"],
};

export function InventoryScreen({ slug }: { slug?: string }) {
  const screen = useMemo(() => getInventoryScreen(slug), [slug]);
  const [overview, setOverview] = useState<InventoryOverviewResponse | null>(null);
  const [meta, setMeta] = useState<InventoryMetaResponse | null>(null);
  const [list, setList] = useState<InventoryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [draftFilters, setDraftFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadInventoryData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    const requests = screen
      ? Promise.all([
          fetchInventoryOverview({
            ...(filters.branchId ? { branchId: filters.branchId } : {}),
            ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
          }),
          fetchInventoryMeta(screen.resource),
          fetchInventoryList(screen.resource, {
            ...filters,
            page,
            limit,
          }),
        ])
      : Promise.all([fetchInventoryOverview(), Promise.resolve(null), Promise.resolve(null)]);

    const [overviewResponse, metaResponse, listResponse] = await requests;
    setOverview(overviewResponse as InventoryOverviewResponse);
    setMeta((metaResponse as InventoryMetaResponse | null) ?? null);
    setList((listResponse as InventoryListResponse | null) ?? null);
    if (showLoading) {
      setLoading(false);
    }
  }, [screen, filters, page, limit]);

  const orderedColumns = useMemo(() => {
    if (!meta?.columns || !screen) return meta?.columns ?? [];
    const preferred = inventoryColumnOrder[screen.resource] ?? [];
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

  async function refreshList(resource: string, nextFilters: Record<string, string>, nextPage: number, nextLimit: number) {
    const listResponse = await fetchInventoryList(resource, {
      ...nextFilters,
      page: nextPage,
      limit: nextLimit,
    });
    setList(listResponse);
  }

  useEffect(() => {
    setFilters({});
    setDraftFilters({});
    setPage(1);
  }, [screen?.resource]);

  useEffect(() => {
    let active = true;
    loadInventoryData(true)
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "Stok modulu yuklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadInventoryData]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return subscribeAdminRealtime((detail) => {
      if (detail.event !== "inventory.stock.changed" && detail.event !== "ticket.updated") {
        return;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        void loadInventoryData(false).catch((fetchError) => {
          setError(fetchError instanceof Error ? fetchError.message : "Stok modulu yuklenemedi.");
        });
      }, 350);
    });
  }, [loadInventoryData]);

  async function handleSelect(id: string) {
    if (!screen) return;
    const detail = await fetchInventoryDetail(screen.resource, id);
    setSelectedId(id);
    setFormData(detail);
    setIsFormModalOpen(true);
  }

  async function handleSubmit() {
    if (!screen || !meta || meta.readOnly) return;
    setSubmitting(true);
    setError(null);
    const payload = normalizeJsonFieldsForSubmit(meta.fields, formData);

    try {
      if (selectedId) {
        await updateInventoryItem(screen.resource, selectedId, payload);
      } else {
        await createInventoryItem(screen.resource, payload);
      }
      setSelectedId(null);
      setFormData({});
      setIsFormModalOpen(false);
      await refreshList(screen.resource, filters, page, limit);
      setOverview(
        await fetchInventoryOverview({
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
          ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        }),
      );
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
      await deleteInventoryItem(screen.resource, selectedId);
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

  async function handleExport() {
    if (!screen || !meta?.exportable) return;
    const csv = await exportInventoryResource(screen.resource, filters);
    downloadCsv(`${screen.slug}.csv`, csv);
  }

  async function handleSyncSales() {
    try {
      setSubmitting(true);
      const result = await syncInventorySales(filters.branchId);
      setError(`Satis baglantili stok dusumu tamamlandi: ${result.syncedCount} hareket.`);
      setOverview(await fetchInventoryOverview(filters.branchId ? { branchId: filters.branchId } : undefined));
      if (screen) {
        setList(await fetchInventoryList(screen.resource, filters));
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Satis stok senkronu basarisiz.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNew() {
    setSelectedId(null);
    setFormData({});
    setIsFormModalOpen(true);
  }

  function handleCloseModal() {
    if (submitting) return;
    setIsFormModalOpen(false);
  }

  function applyFilters() {
    setPage(1);
    setFilters(draftFilters);
  }

  function clearFilters() {
    setPage(1);
    setDraftFilters({});
    setFilters({});
  }

  if (loading) return <AdminStateCard message="Stok ekranlari yukleniyor..." tone="info" />;

  return (
    <div className={`dashboard-stack admin-reference-page ${screen ? `admin-inventory--${screen.resource}` : "admin-inventory--root"}`}>
      <AdminPageHeader
        kicker="Sprint 6 / Stok"
        title={screen ? screen.title : "Stok Modulu"}
        description={screen ? screen.description : "Depo, hareket, uyari ve satis baglantili stok mantigi."}
        className="admin-inventory-toolbar"
        actions={
          <div className="admin-button-row admin-inventory-actions">
            {screen && meta?.actions?.syncSales ? (
              <button className="admin-outline-button" type="button" onClick={handleSyncSales} disabled={submitting}>
                Satistan Stok Dus
              </button>
            ) : null}
            {screen && meta?.exportable ? (
              <button className="admin-outline-button" type="button" onClick={handleExport}>
                CSV Export
              </button>
            ) : null}
            {screen && !meta?.readOnly ? (
              <button className="admin-primary-button" type="button" onClick={handleNew}>
                Yeni Kayit
              </button>
            ) : null}
          </div>
        }
      />

      {error ? <AdminStatusBadge tone={error.includes("tamamlandi") ? "info" : "danger"}>{error}</AdminStatusBadge> : null}

      <AdminStatsGrid>
        {(overview?.cards ?? []).map((card) => (
          <AdminStatCard key={card.key} label={card.label} value={card.value} />
        ))}
      </AdminStatsGrid>

      {!screen ? (
        <>
          <section className="admin-module-grid">
            {inventoryScreens.map((item) => (
              <Link key={item.slug} href={`/stok/${item.slug}`} className="admin-module-card">
                <p className="admin-kicker">Stok</p>
                <h3>{item.title}</h3>
                <p className="admin-subtle-text">{item.description}</p>
              </Link>
            ))}
          </section>

          <section className="dashboard-grid dashboard-grid--secondary">
            <article className="admin-surface">
              <div className="admin-section-head">
                <div>
                  <p className="admin-kicker">Kritik Stoklar</p>
                  <h3>Minimum seviyeye inen urunler</h3>
                </div>
              </div>
              <ul className="admin-list">
                {(overview?.alerts ?? []).map((alert) => (
                  <li key={alert.id}>
                    <strong>{alert.productName}</strong>
                    <span>{` / ${alert.warehouseName} / ${alert.currentStock} ${alert.unit} / esik ${alert.threshold}`}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="admin-surface">
              <div className="admin-section-head">
                <div>
                  <p className="admin-kicker">Son Hareketler</p>
                  <h3>Yeni stok hareketleri</h3>
                </div>
              </div>
              <ul className="admin-list">
                {(overview?.recentMovements ?? []).map((movement) => (
                  <li key={movement.id}>
                    <strong>{movement.productName}</strong>
                    <span>{` / ${movement.entryType} / ${movement.effectQuantity} / ${movement.warehouseName}`}</span>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </>
      ) : (
        <>
          {meta ? (
            <AdminFilterPanel
              kicker="Filtreler"
              title="Depo ve sube bazli stok gorunumu"
              description="Liste, siralama ve tarih filtreleri ortak filter shell ile standardize edildi."
              className="admin-reference-filters"
              actions={
                <>
                  <button className="admin-outline-button" type="button" onClick={clearFilters}>
                    Temizle
                  </button>
                  <button className="admin-primary-button" type="button" onClick={applyFilters}>
                    Filtrele
                  </button>
                </>
              }
            >
              <div className="admin-form-grid" onKeyDown={(event) => (event.key === "Enter" ? applyFilters() : undefined)}>
                {meta.filters.map((filter) => (
                  <label key={filter.key} className="admin-field">
                    <span>{filter.label}</span>
                    {filter.type === "select" ? (
                      <select
                        value={draftFilters[filter.key] ?? ""}
                        onChange={(event) => {
                          setDraftFilters((current) => ({ ...current, [filter.key]: event.target.value }));
                        }}
                      >
                        <option value="">Tum Kayitlar</option>
                        {(filter.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={filter.type === "date" ? "date" : "text"}
                        value={draftFilters[filter.key] ?? ""}
                        onChange={(event) => {
                          setDraftFilters((current) => ({ ...current, [filter.key]: event.target.value }));
                        }}
                      />
                    )}
                  </label>
                ))}
                {!meta.filters.some((item) => item.key === "search") ? (
                  <label className="admin-field">
                    <span>Ara</span>
                    <input value={draftFilters.search ?? ""} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} />
                  </label>
                ) : null}
                {!meta.filters.some((item) => item.key === "startDate") ? (
                  <label className="admin-field">
                    <span>Baslangic</span>
                    <input type="date" value={draftFilters.startDate ?? ""} onChange={(event) => setDraftFilters((current) => ({ ...current, startDate: event.target.value }))} />
                  </label>
                ) : null}
                {!meta.filters.some((item) => item.key === "endDate") ? (
                  <label className="admin-field">
                    <span>Bitis</span>
                    <input type="date" value={draftFilters.endDate ?? ""} onChange={(event) => setDraftFilters((current) => ({ ...current, endDate: event.target.value }))} />
                  </label>
                ) : null}
                <label className="admin-field">
                  <span>Sirala</span>
                  <select value={draftFilters.sortBy ?? ""} onChange={(event) => setDraftFilters((current) => ({ ...current, sortBy: event.target.value }))}>
                    <option value="">Varsayilan</option>
                    {orderedColumns.map((column) => (
                      <option key={column.key} value={column.key}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Yon</span>
                  <select value={draftFilters.sortDirection ?? "desc"} onChange={(event) => setDraftFilters((current) => ({ ...current, sortDirection: event.target.value }))}>
                    <option value="desc">Azalan</option>
                    <option value="asc">Artan</option>
                  </select>
                </label>
                <label className="admin-field">
                  <span>Sayfa Boyutu</span>
                  <select
                    value={String(limit)}
                    onChange={(event) => {
                      setLimit(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </label>
              </div>
            </AdminFilterPanel>
          ) : null}

          <section className="admin-detail-grid admin-detail-grid--single">
            <AdminTableCard
              kicker="Liste"
              title={screen.title}
              badge={<AdminStatusBadge tone="info">{list?.pagination.total ?? 0} toplam</AdminStatusBadge>}
              footer={
                <div className="admin-filter-actions">
                  <button
                    className="admin-outline-button"
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={(list?.pagination.page ?? 1) <= 1}
                  >
                    Onceki
                  </button>
                  <AdminStatusBadge tone="info">
                    Sayfa {list?.pagination.page ?? 1} / {list?.pagination.totalPages ?? 1}
                  </AdminStatusBadge>
                  <button
                    className="admin-outline-button"
                    type="button"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={(list?.pagination.page ?? 1) >= (list?.pagination.totalPages ?? 1)}
                  >
                    Sonraki
                  </button>
                </div>
              }
            >
              <AdminTableWrap>
                <table className={`admin-table ${screen ? `admin-table--${screen.resource}` : ""}`}>
                  <thead>
                    <tr>
                      {orderedColumns.map((column) => (
                        <th key={column.key}>{column.label}</th>
                      ))}
                      {!meta?.readOnly ? <th>Islem</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {(list?.items ?? []).map((item) => {
                      const record = item as Record<string, unknown>;
                      return (
                        <tr key={String(record.id)} onClick={() => handleSelect(String(record.id))} className="admin-table__row--clickable">
                          {orderedColumns.map((column) => (
                            <td key={column.key}>{formatReadableValue(getValueByPath(record, column.key))}</td>
                          ))}
                          {!meta?.readOnly ? (
                            <td>
                              <span className="admin-row-actions">✎  ⋮</span>
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

          <section className="dashboard-grid dashboard-grid--secondary">
            <article className="admin-surface">
              <div className="admin-section-head">
                <div>
                  <p className="admin-kicker">Kritik Stoklar</p>
                  <h3>Acik uyarilar</h3>
                </div>
              </div>
              <ul className="admin-list">
                {(overview?.alerts ?? []).map((alert) => (
                  <li key={alert.id}>
                    <strong>{alert.productName}</strong>
                    <span>{` / ${alert.currentStock} ${alert.unit} / esik ${alert.threshold} / ${alert.warehouseName}`}</span>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          {!meta?.readOnly && isFormModalOpen ? (
            <div className="admin-modal-backdrop" onClick={handleCloseModal}>
              <section className="admin-modal-card" onClick={(event) => event.stopPropagation()}>
                <div className="admin-section-head">
                  <div>
                    <p className="admin-kicker">Form</p>
                    <h3>{selectedId ? "Detay / Guncelle" : "Yeni Kayit"}</h3>
                  </div>
                  <button className="admin-outline-button" type="button" onClick={handleCloseModal}>
                    Kapat
                  </button>
                </div>
                <div className="admin-form-grid">
                  {meta?.fields.map((field) => {
                    const currentValue = formData[field.key];
                    if (field.type === "textarea") {
                      return (
                        <label key={field.key} className="admin-field admin-field--full">
                          <span>{field.label}</span>
                          <textarea value={String(currentValue ?? "")} onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))} />
                        </label>
                      );
                    }
                    if (field.type === "switch") {
                      return (
                        <label key={field.key} className="admin-field">
                          <span>{field.label}</span>
                          <select value={String(currentValue ?? true)} onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value === "true" }))}>
                            <option value="true">Aktif</option>
                            <option value="false">Pasif</option>
                          </select>
                        </label>
                      );
                    }
                    if (field.type === "select") {
                      return (
                        <label key={field.key} className="admin-field">
                          <span>{field.label}</span>
                          <select value={String(currentValue ?? "")} onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))}>
                            <option value="">Seciniz</option>
                            {(field.options ?? []).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    }
                    return (
                      <label key={field.key} className="admin-field">
                        <span>{field.label}</span>
                        <input
                          type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"}
                          value={String(currentValue ?? "")}
                          onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))}
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="admin-filter-actions">
                  {selectedId ? (
                    <button className="admin-outline-button" type="button" onClick={handleDelete} disabled={submitting}>
                      Kaydi Sil
                    </button>
                  ) : null}
                  <button className="admin-primary-button" type="button" disabled={submitting} onClick={handleSubmit}>
                    {submitting ? "Kaydediliyor..." : selectedId ? "Guncelle" : "Olustur"}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
