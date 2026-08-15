import { Injectable } from "@nestjs/common";

type RequestBucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RequestRateLimitService {
  private readonly buckets = new Map<string, RequestBucket>();

  consume(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return {
        allowed: true,
        retryAfterMs: 0,
      };
    }

    current.count += 1;
    if (current.count > limit) {
      return {
        allowed: false,
        retryAfterMs: current.resetAt - now,
      };
    }

    return {
      allowed: true,
      retryAfterMs: 0,
    };
  }
}
