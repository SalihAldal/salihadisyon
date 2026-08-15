import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { apiRuntimeConfig, mergeEffectivePermissions, resolvePrimaryRole } from "@adisyon/config";
import { PrismaService } from "../database/prisma.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AppRequest } from "../types/request-context";

@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AppRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Bearer token gerekli.");
    }

    const token = authorization.replace("Bearer ", "").trim();

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: apiRuntimeConfig.jwtAccessSecret,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          company: { include: { branches: { select: { id: true } } } },
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!user || !user.isActive || user.companyId !== payload.tenantId) {
        throw new UnauthorizedException("Kullanici oturumu gecersiz.");
      }

      const linkedInactiveEmployee = await this.prisma.employeeProfile.findFirst({
        where: {
          userId: user.id,
          companyId: user.companyId,
          isActive: false,
        },
        select: { id: true },
      });
      if (linkedInactiveEmployee) {
        throw new UnauthorizedException("Personel hesabi pasif durumda.");
      }

      const branchIds = [
        ...new Set(
          user.roles
            .map((roleLink) => roleLink.branchId)
            .filter((branchId): branchId is string => Boolean(branchId))
            .concat(user.defaultBranchId ? [user.defaultBranchId] : []),
        ),
      ];

      const roleKeys = [...new Set(user.roles.map((roleLink) => roleLink.role.key))];
      const primaryRoleKey = roleKeys.length > 0 ? resolvePrimaryRole(roleKeys) : payload.role;
      const permissions =
        roleKeys.length > 0
          ? mergeEffectivePermissions(
              roleKeys,
              [...new Set(user.roles.flatMap((roleLink) => roleLink.role.permissions.map((item) => item.permission.key)))],
            )
          : (payload.permissions ?? []);

      request.user = {
        userId: user.id,
        tenantId: user.companyId,
        branchIds,
        role: primaryRoleKey,
        permissions,
        terminalId: payload.terminalId ?? null,
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        deviceInfo:
          request.headers["x-device-label"]?.toString() ??
          request.headers["user-agent"]?.toString() ??
          payload.terminalId ??
          null,
      };

      return true;
    } catch {
      throw new UnauthorizedException("Token gecersiz veya suresi dolmus.");
    }
  }
}
