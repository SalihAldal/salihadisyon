"use client";

import { useEffect, useState } from "react";
import { apiClient } from "../../lib/api/client";
import { requireStoredAccessToken } from "../../lib/auth/session";
import { AdminButtonLink, AdminPageHeader, AdminStateCard } from "../ui/admin-ui";

const fallbackPosUrl = process.env.NEXT_PUBLIC_POS_WEB_URL ?? "http://localhost:3001";

export function GoPosLinkScreen() {
  const [posUrl, setPosUrl] = useState<string | null>(null);
  const [description, setDescription] = useState<string>("POS ekranı ayrı sekmede açılır.");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = requireStoredAccessToken();
        const response = await apiClient.goPosLink(token) as {
          url?: string | null;
          description?: string;
          enabled?: boolean;
        };
        if (!active) return;
        const resolvedUrl = response.url?.trim() || fallbackPosUrl;
        setPosUrl(resolvedUrl);
        setDescription(response.description ?? "Canlı satış operasyonu için POS ekranına geçiş.");
        if (!response.enabled && !response.url) {
          setError("POS linki API üzerinden tanımlı değil; yerel fallback kullanılıyor.");
        }
      } catch (loadError) {
        if (!active) return;
        setPosUrl(fallbackPosUrl);
        setError(loadError instanceof Error ? loadError.message : "POS linki alınamadı; yerel adres kullanılıyor.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="admin-page-stack">
      <AdminPageHeader kicker="Satış Ekranı" title="POS ekranına geçiş" description={description} />
      <section className="admin-surface">
        {loading ? <AdminStateCard tone="info" message="Yükleniyor..." /> : null}
        {error ? <AdminStateCard tone="warning" message={error} /> : null}
        <div className="admin-filter-actions">
          {posUrl ? (
            <AdminButtonLink href={posUrl} target="_blank" rel="noreferrer" variant="primary">
              POS Ekranını Aç
            </AdminButtonLink>
          ) : (
            <AdminStateCard tone="danger" message="POS adresi bulunamadı." />
          )}
        </div>
      </section>
    </div>
  );
}
