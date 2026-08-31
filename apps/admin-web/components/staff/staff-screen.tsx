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
import { IamRolesScreen } from "../iam/iam-roles-screen";
import { getStoredUser, hasStoredPermission } from "../../lib/auth/session";
import { AdminButton, AdminConfirmDialog, AdminField, AdminFilterPanel, AdminInput, AdminModal, AdminPageHeader, AdminPagination, AdminRowActionMenu, AdminSelect, AdminStateCard, AdminStatusBadge, AdminSwitchField, AdminTableCard, AdminTableWrap, AdminTextarea } from "../ui/admin-ui";

function resolveTaskTone(statusLabel: string) {
  if (statusLabel === "Tamamlandi") return "success";
  if (statusLabel === "Gecikti") return "danger";
  if (statusLabel === "Yapiliyor") return "warning";
  return "info";
}

export function StaffScreen({ slug }: { slug?: string }) {
  const screen = useMemo(() => (slug === "personel-rolleri" ? null : getStaffScreen(slug)), [slug]);
  const canManage = hasStoredPermission(getStoredUser(), "staff.manage");
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
  const [actionMenuRowId, setActionMenuRowId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  async function handleDeleteById(id: string) {
    if (!screen) return;
    setSubmitting(true);
    try {
      await deleteStaffItem(screen.resource, id);
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

  if (slug === "personel-rolleri") {
    return <IamRolesScreen />;
  }

  if (!screen) {
    return (
      <div className="admin-page-stack admin-pos-settings-page admin-staff-page">
        <AdminPageHeader
          kicker="Personel"
          title="Personel Yonetimi"
          description="Ekip, vardiya, izin, gorev ve bildirim akisini tek merkezden yonetin."
        />
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
    <div className={`admin-page-stack admin-pos-settings-page admin-staff-page admin-staff-page--${screen.resource}`}>
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
            <AdminButton variant="outline" onClick={() => void refreshList(screen.resource, filters, page, limit)}>
              Yenile
            </AdminButton>
            {screen && canManage ? (
              <AdminButton variant="primary" onClick={handleNew}>
                Yeni Kayit
              </AdminButton>
            ) : null}
          </>
        }
      />

      {meta ? (
        <AdminFilterPanel title="Personel filtreleri" className="admin-pos-settings-filters">
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
                ) : filter.type === "date" ? (
                  <AdminInput
                    type="date"
                    value={filters[filter.key] ?? ""}
                    onChange={(event) => {
                      setFilters((current) => ({ ...current, [filter.key]: event.target.value }));
                      setPage(1);
                    }}
                  />
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

      {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}

      <section className="admin-detail-grid admin-detail-grid--single">
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
          <AdminModal
            open={isFormModalOpen}
            size="lg"
            kicker="Personel"
            title={selectedId ? "Kayıt Düzenle" : "Yeni Kayıt"}
            onClose={handleCloseModal}
            closeDisabled={submitting}
            footer={
              <div className="admin-modal__footer-content">
                <div className="admin-modal__footer-left">
                  <AdminButton variant="text" onClick={handleCloseModal} disabled={submitting}>
                    Vazgeç
                  </AdminButton>
                  {selectedId ? (
                    <AdminButton variant="outline" className="admin-outline-button--danger" onClick={() => setConfirmDeleteId(selectedId)} disabled={submitting || !canManage} loading={submitting}>
                      Kaydı Sil
                    </AdminButton>
                  ) : null}
                </div>
                <div className="admin-modal__footer-right">
                  <AdminButton variant="primary" disabled={submitting || !canManage} onClick={handleSubmit} loading={submitting}>
                    {submitting ? "Kaydediliyor..." : selectedId ? "Güncelle" : "Oluştur"}
                  </AdminButton>
                </div>
              </div>
            }
          >
            <div className="admin-form-grid admin-form-grid--modal">
              {meta?.fields.map((field) => {
                const currentValue = formData[field.key];
                const disabled = submitting || !canManage;
                if (field.type === "textarea") {
                  return (
                    <AdminField key={field.key} label={field.label} fullWidth>
                      <AdminTextarea value={String(currentValue ?? "")} disabled={disabled} onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))} />
                    </AdminField>
                  );
                }
                if (field.type === "json") {
                  return (
                    <AdminField key={field.key} label={field.label} fullWidth>
                      <AdminTextarea value={formatJsonFieldForTextarea(currentValue)} disabled={disabled} onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))} />
                    </AdminField>
                  );
                }
                if (field.type === "switch") {
                  return (
                    <AdminSwitchField
                      key={field.key}
                      label={field.label}
                      checked={Boolean(currentValue)}
                      disabled={disabled}
                      onChange={(next) => setFormData((current) => ({ ...current, [field.key]: next }))}
                    />
                  );
                }
                if (field.type === "select") {
                  return (
                    <AdminField key={field.key} label={field.label}>
                      <AdminSelect value={String(currentValue ?? "")} disabled={disabled} onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))}>
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
                      value={String(currentValue ?? "")}
                      disabled={disabled}
                      onChange={(event) => setFormData((current) => ({ ...current, [field.key]: event.target.value }))}
                    />
                  </AdminField>
                );
              })}
            </div>
          </AdminModal>
        )
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
