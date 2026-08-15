import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AppTooManyRequestsException } from "../errors/app-error";
import type { AppRequest } from "../types/request-context";
import { RequestRateLimitService } from "../security/request-rate-limit.service";

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestRateLimitService: RequestRateLimitService,
  ) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<AppRequest>();
    const ip = request.ip || request.headers["x-forwarded-for"]?.toString() || "unknown";
    const path = request.route?.path ?? request.url ?? "/";
    const method = request.method.toUpperCase();

    if (isPublic) {
      const result = this.requestRateLimitService.consume(`public:${ip}:${method}:${path}`, 30, 60_000);
      if (!result.allowed) {
        throw new AppTooManyRequestsException("Cok fazla istek gonderildi. Biraz sonra tekrar dene.");
      }
      return true;
    }

    const result = this.requestRateLimitService.consume(`api:${ip}:${method}`, 300, 60_000);
    if (!result.allowed) {
      throw new AppTooManyRequestsException("API istek limiti asildi. Biraz sonra tekrar dene.");
    }
    return true;
  }
}
