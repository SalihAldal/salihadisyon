export interface PosProviderTestResult {
  success: boolean;
  message: string;
  deviceStatus: "online" | "offline" | "error" | "busy";
  payload?: Record<string, unknown>;
}

export interface PosProviderTransactionResult {
  success: boolean;
  status: "success" | "failed" | "timeout" | "cancelled";
  providerMessage: string;
  responseCode?: string;
  authCode?: string;
  referenceNo?: string;
  rrnNo?: string;
  stanNo?: string;
  batchNo?: string;
  maskedCardNo?: string;
  cardBrand?: string;
  rawResponse?: Record<string, unknown>;
}

export interface PosProviderTransactionPayload {
  amount: number;
  currency: string;
  installmentCount?: number;
  meta?: Record<string, unknown>;
}

export interface BasePosProviderInterface {
  connect(config: Record<string, unknown>): Promise<PosProviderTestResult>;
  disconnect(config: Record<string, unknown>): Promise<PosProviderTestResult>;
  test(config: Record<string, unknown>): Promise<PosProviderTestResult>;
  sale(config: Record<string, unknown>, payload: PosProviderTransactionPayload): Promise<PosProviderTransactionResult>;
  refund(config: Record<string, unknown>, payload: PosProviderTransactionPayload): Promise<PosProviderTransactionResult>;
  cancel(config: Record<string, unknown>, payload: { referenceNo?: string }): Promise<PosProviderTransactionResult>;
  status(config: Record<string, unknown>): Promise<PosProviderTestResult>;
  mapResponse(rawResponse: Record<string, unknown>): PosProviderTransactionResult;
}
