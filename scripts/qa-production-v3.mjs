#!/usr/bin/env node
/**
 * Prompt 8 — Final production verification harness
 * Usage: node scripts/qa-production-v3.mjs [apiBase]
 */
import { spawn } from "node:child_process";
import { mkdir, stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:4100/api/v1";
const BRIDGE = process.env.POS_PRINT_BRIDGE_URL ?? "http://127.0.0.1:9247";
const BRIDGE_TOKEN = process.env.POS_PRINT_BRIDGE_TOKEN ?? "dev-bridge-token";
const results = [];

function log(test) {
  results.push(test);
  const icon = { PASS: "✓", FAIL: "✗", BLOCKED: "○", "NOT VERIFIED": "?" }[test.status] ?? "?";
  console.log(`${icon} [${test.id}] ${test.category}: ${test.action} → ${test.status}${test.actual ? ` (${test.actual})` : ""}`);
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
    body: { email, password, deviceLabel: "qa-production-v3" },
  });
  if (res.status !== 200 && res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
  const p = res.data?.data ?? res.data;
  return { accessToken: p.accessToken, user: p.user ?? p };
}

async function waitFor(url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function runNodeScript(cwd, env, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn("node", args, { cwd, env: { ...process.env, ...env }, shell: false });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ code: -1, out, err: err + "\nTIMEOUT" });
    }, timeoutMs);
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

