"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getStoredUser, hasStoredPermission } from "../../lib/auth/session";
import {
  createBranch,
  fetchBranches,
  updateBranch,
  type BranchRecord,
} from "../../lib/services/branches-service";
import { formatTrDateTimeSafe } from "../../lib/utils/admin-format";
import { PermissionAction } from "../auth/route-permission-guard";
import {
  AdminButton,
  AdminCheckbox,
  AdminField,
  AdminFilterPanel,
  AdminPageHeader,
  AdminRowActionMenu,
  AdminSelect,
  AdminInput,
  AdminStateCard,
  AdminStatusBadge,
  AdminTableCard,
  AdminTableWrap,
} from "../ui/admin-ui";

type BranchFormState = {
  name: string;
  code: string;
  city: string;
  district: string;
  addressLine: string;
  phone: string;
  isActive: boolean;
};

const emptyForm = (): BranchFormState => ({
  name: "",
  code: "",
  city: "",
  district: "",
  addressLine: "",
  phone: "",
  isActive: true,
});

export function BranchesScreen() {
  const user = getStoredUser();
  const canManage = hasStoredPermission(user, "staff.manage");
  const companyId = user?.tenantId ?? "";

  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "passive">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<BranchFormState>(emptyForm());
  const [isCreating, setIsCreating] = useState(false);
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
      const items = await fetchBranches();
      setBranches(Array.isArray(items) ? items : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Şubeler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return branches.filter((branch) => {
      if (statusFilter === "active" && !branch.isActive) return false;
      if (statusFilter === "passive" && branch.isActive) return false;
      if (!query) return true;
      return [branch.name, branch.code, branch.city, branch.district, branch.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [branches, search, statusFilter]);

  const selected = useMemo(
    () => branches.find((branch) => branch.id === selectedId) ?? null,
    [branches, selectedId],
  );

  function openCreate() {
    setIsCreating(true);
    setSelectedId(null);
    setForm(emptyForm());
    setInfo(null);
  }

  function openEdit(branch: BranchRecord) {
    setIsCreating(false);
    setSelectedId(branch.id);
    setForm({
      name: branch.name,
      code: branch.code,
      city: branch.city ?? "",
      district: branch.district ?? "",
      addressLine: branch.addressLine ?? "",
      phone: branch.phone ?? "",
      isActive: branch.isActive,
    });
    setInfo(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage) return;

    if (!form.name.trim() || !form.code.trim()) {
      setError("Şube adı ve kodu zorunludur.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isCreating) {
        if (!companyId) {
          throw new Error("İşletme bilgisi bulunamadı.");
        }
        await createBranch({
          companyId,
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          city: form.city.trim() || undefined,
          district: form.district.trim() || undefined,
          addressLine: form.addressLine.trim() || undefined,
          phone: form.phone.trim() || undefined,
          isActive: form.isActive,
        });
        setInfo("Şube oluşturuldu.");
      } else if (selectedId) {
        await updateBranch(selectedId, {
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          city: form.city.trim() || null,
          district: form.district.trim() || null,
          addressLine: form.addressLine.trim() || null,
          phone: form.phone.trim() || null,
          isActive: form.isActive,
        });
        setInfo("Şube güncellendi.");
      }
      await load();
      setIsCreating(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "İşlem tamamlanamadı.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(branch: BranchRecord) {
    if (!canManage) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateBranch(branch.id, { isActive: !branch.isActive });
      setInfo(branch.isActive ? "Şube pasife alındı." : "Şube aktifleştirildi.");
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Durum güncellenemedi.");
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
        kicker="İşletme"
        title="Şube Yönetimi"
        description="Şube listesi, iletişim bilgileri ve aktiflik durumu."
        actions={
          <PermissionAction permission="staff.manage">
            <AdminButton variant="primary" onClick={openCreate}>
              Yeni Şube
            </AdminButton>
          </PermissionAction>
        }
      />

      {error ? <AdminStateCard tone="danger" message={error} /> : null}
      {info ? <AdminStateCard tone="success" message={info} /> : null}

      <AdminFilterPanel
        title="Filtreler"
        actions={
          <AdminButton variant="outline" onClick={() => void load()}>
            Tekrar Dene
          </AdminButton>
        }
      >
        <div className="admin-form-grid">
          <AdminField label="Ara">
            <AdminInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Şube adı, kod veya telefon" />
          </AdminField>
          <AdminField label="Durum">
            <AdminSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">Tümü</option>
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
            </AdminSelect>
          </AdminField>
        </div>
      </AdminFilterPanel>

      <div className="admin-split-layout">
        <AdminTableCard title="Şubeler" badge={<AdminStatusBadge tone="info">{filtered.length} kayıt</AdminStatusBadge>}>
          {filtered.length === 0 ? (
            <AdminStateCard tone="neutral" message="Henüz kayıt yok" />
          ) : (
            <AdminTableWrap>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Şube</th>
                    <th>Kod</th>
                    <th>İletişim</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((branch) => (
                    <tr key={branch.id} className={selectedId === branch.id ? "admin-table__row--active" : ""}>
                      <td>
                        <strong>{branch.name}</strong>
                        <p className="admin-subtle-text">
                          {[branch.city, branch.district].filter(Boolean).join(" / ") || "—"}
                        </p>
                      </td>
                      <td>{branch.code}</td>
                      <td>{branch.phone ?? "—"}</td>
                      <td>
                        <AdminStatusBadge tone={branch.isActive ? "success" : "danger"}>
                          {branch.isActive ? "Aktif" : "Pasif"}
                        </AdminStatusBadge>
                      </td>
                      <td>
                        <PermissionAction permission="staff.manage">
                          <AdminRowActionMenu
                            open={actionMenuRowId === branch.id}
                            onToggle={() => setActionMenuRowId((current) => (current === branch.id ? null : branch.id))}
                            onClose={() => setActionMenuRowId(null)}
                            items={[
                              { key: "detail", label: "Detay", onSelect: () => openEdit(branch) },
                              {
                                key: "toggle",
                                label: branch.isActive ? "Pasifleştir" : "Aktifleştir",
                                onSelect: () => void toggleActive(branch),
                                disabled: submitting,
                              },
                            ]}
                          />
                        </PermissionAction>
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
            <h4>{isCreating ? "Yeni Şube" : "Şube Düzenle"}</h4>
            <form className="admin-form-grid" onSubmit={(event) => void handleSubmit(event)}>
              <AdminField label="Şube Adı *">
                <AdminInput value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </AdminField>
              <AdminField label="Kod *">
                <AdminInput value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} required />
              </AdminField>
              <AdminField label="İl">
                <AdminInput value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
              </AdminField>
              <AdminField label="İlçe">
                <AdminInput value={form.district} onChange={(event) => setForm((current) => ({ ...current, district: event.target.value }))} />
              </AdminField>
              <AdminField label="Adres" fullWidth>
                <AdminInput value={form.addressLine} onChange={(event) => setForm((current) => ({ ...current, addressLine: event.target.value }))} />
              </AdminField>
              <AdminField label="Telefon">
                <AdminInput value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </AdminField>
              <label className="admin-form-grid__checkbox">
                <AdminCheckbox checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
                Aktif
              </label>
              {!isCreating && selected ? (
                <p className="admin-subtle-text admin-form-grid__full">
                  Oluşturulma: {formatTrDateTimeSafe(selected.createdAt)}
                </p>
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
              <div><dt>Kod</dt><dd>{selected.code}</dd></div>
              <div><dt>Telefon</dt><dd>{selected.phone ?? "—"}</dd></div>
              <div><dt>Adres</dt><dd>{selected.addressLine ?? "—"}</dd></div>
              <div><dt>İl / İlçe</dt><dd>{[selected.city, selected.district].filter(Boolean).join(" / ") || "—"}</dd></div>
              <div><dt>Durum</dt><dd>{selected.isActive ? "Aktif" : "Pasif"}</dd></div>
              <div><dt>İşletme</dt><dd>{selected.company?.name ?? companyId}</dd></div>
            </dl>
          </section>
        ) : null}
      </div>
    </div>
  );
}
