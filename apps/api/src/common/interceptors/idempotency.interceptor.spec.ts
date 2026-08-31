import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { of, throwError as rxThrowError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import type { IdempotencyStoreService } from "../idempotency/idempotency-store.service";

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe("IdempotencyInterceptor", () => {
  let store: IdempotencyStoreService;

  beforeEach(() => {
    store = {
      acquire: vi.fn(),
      complete: vi.fn(),
      release: vi.fn(),
      lookup: vi.fn(),
      processingConflict: vi.fn(() => new Error("processing")),
    } as unknown as IdempotencyStoreService;
  });

  it("hata alan istekte processing kaydini temizler", async () => {
    const interceptor = new IdempotencyInterceptor(store);
    const request = {
      method: "POST",
      url: "/pos/payments",
      idempotencyKey: "same-key",
    };

    vi.mocked(store.acquire)
      .mockResolvedValueOnce({ kind: "acquired" })
      .mockResolvedValueOnce({ kind: "acquired" });
    vi.mocked(store.release).mockResolvedValue(undefined);
    vi.mocked(store.complete).mockResolvedValue(undefined);

    const firstResult = await new Promise<unknown>((resolve) => {
      interceptor
        .intercept(createContext(request), {
          handle: () => rxThrowError(() => new Error("boom")),
        } as CallHandler)
        .subscribe({
          next: resolve,
          error: (error) => resolve(error),
        });
    });

    const secondResult = await new Promise<unknown>((resolve, reject) => {
      interceptor
        .intercept(createContext(request), {
          handle: () => of({ ok: true }),
        } as CallHandler)
        .subscribe({
          next: resolve,
          error: reject,
        });
    });

    expect(firstResult).toBeInstanceOf(Error);
    expect(secondResult).toEqual({ ok: true });
    expect(store.release).toHaveBeenCalled();
  });

  it("cache anahtarini method ve url ile scope eder", async () => {
    const interceptor = new IdempotencyInterceptor(store);
    const postRequest = {
      method: "POST",
      url: "/pos/payments",
      idempotencyKey: "shared-key",
    };
    const refundRequest = {
      method: "POST",
      url: "/pos/refunds",
      idempotencyKey: "shared-key",
    };

    vi.mocked(store.acquire).mockResolvedValue({ kind: "acquired" });
    vi.mocked(store.complete).mockResolvedValue(undefined);

    await new Promise<void>((resolve, reject) => {
      interceptor
        .intercept(createContext(postRequest), {
          handle: () => of({ action: "payment" }),
        } as CallHandler)
        .subscribe({
          next: () => undefined,
          complete: resolve,
          error: reject,
        });
    });

    const refundResult = await new Promise<unknown>((resolve, reject) => {
      interceptor
        .intercept(createContext(refundRequest), {
          handle: () => of({ action: "refund" }),
        } as CallHandler)
        .subscribe({
          next: resolve,
          error: reject,
        });
    });

    expect(refundResult).toEqual({ action: "refund" });
    expect(store.acquire).toHaveBeenCalledTimes(2);
  });
});
