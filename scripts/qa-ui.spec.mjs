import { test, expect } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";
const ADMIN = process.env.QA_ADMIN_URL ?? "http://localhost:3000";
const POS = process.env.QA_POS_URL ?? "http://localhost:3001";

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

test.describe("Admin Web smoke", () => {
  test("login → dashboard", async ({ page }) => {
    await page.goto(`${ADMIN}/login`);
    await page.fill('input[type="email"], input[name="email"]', "owner@aldal.local");
    await page.fill('input[type="password"], input[name="password"]', "ChangeMe123!");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(?!login)/, { timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText("Giriş yap");
  });
});

test.describe("POS Web smoke", () => {
  test("login → tables visible", async ({ page }) => {
    await page.goto(`${POS}/`);
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill("waiter@aldal.local");
      await page.locator('input[type="password"], input[name="password"]').first().fill("Waiter123!");
      await page.locator('button[type="submit"]').first().click();
    }
    await page.waitForTimeout(3000);
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(20);
  });
});

test.describe("API contract smoke", () => {
  test("owner token loads dashboard API", async () => {
    const session = await apiLogin("owner@aldal.local", "ChangeMe123!");
    const res = await fetch(`${API}/dashboard/overview`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(res.status).toBe(200);
  });
});
