import test from "node:test";
import assert from "node:assert/strict";

test("bridge token auth shape", () => {
  const header = "Bearer dev-bridge-token";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  assert.equal(token, "dev-bridge-token");
});
