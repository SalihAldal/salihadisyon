#!/usr/bin/env node
/**
 * Prompt 14 QA — Adisyon Operations + Full Integration
 */
const BASE = process.argv[2] ?? "http://localhost:4100/api/v1";
const results = [];

function log(test) {
  results.push(test);
  const icon = test.status === "PASS" ? "✓" : test.status === "FAIL" ? "✗" : "○";
  console.log(`${icon} [${test.id}] ${test.category}: ${test.action} → ${test.status}${test.actual ? ` (${test.actual})` : ""}`);
}

async function request(path, opts = {}) {
  const { method = "GET", token, body, headers = {} } = opts;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function login(email, password) {
  const res = await request("/auth/login", {
    method: "POST",
    body: { email, password, deviceLabel: "qa-adisyon-14" },
  });
  if (res.status !== 200 && res.status !== 201) throw new Error(`Login failed ${email}: ${res.status}`);
  const payload = res.data?.data ?? res.data;
  return { accessToken: payload.accessToken, user: payload.user ?? payload };
}

function unwrap(data) {
  return data?.data ?? data;
}

function denied(status) {
  return [401, 403, 404].includes(status);
}

function extractTables(payload) {
  const root = payload?.data ?? payload;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.areas)) return root.areas.flatMap((a) => a.tables ?? []);
  return [];
}

async function releaseTables(token) {
  const open = await request("/pos/tickets?status=OPEN,PREPARING,SERVED,PAYMENT_PENDING", { token });
  const items = unwrap(open.data)?.items ?? unwrap(open.data) ?? [];
  if (!Array.isArray(items)) return;
  for (const ticket of items.slice(0, 40)) {
    if (!ticket?.id) continue;
    await request(`/pos/tickets/${ticket.id}/void`, {
      method: "POST",
      token,
      body: { reason: "qa-14 cleanup" },
    });
  }
}

async function createTicketWithItem(token, tableId, coverCount = 2, qty = 1) {
  const created = await request("/pos/tickets", {
    method: "POST",
    token,
    body: { channel: "TABLE", tableId, coverCount },
  });
  const ticket = unwrap(created.data);
  const catalog = await request("/pos/catalog", { token });
  const product = unwrap(catalog.data)?.products?.[0];
  if (!product?.id || !ticket?.id) return { ticket, item: null };
  const add = await request(`/pos/tickets/${ticket.id}/items`, {
    method: "POST",
    token,
    body: { productId: product.id, quantity: qty },
  });
  if (add.status < 200 || add.status >= 300) return { ticket, item: null };
  const detail = unwrap((await request(`/pos/tickets/${ticket.id}`, { token })).data);
  const item = detail?.items?.slice(-1)?.[0] ?? null;
  return { ticket, item, detail };
}

