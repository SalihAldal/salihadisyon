#!/usr/bin/env node
/**
 * Prompt 9 — backup/restore, port config, connection pool smoke
 */
const BASE = process.argv[2] ?? "http://localhost:4100/api/v1";
const ADMIN = process.env.QA_ADMIN_URL ?? "http://localhost:3000";
const results = [];

function log(test) {
  results.push(test);
  const icon = { PASS: "✓", FAIL: "✗", BLOCKED: "○" }[test.status] ?? "?";
  console.log(`${icon} [${test.id}] ${test.action} → ${test.status}${test.actual ? ` (${test.actual})` : ""}`);
}

async function request(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, text };
}

async function login(email, password) {
  const res = await request("/auth/login", {
    method: "POST",
    body: { email, password, deviceLabel: "qa-hardening" },
  });
  if (res.status !== 200 && res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
  const p = res.data?.data ?? res.data;
  return { accessToken: p.accessToken, user: p.user ?? p };
}

async function main() {
  console.log("\n=== QA HARDENING (Prompt 9) ===\n");

  // Port collision: admin must NOT be on 4100
  try {
    const adminRes = await fetch(`${ADMIN}/login`);
    const apiOn3000 = await fetch("http://localhost:4100/login").then((r) => r.status).catch(() => 0);
    log({
      id: "T-PORT-001",
      action: "Admin web on :3000 (not API port)",
      status: adminRes.status === 200 && apiOn3000 !== 200 ? "PASS" : "FAIL",
      actual: `admin=${adminRes.status}`,
    });
  } catch (e) {
    log({ id: "T-PORT-001", action: "Admin port", status: "FAIL", actual: e.message });
  }

  // API on 4100
  try {
    const api = await request("/auth/me");
    log({
      id: "T-PORT-002",
      action: "API on :4100",
      status: api.status === 401 ? "PASS" : "FAIL",
      actual: String(api.status),
    });
  } catch (e) {
    log({ id: "T-PORT-002", action: "API port", status: "FAIL", actual: e.message });
  }

  // Connection pool restart stability — 3 rapid dashboard bursts
  try {
    const owner = await login("owner@aldal.local", "ChangeMe123!");
    let totalOk = 0;
    let total500 = 0;
    for (let burst = 0; burst < 3; burst++) {
      const batch = await Promise.all(
        Array.from({ length: 10 }, () =>
          request("/dashboard/overview", { token: owner.accessToken }),
        ),
      );
      totalOk += batch.filter((r) => r.status === 200).length;
      total500 += batch.filter((r) => r.status >= 500).length;
    }
    log({
      id: "T-POOL-001",
      action: "Dashboard 30 requests (3 bursts) after singleton pool fix",
      status: total500 === 0 && totalOk === 30 ? "PASS" : "FAIL",
      actual: `${totalOk}/30 ok, ${total500} x500`,
    });
  } catch (e) {
    log({ id: "T-POOL-001", action: "Connection pool load", status: "FAIL", actual: e.message });
  }

  // Backup RBAC
  try {
    const owner = await login("owner@aldal.local", "ChangeMe123!");
    const ownerBackup = await request("/system/backups", {
      method: "POST",
      token: owner.accessToken,
      body: { label: "qa-owner-should-fail" },
    });
    log({
      id: "T-BAK-RBAC",
      action: "Owner cannot create backup",
      status: ownerBackup.status === 403 ? "PASS" : "FAIL",
      actual: String(ownerBackup.status),
    });
  } catch (e) {
    log({ id: "T-BAK-RBAC", action: "Backup RBAC", status: "FAIL", actual: e.message });
  }

  // Backup create + list + restore as super_admin
  try {
    const superAdmin = await login("superadmin@aldal.local", "SuperAdmin123!");
    const role = superAdmin.user?.role ?? superAdmin.user?.primaryRole;
    log({
      id: "T-BAK-SA-LOGIN",
      action: "Super admin login",
      status: role === "super_admin" ? "PASS" : "FAIL",
      actual: String(role),
    });

    const beforeUsers = await request("/iam/users", { token: superAdmin.accessToken });
    const userCountBefore = Array.isArray(beforeUsers.data?.data) ? beforeUsers.data.data.length : beforeUsers.data?.items?.length ?? 0;

    const create = await request("/system/backups", {
      method: "POST",
      token: superAdmin.accessToken,
      body: { label: "QA Prompt 9 backup" },
    });
    const backupPayload = create.data?.data ?? create.data;
    const backupId = backupPayload?.id;
    log({
      id: "T-BAK-CREATE",
      action: "Super admin create backup (docker pg_dump fallback)",
      status: create.status >= 200 && create.status < 300 && backupPayload?.status === "COMPLETED" ? "PASS" : "FAIL",
      actual: `${create.status} ${backupPayload?.status ?? ""}`,
    });

    const list = await request("/system/backups", { token: superAdmin.accessToken });
    const items = list.data?.data?.items ?? list.data?.items ?? [];
    log({
      id: "T-BAK-LIST",
      action: "Super admin list backups",
      status: list.status === 200 && items.length > 0 ? "PASS" : "FAIL",
      actual: `${list.status} count=${items.length}`,
    });

    if (backupId) {
      const restore = await request("/system/backups/restore", {
        method: "POST",
        token: superAdmin.accessToken,
        body: {
          backupId,
          confirmationText: "RESTORE",
          createSafetyBackup: true,
        },
      });
      const restorePayload = restore.data?.data ?? restore.data;
      log({
        id: "T-BAK-RESTORE",
        action: "Restore backup with safety backup",
        status: restore.status >= 200 && restore.status < 300 && restorePayload?.success ? "PASS" : "FAIL",
        actual: `${restore.status}`,
      });

      const afterUsers = await request("/iam/users", { token: superAdmin.accessToken });
      const userCountAfter = Array.isArray(afterUsers.data?.data) ? afterUsers.data.data.length : afterUsers.data?.items?.length ?? 0;
      log({
        id: "T-BAK-RESTORE-DATA",
        action: "DB usable after restore",
        status: afterUsers.status === 200 && userCountAfter >= userCountBefore ? "PASS" : "FAIL",
        actual: `users ${userCountBefore}→${userCountAfter}`,
      });
    }
  } catch (e) {
    log({ id: "T-BAK-SA", action: "Backup flow", status: "FAIL", actual: e.message });
  }

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n=== HARDENING SUMMARY: ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ===\n`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
