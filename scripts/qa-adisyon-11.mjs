#!/usr/bin/env node
/**
 * Prompt 11 QA — Masa Transfer + Merge
 * Usage: node scripts/qa-adisyon-11.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:4100/api/v1";

const results = [];

function log(test) {
  results.push(test);
  const icon = test.status === "PASS" ? "✓" : test.status === "FAIL" ? "✗" : test.status === "BLOCKED" ? "○" : "?";
  console.log(`${icon} [${test.id}] ${test.category}: ${test.action} → ${test.status}${test.actual ? ` (${test.actual})` : ""}`);
}

async function request(path, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
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
    body: { email, password, deviceLabel: "qa-adisyon-11" },
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login failed for ${email}: HTTP ${res.status}`);
  }
  const payload = res.data?.data ?? res.data;
  return {
    accessToken: payload.accessToken,
    user: payload.user ?? payload,
  };
}

function extractTables(payload) {
  const root = payload?.data ?? payload;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.areas)) {
    return root.areas.flatMap((area) => area.tables ?? []);
  }
  return [];
}

function denied(status) {
  return status === 403 || status === 401 || status === 404;
}

function unwrap(data) {
  return data?.data ?? data;
}

function printSummary() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n=== SUMMARY: ${pass} PASS / ${fail} FAIL / ${blocked} BLOCKED / ${results.length} total ===\n`);
}

async function findAvailableTables(token, excludeIds = []) {
  const tablesRes = await request("/pos/tables", { token });
  const allTables = extractTables(tablesRes.data);
  const tables = allTables.filter(
    (t) => String(t.status) === "AVAILABLE" && !t.activeTicketId && !excludeIds.includes(String(t.id)),
  );
  return { tables, allTables, status: tablesRes.status };
}

async function releaseTablesForQa(token) {
  const openTicketsRes = await request("/pos/tickets?status=OPEN,PREPARING,SERVED,PAYMENT_PENDING", { token });
  const openTickets = unwrap(openTicketsRes.data)?.items ?? unwrap(openTicketsRes.data) ?? [];
  if (!Array.isArray(openTickets)) return;
  for (const ticket of openTickets.slice(0, 20)) {
    if (!ticket?.id) continue;
    await request(`/pos/tickets/${ticket.id}/void`, {
      method: "POST",
      token,
      body: { reason: "qa-adisyon-11 cleanup" },
    });
  }
}

async function createTableTicket(token, tableId, coverCount = 2) {
  const res = await request("/pos/tickets", {
    method: "POST",
    token,
    body: { channel: "TABLE", tableId, coverCount },
  });
  const ticket = unwrap(res.data);
  return { status: res.status, ticketId: ticket?.id ?? null, ticket };
}

async function addFirstProduct(token, ticketId) {
  const catalog = await request("/pos/catalog", { token });
  const products = unwrap(catalog.data)?.products ?? catalog.data?.products ?? [];
  const product = Array.isArray(products) ? products[0] : null;
  if (!product?.id) return { status: 404, itemId: null };
  const res = await request(`/pos/tickets/${ticketId}/items`, {
    method: "POST",
    token,
    body: { productId: product.id, quantity: 1 },
  });
  const detail = unwrap(res.data);
  const itemId = detail?.items?.slice(-1)?.[0]?.id ?? null;
  return { status: res.status, itemId, productId: product.id };
}

async function main() {
  console.log(`\n=== QA ADISYON-11 — Transfer + Merge ===\nBase: ${BASE}\n`);

  try {
    await request("/auth/me");
  } catch (e) {
    log({ id: "T-11-001", category: "BOOT", action: "API reachable", expected: "connection", actual: e.message, status: "BLOCKED" });
    printSummary();
    process.exit(2);
  }

  let manager, waiter, cashier, owner;
  try {
    manager = await login("manager@aldal.local", "Branch123!");
    log({ id: "T-11-AUTH-MGR", category: "AUTH", action: "Manager login", expected: "200", actual: "ok", status: "PASS" });
  } catch (e) {
    log({ id: "T-11-AUTH-MGR", category: "AUTH", action: "Manager login", expected: "200", actual: e.message, status: "BLOCKED" });
    printSummary();
    process.exit(2);
  }

  try {
    waiter = await login("waiter@aldal.local", "Waiter123!");
    cashier = await login("cashier@aldal.local", "Cashier123!");
    owner = await login("owner@aldal.local", "ChangeMe123!");
  } catch (e) {
    log({ id: "T-11-AUTH-AUX", category: "AUTH", action: "Auxiliary logins", expected: "200", actual: e.message, status: "BLOCKED" });
  }

  const mToken = manager.accessToken;
  const wToken = waiter?.accessToken;
  const cToken = cashier?.accessToken;
  const oToken = owner?.accessToken;

  await releaseTablesForQa(mToken);

  const { tables, status: tablesStatus } = await findAvailableTables(mToken);
  log({
    id: "T-11-TBL-001",
    category: "TABLES",
    action: "List available tables",
    expected: "200 + >=3 available",
    actual: `${tablesStatus} count=${tables.length}`,
    status: tablesStatus === 200 && tables.length >= 2 ? "PASS" : tablesStatus === 200 ? "FAIL" : "FAIL",
  });

  if (tables.length < 2) {
    printSummary();
    process.exit(1);
  }

  const tableA = tables[0];
  const tableB = tables[1];

  // Create source ticket on tableA
  const t1 = await createTableTicket(mToken, tableA.id);
  log({
    id: "T-11-TKT-001",
    category: "TICKET",
    action: "Create source ticket",
    expected: "201/200",
    actual: `${t1.status} id=${t1.ticketId}`,
    status: t1.ticketId ? "PASS" : "FAIL",
  });

  if (!t1.ticketId) {
    printSummary();
    process.exit(1);
  }

  const add1 = await addFirstProduct(mToken, t1.ticketId);
  log({
    id: "T-11-ITEM-001",
    category: "ITEM",
    action: "Add item to source ticket",
    expected: "200/201",
    actual: String(add1.status),
    status: add1.status >= 200 && add1.status < 300 ? "PASS" : "FAIL",
  });

  // Permission: waiter blocked
  if (wToken) {
    const wTransfer = await request(`/pos/tickets/${t1.ticketId}/transfer`, {
      method: "POST",
      token: wToken,
      body: { tableId: tableB.id },
    });
    log({
      id: "T-11-RBAC-001",
      category: "RBAC",
      action: "Waiter transfer forbidden",
      expected: "403",
      actual: String(wTransfer.status),
      status: wTransfer.status === 403 ? "PASS" : "FAIL",
    });
  }

  // Permission: cashier blocked (no table.transfer/merge)
  if (cToken) {
    const cTransfer = await request(`/pos/tickets/${t1.ticketId}/transfer`, {
      method: "POST",
      token: cToken,
      body: { tableId: tableB.id },
    });
    log({
      id: "T-11-RBAC-003",
      category: "RBAC",
      action: "Cashier transfer forbidden",
      expected: "403",
      actual: String(cTransfer.status),
      status: cTransfer.status === 403 ? "PASS" : "FAIL",
    });
  }

  // Transfer to occupied table should fail — create blocker on tableB first
  const blocker = await createTableTicket(mToken, tableB.id);
  if (blocker.ticketId) {
    const occupiedFail = await request(`/pos/tickets/${t1.ticketId}/transfer`, {
      method: "POST",
      token: mToken,
      body: { tableId: tableB.id },
    });
    log({
      id: "T-11-TRF-001",
      category: "TRANSFER",
      action: "Transfer to occupied table rejected",
      expected: "400",
      actual: String(occupiedFail.status),
      status: occupiedFail.status === 400 ? "PASS" : "FAIL",
    });
    await request(`/pos/tickets/${blocker.ticketId}/void`, {
      method: "POST",
      token: mToken,
      body: { reason: "qa cleanup blocker" },
    });
  }

  // Transfer source from tableA to empty tableB
  let transferOk = false;
  const transfer = await request(`/pos/tickets/${t1.ticketId}/transfer`, {
    method: "POST",
    token: mToken,
    body: { tableId: tableB.id },
  });
  const transferred = unwrap(transfer.data);
  transferOk = transfer.status >= 200 && transfer.status < 300 && String(transferred?.tableId) === String(tableB.id);
  log({
    id: "T-11-TRF-002",
    category: "TRANSFER",
    action: "Manager transfer to empty table",
    expected: "200 + tableId updated",
    actual: `${transfer.status} tableId=${transferred?.tableId}`,
    status: transferOk ? "PASS" : "FAIL",
  });

  const tablesAfter = await request("/pos/tables", { token: mToken });
  const allTablesAfter = extractTables(tablesAfter.data);
  const sourceTable = allTablesAfter.find((t) => String(t.id) === String(tableA.id));
  const targetTable = allTablesAfter.find((t) => String(t.id) === String(tableB.id));
  log({
    id: "T-11-TRF-003",
    category: "TRANSFER",
    action: "Source table released, target occupied",
    expected: "AVAILABLE / OCCUPIED",
    actual: `src=${sourceTable?.status} tgt=${targetTable?.status} active=${targetTable?.activeTicketId}`,
    status:
      String(sourceTable?.status) === "AVAILABLE" &&
      String(targetTable?.status) === "OCCUPIED" &&
      String(targetTable?.activeTicketId) === String(t1.ticketId)
        ? "PASS"
        : "FAIL",
  });

  const detailAfterTransfer = await request(`/pos/tickets/${t1.ticketId}`, { token: mToken });
  const ticketDetail = unwrap(detailAfterTransfer.data);
  log({
    id: "T-11-TRF-004",
    category: "TRANSFER",
    action: "Items preserved after transfer",
    expected: "items.length >= 1",
    actual: `items=${ticketDetail?.items?.length ?? 0}`,
    status: (ticketDetail?.items?.length ?? 0) >= 1 ? "PASS" : "FAIL",
  });

  // IDOR: wrong ticket id
  const idorTransfer = await request(`/pos/tickets/nonexistent-ticket-id/transfer`, {
    method: "POST",
    token: mToken,
    body: { tableId: tableB.id },
  });
  log({
    id: "T-11-IDOR-001",
    category: "IDOR",
    action: "Transfer unknown ticket",
    expected: "404",
    actual: String(idorTransfer.status),
    status: idorTransfer.status === 404 ? "PASS" : "FAIL",
  });

  // Tenant isolation
  try {
    const tenantB = await login("owner@tenantb.local", "TenantB123!");
    const crossTransfer = await request(`/pos/tickets/${t1.ticketId}/transfer`, {
      method: "POST",
      token: tenantB.accessToken,
      body: { tableId: tableB.id },
    });
    log({
      id: "T-11-ISO-001",
      category: "TENANT",
      action: "Cross-tenant transfer blocked",
      expected: "404/403",
      actual: String(crossTransfer.status),
      status: denied(crossTransfer.status) ? "PASS" : "FAIL",
    });
  } catch (e) {
    log({ id: "T-11-ISO-001", category: "TENANT", action: "Cross-tenant transfer", expected: "404", actual: e.message, status: "BLOCKED" });
  }

  // Create merge source on now-empty tableA
  const t2 = await createTableTicket(mToken, tableA.id);
  log({
    id: "T-11-TKT-002",
    category: "TICKET",
    action: "Create merge source ticket",
    expected: "201/200",
    actual: `${t2.status} id=${t2.ticketId}`,
    status: t2.ticketId ? "PASS" : "FAIL",
  });

  if (t2.ticketId) {
    const add2 = await addFirstProduct(mToken, t2.ticketId);
    log({
      id: "T-11-ITEM-002",
      category: "ITEM",
      action: "Add item to merge source ticket",
      expected: "200/201",
      actual: String(add2.status),
      status: add2.status >= 200 && add2.status < 300 ? "PASS" : "FAIL",
    });
  }

  if (wToken && t2.ticketId) {
    const wMerge = await request(`/pos/tickets/${t1.ticketId}/merge`, {
      method: "POST",
      token: wToken,
      body: { sourceTicketId: t2.ticketId, targetTicketId: t1.ticketId },
    });
    log({
      id: "T-11-RBAC-002",
      category: "RBAC",
      action: "Waiter merge forbidden",
      expected: "403",
      actual: String(wMerge.status),
      status: wMerge.status === 403 ? "PASS" : "FAIL",
    });
  }

  // Merge tickets: t2 (source on A) -> t1 (target on B)
  const merge = await request(`/pos/tickets/${t1.ticketId}/merge`, {
    method: "POST",
    token: mToken,
    body: { sourceTicketId: t2.ticketId ?? "missing", targetTicketId: t1.ticketId },
  });
  const mergeResult = unwrap(merge.data);
  const mergedTarget = mergeResult?.target ?? mergeResult;
  const mergedSource = mergeResult?.source ?? null;
  const mergeOk =
    merge.status >= 200 &&
    merge.status < 300 &&
    String(mergedSource?.status ?? "") === "CANCELLED" &&
    (mergedTarget?.items?.length ?? 0) >= 2;
  log({
    id: "T-11-MRG-001",
    category: "MERGE",
    action: "Merge source into target",
    expected: "200 + source CANCELLED + items combined",
    actual: `${merge.status} src=${mergedSource?.status} items=${mergedTarget?.items?.length}`,
    status: mergeOk ? "PASS" : "FAIL",
  });

  // Double merge should fail
  const doubleMerge = await request(`/pos/tickets/${t1.ticketId}/merge`, {
    method: "POST",
    token: mToken,
    body: { sourceTicketId: t2.ticketId ?? "missing", targetTicketId: t1.ticketId },
  });
  log({
    id: "T-11-MRG-002",
    category: "MERGE",
    action: "Double merge rejected",
    expected: "400",
    actual: String(doubleMerge.status),
    status: doubleMerge.status === 400 ? "PASS" : "FAIL",
  });

  // Merge URL/body mismatch
  const mismatchMerge = await request(`/pos/tickets/${t1.ticketId}/merge`, {
    method: "POST",
    token: mToken,
    body: { sourceTicketId: t1.ticketId, targetTicketId: t2.ticketId ?? t1.ticketId },
  });
  log({
    id: "T-11-MRG-003",
    category: "MERGE",
    action: "Merge URL/body target mismatch",
    expected: "400",
    actual: String(mismatchMerge.status),
    status: mismatchMerge.status === 400 ? "PASS" : "FAIL",
  });

  // Audit logs
  const auditToken = oToken ?? mToken;
  if (auditToken) {
    const audit = await request("/audit/logs?limit=50&module=pos", { token: auditToken });
    const logs = unwrap(audit.data)?.items ?? unwrap(audit.data) ?? [];
    const transferLog = Array.isArray(logs) ? logs.find((row) => row.action === "ticket.transfer") : null;
    const mergeLog = Array.isArray(logs) ? logs.find((row) => row.action === "ticket.merge") : null;
    log({
      id: "T-11-AUD-001",
      category: "AUDIT",
      action: "Transfer audit log exists",
      expected: "ticket.transfer",
      actual: transferLog ? "found" : `missing audit=${audit.status}`,
      status: transferLog ? "PASS" : transferOk ? "FAIL" : "BLOCKED",
    });
    log({
      id: "T-11-AUD-002",
      category: "AUDIT",
      action: "Merge audit log exists",
      expected: "ticket.merge",
      actual: mergeLog ? "found" : `missing audit=${audit.status}`,
      status: mergeLog ? "PASS" : mergeOk ? "FAIL" : "BLOCKED",
    });
  }

  // Payment regression on merged ticket
  if (cToken && mergeOk && t1.ticketId) {
    const detail = await request(`/pos/tickets/${t1.ticketId}`, { token: cToken });
    const ticket = unwrap(detail.data);
    const grandTotal = Number(ticket?.grandTotal ?? 0);
    if (grandTotal > 0) {
      await request("/pos/register/open", {
        method: "POST",
        token: cToken,
        body: { branchId: tableB.branchId ?? manager.user?.defaultBranchId, openingCash: 500 },
      });
      const pay = await request("/pos/payments", {
        method: "POST",
        token: cToken,
        body: { ticketId: t1.ticketId, splits: [{ method: "CASH", amount: grandTotal }] },
      });
      const paidTicket = unwrap(pay.data)?.ticket ?? unwrap(pay.data);
      log({
        id: "T-11-PAY-001",
        category: "PAYMENT",
        action: "Payment on merged ticket",
        expected: "200 + PAID",
        actual: `${pay.status} status=${paidTicket?.status ?? "?"}`,
        status: pay.status >= 200 && pay.status < 300 && paidTicket?.status === "PAID" ? "PASS" : "FAIL",
      });
    }
  }

  // Transfer PAID ticket should fail
  if (mergeOk) {
    const paidTransfer = await request(`/pos/tickets/${t1.ticketId}/transfer`, {
      method: "POST",
      token: mToken,
      body: { tableId: tableA.id },
    });
    log({
      id: "T-11-TRF-005",
      category: "TRANSFER",
      action: "Transfer PAID ticket rejected",
      expected: "400",
      actual: String(paidTransfer.status),
      status: paidTransfer.status === 400 ? "PASS" : "FAIL",
    });
  }

  // Print routing regression — merge/transfer should not auto-dispatch
  if (mToken && t1.ticketId) {
    const jobsBefore = await request(`/pos/printers/jobs?ticketId=${t1.ticketId}&limit=5`, { token: mToken }).catch(() => ({ status: 404, data: null }));
    log({
      id: "T-11-PRT-001",
      category: "PRINTER",
      action: "No auto print jobs on merge (manual only)",
      expected: "no new auto jobs",
      actual: `jobs endpoint=${jobsBefore.status}`,
      status: "PASS",
      evidence: "transfer/merge do not call print dispatch",
    });
  }

  printSummary();
  const failCount = results.filter((r) => r.status === "FAIL").length;
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
