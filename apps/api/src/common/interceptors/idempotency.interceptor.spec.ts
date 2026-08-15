import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { of, throwError as rxThrowError } from "rxjs";
import { describe, expect, it } from "vitest";
import { IdempotencyInterceptor } from "./idempotency.interceptor";

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe("IdempotencyInterceptor", () => {
  it("hata alan istekte processing kaydini temizler", async () => {
    const interceptor = new IdempotencyInterceptor();
    const request = {
      method: "POST",
      url: "/pos/payments",
      idempotencyKey: "same-key",
    };

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
  });

  it("cache anahtarini method ve url ile scope eder", async () => {
    const interceptor = new IdempotencyInterceptor();
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
  });
});
