import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SCOPE_LEVEL_KEY } from "../decorators/permissions.decorator";
import type { AppRequest, ScopeLevel } from "../types/request-context";

@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AppRequest>();
    const user = request.user;
    const scopeLevel = this.reflector.getAllAndOverride<ScopeLevel>(SCOPE_LEVEL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? "tenant";

    if (!user?.tenantId) {
      throw new UnauthorizedException("Gecerli tenant baglami bulunamadi.");
    }

    request.scope = {
      tenantId: user.tenantId,
      branchIds: user.branchIds ?? [],
      role: user.role,
      permissions: user.permissions ?? [],
      scopeLevel,
    };

    if (scopeLevel === "branch" && request.scope.branchIds.length === 0) {
      throw new UnauthorizedException("Bu islem icin sube erisimi gerekli.");
    }

    return true;
  }
}
