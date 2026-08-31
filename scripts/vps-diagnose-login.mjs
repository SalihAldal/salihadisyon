#!/usr/bin/env node
const BASE = "http://91.108.120.203";

async function testLogin(label, body) {
  const url = `${BASE}/adisyon/api/v1/auth/login`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const t = await r.text();
    console.log(`${label}: ${r.status} ${t.slice(0, 150)}`);
  } catch (e) {
    console.log(`${label}: NETWORK ERROR ${e.message} (${e.cause?.code || "no code"})`);
  }
}

async function testWrongPath() {
  try {
    const r = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@aldal.local", password: "ChangeMe123!" }),
    });
    console.log(`wrong /api/v1: ${r.status}`);
  } catch (e) {
    console.log(`wrong /api/v1: NETWORK ERROR ${e.message}`);
  }
}

async function checkBundle() {
  const adminHtml = await fetch(`${BASE}/adisyon/admin/login`).then((r) => r.text());
  const chunk = adminHtml.match(/223-[a-f0-9]+\.js/)?.[0];
  if (chunk) {
    const js = await fetch(`${BASE}/adisyon/admin/_next/static/chunks/${chunk}`).then((r) => r.text());
    const hasAdisyon = js.includes("/adisyon/api/v1");
    const hasWrongFallback = js.includes('pathname.startsWith("/adisyon/admin")');
    console.log(`admin chunk ${chunk}: adisyon path=${hasAdisyon}, runtime fallback=${hasWrongFallback}`);
  }
  const posHtml = await fetch(`${BASE}/adisyon/pos/`).then((r) => r.text());
  const jsFile = posHtml.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (jsFile) {
    const js = await fetch(`${BASE}/adisyon/pos/${jsFile}`).then((r) => r.text());
    console.log(`pos js: /adisyon/api/v1=${js.includes("/adisyon/api/v1")}, subpath fallback=${js.includes("isAdisyonSubpathDeploy") || js.includes("/adisyon/pos")}`);
  }
}

async function main() {
  console.log("=== External tests from local machine ===");
  await testLogin("admin-email", { email: "owner@aldal.local", password: "ChangeMe123!" });
  await testLogin("waiter-pin", { pinCode: "3333" });
  await testWrongPath();
  await checkBundle();
}

main();
