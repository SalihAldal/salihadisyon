import { describe, expect, it } from "vitest";
import { isWaiterRole, mergeEffectivePermissions, roleMatrix } from "@adisyon/config";
import { isWaiterSession, mergeSessionUserFromMe } from "./pos-helpers";
import type { PosAuthSession } from "./api";

describe("pos rbac helpers", () => {
  it("waiter rolunu tanir", () => {
    expect(isWaiterRole("waiter")).toBe(true);
    expect(isWaiterRole("garson")).toBe(true);
    expect(isWaiterRole("cashier")).toBe(false);
  });

  it("waiter oturumunu backend rolunden belirler", () => {
    const session: PosAuthSession = {
      accessToken: "token",
      refreshToken: "refresh",
      user: {
        id: "u1",
        fullName: "Garson",
        email: "waiter@test.local",
        tenantId: "t1",
        defaultBranchId: "b1",
        branchIds: ["b1"],
        role: "waiter",
        permissions: ["ticket.view", "ticket.manage"],
      },
    };
    expect(isWaiterSession(session)).toBe(true);
  });

  it("localStorage role manipulasyonu /auth/me ile duzeltilir", () => {
    const session: PosAuthSession = {
      accessToken: "token",
      refreshToken: "refresh",
      user: {
        id: "u1",
        fullName: "Garson",
        email: "waiter@test.local",
        tenantId: "t1",
        defaultBranchId: "b1",
        branchIds: ["b1"],
        role: "cashier",
        permissions: ["payment.manage"],
      },
    };
    const synced = mergeSessionUserFromMe(session, {
      id: "u1",
      role: "waiter",
      permissions: ["table.view", "ticket.view", "ticket.manage"],
      branchIds: ["b1"],
    });
    expect(synced.user.role).toBe("waiter");
    expect(synced.user.permissions).not.toContain("payment.manage");
    expect(isWaiterSession(synced)).toBe(true);
  });

  it("waiter default permissionlarinda odeme ve masa tasima yok", () => {
    const permissions = mergeEffectivePermissions(["waiter"], []);
    expect(permissions).toContain("ticket.manage");
    expect(permissions).not.toContain("payment.manage");
    expect(permissions).not.toContain("table.transfer");
    expect(permissions).not.toContain("table.merge");
  });

  it("canonical roleMatrix waiter izinleri config ile uyumlu", () => {
    expect(roleMatrix.waiter).toEqual(expect.arrayContaining(["ticket.view", "ticket.manage"]));
    expect(roleMatrix.waiter).not.toContain("payment.manage");
    expect(roleMatrix.waiter).not.toContain("table.transfer");
  });
});
