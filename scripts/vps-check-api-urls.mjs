#!/usr/bin/env node
const BASE = "http://91.108.120.203";

async function main() {
  const loginPage = await fetch(`${BASE}/adisyon/admin/login`);
  const html = await loginPage.text();
  const jsUrls = [...html.matchAll(/src="(\/adisyon\/admin\/_next\/static\/chunks\/[^"]+)"/g)].map((m) => m[1]);
  console.log("JS chunks:", jsUrls.length);

  for (const jsPath of jsUrls.slice(0, 5)) {
    const js = await fetch(`${BASE}${jsPath}`).then((r) => r.text());
    if (js.includes("/adisyon/api/v1")) {
      console.log("FOUND /adisyon/api/v1 in", jsPath);
    }
    if (js.includes('"/api/v1"') || js.includes("'/api/v1'")) {
      console.log("FOUND wrong /api/v1 in", jsPath);
    }
  }

  // Admin login test
  try {
    const r = await fetch(`${BASE}/adisyon/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@aldal.local", password: "ChangeMe123!" }),
    });
    console.log("admin login via nginx:", r.status, r.ok ? "OK" : await r.text().then((t) => t.slice(0, 120)));
  } catch (e) {
    console.log("admin login FAIL:", e.message);
  }

  // Wrong path (what admin might hit if env wrong)
  try {
    const r = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@aldal.local", password: "ChangeMe123!" }),
    });
    console.log("wrong /api/v1 path:", r.status, (await r.text()).slice(0, 80));
  } catch (e) {
    console.log("wrong path error:", e.message);
  }

  // POS API from built env
  const posHtml = await fetch(`${BASE}/adisyon/pos/`).then((r) => r.text());
  const posJs = posHtml.match(/src="([^"]+\.js)"/)?.[1];
  if (posJs) {
    const js = await fetch(`${BASE}${posJs}`).then((r) => r.text());
    console.log("POS js has /adisyon/api:", js.includes("/adisyon/api/v1"));
    console.log("POS js has wrong /api/v1:", js.includes('"/api/v1"'));
  }
}

main();
