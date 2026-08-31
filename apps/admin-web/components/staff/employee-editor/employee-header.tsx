"use client";

import { AdminButton, AdminStatusBadge, AdminTabs } from "../../ui/admin-ui";
import type { EmployeeDetailData, EmployeeEditorTab } from "./types";

const TAB_ITEMS: Array<{ id: EmployeeEditorTab; label: string }> = [
  { id: "account-settings", label: "Hesap Ayarlari" },
  { id: "personal-info", label: "Kisisel Bilgiler" },
  { id: "other-info", label: "Diger Bilgiler" },
  { id: "payments", label: "Odemeler" },
  { id: "shifts", label: "Vardiyalar" },
  { id: "account-movements", label: "Hesap Hareketleri" },
];

export function EmployeeHeader({
  detail,
  activeTab,
  onTabChange,
  onPassive,
  onAssignOwner,
  canManageEmployee,
  canAssignOwner,
  busy,
}: {
  detail: EmployeeDetailData;
  activeTab: EmployeeEditorTab;
  onTabChange: (tab: EmployeeEditorTab) => void;
  onPassive: () => void;
  onAssignOwner: () => void;
  canManageEmployee: boolean;
  canAssignOwner: boolean;
  busy?: boolean;
}) {
  const initials = `${detail.main.firstName?.[0] ?? ""}${detail.main.lastName?.[0] ?? ""}`.trim() || "PR";
  const showActions = canManageEmployee || canAssignOwner;

  return (
    <section className="admin-employee-editor__header">
      <div className="admin-employee-editor__identity">
        <div className="admin-employee-editor__avatar">{initials}</div>
        <div>
          <div className="admin-employee-editor__title-row">
            <h3>{detail.main.fullName}</h3>
            <AdminStatusBadge tone={detail.main.isActive ? "success" : "danger"}>{detail.main.isActive ? "Aktif" : "Pasif"}</AdminStatusBadge>
            {detail.main.isOwner ? <AdminStatusBadge tone="warning">Isletme Sahibi</AdminStatusBadge> : null}
          </div>
          <p>
            {detail.main.branchName} · {detail.main.staffRoleName || "Rol tanimsiz"}
          </p>
        </div>
      </div>

      <div className="admin-employee-editor__toolbar">
        <AdminTabs
          className="admin-employee-editor__tabs"
          items={TAB_ITEMS.map((item) => ({ key: item.id, label: item.label }))}
          active={activeTab}
          onChange={onTabChange}
        />

        {showActions ? (
          <details className="admin-employee-editor__actions">
            <summary className="admin-outline-button">{busy ? "Isleniyor..." : "Ayarlar"}</summary>
            <div className="admin-employee-editor__actions-menu">
              {canManageEmployee ? (
                <>
                  <AdminButton variant="ghost" onClick={() => onTabChange("account-settings")}>
                    Hesap Ayarlarina git
                  </AdminButton>
                  <AdminButton variant="ghost" onClick={() => onTabChange("personal-info")}>
                    Kisisel Bilgilere git
                  </AdminButton>
                  <AdminButton variant="ghost" onClick={() => onTabChange("other-info")}>
                    Diger Bilgilere git
                  </AdminButton>
                  <AdminButton variant="ghost" onClick={onPassive} disabled={busy || !detail.main.isActive}>
                    Personeli pasiflestir
                  </AdminButton>
                </>
              ) : null}
              {canAssignOwner ? (
                <AdminButton
                  variant="ghost"
                  onClick={onAssignOwner}
                  disabled={busy || !detail.main.isActive || detail.main.isOwner}
                >
                  Isletme sahibi olarak ata
                </AdminButton>
              ) : null}
              {!detail.main.isActive ? <p className="admin-employee-editor__actions-note">Pasif personelde kritik aksiyonlar kisitlidir.</p> : null}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
