#!/usr/bin/env node
const BASE = "http://91.108.120.203";

async function browserLikeLogin(apiBase, label) {
  const url = `${apiBase}/auth/login`.replace(/([^:]\/)\/+/g, "$1");
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: `${BASE}/adisyon/admin`,
        Referer: `${BASE}/adisyon/admin/login`,
      },
      body: JSON.stringify({ email: "owner@aldal.local", password: "ChangeMe123!" }),
    });
    const text = await r.text();
    console.log(`${label}: ${url} -> ${r.status} ${text.slice(0, 100)}`);
  } catch (e) {
    console.log(`${label}: ${url} -> FETCH ERROR: ${e.message}`);
  }
}

async function main() {
  const html = await fetch(`${BASE}/adisyon/admin/login`).then((r) => r.text());
  console.log("runtime script present:", html.includes("__ADISYON_API_BASE__"));
  const scriptMatch = html.match(/__ADISYON_API_BASE__[^;]+/);
  console.log("script snippet:", scriptMatch?.[0] ?? "NOT FOUND");

  await browserLikeLogin(`${BASE}/adisyon/api/v1`, "absolute-adisyon");
  await browserLikeLogin(`${BASE}/api/v1`, "absolute-fallback");
  await browserLikeLogin("/adisyon/api/v1", "relative-adisyon");
  await browserLikeLogin("/api/v1", "relative-fallback");

  // Simulate what broken client might do
  await browserLikeLogin("http://localhost:4100/api/v1", "localhost-broken");
}

main();
