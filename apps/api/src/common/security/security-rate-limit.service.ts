import { Injectable } from "@nestjs/common";

type CounterState = {
  count: number;
  resetAt: number;
  blockedUntil?: number;
};

@Injectable()
export class SecurityRateLimitService {
  private readonly counters = new Map<string, CounterState>();

  check(key: string, limit: number, windowMs: number, blockMs = 0) {
    const now = Date.now();
    const current = this.counters.get(key);

    if (!current || current.resetAt <= now) {
      const next: CounterState = {
        count: 1,
        resetAt: now + windowMs,
      };
      this.counters.set(key, next);
      return {
        allowed: true,
        remaining: Math.max(limit - 1, 0),
        retryAfterMs: 0,
      };
    }

    if (current.blockedUntil && current.blockedUntil > now) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: current.blockedUntil - now,
      };
    }

    current.count += 1;
    if (current.count > limit) {
      current.blockedUntil = now + blockMs;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: current.blockedUntil - now,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(limit - current.count, 0),
      retryAfterMs: 0,
    };
  }

  reset(key: string) {
    this.counters.delete(key);
  }
}
