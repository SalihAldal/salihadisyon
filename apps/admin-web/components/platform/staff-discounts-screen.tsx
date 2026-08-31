"use client";

import { useEffect, useState } from "react";
import type { PlatformMetaResponse } from "../../lib/api/client";
import { createStaffDiscount, deleteStaffDiscount, fetchPlatformMeta, fetchStaffDiscounts, updateStaffDiscount } from "../../lib/services/platform-service";
import { AdminButton, AdminField, AdminInput, AdminPageHeader, AdminSelect, AdminStateCard, AdminTableCard, AdminTableWrap } from "../ui/admin-ui";

export function StaffDiscountsScreen() {
  const [meta, setMeta] = useState<PlatformMetaResponse | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    const [metaResponse, itemsResponse] = await Promise.all([fetchPlatformMeta(), fetchStaffDiscounts()]);
    setMeta(metaResponse);
    setItems(itemsResponse);
  }

  useEffect(() => {
    void loadData().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Personel indirimleri yuklenemedi."));
  }, []);

  async function handleSubmit() {
    try {
      if (selectedId) await updateStaffDiscount(selectedId, formData);
      else await createStaffDiscount(formData);
      setFormData({});
      setSelectedId(null);
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Kayit basarisiz.");
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    await deleteStaffDiscount(selectedId);
    setFormData({});
    setSelectedId(null);
    await loadData();
  }

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader kicker="Platform" title="Personel Indirimleri" description="Yetkili indirim ve limit tanimlari." />
      {error ? <AdminStateCard tone="danger" message={error} /> : null}

      <section className="admin-detail-grid">
        <AdminTableCard kicker="Liste" title="Kayitlar">
          <AdminTableWrap>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Baslik</th>
                  <th>Personel</th>
                  <th>Sube</th>
                  <th>Tip</th>
                  <th>Deger</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={String(item.id)}
                    className="admin-table__row--clickable"
                    onClick={() => {
                      setSelectedId(String(item.id));
                      setFormData(item);
                    }}
                  >
                    <td>{String(item.title ?? "-")}</td>
                    <td>{String(item.employeeName ?? "-")}</td>
                    <td>{String(item.branchName ?? "-")}</td>
                    <td>{String(item.discountType ?? "-")}</td>
                    <td>{String(item.value ?? "-")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        </AdminTableCard>

        <AdminTableCard kicker="Form" title={selectedId ? "Kayit Düzenle" : "Yeni Kayit"}>
          <div className="admin-form-grid">
            <AdminField label="Sube">
              <AdminSelect value={String(formData.branchId ?? "")} onChange={(event) => setFormData((current) => ({ ...current, branchId: event.target.value }))}>
                <option value="">Seciniz</option>
                {(meta?.branches ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Personel">
              <AdminSelect value={String(formData.employeeProfileId ?? "")} onChange={(event) => setFormData((current) => ({ ...current, employeeProfileId: event.target.value }))}>
                <option value="">Seciniz</option>
                {(meta?.employees ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${item.name} / ${item.branchName}`}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Baslik">
              <AdminInput value={String(formData.title ?? "")} onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))} />
            </AdminField>
            <AdminField label="Tip">
              <AdminSelect value={String(formData.discountType ?? "percentage")} onChange={(event) => setFormData((current) => ({ ...current, discountType: event.target.value }))}>
                <option value="percentage">percentage</option>
                <option value="amount">amount</option>
              </AdminSelect>
            </AdminField>
            <AdminField label="Deger">
              <AdminInput type="number" value={String(formData.value ?? "")} onChange={(event) => setFormData((current) => ({ ...current, value: event.target.value }))} />
            </AdminField>
            <AdminField label="Gunluk Limit">
              <AdminInput type="number" value={String(formData.dailyLimit ?? "")} onChange={(event) => setFormData((current) => ({ ...current, dailyLimit: event.target.value }))} />
            </AdminField>
            <AdminField label="Aylik Limit">
              <AdminInput type="number" value={String(formData.monthlyLimit ?? "")} onChange={(event) => setFormData((current) => ({ ...current, monthlyLimit: event.target.value }))} />
            </AdminField>
          </div>
          <div className="admin-filter-actions">
            {selectedId ? (
              <AdminButton variant="outline" className="admin-outline-button--danger" onClick={handleDelete}>
                Sil
              </AdminButton>
            ) : null}
            <AdminButton variant="primary" onClick={handleSubmit}>
              {selectedId ? "Guncelle" : "Kaydet"}
            </AdminButton>
          </div>
        </AdminTableCard>
      </section>
    </div>
  );
}
