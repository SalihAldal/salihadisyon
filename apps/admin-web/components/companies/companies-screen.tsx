"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getStoredUser, hasStoredPermission } from "../../lib/auth/session";
import {
  createCompany,
  fetchCompanies,
  updateCompany,
  type CompanyRecord,
} from "../../lib/services/companies-service";
import { formatTrDateTimeSafe } from "../../lib/utils/admin-format";
import { PermissionAction } from "../auth/route-permission-guard";
import {
  AdminButton,
  AdminField,
  AdminInput,
  AdminPageHeader,
  AdminRowActionMenu,
  AdminSelect,
  AdminStateCard,
  AdminStatusBadge,
  AdminTableCard,
  AdminTableWrap,
} from "../ui/admin-ui";

type CompanyFormState = {
  name: string;
  legalName: string;
  taxNumber: string;
  timezone: string;
  currency: string;
};

const emptyForm = (): CompanyFormState => ({
  name: "",
  legalName: "",
  taxNumber: "",
  timezone: "Europe/Istanbul",
  currency: "TRY",
});

export function CompaniesScreen() {
  const user = getStoredUser();
  const isSuperAdmin = String(user?.role ?? "").toLowerCase() === "super_admin";
  const canManage = hasStoredPermission(user, "subscription.manage");

  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<CompanyFormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [actionMenuRowId, setActionMenuRowId] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchCompanies();
      setCompanies(Array.isArray(items) ? items : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "İşletme bilgileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => companies.find((company) => company.id === selectedId) ?? null,
    [companies, selectedId],
  );

  function openCreate() {
    setIsCreating(true);
    setSelectedId(null);
    setForm(emptyForm());
  }

  function openEdit(company: CompanyRecord) {
    setIsCreating(false);
    setSelectedId(company.id);
    setForm({
      name: company.name,
      legalName: company.legalName ?? "",
      taxNumber: company.taxNumber ?? "",
      timezone: company.timezone ?? "Europe/Istanbul",
      currency: company.currency ?? "TRY",
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    if (!form.name.trim()) {
      setError("İşletme adı zorunludur.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isCreating) {
        if (!isSuperAdmin) {
          throw new Error("Yeni işletme oluşturma yalnızca süper admin tarafından yapılabilir.");
        }
        await createCompany({
          name: form.name.trim(),
          legalName: form.legalName.trim() || undefined,
          taxNumber: form.taxNumber.trim() || undefined,
          timezone: form.timezone.trim() || undefined,
          currency: form.currency.trim() || undefined,
        });
        setInfo("İşletme oluşturuldu.");
      } else if (selectedId) {
        await updateCompany(selectedId, {
          name: form.name.trim(),
          legalName: form.legalName.trim() || null,
          taxNumber: form.taxNumber.trim() || null,
          timezone: form.timezone.trim() || null,
          currency: form.currency.trim() || null,
        });
        setInfo("İşletme güncellendi.");
      }
      await load();
      setIsCreating(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "İşlem tamamlanamadı.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <AdminStateCard tone="info" message="Yükleniyor..." />;
  }

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader
        kicker="Tenant"
        title="İşletme Yönetimi"
        description="Tenant bilgileri, abonelik durumu ve şube ilişkileri."
        actions={
          isSuperAdmin ? (
            <PermissionAction permission="subscription.manage">
              <AdminButton variant="primary" onClick={openCreate}>
                Yeni İşletme
              </AdminButton>
            </PermissionAction>
          ) : null
        }
      />

      {error ? <AdminStateCard tone="danger" message={error} /> : null}
      {info ? <AdminStateCard tone="success" message={info} /> : null}

      <div className="admin-split-layout">
        <AdminTableCard title="İşletmeler" badge={<AdminStatusBadge tone="info">{companies.length} kayıt</AdminStatusBadge>}>
          {companies.length === 0 ? (
            <AdminStateCard tone="neutral" message="Henüz kayıt yok" />
          ) : (
            <AdminTableWrap>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>İşletme</th>
                    <th>Abonelik</th>
                    <th>Şube</th>
                    <th>Para Birimi</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id} className={selectedId === company.id ? "admin-table__row--active" : ""}>
                      <td>
                        <strong>{company.name}</strong>
                        <p className="admin-subtle-text">{company.legalName ?? company.taxNumber ?? "—"}</p>
                      </td>
                      <td>
                        <AdminStatusBadge tone="info">
                          {company.subscriptionState ?? "—"}
                        </AdminStatusBadge>
                      </td>
                      <td>{company.branches?.length ?? 0}</td>
                      <td>{company.currency ?? "TRY"}</td>
                      <td>
                        <AdminRowActionMenu
                          open={actionMenuRowId === company.id}
                          onToggle={() => setActionMenuRowId((current) => (current === company.id ? null : company.id))}
                          onClose={() => setActionMenuRowId(null)}
                          items={[
                            {
                              key: "detail",
                              label: canManage ? "Düzenle" : "Detay",
                              onSelect: () => openEdit(company),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
          )}
        </AdminTableCard>

        {(isCreating || selected) && canManage ? (
          <section className="admin-surface admin-form-panel">
            <h4>{isCreating ? "Yeni İşletme" : "İşletme Düzenle"}</h4>
            <form className="admin-form-grid" onSubmit={(event) => void handleSubmit(event)}>
              <AdminField label="Ad *">
                <AdminInput value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </AdminField>
              <AdminField label="Yasal Ünvan">
                <AdminInput value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} />
              </AdminField>
              <AdminField label="Vergi No">
                <AdminInput value={form.taxNumber} onChange={(event) => setForm((current) => ({ ...current, taxNumber: event.target.value }))} />
              </AdminField>
              <AdminField label="Saat Dilimi">
                <AdminInput value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} />
              </AdminField>
              <AdminField label="Para Birimi">
                <AdminSelect value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}>
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </AdminSelect>
              </AdminField>
              {!isCreating && selected ? (
                <>
                  <p className="admin-subtle-text admin-form-grid__full">
                    Oluşturulma: {formatTrDateTimeSafe(selected.createdAt)}
                  </p>
                  <p className="admin-subtle-text admin-form-grid__full">
                    Bağlı şube: {selected.branches?.length ?? 0}
                  </p>
                </>
              ) : null}
              <div className="admin-form-grid__actions admin-form-grid__full">
                <AdminButton variant="primary" type="submit" disabled={submitting} loading={submitting}>
                  {submitting ? "Kaydediliyor..." : isCreating ? "Oluştur" : "Kaydet"}
                </AdminButton>
                <AdminButton
                  variant="outline"
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(null);
                  }}
                >
                  İptal
                </AdminButton>
              </div>
            </form>
          </section>
        ) : selected ? (
          <section className="admin-surface admin-form-panel">
            <h4>{selected.name}</h4>
            <dl className="admin-detail-list">
              <div><dt>Yasal Unvan</dt><dd>{selected.legalName ?? "—"}</dd></div>
              <div><dt>Vergi No</dt><dd>{selected.taxNumber ?? "—"}</dd></div>
              <div><dt>Saat Dilimi</dt><dd>{selected.timezone ?? "—"}</dd></div>
              <div><dt>Para Birimi</dt><dd>{selected.currency ?? "TRY"}</dd></div>
              <div><dt>Şube Sayısı</dt><dd>{selected.branches?.length ?? 0}</dd></div>
            </dl>
          </section>
        ) : null}
      </div>
    </div>
  );
}
