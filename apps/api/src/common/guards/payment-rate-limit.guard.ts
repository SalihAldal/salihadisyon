import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AppTooManyRequestsException } from "../errors/app-error";
import type { AppRequest } from "../types/request-context";
import { SecurityRateLimitService } from "../security/security-rate-limit.service";

@Injectable()
export class PaymentRateLimitGuard implements CanActivate {
  constructor(private readonly securityRateLimitService: SecurityRateLimitService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const actor = request.user;
    const ip = request.ip || request.headers["x-forwarded-for"]?.toString() || "unknown";
    const ticketId = request.params?.ticketId ?? request.body?.ticketId ?? "unknown";
    const userKey = actor?.userId ?? "anonymous";

    const actorBucket = this.securityRateLimitService.check(`payment:user:${userKey}`, 20, 5 * 60_000, 10 * 60_000);
    if (!actorBucket.allowed) {
      throw new AppTooManyRequestsException("Kisa surede cok fazla odeme denemesi yapildi.");
    }

    const ticketBucket = this.securityRateLimitService.check(`payment:ticket:${ticketId}`, 8, 2 * 60_000, 5 * 60_000);
    if (!ticketBucket.allowed) {
      throw new AppTooManyRequestsException("Bu adisyon icin odeme deneme limiti asildi.");
    }

    const ipBucket = this.securityRateLimitService.check(`payment:ip:${ip}`, 40, 5 * 60_000, 10 * 60_000);
    if (!ipBucket.allowed) {
      throw new AppTooManyRequestsException("Bu IP icin odeme istek limiti asildi.");
    }

    return true;
  }
}