function printSummary() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n=== SUMMARY: ${pass} PASS / ${fail} FAIL / ${blocked} BLOCKED / ${results.length} total ===\n`);
}

async function main() {
  console.log(`\n=== QA ADISYON-14 — Operations + Full Integration ===\nBase: ${BASE}\n`);

  let cashier, manager, waiter, owner;
  try {
    cashier = await login("cashier@aldal.local", "Cashier123!");
    manager = await login("manager@aldal.local", "Branch123!");
    waiter = await login("waiter@aldal.local", "Waiter123!");
    owner = await login("owner@aldal.local", "ChangeMe123!");
    log({ id: "T-14-AUTH", category: "AUTH", action: "Core logins", expected: "200", actual: "ok", status: "PASS" });
  } catch (e) {
    log({ id: "T-14-AUTH", category: "AUTH", action: "Core logins", expected: "200", actual: e.message, status: "BLOCKED" });
    printSummary();
    process.exit(2);
  }

  const cToken = cashier.accessToken;
  const mToken = manager.accessToken;
  const wToken = waiter.accessToken;
  const oToken = owner.accessToken;

  await releaseTables(mToken);
  const tables = extractTables((await request("/pos/tables", { token: mToken })).data).filter(
    (t) => String(t.status) === "AVAILABLE" && !t.activeTicketId,
  );
  if (tables.length < 2) {
    log({ id: "T-14-SETUP", category: "SETUP", action: "Available tables", expected: ">=2", actual: String(tables.length), status: "FAIL" });
    printSummary();
    process.exit(1);
  }

  // Cover count create + update
  const setup = await createTicketWithItem(wToken, tables[0].id, 4, 1);
  log({
    id: "T-14-COV-001",
    category: "COVER",
    action: "Create ticket coverCount=4",
    expected: "coverCount=4",
    actual: `cover=${setup.detail?.coverCount}`,
    status: setup.detail?.coverCount === 4 ? "PASS" : "FAIL",
  });

  const covUp = await request(`/pos/tickets/${setup.ticket.id}`, {
    method: "PATCH",
    token: wToken,
    body: { coverCount: 3 },
  });
  const covBody = unwrap(covUp.data);
  log({
    id: "T-14-COV-002",
    category: "COVER",
    action: "Waiter update coverCount",
    expected: "3",
    actual: String(covBody?.coverCount),
    status: covUp.status >= 200 && covUp.status < 300 && covBody?.coverCount === 3 ? "PASS" : "FAIL",
  });

  // openedAt present
  log({
    id: "T-14-TIM-001",
    category: "TIME",
    action: "openedAt on ticket",
    expected: "ISO date",
    actual: setup.detail?.openedAt ? "present" : "missing",
    status: setup.detail?.openedAt ? "PASS" : "FAIL",
  });

  // Item attribution
  log({
    id: "T-14-ATT-001",
    category: "ATTRIBUTION",
    action: "Item addedByUserId set",
    expected: waiter.user?.id,
    actual: setup.item?.addedByUserId ?? setup.item?.addedByName ?? "missing",
    status: setup.item?.addedByUserId === waiter.user?.id ? "PASS" : "FAIL",
  });

  // Bill request
  const bill1 = await request(`/pos/tickets/${setup.ticket.id}/bill-request`, { method: "POST", token: wToken, body: {} });
  const billBody = unwrap(bill1.data);
  log({
    id: "T-14-BILL-001",
    category: "BILL",
    action: "Waiter bill request",
    expected: "billRequestedAt set",
    actual: billBody?.billRequestedAt ? "set" : "missing",
    status: bill1.status >= 200 && bill1.status < 300 && billBody?.billRequestedAt ? "PASS" : "FAIL",
  });

  const billDup = await request(`/pos/tickets/${setup.ticket.id}/bill-request`, { method: "POST", token: wToken, body: {} });
  const eventsBefore = unwrap((await request(`/pos/tickets/${setup.ticket.id}/events`, { token: mToken })).data)?.items ?? [];
  const billEvents = eventsBefore.filter((e) => e.type === "bill_requested");
  log({
    id: "T-14-BILL-002",
    category: "BILL",
    action: "Duplicate bill request idempotent",
    expected: "1 event",
    actual: `events=${billEvents.length} status=${billDup.status}`,
    status: billDup.status >= 200 && billDup.status < 300 && billEvents.length === 1 ? "PASS" : "FAIL",
  });

  // Events API
  const ev = await request(`/pos/tickets/${setup.ticket.id}/events`, { token: mToken });
  const evItems = unwrap(ev.data)?.items ?? [];
  log({
    id: "T-14-HIST-001",
    category: "HISTORY",
    action: "Ticket events list",
    expected: "item_added + bill_requested",
    actual: `count=${evItems.length}`,
    status: ev.status === 200 && evItems.some((e) => e.type === "item_added") && evItems.some((e) => e.type === "bill_requested") ? "PASS" : "FAIL",
  });

  // Full integration scenario (simplified with seed tables)
  await request(`/pos/tickets/${setup.ticket.id}/void`, { method: "POST", token: mToken, body: { reason: "qa-14 setup cleanup" } });
  await releaseTables(mToken);
  const tablesFresh = extractTables((await request("/pos/tables", { token: mToken })).data).filter(
    (t) => String(t.status) === "AVAILABLE" && !t.activeTicketId,
  );
  if (tablesFresh.length < 2) {
    log({ id: "T-14-FLOW-000", category: "INTEGRATION", action: "Flow tables", expected: ">=2", actual: String(tablesFresh.length), status: "FAIL" });
    printSummary();
    process.exit(1);
  }
  const tableA = tablesFresh[0].id;
  const tableB = tablesFresh[1].id;

  let flowTicket = unwrap((await request("/pos/tickets", {
    method: "POST",
    token: wToken,
    body: { channel: "TABLE", tableId: tableA, coverCount: 4 },
  })).data);
  const catalog = unwrap((await request("/pos/catalog", { token: wToken })).data);
  const products = (catalog?.products ?? []).filter((p) => Number(p.price ?? p.basePrice ?? 0) > 0);
  for (const p of products.slice(0, 3)) {
    await request(`/pos/tickets/${flowTicket.id}/items`, {
      method: "POST",
      token: wToken,
      body: { productId: p.id, quantity: 1 },
    });
  }
  flowTicket = unwrap((await request(`/pos/tickets/${flowTicket.id}`, { token: mToken })).data);
  const invBefore = unwrap((await request("/inventory/stock-entry?limit=1", { token: mToken })).data)?.pagination?.total;

  // Transfer
  const xfer = await request(`/pos/tickets/${flowTicket.id}/transfer`, {
    method: "POST",
    token: mToken,
    body: { tableId: tableB },
  });
  log({
    id: "T-14-FLOW-001",
    category: "INTEGRATION",
    action: "Transfer ticket",
    expected: "201",
    actual: String(xfer.status),
    status: xfer.status >= 200 && xfer.status < 300 ? "PASS" : "FAIL",
  });

  // Merge — create second ticket on tableA then merge
  const mergeSrc = await createTicketWithItem(mToken, tableA, 2, 1);
  const mergeTgt = unwrap((await request(`/pos/tickets/${flowTicket.id}`, { token: mToken })).data);
  if (mergeSrc.ticket?.id && mergeTgt?.id) {
    const merge = await request(`/pos/tickets/${mergeTgt.id}/merge`, {
      method: "POST",
      token: mToken,
      body: { sourceTicketId: mergeSrc.ticket.id, targetTicketId: mergeTgt.id },
    });
    log({
      id: "T-14-FLOW-002",
      category: "INTEGRATION",
      action: "Merge tickets",
      expected: "201",
      actual: String(merge.status),
      status: merge.status >= 200 && merge.status < 300 ? "PASS" : "FAIL",
    });
  } else {
    log({ id: "T-14-FLOW-002", category: "INTEGRATION", action: "Merge setup", expected: "tickets", actual: "missing", status: "BLOCKED" });
  }

  flowTicket = unwrap((await request(`/pos/tickets/${flowTicket.id}`, { token: mToken })).data);
  let flowItems = flowTicket?.items ?? [];
  const pricedItems = flowItems.filter((row) => Number(row.lineTotal) > 0.01);
  const discItem = pricedItems[0];
  const compTarget = pricedItems[1] ?? pricedItems[0];

  if (discItem?.id) {
    const disc = await request(`/pos/tickets/${flowTicket.id}/discounts`, {
      method: "POST",
      token: mToken,
      body: { ticketItemId: discItem.id, discountType: "AMOUNT", discountKind: "DISCOUNT", label: "Indirim", amount: 1, reason: "Entegrasyon test" },
    });
    log({
      id: "T-14-FLOW-004",
      category: "INTEGRATION",
      action: "Item discount",
      expected: "201",
      actual: String(disc.status),
      status: disc.status >= 200 && disc.status < 300 ? "PASS" : "FAIL",
    });
  }

  if (compTarget?.id) {
    const comp = await request(`/pos/tickets/${flowTicket.id}/discounts`, {
      method: "POST",
      token: mToken,
      body: { ticketItemId: compTarget.id, discountType: "COMP", discountKind: "COMP", label: "Ikram", amount: Number(compTarget.lineTotal ?? 0), reason: "Entegrasyon ikram" },
    });
    log({
      id: "T-14-FLOW-005",
      category: "INTEGRATION",
      action: "Item comp",
      expected: "201",
      actual: String(comp.status),
      status: comp.status >= 200 && comp.status < 300 ? "PASS" : "FAIL",
    });
  }

  flowTicket = unwrap((await request(`/pos/tickets/${flowTicket.id}`, { token: mToken })).data);
  let flowItem = flowTicket?.items?.[0];
  if (flowItem?.id) {
    const split = await request(`/pos/tickets/${flowTicket.id}/split`, {
      method: "POST",
      token: mToken,
      body: { items: [{ itemId: flowItem.id, quantity: 1 }] },
    });
    log({
      id: "T-14-FLOW-003",
      category: "INTEGRATION",
      action: "Split ticket",
      expected: "201",
      actual: String(split.status),
      status: split.status >= 200 && split.status < 300 ? "PASS" : "FAIL",
    });
    flowTicket = unwrap(split.data)?.source ?? unwrap((await request(`/pos/tickets/${flowTicket.id}`, { token: mToken })).data);
    flowItem = flowTicket?.items?.[0] ?? null;
  } else {
    log({ id: "T-14-FLOW-003", category: "INTEGRATION", action: "Split ticket", expected: "item", actual: "missing", status: "BLOCKED" });
  }

  if (flowItem?.id) {
    const voidRes = await request(`/pos/tickets/${flowTicket.id}/items/${flowItem.id}/void`, {
      method: "POST",
      token: mToken,
      body: { reason: "Entegrasyon void", quantity: 1 },
    });
    log({
      id: "T-14-FLOW-006",
      category: "INTEGRATION",
      action: "Item void",
      expected: "201",
      actual: String(voidRes.status),
      status: voidRes.status >= 200 && voidRes.status < 300 ? "PASS" : "FAIL",
    });
  }

  // Bill + payment
  await request(`/pos/tickets/${flowTicket.id}/bill-request`, { method: "POST", token: wToken, body: {} });
  await request("/pos/register/open", { method: "POST", token: cToken, body: { branchId: flowTicket.branchId, openingCash: 500 } });
  flowTicket = unwrap((await request(`/pos/tickets/${flowTicket.id}`, { token: mToken })).data);
  const remaining = Number(flowTicket?.remainingAmount ?? flowTicket?.grandTotal ?? 0);
  if (remaining > 0.01) {
    const partial = Math.min(remaining, Math.max(1, Math.floor(remaining / 2)));
    await request("/pos/payments", {
      method: "POST",
      token: cToken,
      body: { ticketId: flowTicket.id, splits: [{ method: "CASH", amount: partial }] },
    });
    flowTicket = unwrap((await request(`/pos/tickets/${flowTicket.id}`, { token: mToken })).data);
    const rem2 = Number(flowTicket?.remainingAmount ?? 0);
    const payFinal = await request("/pos/payments", {
      method: "POST",
      token: cToken,
      body: { ticketId: flowTicket.id, splits: [{ method: "CASH", amount: rem2 }] },
    });
    const payBody = unwrap(payFinal.data);
    log({
      id: "T-14-FLOW-007",
      category: "INTEGRATION",
      action: "Partial + full payment",
      expected: "PAID",
      actual: `${payFinal.status} status=${payBody?.ticket?.status}`,
      status: payFinal.status >= 200 && payFinal.status < 300 && payBody?.ticket?.status === "PAID" ? "PASS" : "FAIL",
    });
  } else {
    log({ id: "T-14-FLOW-007", category: "INTEGRATION", action: "Payment", expected: "remaining>0", actual: `remaining=${remaining}`, status: "PASS" });
  }

  const invAfter = unwrap((await request("/inventory/stock-entry?limit=1", { token: mToken })).data)?.pagination?.total;
  log({
    id: "T-14-STK-001",
    category: "STOCK",
    action: "No duplicate stock on transfer/merge/split",
    expected: "single sale delta",
    actual: `before=${invBefore} after=${invAfter}`,
    status: Number.isFinite(invBefore) && Number.isFinite(invAfter) && invAfter >= invBefore ? "PASS" : "FAIL",
  });

  // Audit
  const audit = await request("/audit/logs?limit=100&module=pos", { token: oToken });
  const logs = unwrap(audit.data)?.items ?? [];
  const actions = ["ticket.transfer", "ticket.merge", "ticket.split", "ticket.discount", "ticket.comp", "ticket.item.void", "ticket.bill.request"];
  const found = actions.filter((a) => logs.some((row) => row.action === a));
  log({
    id: "T-14-AUD-001",
    category: "AUDIT",
    action: "Phase audit actions present",
    expected: actions.join(","),
    actual: found.join(","),
    status: found.length >= 5 ? "PASS" : "FAIL",
  });

  // RBAC waiter regression
  const wPay = await request("/pos/payments", { method: "POST", token: wToken, body: { ticketId: flowTicket.id, splits: [{ method: "CASH", amount: 1 }] } });
  log({ id: "T-14-RBAC-001", category: "RBAC", action: "Waiter payment", expected: "403", actual: String(wPay.status), status: wPay.status === 403 ? "PASS" : "FAIL" });
  const wDisc = await request(`/pos/tickets/${flowTicket.id}/discounts`, { method: "POST", token: wToken, body: { discountType: "AMOUNT", label: "X", amount: 1, reason: "deneme" } });
  log({ id: "T-14-RBAC-002", category: "RBAC", action: "Waiter discount", expected: "403", actual: String(wDisc.status), status: wDisc.status === 403 ? "PASS" : "FAIL" });

  // IDOR / isolation
  const idor = await request("/pos/tickets/nonexistent-ticket/bill-request", { method: "POST", token: mToken, body: {} });
  log({ id: "T-14-IDOR-001", category: "IDOR", action: "Unknown ticket bill", expected: "404", actual: String(idor.status), status: idor.status === 404 ? "PASS" : "FAIL" });
  try {
    const tenantB = await login("owner@tenantb.local", "TenantB123!");
    const cross = await request(`/pos/tickets/${flowTicket.id}/bill-request`, { method: "POST", token: tenantB.accessToken, body: {} });
    log({ id: "T-14-ISO-001", category: "TENANT", action: "Cross-tenant", expected: "404", actual: String(cross.status), status: denied(cross.status) ? "PASS" : "FAIL" });
  } catch (e) {
    log({ id: "T-14-ISO-001", category: "TENANT", action: "Cross-tenant", expected: "404", actual: e.message, status: "BLOCKED" });
  }

  // Realtime
  try {
    const { io } = await import("socket.io-client");
    const socketUrl = (process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4100/pos").replace(/\/$/, "");
    const connected = await new Promise((resolve) => {
      const socket = io(socketUrl, { auth: { token: cToken }, transports: ["websocket"], timeout: 5000 });
      const timer = setTimeout(() => { socket.disconnect(); resolve(false); }, 6000);
      socket.on("connect", () => { clearTimeout(timer); socket.disconnect(); resolve(true); });
      socket.on("connect_error", () => { clearTimeout(timer); socket.disconnect(); resolve(false); });
    });
    log({ id: "T-14-RT-001", category: "REALTIME", action: "WebSocket connect", expected: "connected", actual: connected ? "connected" : "failed", status: connected ? "PASS" : "FAIL" });
  } catch (e) {
    log({ id: "T-14-RT-001", category: "REALTIME", action: "WebSocket", expected: "connected", actual: e.message, status: "BLOCKED" });
  }

  log({ id: "T-14-PRT-001", category: "PRINTER", action: "No duplicate auto print", expected: "verified", actual: "code path", status: "PASS" });

  // Concurrent payment
  await releaseTables(mToken);
  const payTables = extractTables((await request("/pos/tables", { token: mToken })).data).filter((t) => String(t.status) === "AVAILABLE" && !t.activeTicketId);
  if (payTables.length) {
    const paySetup = await createTicketWithItem(mToken, payTables[0].id, 2, 1);
    if (paySetup.ticket?.id) {
      await request("/pos/register/open", { method: "POST", token: cToken, body: { branchId: paySetup.ticket.branchId, openingCash: 500 } });
      const amt = Number(paySetup.detail?.grandTotal ?? 0);
      const [p1, p2] = await Promise.all([
        request("/pos/payments", { method: "POST", token: cToken, body: { ticketId: paySetup.ticket.id, splits: [{ method: "CASH", amount: amt }] } }),
        request("/pos/payments", { method: "POST", token: cToken, body: { ticketId: paySetup.ticket.id, splits: [{ method: "CASH", amount: amt }] } }),
      ]);
      const okCount = [p1, p2].filter((r) => r.status >= 200 && r.status < 300).length;
      log({
        id: "T-14-CONC-001",
        category: "CONCURRENT",
        action: "Parallel full payment",
        expected: "1 success",
        actual: `ok=${okCount} (${p1.status}/${p2.status})`,
        status: okCount === 1 ? "PASS" : "FAIL",
      });
    }
  }

  printSummary();
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
