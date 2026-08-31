"use client";

import { useEffect, useMemo, useState } from "react";
import { getStoredUser, hasStoredPermission } from "../../lib/auth/session";
import {
  bootstrapPrintIntegrations,
  fetchPrintIntegrations,
  saveCategoryPrintRouting,
  testPrinterConnection,
  testPrinterDispatch,
} from "../../lib/services/print-integrations-service";
import { AdminButton, AdminField, AdminPageHeader, AdminStateCard, AdminStatusBadge, AdminTableCard, AdminTableWrap, AdminCheckbox, AdminSelect } from "../ui/admin-ui";
import { PosSettingsShell } from "../pos-settings/pos-settings-shell";

export function PrintIntegrationsScreen() {
  const user = getStoredUser();
  const branchId = user?.defaultBranchId ?? user?.branchIds?.[0] ?? "";
  const canManage = hasStoredPermission(user, "device.manage");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [categoryDestinationIds, setCategoryDestinationIds] = useState<string[]>([]);
  const [connectionResult, setConnectionResult] = useState<Record<string, any> | null>(null);

  async function load() {
    if (!branchId) {
      setError("Sube secimi bulunamadi.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchPrintIntegrations(branchId);
      setData(response);
      if (!((response.destinations as unknown[] | undefined)?.length) && canManage) {
        await bootstrapPrintIntegrations(branchId);
        setData(await fetchPrintIntegrations(branchId));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Fis entegrasyonlari yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [branchId]);

  const categories = useMemo(() => ((data?.categories as Array<Record<string, any>>) ?? []), [data]);
  const destinations = useMemo(() => ((data?.destinations as Array<Record<string, any>>) ?? []), [data]);
  const printers = useMemo(() => ((data?.printers as Array<Record<string, any>>) ?? []), [data]);

  useEffect(() => {
    if (!selectedCategoryId && categories[0]?.id) {
      setSelectedCategoryId(String(categories[0].id));
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    const category = categories.find((item) => String(item.id) === selectedCategoryId);
    setCategoryDestinationIds(((category?.destinationIds as string[] | undefined) ?? []).map(String));
  }, [categories, selectedCategoryId]);

  async function handleSaveCategoryRouting() {
    if (!canManage || !selectedCategoryId) return;
    try {
      await saveCategoryPrintRouting(selectedCategoryId, categoryDestinationIds);
      setInfo("Kategori routing kaydedildi.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kategori routing kaydedilemedi.");
    }
  }

  async function handleTestPrinter(printer: Record<string, any>) {
    if (!canManage) return;
    try {
      await testPrinterDispatch(String(printer.id));
      setInfo(`${String(printer.displayName ?? printer.name)} icin test baskisi gonderildi.`);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Test baskisi basarisiz.");
    }
  }

  async function handleConnectionTest(printerName: string) {
    if (!canManage) return;
    try {
      const result = await testPrinterConnection(printerName, branchId);
      setConnectionResult(result);
    } catch (testError) {
      setConnectionResult({ printerName, reachable: false, printerFound: false, status: "unavailable" });
      setError(testError instanceof Error ? testError.message : "Baglanti testi basarisiz.");
    }
  }

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader
        kicker="POS Ayarlari"
        title="Fis Entegrasyonlari"
        description="Fislik, yazici, kategori routing ve test baskisi yonetimi"
      />
      {error ? <AdminStateCard tone="danger" message={error} /> : null}
      {info ? <AdminStateCard tone="info" message={info} /> : null}
      {loading ? <AdminStateCard tone="neutral" message="Yukleniyor..." /> : null}

      <PosSettingsShell activeSlug="fis-entegrasyonlari">
        {!loading && data ? (
          <>
          <AdminTableCard title="Fislikler">
            <AdminTableWrap>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Kod</th>
                    <th>Ad</th>
                    <th>Tip</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {destinations.map((destination) => (
                    <tr key={String(destination.id)}>
                      <td>{String(destination.code)}</td>
                      <td>{String(destination.name)}</td>
                      <td>{destination.isCashRegister ? "Kasa" : "Uretim"}</td>
                      <td>
                        <AdminStatusBadge tone={destination.isActive ? "success" : "neutral"}>
                          {destination.isActive ? "Aktif" : "Pasif"}
                        </AdminStatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
          </AdminTableCard>

          <AdminTableCard title="Yazicilar">
            <AdminTableWrap>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Fis Adi</th>
                    <th>Yazici Adi</th>
                    <th>Fislik</th>
                    <th>Baglanti</th>
                    <th>Durum</th>
                    <th>Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {printers.map((printer) => (
                    <tr key={String(printer.id)}>
                      <td>{String(printer.displayName ?? "-")}</td>
                      <td>{String(printer.name)}</td>
                      <td>{String(printer.printDestinationCode ?? "-")}</td>
                      <td>{String(printer.connectionUri ?? "-")}</td>
                      <td>
                        <AdminStatusBadge tone={printer.isActive ? "success" : "neutral"}>
                          {printer.isActive ? "Aktif" : "Pasif"}
                        </AdminStatusBadge>
                      </td>
                      <td>
                        {canManage ? (
                          <div className="admin-inline-actions">
                            <AdminButton variant="outline" className="admin-outline-button--sm" onClick={() => void handleTestPrinter(printer)}>
                              Test Baskisi
                            </AdminButton>
                            <AdminButton variant="outline" className="admin-outline-button--sm" onClick={() => void handleConnectionTest(String(printer.name))}>
                              Baglanti Test
                            </AdminButton>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
            {connectionResult ? (
              <AdminStateCard
                tone={connectionResult.printerFound ? "success" : "warning"}
                message={`${String(connectionResult.printerName)} → ${connectionResult.reachable ? (connectionResult.printerFound ? "Yazici bulundu" : "Yazici bulunamadi") : "Bridge erisilemiyor"} (${String(connectionResult.status ?? "unknown")})`}
              />
            ) : null}
          </AdminTableCard>

          <AdminTableCard title="Kategori → Fislik Routing">
            <div className="admin-form-grid">
              <AdminField label="Kategori">
                <AdminSelect value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
                  {categories.map((category) => (
                    <option key={String(category.id)} value={String(category.id)}>
                      {String(category.name)}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <div className="admin-checkbox-grid">
                {destinations.map((destination) => (
                  <label key={String(destination.id)}>
                    <AdminCheckbox
                      checked={categoryDestinationIds.includes(String(destination.id))}
                      disabled={!canManage}
                      onChange={(event) => {
                        const id = String(destination.id);
                        setCategoryDestinationIds((current) =>
                          event.target.checked ? [...new Set([...current, id])] : current.filter((item) => item !== id),
                        );
                      }}
                    />
                    <span>{`${String(destination.code)} · ${String(destination.name)}`}</span>
                  </label>
                ))}
              </div>
              {canManage ? (
                <AdminButton variant="primary" onClick={() => void handleSaveCategoryRouting()}>
                  Kategori Routing Kaydet
                </AdminButton>
              ) : null}
            </div>
          </AdminTableCard>
        </>
        ) : null}
      </PosSettingsShell>
    </div>
  );
}
