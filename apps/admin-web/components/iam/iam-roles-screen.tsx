"use client";

import { useEffect, useMemo, useState } from "react";
import { permissionCatalog } from "@adisyon/config";
import { getStoredUser, hasStoredPermission } from "../../lib/auth/session";
import { fetchIamPermissions, fetchIamRoles } from "../../lib/services/iam-service";
import { AdminPageHeader, AdminStateCard, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../ui/admin-ui";

type RoleRow = {
  id: string;
  name: string;
  key: string;
  description?: string | null;
  isSystem?: boolean;
  permissions: string[];
};

type PermissionRow = {
  id?: string;
  key: string;
  module?: string;
  action?: string;
  description?: string | null;
};

export function IamRolesScreen() {
  const user = getStoredUser();
  const canManage = hasStoredPermission(user, "staff.manage");
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([fetchIamRoles(), fetchIamPermissions()])
      .then(([roleItems, permissionItems]) => {
        if (!active) return;
        const normalizedRoles = (Array.isArray(roleItems) ? roleItems : []).map((role) => {
          const record = role as unknown as Record<string, unknown>;
          const nested = (record.permissions as Array<{ permission?: { key?: string; module?: string; action?: string } }> | undefined) ?? [];
          const permissionKeys = nested
            .map((item) => item.permission?.key ?? `${item.permission?.module}.${item.permission?.action}`)
            .filter(Boolean) as string[];

          return {
            id: String(record.id),
            name: String(record.name ?? ""),
            key: String(record.key ?? ""),
            description: (record.description as string | null | undefined) ?? null,
            isSystem: Boolean(record.isSystem),
            permissions: permissionKeys.length ? permissionKeys : ((record.permissions as string[] | undefined) ?? []),
          };
        });

        const normalizedPermissions = (Array.isArray(permissionItems) ? permissionItems : []).map((item) => {
          const record = item as unknown as Record<string, unknown>;
          return {
            id: record.id ? String(record.id) : undefined,
            key: String(record.key ?? `${record.module}.${record.action}`),
            module: record.module ? String(record.module) : undefined,
            action: record.action ? String(record.action) : undefined,
            description: (record.description as string | null | undefined) ?? null,
          };
        });

        setRoles(normalizedRoles);
        setPermissions(normalizedPermissions);
        if (normalizedRoles[0]?.id) {
          setSelectedRoleId(normalizedRoles[0].id);
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Rol verileri yüklenemedi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const catalogDomains = useMemo(() => Object.entries(permissionCatalog), []);

  if (loading) {
    return <AdminStateCard tone="info" message="Yükleniyor..." />;
  }

  if (error) {
    return (
      <div className="admin-page-stack">
        <AdminStateCard tone="danger" message={error} />
      </div>
    );
  }

  return (
    <div className="admin-page-stack">
      <AdminPageHeader
        kicker="Personel"
        title="Roller ve İzinler"
        description={
          canManage
            ? "Rol bazlı izin setleri. Garson rolünde ödeme ve adisyon kapatma izinleri bulunmaz."
            : "Rol ve izin setlerini görüntüleme modu."
        }
      />

      <div className="admin-split-layout">
        <AdminTableCard title="Roller" badge={<AdminStatusBadge tone="info">{roles.length} rol</AdminStatusBadge>}>
          {roles.length === 0 ? (
            <AdminStateCard tone="neutral" message="Henüz kayıt yok" />
          ) : (
            <AdminTableWrap>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Rol</th>
                    <th>Anahtar</th>
                    <th>İzin</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr
                      key={role.id}
                      className={selectedRoleId === role.id ? "admin-table__row--active" : ""}
                      onClick={() => setSelectedRoleId(role.id)}
                    >
                      <td>
                        <strong>{role.name}</strong>
                        {role.isSystem ? <AdminStatusBadge tone="info">Sistem</AdminStatusBadge> : null}
                      </td>
                      <td>{role.key}</td>
                      <td>{role.permissions.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
          )}
        </AdminTableCard>

        <section className="admin-surface admin-form-panel">
          <h4>{selectedRole?.name ?? "Rol seçin"}</h4>
          {selectedRole?.description ? <p className="admin-subtle-text">{selectedRole.description}</p> : null}
          {selectedRole ? (
            <div className="admin-page-stack">
              {catalogDomains.map(([domain, keys]) => {
                const roleKeys = new Set(selectedRole.permissions);
                const visible = keys.filter((key) => roleKeys.has(key));
                if (!visible.length) return null;
                return (
                  <div key={domain} className="admin-permission-group">
                    <strong>{domain}</strong>
                    <ul className="admin-permission-list">
                      {visible.map((key) => (
                        <li key={key}>
                          <AdminStatusBadge tone={key.includes("payment") ? "warning" : "success"}>{key}</AdminStatusBadge>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {selectedRole.permissions.filter((key) => !catalogDomains.flatMap(([, values]) => values).includes(key as never)).length ? (
                <div className="admin-permission-group">
                  <strong>Diğer</strong>
                  <ul className="admin-permission-list">
                    {selectedRole.permissions
                      .filter((key) => !catalogDomains.flatMap(([, values]) => values).includes(key as never))
                      .map((key) => (
                        <li key={key}>
                          <AdminStatusBadge tone="neutral">{key}</AdminStatusBadge>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <AdminStateCard tone="neutral" message="Detay için rol seçin" />
          )}
          <p className="admin-subtle-text">Toplam tanımlı izin: {permissions.length}</p>
        </section>
      </div>
    </div>
  );
}
