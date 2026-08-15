"use client";

import { useEffect, useState } from "react";
import type { PlatformMetaResponse } from "../../lib/api/client";
import { createProductRating, deleteProductRating, fetchPlatformMeta, fetchProductRatings, updateProductRating } from "../../lib/services/platform-service";

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
    <div className="dashboard-stack">
      <section className="admin-page-intro">
        <div>
          <p className="admin-kicker">Sprint 8 / Urun Puanlari</p>
          <h3>Musteri deneyimi ve urun puan analizi</h3>
        </div>
      </section>
      {error ? <div className="admin-status-pill admin-status-pill--danger">{error}</div> : null}
      <section className="admin-detail-grid">
        <article className="admin-surface">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Puan Listesi</p>
              <h3>Kayitlar</h3>
            </div>
          </div>
          <div className="admin-table-wrap">
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
                  <tr key={String(item.id)} className="admin-table__row--clickable" onClick={() => { setSelectedId(String(item.id)); setFormData(item); }}>
                    <td>{String(item.productName ?? "-")}</td>
                    <td>{String(item.branchName ?? "-")}</td>
                    <td>{String(item.customerName ?? "-")}</td>
                    <td>{String(item.score ?? "-")}</td>
                    <td>{String(item.comment ?? "-")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="admin-surface">
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Sube</span>
              <select value={String(formData.branchId ?? "")} onChange={(event) => setFormData((current) => ({ ...current, branchId: event.target.value }))}>
                <option value="">Seciniz</option>
                {(meta?.branches ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span>Urun</span>
              <select value={String(formData.productId ?? "")} onChange={(event) => setFormData((current) => ({ ...current, productId: event.target.value }))}>
                <option value="">Seciniz</option>
                {(meta?.products ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span>Musteri</span>
              <select value={String(formData.customerId ?? "")} onChange={(event) => setFormData((current) => ({ ...current, customerId: event.target.value }))}>
                <option value="">Opsiyonel</option>
                {(meta?.customers ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span>Puan</span>
              <input type="number" min="1" max="5" value={String(formData.score ?? "")} onChange={(event) => setFormData((current) => ({ ...current, score: event.target.value }))} />
            </label>
            <label className="admin-field admin-field--full">
              <span>Yorum</span>
              <textarea value={String(formData.comment ?? "")} onChange={(event) => setFormData((current) => ({ ...current, comment: event.target.value }))} />
            </label>
          </div>
          <div className="admin-filter-actions">
            {selectedId ? <button className="admin-outline-button" type="button" onClick={handleDelete}>Sil</button> : null}
            <button className="admin-primary-button" type="button" onClick={handleSubmit}>{selectedId ? "Guncelle" : "Kaydet"}</button>
          </div>
        </article>
      </section>
    </div>
  );
}
