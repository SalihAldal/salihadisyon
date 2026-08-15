import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { hasAllPermissions } from "@adisyon/config";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import type { AppRequest } from "../types/request-context";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AppRequest>();
    const user = {
      role: request.user?.role,
      permissions: request.user?.permissions ?? [],
    };
    const missingPermissions = requiredPermissions.filter((permission) => !hasAllPermissions(user, [permission]));

    if (missingPermissions.length > 0) {
      throw new ForbiddenException({
        message: "Bu islem icin yetkiniz yok.",
        missingPermissions,
      });
    }

    return true;
  }
}
