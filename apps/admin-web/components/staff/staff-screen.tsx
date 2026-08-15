"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getStaffScreen, staffScreens } from "../../lib/staff-config";
import {
  createStaffItem,
  deleteStaffItem,
  fetchStaffDetail,
  fetchStaffList,
  fetchStaffMeta,
  updateStaffItem,
} from "../../lib/services/staff-service";
import type { StaffListResponse, StaffMetaResponse } from "../../lib/api/client";
import { formatTrDateTimeSafe } from "../../lib/utils/admin-format";
import { getValueByPath } from "../../lib/utils/object-path";
import { formatJsonFieldForTextarea, formatReadableValue, normalizeJsonFieldsForSubmit } from "../../lib/utils/readable-value";
import { EmployeeEditModal } from "./employee-editor/employee-edit-modal";
import { AdminFilterPanel, AdminPageHeader, AdminStateCard, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../ui/admin-ui";

function resolveTaskTone(statusLabel: string) {
  if (statusLabel === "Tamamlandi") return "success";
  if (statusLabel === "Gecikti") return "danger";
  if (statusLabel === "Yapiliyor") return "warning";
  return "info";
}

export function StaffScreen({ slug }: { slug?: string }) {
  const screen = useMemo(() => getStaffScreen(slug), [slug]);
  const [meta, setMeta] = useState<StaffMetaResponse | null>(null);
  const [list, setList] = useState<StaffListResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(screen));
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function refreshList(resource: string, nextFilters: Record<string, string>, nextPage: number, nextLimit: number) {
    const listResponse = await fetchStaffList(resource, {
      ...nextFilters,
      page: nextPage,
      limit: nextLimit,
    });
    setList(listResponse);
  }

  useEffect(() => {
    if (!screen) return;
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchStaffMeta(screen.resource),
      fetchStaffList(screen.resource, {
        ...filters,
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
        if (active) setError(fetchError instanceof Error ? fetchError.message : "Personel modulu yuklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [screen, filters, page, limit]);

  const groupedShifts = useMemo(() => {
    if (screen?.resource !== "shifts") return [];
    const items = (list?.items ?? []) as Array<Record<string, unknown>>;
    const map = new Map<string, Array<Record<string, unknown>>>();

    items.forEach((item) => {
      const scheduledStartAt = String(item.scheduledStartAt ?? "");
      const date = new Date(scheduledStartAt);
      if (Number.isNaN(date.getTime())) return;
      const weekStart = new Date(date);
      const day = weekStart.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      weekStart.setDate(weekStart.getDate() + diff);
      weekStart.setHours(0, 0, 0, 0);
      const key = weekStart.toISOString().slice(0, 10);
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    });

    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, itemsInWeek]) => {
        const start = new Date(key);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return { key, start, end, items: itemsInWeek };
      });
  }, [screen?.resource, list?.items]);

  async function handleSelect(id: string) {
    if (!screen) return;
    if (screen.resource === "team") {
      setSelectedId(id);
      setIsFormModalOpen(true);
      return;
    }
    try {
      const detail = await fetchStaffDetail(screen.resource, id);
      setSelectedId(id);
      setFormData(detail);
      setIsFormModalOpen(true);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Detay getirilemedi.");
    }
  }

  function handleNew() {
    setSelectedId(null);
    if (screen?.resource === "tasks") {
      setFormData({ status: "todo", priority: "medium" });
    } else if (screen?.resource === "notifications") {
      setFormData({ type: "SYSTEM", isRead: false });
    } else {
      setFormData({});
    }
    setIsFormModalOpen(true);
  }

  function handleCloseModal() {
    if (submitting) return;
    setSelectedId(null);
    setFormData({});
    setIsFormModalOpen(false);
  }

  async function handleSubmit() {
    if (!screen || !meta) return;
    setError(null);
    for (const field of meta.fields) {
      if (!field.required) continue;
      const value = formData[field.key];
      if (field.type === "switch") continue;
      if (value === undefined || value === null || String(value).trim() === "") {
        setError(`${field.label} zorunlu.`);
        return;
      }
    }
    if (screen.resource === "tasks") {
      if (!formData.branchId || !formData.userId || !String(formData.title ?? "").trim()) {
        setError("Sube, personel ve gorev basligi zorunlu.");
        return;
      }
    }
    if (screen.resource === "notifications") {
      if (!formData.branchId || !String(formData.title ?? "").trim() || !String(formData.message ?? "").trim()) {
        setError("Sube, baslik ve mesaj zorunlu.");
        return;
      }
    }
    setSubmitting(true);
    const payload = normalizeJsonFieldsForSubmit(meta?.fields ?? [], formData);

    try {
      if (selectedId) {
        await updateStaffItem(screen.resource, selectedId, payload);
      } else {
        await createStaffItem(screen.resource, payload);
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

    try {
      await deleteStaffItem(screen.resource, selectedId);
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

  if (!screen) {
    return (
      <div className="dashboard-stack">
        <section className="admin-page-intro">
          <div>
            <p className="admin-kicker">Sprint 4 / Personel Yonetimi</p>
            <h3>Tum personel modulleri tek merkezden yonetilir</h3>
          </div>
        </section>
        <section className="admin-module-grid">
          {staffScreens.map((item) => (
            <Link key={item.slug} href={`/personel/${item.slug}`} className="admin-module-card">
              <p className="admin-kicker">Personel</p>
              <h3>{item.title}</h3>
              <p className="admin-subtle-text">{item.description}</p>
            </Link>
          ))}
        </section>
      </div>
    );
  }

  if (loading) return <AdminStateCard message="Personel modulu yukleniyor..." tone="info" />;
  if (error && !meta) return <AdminStateCard message={error} tone="danger" />;

  return (
    <div className={`dashboard-stack admin-pos-settings-page admin-staff-page admin-staff-page--${screen.resource}`}>
      <section className="admin-pos-settings-nav">
        <div className="admin-pos-settings-nav__row">
          {staffScreens.map((item) => (
            <Link key={item.slug} href={`/personel/${item.slug}`} className={`admin-chip ${item.slug === screen.slug ? "admin-chip--active" : ""}`}>
              {item.title}
            </Link>
          ))}
        </div>
      </section>

      <AdminPageHeader
        title={screen.title}
        className="admin-staff-toolbar"
        actions={
          <>
            <button className="admin-outline-button" type="button" onClick={() => void refreshList(screen.resource, filters, page, limit)}>
              Yenile
            </button>
            <button className="admin-primary-button" type="button" onClick={handleNew}>
              Yeni Kayit
            </button>
          </>
        }
      />

      {meta ? (
        <AdminFilterPanel title="Personel filtreleri" className="admin-pos-settings-filters">
          <div className="admin-form-grid">
            {meta.filters.map((filter) => (
              <label key={filter.key} className="admin-field">
                <span>{filter.label}</span>
                {filter.type === "select" ? (
                  <select
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
                  </select>
                ) : filter.type === "date" ? (
                  <input
                    type="date"
                    value={filters[filter.key] ?? ""}
                    onChange={(event) => {
                      setFilters((current) => ({ ...current, [filter.key]: event.target.value }));
                      setPage(1);
                    }}
                  />
                ) : (
                  <input
                    value={filters[filter.key] ?? ""}
                    onChange={(event) => {
                      setFilters((current) => ({ ...current, [filter.key]: event.target.value }));
                      setPage(1);
                    }}
                    placeholder={`${filter.label} ile filtrele`}
                  />
                )}
              </label>
            ))}
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

      {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}

      <section className="admin-detail-grid admin-detail-grid--single">
        <AdminTableCard
          title={`${screen.title} Kayitlari`}
          badge={<AdminStatusBadge tone="info">{list?.pagination.total ?? 0} toplam</AdminStatusBadge>}
          footer={
            <div className="admin-filter-actions">
              <button className="admin-outline-button" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={(list?.pagination.page ?? 1) <= 1}>
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

          {screen.resource === "shifts" ? (
            <div className="admin-shift-groups">
              {groupedShifts.map((group) => (
                <section key={group.key} className="admin-shift-group">
                  <header className="admin-shift-group__head">
                    <strong>
                      {new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long" }).format(group.start)} -{" "}
                      {new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long" }).format(group.end)}
                    </strong>
                    <span>{group.start.getFullYear()}</span>
                  </header>
                  <AdminTableWrap>
                    <table className="admin-table admin-table--compact">
                      <thead>
                        <tr>
                          <th>Personel</th>
                          <th>Sube</th>
                          <th>Baslangic</th>
                          <th>Bitis</th>
                          <th>Sure</th>
                          <th>Islem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => {
                          const rowId = String(item.id ?? "");
                          return (
                            <tr key={rowId} className="admin-table__row--clickable" onClick={() => handleSelect(rowId)}>
                              <td>{String(getValueByPath(item, "employeeProfile.user.fullName") ?? "-")}</td>
                              <td>{String(getValueByPath(item, "branch.name") ?? "-")}</td>
                              <td>{formatTrDateTimeSafe(typeof item.scheduledStartAt === "string" ? item.scheduledStartAt : null, "-", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</td>
                              <td>{formatTrDateTimeSafe(typeof item.scheduledEndAt === "string" ? item.scheduledEndAt : null, "-", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</td>
                              <td>{String(item.totalBreakMinutes ?? 0)} dk</td>
                              <td>
                                <span className="admin-row-actions">✎ · 🗑</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </AdminTableWrap>
                </section>
              ))}
            </div>
          ) : (
            <AdminTableWrap>
              <table className={`admin-table ${screen.resource === "tracking" ? "admin-table--tracking" : ""}`}>
                <thead>
                  <tr>
                    {meta?.columns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                    <th>Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {(list?.items ?? []).map((item) => {
                    const record = item as Record<string, unknown>;
                    const rowId = String(record.id);
                    return (
                      <tr key={rowId} onClick={() => handleSelect(rowId)} className="admin-table__row--clickable">
                        {meta?.columns.map((column) => {
                          if (screen.resource === "team" && column.key === "user.fullName") {
                            const fullName = String(getValueByPath(record, "user.fullName") ?? "-");
                            const email = String(getValueByPath(record, "user.email") ?? "-");
                            return (
                              <td key={column.key}>
                                <div className="admin-employee-cell">
                                  <img
                                    className="admin-employee-avatar"
                                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=1d4ed8&color=fff&size=64`}
                                    alt={fullName}
                                  />
                                  <div>
                                    <strong>{fullName}</strong>
                                    <p>{email}</p>
                                  </div>
                                </div>
                              </td>
                            );
                          }
                          if (screen.resource === "tasks" && column.key === "statusLabel") {
                            const statusLabel = String(record.statusLabel ?? "Bekliyor");
                            return (
                              <td key={column.key}>
                                <AdminStatusBadge tone={resolveTaskTone(statusLabel)}>{statusLabel}</AdminStatusBadge>
                              </td>
                            );
                          }
                          if (screen.resource === "tasks" && column.key === "priorityLabel") {
                            const priorityLabel = String(record.priorityLabel ?? "Orta");
                            const tone =
                              priorityLabel === "Kritik" ? "danger" : priorityLabel === "Yuksek" ? "warning" : priorityLabel === "Dusuk" ? "neutral" : "info";
                            return (
                              <td key={column.key}>
                                <AdminStatusBadge tone={tone}>{priorityLabel}</AdminStatusBadge>
                              </td>
                            );
                          }
                          if (screen.resource === "notifications" && (column.key === "readStatusLabel" || column.key === "typeLabel")) {
                            const value = String(getValueByPath(record, column.key) ?? "-");
                            const tone = column.key === "readStatusLabel" ? (value === "Okundu" ? "neutral" : "info") : value === "Gorev" ? "warning" : "info";
                            return (
                              <td key={column.key}>
                                <AdminStatusBadge tone={tone}>{value}</AdminStatusBadge>
                              </td>
                            );
                          }
                          if (screen.resource === "goals" && column.key === "statusLabel") {
                            const value = String(getValueByPath(record, column.key) ?? "-");
                            const tone = value === "Tamamlandi" ? "success" : value === "Suresi Doldu" ? "danger" : "warning";
                            return (
                              <td key={column.key}>
                                <AdminStatusBadge tone={tone}>{value}</AdminStatusBadge>
                              </td>
                            );
                          }
                          if (screen.resource === "goals" && (column.key === "goalTypeLabel" || column.key === "goalScopeLabel")) {
                            const value = String(getValueByPath(record, column.key) ?? "-");
                            return (
                              <td key={column.key}>
                                <AdminStatusBadge tone={column.key === "goalScopeLabel" ? "info" : "warning"}>{value}</AdminStatusBadge>
                              </td>
                            );
                          }
                          return <td key={column.key}>{String(formatReadableValue(getValueByPath(record, column.key)))}</td>;
                        })}
                        <td>
                          <span className="admin-row-actions">✎ · 🗑</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AdminTableWrap>
          )}
        </AdminTableCard>
      </section>

      {isFormModalOpen ? (
        screen.resource === "team" && selectedId ? (
          <EmployeeEditModal
            employeeId={selectedId}
            meta={meta}
            onClose={handleCloseModal}
            onRefreshList={() => refreshList(screen.resource, filters, page, limit)}
          />
        ) : (
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
                  if (field.type === "json") {
                    return (
                      <label key={field.key} className="admin-field admin-field--full">
                        <span>{field.label}</span>
                        <textarea
                          value={formatJsonFieldForTextarea(currentValue)}
                          onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))}
                          placeholder="Satir satir veya anahtar: deger formatinda girin"
                        />
                      </label>
                    );
                  }
                  if (field.type === "switch") {
                    return (
                      <label key={field.key} className="admin-field">
                        <span>{field.label}</span>
                        <select value={String(currentValue ?? false)} onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value === "true" }))}>
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
        )
      ) : null}
    </div>
  );
}
