"use client";

import { useEffect, useMemo, useState } from "react";
import { getStoredUser, hasStoredPermission } from "../../lib/auth/session";
import type { FeatureFlagItem } from "../../lib/feature-flags";
import { fetchFeatureFlags, resetFeatureFlag, updateFeatureFlag } from "../../lib/services/feature-flags-service";
import { AdminButton, AdminCheckbox, AdminField, AdminInput, AdminPageHeader, AdminStateCard, AdminStatusBadge, AdminTextarea } from "../ui/admin-ui";
import { PosSettingsShell } from "../pos-settings/pos-settings-shell";

type EditorState = {
  enabled: boolean;
  rolloutPercentage: number;
  allowedRoleKeys: string;
  allowedUserIds: string;
  allowedBranchIds: string;
  clients: Array<"admin-web" | "pos-web" | "api">;
  note: string;
};

function normalizeCsv(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function buildEditorState(item: FeatureFlagItem): EditorState {
  const source = item.override ?? {
    enabled: item.defaultEnabled,
    rolloutPercentage: item.constraints.rolloutPercentage,
    allowedRoleKeys: item.constraints.allowedRoleKeys,
    allowedUserIds: item.constraints.allowedUserIds,
    allowedBranchIds: item.constraints.allowedBranchIds,
    clients: item.constraints.clients,
    note: "",
  };
  return {
    enabled: source.enabled,
    rolloutPercentage: source.rolloutPercentage,
    allowedRoleKeys: source.allowedRoleKeys.join(", "),
    allowedUserIds: source.allowedUserIds.join(", "),
    allowedBranchIds: source.allowedBranchIds.join(", "),
    clients: source.clients.length ? source.clients : item.targets,
    note: source.note ?? "",
  };
}

export function FeatureFlagsScreen() {
  const sessionUser = useMemo(() => getStoredUser(), []);
  const canView = hasStoredPermission(sessionUser, "feature_flags.view");
  const canManage = hasStoredPermission(sessionUser, "feature_flags.manage");
  const [items, setItems] = useState<FeatureFlagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EditorState>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchFeatureFlags()
      .then((response) => {
        if (!active) return;
        setItems(response.items);
        setDrafts(
          Object.fromEntries(response.items.map((item) => [item.key, buildEditorState(item)])),
        );
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Feature flag listesi alinamadi.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!canView) {
    return <AdminStateCard message="Feature flag ekranini gormek icin yetkin yok." tone="danger" />;
  }

  async function reload() {
    const response = await fetchFeatureFlags();
    setItems(response.items);
    setDrafts(Object.fromEntries(response.items.map((item) => [item.key, buildEditorState(item)])));
  }

  async function handleSave(item: FeatureFlagItem) {
    const draft = drafts[item.key];
    if (!draft) return;
    setSavingKey(item.key);
    setError(null);
    try {
      await updateFeatureFlag(item.key, {
        enabled: draft.enabled,
        rolloutPercentage: draft.rolloutPercentage,
        allowedRoleKeys: normalizeCsv(draft.allowedRoleKeys),
        allowedUserIds: normalizeCsv(draft.allowedUserIds),
        allowedBranchIds: normalizeCsv(draft.allowedBranchIds),
        clients: draft.clients,
        note: draft.note.trim() || undefined,
      });
      await reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Feature flag kaydedilemedi.");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleReset(item: FeatureFlagItem) {
    setSavingKey(item.key);
    setError(null);
    try {
      await resetFeatureFlag(item.key);
      await reload();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Feature flag sifirlanamadi.");
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return <AdminStateCard message="Feature flag ekranı yukleniyor..." tone="info" />;
  }

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader
        kicker="Sistem"
        title="Feature Flag Yonetimi"
        description="Yeni odeme sistemi, yeni rapor ekrani ve beta modulleri canlida kontrollu acip kapat."
      />

      {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}


      <PosSettingsShell activeSlug="feature-flags">
        <section className="admin-module-grid">
          {items.map((item) => {
            const draft = drafts[item.key];
            if (!draft) {
              return null;
            }
            const isSaving = savingKey === item.key;

            return (
              <article key={item.key} className="admin-surface admin-module-card">
              <div className="admin-flex admin-flex--between">
                <div>
                  <p className="admin-kicker">{item.category}</p>
                  <h3>{item.label}</h3>
                  <p className="admin-subtle-text">{item.description}</p>
                </div>
                <AdminStatusBadge tone={item.effectiveEnabled ? "success" : "warning"}>
                  {item.effectiveEnabled ? "Aktif" : "Pasif"}
                </AdminStatusBadge>
              </div>

              <div className="admin-feature-flag-meta">
                <span>Hedef: {item.targets.join(", ")}</span>
                <span>Default: {item.defaultEnabled ? "Acik" : "Kapali"}</span>
              </div>

              <AdminField label="Aktif">
                <AdminCheckbox
                  checked={draft.enabled}
                  disabled={!canManage || isSaving}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.key]: { ...current[item.key], enabled: event.target.checked },
                    }))
                  }
                />
              </AdminField>

              <AdminField label="Rollout Yuzdesi">
                <AdminInput
                  type="number"
                  min="0"
                  max="100"
                  value={draft.rolloutPercentage}
                  disabled={!canManage || isSaving}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.key]: {
                        ...current[item.key],
                        rolloutPercentage: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                      },
                    }))
                  }
                />
              </AdminField>

              <AdminField label="Rol Filtreleri">
                <AdminInput
                  value={draft.allowedRoleKeys}
                  disabled={!canManage || isSaving}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.key]: { ...current[item.key], allowedRoleKeys: event.target.value },
                    }))
                  }
                  placeholder="super_admin, branch_manager"
                />
              </AdminField>

              <AdminField label="Kullanici ID Filtreleri">
                <AdminInput
                  value={draft.allowedUserIds}
                  disabled={!canManage || isSaving}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.key]: { ...current[item.key], allowedUserIds: event.target.value },
                    }))
                  }
                  placeholder="cuid1, cuid2"
                />
              </AdminField>

              <AdminField label="Sube ID Filtreleri">
                <AdminInput
                  value={draft.allowedBranchIds}
                  disabled={!canManage || isSaving}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.key]: { ...current[item.key], allowedBranchIds: event.target.value },
                    }))
                  }
                  placeholder="branch1, branch2"
                />
              </AdminField>

              <div className="admin-field">
                <span>Istemciler</span>
                <div className="admin-button-row">
                  {(["admin-web", "pos-web", "api"] as const).map((client) => (
                    <label key={client} className="admin-pill-check">
                      <AdminCheckbox
                        checked={draft.clients.includes(client)}
                        disabled={!canManage || isSaving}
                        onChange={(event) =>
                          setDrafts((current) => {
                            const nextClients = event.target.checked
                              ? [...new Set([...current[item.key].clients, client])]
                              : current[item.key].clients.filter((entry) => entry !== client);
                            return {
                              ...current,
                              [item.key]: { ...current[item.key], clients: nextClients },
                            };
                          })
                        }
                      />
                      <span>{client}</span>
                    </label>
                  ))}
                </div>
              </div>

              <AdminField label="Not">
                <AdminTextarea
                  value={draft.note}
                  disabled={!canManage || isSaving}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.key]: { ...current[item.key], note: event.target.value },
                    }))
                  }
                  placeholder="Canli rollout notu"
                  rows={3}
                />
              </AdminField>

              <div className="admin-button-row">
                <AdminButton variant="primary" disabled={!canManage || isSaving} loading={isSaving} onClick={() => void handleSave(item)}>
                  {isSaving ? "Kaydediliyor..." : "Kaydet"}
                </AdminButton>
                <AdminButton variant="outline" disabled={!canManage || isSaving || !item.override} onClick={() => void handleReset(item)}>
                  Varsayilana Don
                </AdminButton>
              </div>
            </article>
          );
          })}
        </section>
      </PosSettingsShell>
    </div>
  );
}
