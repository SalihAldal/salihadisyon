"use client";

import { useEffect, useMemo, useState } from "react";
import {
  activatePosIntegrationDevice,
  assignPosIntegrationDevice,
  createPosIntegrationDevice,
  deactivatePosIntegrationDevice,
  deletePosIntegrationDevice,
  fetchPosIntegrationDeviceDetail,
  fetchPosIntegrationDeviceLogs,
  fetchPosIntegrationDeviceTransactions,
  fetchPosIntegrationDevices,
  fetchPosIntegrationsMeta,
  testPosIntegrationDevice,
  updatePosIntegrationDevice,
} from "../../lib/services/platform-service";

export function IntegrationsScreen() {
  const [meta, setMeta] = useState<Record<string, any> | null>(null);
  const [devices, setDevices] = useState<Array<Record<string, unknown>>>([]);
  const [deviceForm, setDeviceForm] = useState<Record<string, unknown>>({
    connectionType: "NETWORK",
    isActive: true,
  });
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [logs, setLogs] = useState<Array<Record<string, any>>>([]);
  const [transactions, setTransactions] = useState<Array<Record<string, any>>>([]);
  const [assignmentForm, setAssignmentForm] = useState<Record<string, unknown>>({
    isDefault: true,
    isActive: true,
  });
  const [filters, setFilters] = useState<Record<string, string>>({
    branchId: "",
    brand: "",
    model: "",
    connectionType: "",
    status: "",
    isActive: "",
    search: "",
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const [metaResponse, deviceResponse] = await Promise.all([fetchPosIntegrationsMeta(), fetchPosIntegrationDevices(filters)]);
    setMeta(metaResponse.data);
    setDevices((deviceResponse.data?.items as Array<Record<string, unknown>>) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadData().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "POS cihazlari yuklenemedi."));
  }, [filters.branchId, filters.brand, filters.model, filters.connectionType, filters.status, filters.isActive, filters.search]);

  const selectedBrand = String(deviceForm.brand ?? "");
  const selectedConnectionType = String(deviceForm.connectionType ?? "NETWORK");
  const selectedBranchId = String(deviceForm.branchId ?? "");
  const selectedBrandModels = useMemo(
    () => (meta?.brandModels ?? []).find((item: Record<string, unknown>) => String(item.brand) === selectedBrand)?.models ?? [],
    [meta?.brandModels, selectedBrand],
  );
  const activeModelMeta = useMemo(
    () => selectedBrandModels.find((item: Record<string, unknown>) => String(item.model) === String(deviceForm.model ?? "")),
    [selectedBrandModels, deviceForm.model],
  );
  const filteredTerminals = useMemo(
    () => (meta?.terminals ?? []).filter((item: Record<string, unknown>) => (selectedBranchId ? String(item.branchId) === selectedBranchId : true)),
    [meta?.terminals, selectedBranchId],
  );

  function handleNewDevice() {
    setSelectedDeviceId(null);
    setDetail(null);
    setLogs([]);
    setTransactions([]);
    setDeviceForm({ connectionType: "NETWORK", isActive: true });
    setAssignmentForm({ isDefault: true, isActive: true });
  }

  async function loadDetail(id: string) {
    const [detailResponse, logResponse, transactionResponse] = await Promise.all([
      fetchPosIntegrationDeviceDetail(id),
      fetchPosIntegrationDeviceLogs(id),
      fetchPosIntegrationDeviceTransactions(id),
    ]);
    setDetail((detailResponse as Record<string, any>).data ?? null);
    setLogs((((logResponse as Record<string, any>).data ?? []) as Array<Record<string, any>>).slice(0, 20));
    setTransactions((((transactionResponse as Record<string, any>).data ?? []) as Array<Record<string, any>>).slice(0, 10));
  }

  async function handleSubmitDevice() {
    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);
      const payload = {
        branchId: deviceForm.branchId,
        name: deviceForm.name,
        brand: deviceForm.brand,
        model: deviceForm.model,
        serialNumber: deviceForm.serialNumber,
        registryNumber: deviceForm.registryNumber,
        connectionType: selectedConnectionType,
        ipAddress: selectedConnectionType === "NETWORK" ? deviceForm.ipAddress : undefined,
        port: selectedConnectionType === "NETWORK" ? Number(deviceForm.port ?? 0) : undefined,
        pinCode: deviceForm.pinCode,
        isActive: deviceForm.isActive !== false,
      };
      if (selectedDeviceId) {
        await updatePosIntegrationDevice(selectedDeviceId, payload);
      } else {
        await createPosIntegrationDevice(payload);
      }
      setSuccessMessage(selectedDeviceId ? "POS cihazi guncellendi." : "POS cihazi kaydedildi.");
      if (selectedDeviceId && assignmentForm.terminalId) {
        await assignPosIntegrationDevice({
          posDeviceId: selectedDeviceId,
          branchId: deviceForm.branchId,
          terminalId: assignmentForm.terminalId,
          isDefault: assignmentForm.isDefault !== false,
          isActive: assignmentForm.isActive !== false,
        });
      }
      await loadData();
      if (selectedDeviceId) {
        await loadDetail(selectedDeviceId);
      } else {
        handleNewDevice();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "POS cihaz kaydetme islemi basarisiz.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteDevice() {
    if (!selectedDeviceId) return;
    if (!window.confirm("Secili POS cihazi silinsin mi?")) return;
    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);
      await deletePosIntegrationDevice(selectedDeviceId);
      setSuccessMessage("POS cihazi silindi.");
      handleNewDevice();
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "POS cihaz silme basarisiz.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTest() {
    if (!selectedDeviceId) return;
    try {
      setTesting(true);
      setError(null);
      const response = await testPosIntegrationDevice(selectedDeviceId);
      setSuccessMessage(String((response as Record<string, any>).message ?? "Baglanti testi tamamlandi."));
      await loadData();
      await loadDetail(selectedDeviceId);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Baglanti testi basarisiz.");
    } finally {
      setTesting(false);
    }
  }

  async function handleToggleActive() {
    if (!selectedDeviceId) return;
    const isCurrentlyActive = Boolean((devices.find((item) => String(item.id) === selectedDeviceId) as Record<string, unknown> | undefined)?.isActive);
    try {
      setSubmitting(true);
      if (isCurrentlyActive) {
        await deactivatePosIntegrationDevice(selectedDeviceId);
      } else {
        await activatePosIntegrationDevice(selectedDeviceId);
      }
      setSuccessMessage(isCurrentlyActive ? "Cihaz pasife alindi." : "Cihaz aktif edildi.");
      await loadData();
      await loadDetail(selectedDeviceId);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Aktif/Pasif islemi basarisiz.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="admin-surface admin-empty-state">POS entegrasyon modulu yukleniyor...</div>;
  }

  const totalDevices = devices.length;
  const activeDevices = devices.filter((item) => Boolean(item.isActive)).length;

  return (
    <div className="dashboard-stack admin-reference-page admin-integrations-page">
      <section className="admin-page-intro">
        <div>
          <p className="admin-kicker">Pano &gt; POS Ayarlari &gt; POS Cihazlari</p>
          <h3>POS Entegrasyon Yonetim Modulu</h3>
        </div>
        <span className="admin-status-pill admin-status-pill--info">{activeDevices} aktif / {totalDevices} toplam</span>
      </section>

      {error ? <div className="admin-status-pill admin-status-pill--danger">{error}</div> : null}
      {successMessage ? <div className="admin-status-pill admin-status-pill--success">{successMessage}</div> : null}

      <section className="admin-surface admin-pos-link-card">
        <div className="admin-section-head">
          <div>
            <p className="admin-kicker">POS Cihaz Ekle</p>
            <h3>Marka, model ve baglanti bilgisi ile POS cihazi yonet</h3>
          </div>
          <div className="admin-button-row admin-pos-link-actions">
            <button className="admin-outline-button" type="button" onClick={handleNewDevice}>
              Yeni
            </button>
            {selectedDeviceId ? (
              <button className="admin-outline-button" type="button" onClick={handleDeleteDevice} disabled={submitting}>
                Sil
              </button>
            ) : null}
            {selectedDeviceId ? (
              <button className="admin-outline-button" type="button" onClick={handleTest} disabled={testing}>
                {testing ? "Test Ediliyor..." : "Baglantiyi Test Et"}
              </button>
            ) : null}
            {selectedDeviceId ? (
              <button className="admin-outline-button" type="button" onClick={handleToggleActive} disabled={submitting}>
                Aktif / Pasif
              </button>
            ) : null}
            <button className="admin-primary-button" type="button" onClick={handleSubmitDevice} disabled={submitting}>
              {submitting ? "Kaydediliyor..." : selectedDeviceId ? "Guncelle" : "POS Cihazi Ekle"}
            </button>
          </div>
        </div>
        <div className="admin-form-grid admin-pos-link-form">
          <label className="admin-field">
            <span>Sube</span>
            <select
              value={selectedBranchId}
              onChange={(event) =>
                setDeviceForm((current) => ({
                  ...current,
                  branchId: event.target.value,
                }))
              }
            >
              <option value="">Seciniz</option>
              {(meta?.branches ?? []).map((item: Record<string, unknown>) => (
                <option key={String(item.id)} value={String(item.id)}>
                  {String(item.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Marka</span>
            <select value={selectedBrand} onChange={(event) => setDeviceForm((current) => ({ ...current, brand: event.target.value, model: "" }))}>
              <option value="">Seciniz</option>
              {(meta?.brandModels ?? []).map((item: Record<string, unknown>) => (
                <option key={String(item.brand)} value={String(item.brand)}>
                  {String(item.brand)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Model</span>
            <select
              value={String(deviceForm.model ?? "")}
              disabled={!selectedBrand}
              onChange={(event) => setDeviceForm((current) => ({ ...current, model: event.target.value }))}
            >
              <option value="">Seciniz</option>
              {selectedBrandModels.map((item: Record<string, unknown>) => (
                <option key={String(item.model)} value={String(item.model)}>
                  {String(item.model)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Cihaz Adi</span>
            <input value={String(deviceForm.name ?? "")} onChange={(event) => setDeviceForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="admin-field">
            <span>Seri Numarasi</span>
            <input value={String(deviceForm.serialNumber ?? "")} onChange={(event) => setDeviceForm((current) => ({ ...current, serialNumber: event.target.value }))} />
          </label>
          <label className="admin-field">
            <span>Sicil Numarasi</span>
            <input value={String(deviceForm.registryNumber ?? "")} onChange={(event) => setDeviceForm((current) => ({ ...current, registryNumber: event.target.value }))} />
          </label>
          <label className="admin-field">
            <span>Baglanti Turu</span>
            <select
              value={selectedConnectionType}
              onChange={(event) =>
                setDeviceForm((current) => ({
                  ...current,
                  connectionType: event.target.value,
                  ipAddress: event.target.value === "USB" ? "" : current.ipAddress,
                  port: event.target.value === "USB" ? "" : current.port,
                }))
              }
            >
              {(meta?.connectionTypes ?? []).map((item: Record<string, unknown>) => (
                <option key={String(item.value)} value={String(item.value)}>
                  {String(item.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>IP</span>
            <input
              disabled={selectedConnectionType !== "NETWORK"}
              value={String(deviceForm.ipAddress ?? "")}
              onChange={(event) => setDeviceForm((current) => ({ ...current, ipAddress: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span>Port</span>
            <input
              type="number"
              disabled={selectedConnectionType !== "NETWORK"}
              value={String(deviceForm.port ?? "")}
              onChange={(event) => setDeviceForm((current) => ({ ...current, port: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span>Pin</span>
            <input
              value={String(deviceForm.pinCode ?? "")}
              placeholder={Boolean(activeModelMeta?.requiresPin) ? "Bu modelde zorunlu" : "Opsiyonel"}
              onChange={(event) => setDeviceForm((current) => ({ ...current, pinCode: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span>Terminal Atama</span>
            <select value={String(assignmentForm.terminalId ?? "")} onChange={(event) => setAssignmentForm((current) => ({ ...current, terminalId: event.target.value }))}>
              <option value="">Seciniz</option>
              {filteredTerminals.map((item: Record<string, unknown>) => (
                <option key={String(item.id)} value={String(item.id)}>
                  {String(item.name)} ({String(item.code)})
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Varsayilan</span>
            <select value={String(assignmentForm.isDefault ?? true)} onChange={(event) => setAssignmentForm((current) => ({ ...current, isDefault: event.target.value === "true" }))}>
              <option value="true">Evet</option>
              <option value="false">Hayir</option>
            </select>
          </label>
          <label className="admin-field">
            <span>Aktif</span>
            <select value={String(deviceForm.isActive ?? true)} onChange={(event) => setDeviceForm((current) => ({ ...current, isActive: event.target.value === "true" }))}>
              <option value="true">Evet</option>
              <option value="false">Hayir</option>
            </select>
          </label>
        </div>
        <div className="admin-table-wrap admin-pos-link-table-wrap">
          <table className="admin-table admin-table--pos-link">
            <colgroup>
              <col className="admin-pos-link-col--branch" />
              <col className="admin-pos-link-col--provider" />
              <col className="admin-pos-link-col--user" />
              <col className="admin-pos-link-col--terminal" />
              <col className="admin-pos-link-col--channel" />
              <col className="admin-pos-link-col--status" />
            </colgroup>
            <thead>
              <tr>
                <th>Sube</th>
                <th>Marka / Model</th>
                <th>Seri No</th>
                <th>Baglanti</th>
                <th>Durum</th>
                <th>Son Test</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((item) => (
                <tr
                  key={String(item.id)}
                  className="admin-table__row--clickable"
                  onClick={async () => {
                    const id = String(item.id);
                    setSelectedDeviceId(id);
                    setDeviceForm({
                      branchId: item.branchId,
                      name: item.name,
                      brand: item.brand,
                      model: item.model,
                      serialNumber: item.serialNumber,
                      registryNumber: item.registryNumber,
                      connectionType: item.connectionType || "NETWORK",
                      ipAddress: item.ipAddress,
                      port: item.port,
                      isActive: item.isActive,
                    });
                    await loadDetail(id);
                  }}
                >
                  <td>{String(item.branchName ?? "-")}</td>
                  <td>{`${String(item.brand ?? "-")} / ${String(item.model ?? "-")}`}</td>
                  <td>{String(item.serialNumber ?? "-")}</td>
                  <td>{item.connectionType === "NETWORK" ? `${String(item.ipAddress ?? "-")} : ${String(item.port ?? "-")}` : "USB"}</td>
                  <td>{String(item.status ?? "-")}</td>
                  <td>{String(item.lastTestStatus ?? "-")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-grid admin-grid--2">
          <section className="admin-surface">
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Son 10 Islem</p>
                <h3>POS Transaction Kayitlari</h3>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table admin-table--compact">
                <thead>
                  <tr>
                    <th>Tip</th>
                    <th>Tutar</th>
                    <th>Durum</th>
                    <th>Mesaj</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Kayit yok.</td>
                    </tr>
                  ) : (
                    transactions.map((row) => (
                      <tr key={String(row.id)}>
                        <td>{String(row.transactionType ?? "-")}</td>
                        <td>{String(row.amount ?? "-")}</td>
                        <td>{String(row.status ?? "-")}</td>
                        <td>{String(row.responseMessage ?? "-")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="admin-surface">
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Son 20 Log</p>
                <h3>Cihaz Teknik Loglari</h3>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table admin-table--compact">
                <thead>
                  <tr>
                    <th>Seviye</th>
                    <th>Event</th>
                    <th>Mesaj</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={3}>Kayit yok.</td>
                    </tr>
                  ) : (
                    logs.map((row) => (
                      <tr key={String(row.id)}>
                        <td>{String(row.level ?? "-")}</td>
                        <td>{String(row.eventType ?? "-")}</td>
                        <td>{String(row.message ?? "-")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
