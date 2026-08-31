import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";
const ADMIN = process.env.QA_ADMIN_URL ?? "http://localhost:3000";

function ensureOutDir() {
  const outDir = join(process.cwd(), "artifacts", "batch");
  mkdirSync(outDir, { recursive: true });
  return outDir;
}

async function apiLogin(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, deviceLabel: "qa-playwright" }),
  });
  if (!res.ok) throw new Error(`Login failed ${email}: ${res.status}`);
  const payload = await res.json();
  return payload.accessToken ? payload : payload.data;
}

async function setAdminSession(page, session) {
  await page.addInitScript(({ accessToken, refreshToken, user }) => {
    window.localStorage.setItem("adisyon.accessToken", accessToken);
    window.localStorage.setItem("adisyon.refreshToken", refreshToken);
    window.localStorage.setItem("adisyon.user", JSON.stringify(user));
  }, session);
}

async function waitForAny(page, selectors, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of selectors) {
      const loc = typeof sel === "string" ? page.locator(sel).first() : sel();
      if (await loc.isVisible().catch(() => false)) return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function waitForAppShell(page) {
  await expect(page.locator(".admin-topbar")).toBeVisible({ timeout: 25000 });
  await expect(page.locator(".admin-sidebar")).toBeVisible({ timeout: 25000 });
}

async function waitForDataOrError(page, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hasLoading = await page
      .locator(".admin-empty-state")
      .filter({ hasText: /y[üu]kleniyor/i })
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasLoading) {
      const hasTable = await page.locator("table.admin-table").first().isVisible().catch(() => false);
      const hasEmpty = await page.locator(".admin-empty-state").first().isVisible().catch(() => false);
      const hasError = await page.locator(".admin-status-pill--danger").first().isVisible().catch(() => false);
      if (hasTable || hasEmpty || hasError) return true;
    }
    await page.waitForTimeout(350);
  }
  return false;
}

test.describe("Admin Panel — Batch Visual QA", () => {
  test("capture prioritized screens", async ({ page }) => {
    test.setTimeout(900_000);
    const outDir = ensureOutDir();

    const consoleEvents = [];
    page.on("pageerror", (err) => consoleEvents.push({ type: "pageerror", message: String(err?.message ?? err) }));
    page.on("console", (msg) => {
      if (["error", "warning"].includes(msg.type())) {
        consoleEvents.push({ type: `console.${msg.type()}`, message: msg.text() });
      }
    });

    const session = await apiLogin("owner@aldal.local", "ChangeMe123!");
    await setAdminSession(page, session);

    const shots = [
      { key: "01-pos-hub", path: "/pos-ayarlari" },
      { key: "02-print-integrations", path: "/pos-ayarlari/fis-entegrasyonlari" },
      { key: "03-backup", path: "/pos-ayarlari/yedekleme" },
      { key: "04-feature-flags", path: "/pos-ayarlari/feature-flags" },
      { key: "05-staff-team", path: "/personel/yonetici-ve-personel" },
      { key: "06-waiter-logs", path: "/personel/garson-loglari" },
      { key: "07-attendance-qr", path: "/mesai-qr" },
      { key: "08-monitoring", path: "/monitoring" },
      { key: "09-accounting-accounts", path: "/muhasebe/hesaplar" },
      { key: "10-inventory-warehouses", path: "/stok/depolar" },
      { key: "11-reports-sales", path: "/raporlar/satis-raporlari" },
      { key: "12-integrations-pos-devices", path: "/entegrasyonlar/pos-cihazlari" },
      { key: "13-audit", path: "/audit" },
    ];

    await page.setViewportSize({ width: 1440, height: 900 });
    for (const shot of shots) {
      await page.goto(`${ADMIN}${shot.path}`);
      await page.waitForLoadState("domcontentloaded");
      await waitForAppShell(page);
      await waitForAny(page, [".admin-page-stack", ".admin-reference-page", "main"], 20000);
      await waitForDataOrError(page, 120000);
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(outDir, `${shot.key}.png`), fullPage: true });
    }

    // Staff employee edit modal (best-effort)
    await page.goto(`${ADMIN}/personel/yonetici-ve-personel`);
    await page.waitForLoadState("domcontentloaded");
    await waitForAppShell(page);
    await waitForDataOrError(page, 120000);
    const firstRow = page.locator("table.admin-table tbody tr").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await expect(page.locator(".admin-modal-card")).toBeVisible({ timeout: 25000 });
      await page.screenshot({ path: join(outDir, "05b-staff-employee-editor-modal.png"), fullPage: true });
      await page.keyboard.press("Escape").catch(() => null);
    }

    writeFileSync(join(outDir, "console-errors.json"), JSON.stringify(consoleEvents, null, 2));
  });
});

