import type {
  BasePosProviderInterface,
  PosProviderTestResult,
  PosProviderTransactionPayload,
  PosProviderTransactionResult,
} from "./base-pos-provider";

function randomRef(prefix: string) {
  return `${prefix}-${Math.floor(Math.random() * 900000 + 100000)}`;
}

export class MockPosProvider implements BasePosProviderInterface {
  async connect(config: Record<string, unknown>): Promise<PosProviderTestResult> {
    return this.test(config);
  }

  async disconnect(): Promise<PosProviderTestResult> {
    return { success: true, message: "Baglanti kapatildi.", deviceStatus: "offline" };
  }

  async test(config: Record<string, unknown>): Promise<PosProviderTestResult> {
    const ip = String(config.ipAddress ?? "");
    const forcedError = String(config.mockMode ?? "") === "error";
    if (forcedError || ip.includes("0.0.0.0")) {
      return {
        success: false,
        message: "Cihaza baglanilamadi.",
        deviceStatus: "error",
        payload: { reason: "mock_connection_error" },
      };
    }
    return {
      success: true,
      message: "Cihaz baglanti testi basarili.",
      deviceStatus: "online",
      payload: { latencyMs: 42 },
    };
  }

  async sale(config: Record<string, unknown>, payload: PosProviderTransactionPayload): Promise<PosProviderTransactionResult> {
    return this.simulatePaymentResult(config, payload, "sale");
  }

  async refund(config: Record<string, unknown>, payload: PosProviderTransactionPayload): Promise<PosProviderTransactionResult> {
    return this.simulatePaymentResult(config, payload, "refund");
  }

  async cancel(_config: Record<string, unknown>, payload: { referenceNo?: string }): Promise<PosProviderTransactionResult> {
    return {
      success: true,
      status: "cancelled",
      providerMessage: "Islem iptal edildi.",
      referenceNo: payload.referenceNo ?? randomRef("CANCEL"),
      rawResponse: { status: "cancelled" },
    };
  }

  async status(config: Record<string, unknown>): Promise<PosProviderTestResult> {
    return this.test(config);
  }

  mapResponse(rawResponse: Record<string, unknown>): PosProviderTransactionResult {
    const status = String(rawResponse.status ?? "failed");
    return {
      success: status === "success",
      status: status === "timeout" ? "timeout" : status === "cancelled" ? "cancelled" : status === "success" ? "success" : "failed",
      providerMessage: String(rawResponse.message ?? "POS cevabi alindi."),
      responseCode: rawResponse.responseCode ? String(rawResponse.responseCode) : undefined,
      authCode: rawResponse.authCode ? String(rawResponse.authCode) : undefined,
      referenceNo: rawResponse.referenceNo ? String(rawResponse.referenceNo) : undefined,
      rrnNo: rawResponse.rrnNo ? String(rawResponse.rrnNo) : undefined,
      stanNo: rawResponse.stanNo ? String(rawResponse.stanNo) : undefined,
      batchNo: rawResponse.batchNo ? String(rawResponse.batchNo) : undefined,
      maskedCardNo: rawResponse.maskedCardNo ? String(rawResponse.maskedCardNo) : undefined,
      cardBrand: rawResponse.cardBrand ? String(rawResponse.cardBrand) : undefined,
      rawResponse,
    };
  }

  private async simulatePaymentResult(
    config: Record<string, unknown>,
    payload: PosProviderTransactionPayload,
    type: "sale" | "refund",
  ): Promise<PosProviderTransactionResult> {
    const mode = String(config.mockMode ?? "");
    if (mode === "timeout") {
      return {
        success: false,
        status: "timeout",
        providerMessage: "POS cihazi sure asimina ugradi.",
        rawResponse: { status: "timeout", type },
      };
    }
    if (mode === "fail" || payload.amount <= 0) {
      return {
        success: false,
        status: "failed",
        providerMessage: "Islem reddedildi.",
        responseCode: "51",
        rawResponse: { status: "failed", code: "51", type },
      };
    }
    return {
      success: true,
      status: "success",
      providerMessage: type === "sale" ? "Satis onaylandi." : "Iade onaylandi.",
      responseCode: "00",
      authCode: randomRef("AUTH"),
      referenceNo: randomRef("REF"),
      rrnNo: randomRef("RRN"),
      stanNo: randomRef("STAN"),
      batchNo: randomRef("BATCH"),
      maskedCardNo: "**** **** **** 1234",
      cardBrand: "VISA",
      rawResponse: { status: "success", code: "00", type },
    };
  }
}
