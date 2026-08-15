"use client";

import { useEffect, useState } from "react";
import type { PlatformMetaResponse } from "../../lib/api/client";
import { createStaffDiscount, deleteStaffDiscount, fetchPlatformMeta, fetchStaffDiscounts, updateStaffDiscount } from "../../lib/services/platform-service";

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
    <div className="dashboard-stack">
      <section className="admin-page-intro">
        <div>
          <p className="admin-kicker">Sprint 8 / Personel Indirimleri</p>
          <h3>Yetkili indirim ve limit tanimlari</h3>
        </div>
      </section>
      {error ? <div className="admin-status-pill admin-status-pill--danger">{error}</div> : null}
      <section className="admin-detail-grid">
        <article className="admin-surface">
          <div className="admin-table-wrap">
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
                  <tr key={String(item.id)} className="admin-table__row--clickable" onClick={() => { setSelectedId(String(item.id)); setFormData(item); }}>
                    <td>{String(item.title ?? "-")}</td>
                    <td>{String(item.employeeName ?? "-")}</td>
                    <td>{String(item.branchName ?? "-")}</td>
                    <td>{String(item.discountType ?? "-")}</td>
                    <td>{String(item.value ?? "-")}</td>
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
              <span>Personel</span>
              <select value={String(formData.employeeProfileId ?? "")} onChange={(event) => setFormData((current) => ({ ...current, employeeProfileId: event.target.value }))}>
                <option value="">Seciniz</option>
                {(meta?.employees ?? []).map((item) => <option key={item.id} value={item.id}>{`${item.name} / ${item.branchName}`}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span>Baslik</span>
              <input value={String(formData.title ?? "")} onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="admin-field">
              <span>Tip</span>
              <select value={String(formData.discountType ?? "percentage")} onChange={(event) => setFormData((current) => ({ ...current, discountType: event.target.value }))}>
                <option value="percentage">percentage</option>
                <option value="amount">amount</option>
              </select>
            </label>
            <label className="admin-field">
              <span>Deger</span>
              <input type="number" value={String(formData.value ?? "")} onChange={(event) => setFormData((current) => ({ ...current, value: event.target.value }))} />
            </label>
            <label className="admin-field">
              <span>Gunluk Limit</span>
              <input type="number" value={String(formData.dailyLimit ?? "")} onChange={(event) => setFormData((current) => ({ ...current, dailyLimit: event.target.value }))} />
            </label>
            <label className="admin-field">
              <span>Aylik Limit</span>
              <input type="number" value={String(formData.monthlyLimit ?? "")} onChange={(event) => setFormData((current) => ({ ...current, monthlyLimit: event.target.value }))} />
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