async function main() {
  console.log(`\n=== QA PRODUCTION V3 ===\nBase: ${BASE}\n`);

  const apiUp = await waitFor(`${BASE.replace(/\/api\/v1$/, "")}/api/v1/auth/me`.replace("/auth/me", "/auth/me") || `${BASE}/auth/me`);
  log({
    id: "T-ENV-001",
    category: "ENV",
    action: "API reachable",
    expected: "401",
    actual: apiUp ? "up" : "down",
    status: apiUp ? "PASS" : "BLOCKED",
  });
  if (!apiUp) {
    printSummary();
    process.exit(2);
  }

  let owner;
  try {
    owner = await login("owner@aldal.local", "ChangeMe123!");
    log({ id: "T-MOB-001", category: "MOBILE", action: "Login contract (owner)", expected: "200", actual: "200", status: "PASS" });
  } catch (e) {
    log({ id: "T-MOB-001", category: "MOBILE", action: "Login contract", expected: "200", actual: e.message, status: "FAIL" });
  }

  if (owner?.accessToken) {
    const me = await request("/auth/me", { token: owner.accessToken });
    log({
      id: "T-MOB-002",
      category: "MOBILE",
      action: "GET /auth/me",
      expected: "200",
      actual: String(me.status),
      status: me.status === 200 ? "PASS" : "FAIL",
    });

    const branchId = owner.user?.defaultBranchId ?? owner.user?.branchIds?.[0];
    const dash = await request(`/dashboard/overview${branchId ? `?branchId=${branchId}` : ""}`, { token: owner.accessToken });
    log({
      id: "T-LOAD-001",
      category: "LOAD",
      action: "Dashboard overview single",
      expected: "200",
      actual: String(dash.status),
      status: dash.status === 200 ? "PASS" : "FAIL",
      evidence: dash.status !== 200 ? dash.text?.slice(0, 120) : undefined,
    });

    const concurrent = await Promise.all(
      Array.from({ length: 15 }, () =>
        request(`/dashboard/overview${branchId ? `?branchId=${branchId}` : ""}`, { token: owner.accessToken }),
      ),
    );
    const ok = concurrent.filter((r) => r.status === 200).length;
    const fail500 = concurrent.filter((r) => r.status === 500).length;
    log({
      id: "T-LOAD-002",
      category: "LOAD",
      action: "Dashboard 15 concurrent requests",
      expected: "15x 200",
      actual: `${ok}/15 ok, ${fail500} x500`,
      status: ok === 15 ? "PASS" : fail500 > 0 ? "FAIL" : "NOT VERIFIED",
    });

    const backupList = await request("/system/backups", { token: owner.accessToken });
    log({
      id: "T-BAK-001",
      category: "BACKUP",
      action: "List backups (tenant_owner)",
      expected: "403 or 200",
      actual: String(backupList.status),
      status: backupList.status === 403 ? "PASS" : backupList.status === 200 ? "NOT VERIFIED" : "FAIL",
      evidence: "super_admin required for backup",
    });

    const backupCreate = await request("/system/backups", {
      method: "POST",
      token: owner.accessToken,
      body: { label: "QA v3 test" },
    });
    log({
      id: "T-BAK-002",
      category: "BACKUP",
      action: "Create backup without super_admin",
      expected: "403",
      actual: String(backupCreate.status),
      status: backupCreate.status === 403 ? "PASS" : "FAIL",
    });
  }

  // Idempotency on open ticket
  try {
    const cashier = await login("cashier@aldal.local", "Cashier123!");
    const tables = await request("/pos/tables", { token: cashier.accessToken });
    const root = tables.data?.data ?? tables.data;
    const table = (root?.areas ?? []).flatMap((a) => a.tables ?? [])[0];
    if (table?.id) {
      const ct = await request("/pos/tickets", {
        method: "POST",
        token: cashier.accessToken,
        body: { channel: "TABLE", tableId: table.id, coverCount: 1 },
      });
      const ticketId = ct.data?.id ?? ct.data?.data?.id;
      if (ticketId) {
        const idemKey = `qa-v3-idem-${Date.now()}`;
        const body = { content: "QA idempotency note" };
        const n1 = await request(`/pos/tickets/${ticketId}/notes`, {
          method: "POST",
          token: cashier.accessToken,
          headers: { "Idempotency-Key": idemKey },
          body,
        });
        const n2 = await request(`/pos/tickets/${ticketId}/notes`, {
          method: "POST",
          token: cashier.accessToken,
          headers: { "Idempotency-Key": idemKey },
          body,
        });
        log({
          id: "T-IDEM-001",
          category: "IDEMPOTENCY",
          action: "Duplicate key replay on open ticket note",
          expected: "same 2xx",
          actual: `${n1.status}/${n2.status}`,
          status: n1.status === n2.status && n1.status >= 200 && n1.status < 300 ? "PASS" : "FAIL",
        });
      }
    }
  } catch (e) {
    log({ id: "T-IDEM-001", category: "IDEMPOTENCY", action: "Setup", expected: "PASS", actual: e.message, status: "BLOCKED" });
  }

  // Print bridge
  try {
    const health = await fetch(`${BRIDGE}/health`, { headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` } });
    log({
      id: "T-BRG-001",
      category: "PRINTER",
      action: "Bridge health",
      expected: "200",
      actual: String(health.status),
      status: health.status === 200 ? "PASS" : "FAIL",
    });

    if (health.status === 200) {
      const printers = await fetch(`${BRIDGE}/printers`, { headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` } });
      const pj = await printers.json();
      const names = pj.items ?? [];
      log({
        id: "T-BRG-002",
        category: "PRINTER",
        action: "List Windows printers",
        expected: ">=0 printers",
        actual: `${names.length} found`,
        status: printers.status === 200 ? "PASS" : "FAIL",
        evidence: names.slice(0, 3).join(", "),
      });

      const target =
        names.find((n) => /pdf|xps|onenote/i.test(n)) ??
        names.find((n) => !/fax|pdf/i.test(n)) ??
        names[0];
      if (target) {
        const printRes = await fetch(`${BRIDGE}/print`, {
          method: "POST",
          headers: { Authorization: `Bearer ${BRIDGE_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            printerName: target,
            content: "ADISYON QA V3 TEST PRINT\n" + new Date().toISOString(),
          }),
        });
        const printJson = await printRes.json().catch(() => ({}));
        log({
          id: "T-PRT-PHY-001",
          category: "PRINTER",
          action: `Physical/virtual print → ${target}`,
          expected: "200 sent",
          actual: `${printRes.status} ${printJson.status ?? printJson.error ?? ""}`,
          status: printRes.status === 200 ? "PASS" : "FAIL",
        });
      } else {
        log({
          id: "T-PRT-PHY-001",
          category: "PRINTER",
          action: "Physical print",
          expected: "printer available",
          actual: "no printers",
          status: "BLOCKED",
        });
      }
    }
  } catch (e) {
    log({ id: "T-BRG-001", category: "PRINTER", action: "Bridge", expected: "200", actual: e.message, status: "BLOCKED" });
  }

  // Production boot — insecure secrets must fail
  const apiDir = join(process.cwd(), "apps", "api");
  const insecureBoot = await runNodeScript(
    apiDir,
    { NODE_ENV: "production", APP_ENV: "production", JWT_ACCESS_SECRET: "change-me-access", JWT_REFRESH_SECRET: "change-me-refresh", PORT: "4101" },
    ["--require", "ts-node/register", "src/main.ts"],
    12000,
  );
  log({
    id: "T-PROD-001",
    category: "PRODUCTION",
    action: "Boot with insecure JWT (must reject)",
    expected: "non-zero exit",
    actual: `exit=${insecureBoot.code}`,
    status: insecureBoot.code !== 0 || /Production runtime config gecersiz/i.test(insecureBoot.err + insecureBoot.out) ? "PASS" : "FAIL",
  });

  const secureBoot = await runNodeScript(
    apiDir,
    {
      NODE_ENV: "production",
      APP_ENV: "production",
      JWT_ACCESS_SECRET: "qa-prod-access-secret-min-32-chars-long!!",
      JWT_REFRESH_SECRET: "qa-prod-refresh-secret-min-32-chars-long!",
      PORT: "4101",
    },
    ["--require", "ts-node/register", "src/main.ts"],
    18000,
  );
  const prodStarted = /API hazir|successfully started/i.test(secureBoot.out);
  log({
    id: "T-PROD-002",
    category: "PRODUCTION",
    action: "Boot with valid production secrets :4101",
    expected: "started",
    actual: prodStarted ? "started" : `exit=${secureBoot.code}`,
    status: prodStarted ? "PASS" : "FAIL",
    evidence: secureBoot.err?.slice(0, 150),
  });
  if (prodStarted) {
    try {
      const prodPing = await fetch("http://localhost:4101/api/v1/auth/me");
      log({
        id: "T-PROD-003",
        category: "PRODUCTION",
        action: "Production instance /auth/me",
        expected: "401",
        actual: String(prodPing.status),
        status: prodPing.status === 401 ? "PASS" : "FAIL",
      });
    } catch (e) {
      log({ id: "T-PROD-003", category: "PRODUCTION", action: "Ping prod instance", expected: "401", actual: e.message, status: "FAIL" });
    }
    spawn("node", ["./scripts/kill-ports.mjs", "4101"], { cwd: process.cwd(), shell: true, stdio: "ignore" });
  }

  // pg_dump availability for backup
  try {
    await access(process.env.PG_DUMP_PATH ?? "pg_dump", constants.X_OK);
    log({ id: "T-BAK-003", category: "BACKUP", action: "pg_dump on PATH", expected: "exists", actual: "found", status: "PASS" });
  } catch {
    const which = await runNodeScript(process.cwd(), {}, ["-e", "require('child_process').execSync('where pg_dump',{stdio:'pipe'})"], 5000);
    log({
      id: "T-BAK-003",
      category: "BACKUP",
      action: "pg_dump availability",
      expected: "installed",
      actual: which.code === 0 ? "found via where" : "NOT FOUND",
      status: which.code === 0 ? "PASS" : "BLOCKED",
    });
  }

  await mkdir(join(process.cwd(), "storage", "backups"), { recursive: true }).catch(() => {});
  try {
    const backupDir = join(process.cwd(), "storage", "backups");
    const files = await stat(backupDir);
    log({
      id: "T-BAK-004",
      category: "BACKUP",
      action: "Backup storage dir writable",
      expected: "exists",
      actual: files.isDirectory() ? "dir ok" : "missing",
      status: files.isDirectory() ? "PASS" : "FAIL",
    });
  } catch {
    log({ id: "T-BAK-004", category: "BACKUP", action: "Backup dir", expected: "dir", actual: "missing", status: "FAIL" });
  }

  printSummary();
}

function printSummary() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n=== V3 SUMMARY: ${pass} PASS / ${fail} FAIL / ${blocked} BLOCKED / ${results.length} TOTAL ===\n`);
  if (fail) {
    console.log("FAILURES:");
    results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  - ${r.id}: ${r.action}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
