"use client";

import { useEffect, useState } from "react";
import type { SupportMetaResponse } from "../../lib/api/client";
import { createSupportTicket, deleteSupportTicket, fetchSupportMeta, fetchSupportTickets, updateSupportTicket } from "../../lib/services/platform-service";

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
    <div className="dashboard-stack">
      <section className="admin-page-intro">
        <div>
          <p className="admin-kicker">Sprint 8 / Destek</p>
          <h3>Talep, durum ve SLA takibi</h3>
        </div>
      </section>
      {error ? <div className="admin-status-pill admin-status-pill--danger">{error}</div> : null}
      <section className="admin-detail-grid">
        <article className="admin-surface">
          <div className="admin-table-wrap">
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
                  <tr key={String(item.id)} className="admin-table__row--clickable" onClick={() => { setSelectedId(String(item.id)); setFormData(item); }}>
                    <td>{String(item.subject ?? "-")}</td>
                    <td>{String(item.category ?? "-")}</td>
                    <td>{String(item.priority ?? "-")}</td>
                    <td>{String(item.status ?? "-")}</td>
                    <td>{String(item.branchName ?? "-")}</td>
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
                <option value="">Genel</option>
                {(meta?.branches ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span>Kategori</span>
              <select value={String(formData.category ?? "diger")} onChange={(event) => setFormData((current) => ({ ...current, category: event.target.value }))}>
                {(meta?.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span>Oncelik</span>
              <select value={String(formData.priority ?? "medium")} onChange={(event) => setFormData((current) => ({ ...current, priority: event.target.value }))}>
                {(meta?.priorities ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span>Durum</span>
              <select value={String(formData.status ?? "open")} onChange={(event) => setFormData((current) => ({ ...current, status: event.target.value }))}>
                {(meta?.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="admin-field admin-field--full">
              <span>Konu</span>
              <input value={String(formData.subject ?? "")} onChange={(event) => setFormData((current) => ({ ...current, subject: event.target.value }))} />
            </label>
            <label className="admin-field admin-field--full">
              <span>Aciklama</span>
              <textarea value={String(formData.description ?? "")} onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))} />
            </label>
          </div>
          <div className="admin-filter-actions">
            {selectedId ? <button className="admin-outline-button" type="button" onClick={handleDelete}>Sil</button> : null}
            <button className="admin-primary-button" type="button" onClick={handleSubmit}>{selectedId ? "Guncelle" : "Talep Ac"}</button>
          </div>
        </article>
      </section>
    </div>
  );
}
