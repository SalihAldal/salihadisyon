import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";
const ADMIN = process.env.QA_ADMIN_URL ?? "http://localhost:3000";

function ensureOutDir() {
  const outDir = join(process.cwd(), "artifacts", "stage1");
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
      if (await loc.isVisible().catch(() => false)) {
        return true;
      }
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function waitForDataOrError(page, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hasLoading = await page
      .locator(".admin-empty-state")
      .filter({ hasText: /Modu[lü]\s*y[üu]kleniyor/i })
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

test.describe("Stage 1 — Visual QA (Dashboard/Products/Categories/Shell)", () => {
  test("capture core screens", async ({ page }) => {
    test.setTimeout(600_000);
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

    const viewports = [
      { key: "1920", width: 1920, height: 1080 },
      { key: "1440", width: 1440, height: 900 },
      { key: "1024", width: 1024, height: 768 },
      { key: "768", width: 768, height: 1024 },
    ];

    // Dashboard (load once, then resize screenshots)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${ADMIN}/`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".admin-topbar")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".admin-sidebar")).toBeVisible({ timeout: 15000 });
    // Prefer waiting for the actual dashboard widgets; fallback to state card if backend is unavailable.
    const dashboardReady = await waitForAny(page, [".admin-chart-live"], 90000);
    if (!dashboardReady) {
      await waitForAny(page, [".admin-empty-state"], 10000);
    }
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(outDir, `01-dashboard-${vp.key}.png`), fullPage: true });
    }

    // Shell close-ups (canonical reference)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${ADMIN}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator(".admin-sidebar").screenshot({ path: join(outDir, "01-shell-sidebar.png") });
    await page.locator(".admin-topbar").screenshot({ path: join(outDir, "01-shell-topbar.png") });

    // Products
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${ADMIN}/pos-ayarlari/urunler`);
    await page.waitForLoadState("domcontentloaded");
    await waitForDataOrError(page, 120000);
    for (const vp of [{ key: "1440", width: 1440, height: 900 }, { key: "1024", width: 1024, height: 768 }, { key: "768", width: 768, height: 1024 }]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(outDir, `02-products-${vp.key}.png`), fullPage: true });
    }

    const newButton = page.getByRole("button", { name: /Yeni Kayit/i });
    if (await newButton.isVisible().catch(() => false)) {
      await newButton.click();
      await expect(page.locator(".admin-modal-card")).toBeVisible();
      await page.screenshot({ path: join(outDir, "03-product-create-modal.png"), fullPage: true });
      await page.keyboard.press("Escape").catch(() => null);
      await page.getByRole("button", { name: /Vazgec|Kapat/i }).first().click().catch(() => null);
    }

    const firstRow = page.locator("table.admin-table tbody tr").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await expect(page.locator(".admin-modal-card")).toBeVisible();
      await page.screenshot({ path: join(outDir, "04-product-edit-modal.png"), fullPage: true });
      await page.locator(".admin-modal-card").evaluate((el) => {
        el.scrollTop = Math.min(el.scrollHeight, 900);
      });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(outDir, "04b-product-edit-modal-scrolled.png"), fullPage: true });
      await page.getByRole("button", { name: /Vazgec|Kapat/i }).first().click().catch(() => null);
    }

    // Categories
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${ADMIN}/pos-ayarlari/kategoriler`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);
    const categoriesVisible = await waitForAny(page, ["table.admin-table", ".admin-status-pill--danger"], 120000);
    if (!categoriesVisible) {
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(800);
      await waitForAny(page, ["table.admin-table", ".admin-status-pill--danger"], 120000);
    }
    for (const vp of [{ key: "1440", width: 1440, height: 900 }, { key: "1024", width: 1024, height: 768 }, { key: "768", width: 768, height: 1024 }]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(outDir, `05-categories-${vp.key}.png`), fullPage: true });
    }

    if (await newButton.isVisible().catch(() => false)) {
      await newButton.click();
      await expect(page.locator(".admin-modal-card")).toBeVisible();
      await page.screenshot({ path: join(outDir, "06-category-create-modal.png"), fullPage: true });
      await page.locator(".admin-modal-card").evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(outDir, "06b-category-create-modal-bottom.png"), fullPage: true });
      await page.getByRole("button", { name: /Vazgec|Kapat/i }).first().click().catch(() => null);
    }

    const firstCategoryRow = page.locator("table.admin-table tbody tr").first();
    if (await firstCategoryRow.isVisible().catch(() => false)) {
      await firstCategoryRow.click();
      await expect(page.locator(".admin-modal-card")).toBeVisible();
      await page.screenshot({ path: join(outDir, "07-category-edit-modal.png"), fullPage: true });
      await page.locator(".admin-modal-card").evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(outDir, "07b-category-edit-modal-bottom.png"), fullPage: true });
      await page.getByRole("button", { name: /Vazgec|Kapat/i }).first().click().catch(() => null);
    }

    writeFileSync(join(outDir, "console-errors.json"), JSON.stringify(consoleEvents, null, 2));
  });
});

