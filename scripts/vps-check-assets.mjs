#!/usr/bin/env node
const BASE = "http://91.108.120.203";

async function checkAssets(path, label) {
  const res = await fetch(`${BASE}${path}`);
  const html = await res.text();
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  console.log(`\n=== ${label} (${path}) status=${res.status} ===`);
  for (const ref of refs.slice(0, 15)) {
    const url = ref.startsWith("http") ? ref : `${BASE}${ref.startsWith("/") ? ref : `${path.replace(/\/?$/, "/")}${ref}`}`;
    try {
      const r = await fetch(url, { method: "HEAD" });
      console.log(`${r.status} ${url}`);
    } catch (e) {
      console.log(`ERR ${url} ${e.message}`);
    }
  }
}

async function main() {
  await checkAssets("/adisyon/admin/login", "Admin");
  await checkAssets("/adisyon/pos/", "POS");
  const login = await fetch(`${BASE}/adisyon/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "waiter@aldal.local", password: "Waiter123!" }),
  });
  const loginJson = await login.json();
  console.log("\n=== Waiter login ===", login.status, loginJson.accessToken ? "OK token" : JSON.stringify(loginJson).slice(0, 200));
}

main().catch(console.error);
