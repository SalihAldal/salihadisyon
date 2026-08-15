import { describe, expect, it } from "vitest";
import { MockPosProvider } from "./mock-pos-provider";

describe("MockPosProvider", () => {
  const provider = new MockPosProvider();

  it("test baglantisini basarili doner", async () => {
    const result = await provider.test({ ipAddress: "192.168.1.10", mockMode: "success" });
    expect(result.success).toBe(true);
    expect(result.deviceStatus).toBe("online");
  });

  it("sale timeout modunda timeout doner", async () => {
    const result = await provider.sale({ mockMode: "timeout" }, { amount: 100, currency: "TRY" });
    expect(result.success).toBe(false);
    expect(result.status).toBe("timeout");
  });

  it("sale fail modunda failed doner", async () => {
    const result = await provider.sale({ mockMode: "fail" }, { amount: 100, currency: "TRY" });
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
  });

  it("sale success modunda success doner", async () => {
    const result = await provider.sale({ mockMode: "success" }, { amount: 100, currency: "TRY" });
    expect(result.success).toBe(true);
    expect(result.status).toBe("success");
    expect(result.responseCode).toBe("00");
  });
});
