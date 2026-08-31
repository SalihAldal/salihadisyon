"use client";

import { useEffect, useState } from "react";
import type { PlatformMetaResponse } from "../../lib/api/client";
import { createProductRating, deleteProductRating, fetchPlatformMeta, fetchProductRatings, updateProductRating } from "../../lib/services/platform-service";
import { AdminButton, AdminField, AdminInput, AdminPageHeader, AdminSelect, AdminStateCard, AdminTableCard, AdminTableWrap, AdminTextarea } from "../ui/admin-ui";

export function ProductRatingsScreen() {
  const [meta, setMeta] = useState<PlatformMetaResponse | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    const [metaResponse, itemsResponse] = await Promise.all([fetchPlatformMeta(), fetchProductRatings()]);
    setMeta(metaResponse);
    setItems(itemsResponse);
  }

  useEffect(() => {
    void loadData().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Urun puanlari yuklenemedi."));
  }, []);

  async function handleSubmit() {
    try {
      if (selectedId) await updateProductRating(selectedId, formData);
      else await createProductRating(formData);
      setFormData({});
      setSelectedId(null);
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Kayit basarisiz.");
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    await deleteProductRating(selectedId);
    setFormData({});
    setSelectedId(null);
    await loadData();
  }

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader kicker="Platform" title="Urun Puanlari" description="Musteri deneyimi ve urun puan analizi." />
      {error ? <AdminStateCard tone="danger" message={error} /> : null}

      <section className="admin-detail-grid">
        <AdminTableCard kicker="Liste" title="Kayitlar">
          <AdminTableWrap>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Urun</th>
                  <th>Sube</th>
                  <th>Musteri</th>
                  <th>Puan</th>
                  <th>Yorum</th>
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
                    <td>{String(item.productName ?? "-")}</td>
                    <td>{String(item.branchName ?? "-")}</td>
                    <td>{String(item.customerName ?? "-")}</td>
                    <td>{String(item.score ?? "-")}</td>
                    <td>{String(item.comment ?? "-")}</td>
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
            <AdminField label="Urun">
              <AdminSelect value={String(formData.productId ?? "")} onChange={(event) => setFormData((current) => ({ ...current, productId: event.target.value }))}>
                <option value="">Seciniz</option>
                {(meta?.products ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Musteri">
              <AdminSelect value={String(formData.customerId ?? "")} onChange={(event) => setFormData((current) => ({ ...current, customerId: event.target.value }))}>
                <option value="">Opsiyonel</option>
                {(meta?.customers ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Puan">
              <AdminInput type="number" min="1" max="5" value={String(formData.score ?? "")} onChange={(event) => setFormData((current) => ({ ...current, score: event.target.value }))} />
            </AdminField>
            <AdminField label="Yorum" fullWidth>
              <AdminTextarea value={String(formData.comment ?? "")} onChange={(event) => setFormData((current) => ({ ...current, comment: event.target.value }))} />
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
