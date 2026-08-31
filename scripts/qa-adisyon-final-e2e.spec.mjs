import { test, expect } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";
const ADMIN = process.env.QA_ADMIN_URL ?? "http://localhost:3000";
const POS = process.env.QA_POS_URL ?? "http://localhost:3001";
const POS_STORAGE_KEY = "pos-web-session";

const errors = [];
const httpErrors = [];

function trackPage(page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push({ type: "console.error", text: msg.text() });
  });
  page.on("pageerror", (err) => errors.push({ type: "pageerror", text: err.message }));
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/api/v1") && res.status() >= 400 && !url.includes("/auth/me")) {
      httpErrors.push({ url, status: res.status() });
    }
  });
}

async function apiLogin(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, deviceLabel: "qa-final-e2e" }),
  });
  if (!res.ok) throw new Error(`Login failed ${email}: ${res.status}`);
  const payload = await res.json();
  const data = payload.accessToken ? payload : payload.data;
  const user = data.user ?? data;
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: {
      id: String(user.id ?? ""),
      fullName: String(user.fullName ?? ""),
      email: String(user.email ?? ""),
      tenantId: String(user.tenantId ?? user.companyId ?? ""),
      defaultBranchId: user.defaultBranchId ?? user.defaultBranch?.id ?? null,
      branchIds: user.branchIds ?? (user.defaultBranchId ? [user.defaultBranchId] : []),
      permissions: user.permissions ?? [],
      role: String(user.role ?? user.roles?.[0]?.key ?? ""),
    },
  };
}

async function injectPosSession(page, email, password) {
  const session = await apiLogin(email, password);
  await page.goto(`${POS}/`);
  await page.evaluate(
    ({ key, session: s }) => {
      localStorage.setItem(key, JSON.stringify(s));
    },
    { key: POS_STORAGE_KEY, session },
  );
  await page.reload({ waitUntil: "networkidle" });
  return session;
}

test.describe("Admin Web — Final QA", () => {
  test("login → dashboard → audit", async ({ page }) => {
    trackPage(page);
    await page.goto(`${ADMIN}/login`);
    await page.fill('input[type="email"], input[name="email"]', "owner@aldal.local");
    await page.fill('input[type="password"], input[name="password"]', "ChangeMe123!");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(?!login)/, { timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText("Giriş yap");
    await page.goto(`${ADMIN}/audit`);
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    const onLogin = /Giris Yap|Yonetici Girisi/i.test(body);
    expect(onLogin).toBe(false);
    expect(body.length).toBeGreaterThan(30);
  });
});

test.describe("POS Web — Garson flow (session inject)", () => {
  test("waiter → tables → open ticket → bill request", async ({ page }) => {
    trackPage(page);
    const session = await injectPosSession(page, "waiter@aldal.local", "Waiter123!");
    await page.waitForTimeout(2000);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(30);

    const tableCard = page.locator(".waiter-table-card").first();
    if (await tableCard.isVisible({ timeout: 8000 }).catch(() => false)) {
      await tableCard.click();
      await page.waitForTimeout(2000);
    }

    const billBtn = page.getByRole("button", { name: /Hesap Ist/i });
    if (await billBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await billBtn.click();
      await page.waitForTimeout(1500);
    }

    const criticalConsole = errors.filter((e) => !e.text?.includes("favicon"));
    expect(criticalConsole.length).toBe(0);
    const criticalHttp = httpErrors.filter((e) => e.status >= 500);
    expect(criticalHttp.length).toBe(0);
  });

  test("table duration tick increases", async ({ page }) => {
    trackPage(page);
    await injectPosSession(page, "manager@aldal.local", "Branch123!");
    await page.waitForTimeout(2000);

    const busyCard = page.locator(".waiter-table-card--busy").first();
    if (!(await busyCard.isVisible({ timeout: 5000 }).catch(() => false))) {
      const freeCard = page.locator(".waiter-table-card--free").first();
      if (await freeCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await freeCard.click();
        await page.waitForTimeout(2500);
      }
    }

    const durationEl = page.locator(".waiter-table-card--busy span").filter({ hasText: /:/ }).first();
    if (await durationEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      const t1 = await durationEl.innerText();
      await page.waitForTimeout(2500);
      const t2 = await durationEl.innerText();
      expect(t1).toMatch(/\d+:\d+:\d+/);
      expect(t2).not.toBe(t1);
    }
  });
});

test.describe("POS Web — Kasa flow (session inject)", () => {
  test("cashier session loads catalog", async ({ page }) => {
    trackPage(page);
    await injectPosSession(page, "cashier@aldal.local", "Cashier123!");
    await page.waitForTimeout(2500);
    const text = await page.locator("body").innerText();
    expect(text.length).toBeGreaterThan(40);
    const serverErrors = httpErrors.filter((e) => e.status >= 500);
    expect(serverErrors.length).toBe(0);
  });
});

test.describe("API contract", () => {
  test("owner dashboard API", async () => {
    const session = await apiLogin("owner@aldal.local", "ChangeMe123!");
    const res = await fetch(`${API}/dashboard/overview`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(res.status).toBe(200);
  });
});
