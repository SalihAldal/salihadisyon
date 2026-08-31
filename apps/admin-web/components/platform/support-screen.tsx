"use client";

import { useEffect, useState } from "react";
import type { SupportMetaResponse } from "../../lib/api/client";
import { createSupportTicket, deleteSupportTicket, fetchSupportMeta, fetchSupportTickets, updateSupportTicket } from "../../lib/services/platform-service";
import { AdminButton, AdminField, AdminInput, AdminPageHeader, AdminSelect, AdminStateCard, AdminTableCard, AdminTableWrap, AdminTextarea } from "../ui/admin-ui";

export function SupportScreen() {
  const [meta, setMeta] = useState<SupportMetaResponse | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    const [metaResponse, itemsResponse] = await Promise.all([fetchSupportMeta(), fetchSupportTickets()]);
    setMeta(metaResponse);
    setItems(itemsResponse);
  }

  useEffect(() => {
    void loadData().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Destek kayitlari yuklenemedi."));
  }, []);

  async function handleSubmit() {
    try {
      if (selectedId) await updateSupportTicket(selectedId, formData);
      else await createSupportTicket(formData);
      setSelectedId(null);
      setFormData({});
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Destek kaydi basarisiz.");
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    await deleteSupportTicket(selectedId);
    setSelectedId(null);
    setFormData({});
    await loadData();
  }

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader kicker="Platform" title="Destek" description="Talep, durum ve SLA takibi." />
      {error ? <AdminStateCard tone="danger" message={error} /> : null}

      <section className="admin-detail-grid">
        <AdminTableCard kicker="Liste" title="Destek Talepleri">
          <AdminTableWrap>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Konu</th>
                  <th>Kategori</th>
                  <th>Oncelik</th>
                  <th>Durum</th>
                  <th>Sube</th>
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
                    <td>{String(item.subject ?? "-")}</td>
                    <td>{String(item.category ?? "-")}</td>
                    <td>{String(item.priority ?? "-")}</td>
                    <td>{String(item.status ?? "-")}</td>
                    <td>{String(item.branchName ?? "-")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        </AdminTableCard>

        <AdminTableCard kicker="Form" title={selectedId ? "Talep Düzenle" : "Yeni Talep"}>
          <div className="admin-form-grid">
            <AdminField label="Sube">
              <AdminSelect value={String(formData.branchId ?? "")} onChange={(event) => setFormData((current) => ({ ...current, branchId: event.target.value }))}>
                <option value="">Genel</option>
                {(meta?.branches ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Kategori">
              <AdminSelect value={String(formData.category ?? "diger")} onChange={(event) => setFormData((current) => ({ ...current, category: event.target.value }))}>
                {(meta?.categories ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Oncelik">
              <AdminSelect value={String(formData.priority ?? "medium")} onChange={(event) => setFormData((current) => ({ ...current, priority: event.target.value }))}>
                {(meta?.priorities ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Durum">
              <AdminSelect value={String(formData.status ?? "open")} onChange={(event) => setFormData((current) => ({ ...current, status: event.target.value }))}>
                {(meta?.statuses ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Konu" fullWidth>
              <AdminInput value={String(formData.subject ?? "")} onChange={(event) => setFormData((current) => ({ ...current, subject: event.target.value }))} />
            </AdminField>
            <AdminField label="Aciklama" fullWidth>
              <AdminTextarea value={String(formData.description ?? "")} onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))} />
            </AdminField>
          </div>
          <div className="admin-filter-actions">
            {selectedId ? (
              <AdminButton variant="outline" className="admin-outline-button--danger" onClick={handleDelete}>
                Sil
              </AdminButton>
            ) : null}
            <AdminButton variant="primary" onClick={handleSubmit}>
              {selectedId ? "Guncelle" : "Talep Ac"}
            </AdminButton>
          </div>
        </AdminTableCard>
      </section>
    </div>
  );
}
