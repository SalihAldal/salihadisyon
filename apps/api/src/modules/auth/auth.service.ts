import { randomUUID } from "crypto";
import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { apiRuntimeConfig, mergeEffectivePermissions, resolvePrimaryRole } from "@adisyon/config";
import { compare, hash } from "bcryptjs";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { AppTooManyRequestsException } from "../../common/errors/app-error";
import type { AppRequest } from "../../common/types/request-context";
import { sanitizeTextInput } from "../../common/security/sanitize";
import { SecurityRateLimitService } from "../../common/security/security-rate-limit.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";

interface AuthPayload {
  sub: string;
  tenantId: string;
  branchIds: string[];
  role: string;
  permissions: string[];
  terminalId?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
    private readonly securityRateLimitService: SecurityRateLimitService,
  ) {}

  async login(dto: LoginDto, request?: AppRequest) {
    if (dto.pinCode) {
      return this.loginWithPin(dto, request);
    }
    const normalizedEmail = sanitizeTextInput(dto.email.toLowerCase());
    const deviceLabel = dto.deviceLabel ? sanitizeTextInput(dto.deviceLabel) : "web-admin";
    const clientIp = request?.ip ?? request?.headers["x-forwarded-for"]?.toString() ?? "unknown";
    const ipBucket = this.securityRateLimitService.check(`auth:login:ip:${clientIp}`, 12, 15 * 60_000, 20 * 60_000);
    if (!ipBucket.allowed) {
      throw new AppTooManyRequestsException("Cok fazla giris denemesi yapildi. Bir sure bekleyip tekrar deneyin.");
    }
    const emailBucket = this.securityRateLimitService.check(`auth:login:email:${normalizedEmail}`, 6, 15 * 60_000, 30 * 60_000);
    if (!emailBucket.allowed) {
      throw new AppTooManyRequestsException("Bu hesap icin gecici giris kilidi aktif. Bir sure sonra tekrar deneyin.");
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        company: {
          include: {
            branches: {
              select: {
                id: true,
              },
            },
          },
        },
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
            branch: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Gecersiz giris bilgileri.");
    }
    const linkedInactiveEmployee = await this.prisma.employeeProfile.findFirst({
      where: {
        userId: user?.id,
        companyId: user?.companyId,
        isActive: false,
      },
      select: { id: true },
    });
    const activeEmployeeProfile = await this.prisma.employeeProfile.findFirst({
      where: {
        userId: user?.id,
        companyId: user?.companyId,
        isActive: true,
      },
      include: {
        staffRole: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
    if (linkedInactiveEmployee) {
      throw new UnauthorizedException("Personel hesabi pasif durumda.");
    }
    if (!user.company) {
      throw new UnauthorizedException("Kullanici sirket kaydi bulunamadi.");
    }

    if (!user.passwordHash || typeof user.passwordHash !== "string") {
      throw new UnauthorizedException("Gecersiz giris bilgileri.");
    }

    const passwordMatches = await compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Gecersiz giris bilgileri.");
    }
    this.securityRateLimitService.reset(`auth:login:email:${normalizedEmail}`);


    const roleContext = this.resolveRoleContext(user, activeEmployeeProfile ?? undefined);
    const branchIds = roleContext.branchIds;
    const roleKeys = roleContext.roleKeys;
    const primaryRoleKey = roleContext.primaryRoleKey;
    const permissions = roleContext.permissions;

    const payload: AuthPayload = {
      sub: user.id,
      tenantId: user.companyId,
      branchIds,
      role: primaryRoleKey,
      permissions,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: apiRuntimeConfig.jwtAccessSecret,
      expiresIn: apiRuntimeConfig.jwtAccessTtl as never,
    });

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        tenantId: user.companyId,
        sid: randomUUID(),
      },
      {
        secret: apiRuntimeConfig.jwtRefreshSecret,
        expiresIn: apiRuntimeConfig.jwtRefreshTtl as never,
      },
    );

    const refreshTokenHash = await hash(refreshToken, 10);
    const decodedRefresh = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const expiry = decodedRefresh?.exp
      ? new Date(decodedRefresh.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.cleanupRefreshSessions(user.companyId, user.id);

    try {
      await this.prisma.refreshTokenSession.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          deviceLabel,
          refreshTokenHash,
          userAgent: request?.headers["user-agent"]?.toString() ?? null,
          ipAddress: request?.ip ?? null,
          expiresAt: expiry,
        },
      });
    } catch (error) {
      this.logger.warn(`Refresh session kaydi yazilamadi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    }

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`Son login tarihi guncellenemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    }

    await this.auditLogService.create({
      companyId: user.companyId,
      branchId: user.defaultBranchId ?? null,
      userId: user.id,
      module: "auth",
      action: "login",
      entityType: "user",
      entityId: user.id,
      payload: { email: user.email, deviceLabel },
      oldValues: null,
      newValues: {
        email: user.email,
        role: primaryRoleKey,
        permissions,
        branchIds,
        lastLoginAt: new Date(),
        deviceLabel,
      },
      ipAddress: request?.ip ?? null,
      userAgent: request?.headers["user-agent"]?.toString() ?? null,
      deviceInfo: deviceLabel || request?.headers["user-agent"]?.toString() || "web-admin",
    });

    return {
      accessToken,
      refreshToken,
      user: this.serializeSessionUser({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        companyId: user.companyId,
        defaultBranchId: user.defaultBranchId,
        role: primaryRoleKey,
        permissions,
        branchIds,
      }),
    };
  }

  private async loginWithPin(dto: LoginDto, request?: AppRequest) {
    const normalizedPinCode = sanitizeTextInput(dto.pinCode ?? "");
    if (!/^\d{4}$/.test(normalizedPinCode)) {
      throw new UnauthorizedException("Pin kodu gecersiz.");
    }
    const deviceLabel = dto.deviceLabel ? sanitizeTextInput(dto.deviceLabel) : "pos-web";
    const clientIp = request?.ip ?? request?.headers["x-forwarded-for"]?.toString() ?? "unknown";
    const pinBucket = this.securityRateLimitService.check(`auth:login:pin:${normalizedPinCode}:${clientIp}`, 8, 10 * 60_000, 15 * 60_000);
    if (!pinBucket.allowed) {
      throw new AppTooManyRequestsException("Cok fazla pin denemesi yapildi. Bir sure bekleyip tekrar deneyin.");
    }

    const employee = await this.prisma.employeeProfile.findFirst({
      where: {
        pinCodeEnc: Buffer.from(normalizedPinCode, "utf8").toString("base64"),
        isActive: true,
      },
      include: {
        staffRole: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        user: {
          include: {
            company: {
              include: {
                branches: {
                  select: {
                    id: true,
                  },
                },
              },
            },
            roles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: { permission: true },
                    },
                  },
                },
                branch: true,
              },
            },
          },
        },
        branch: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const user = employee?.user;
    if (!employee || !user || !user.isActive || !user.company) {
      throw new UnauthorizedException("Pin kodu gecersiz.");
    }
    const roleContext = this.resolveRoleContext(user, employee ?? undefined);
    const branchIds = roleContext.branchIds;
    const roleKeys = roleContext.roleKeys;
    const primaryRoleKey = roleContext.primaryRoleKey;
    const permissions = roleContext.permissions;

    const payload: AuthPayload = {
      sub: user.id,
      tenantId: user.companyId,
      branchIds,
      role: primaryRoleKey,
      permissions,
      terminalId: request?.headers["x-terminal-id"]?.toString() ?? null,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: apiRuntimeConfig.jwtAccessSecret,
      expiresIn: apiRuntimeConfig.jwtAccessTtl as never,
    });

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        tenantId: user.companyId,
        sid: randomUUID(),
      },
      {
        secret: apiRuntimeConfig.jwtRefreshSecret,
        expiresIn: apiRuntimeConfig.jwtRefreshTtl as never,
      },
    );

    const refreshTokenHash = await hash(refreshToken, 10);
    const decodedRefresh = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const expiry = decodedRefresh?.exp
      ? new Date(decodedRefresh.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.cleanupRefreshSessions(user.companyId, user.id);
    await this.prisma.refreshTokenSession.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        deviceLabel,
        refreshTokenHash,
        userAgent: request?.headers["user-agent"]?.toString() ?? null,
        ipAddress: request?.ip ?? null,
        expiresAt: expiry,
      },
    });

    await this.auditLogService.create({
      companyId: user.companyId,
      branchId: employee.branchId ?? user.defaultBranchId ?? null,
      userId: user.id,
      module: "auth",
      action: "login.pin",
      entityType: "user",
      entityId: user.id,
      payload: { employeeId: employee.id, branchId: employee.branchId, deviceLabel },
      oldValues: null,
      newValues: {
        role: primaryRoleKey,
        permissions,
        branchIds,
        deviceLabel,
      },
      ipAddress: request?.ip ?? null,
      userAgent: request?.headers["user-agent"]?.toString() ?? null,
      deviceInfo: deviceLabel,
    });

    return {
      accessToken,
      refreshToken,
      user: this.serializeSessionUser({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        companyId: user.companyId,
        defaultBranchId: employee.branchId ?? user.defaultBranchId,
        role: primaryRoleKey,
        permissions,
        branchIds,
      }),
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const sanitizedRefreshToken = sanitizeTextInput(dto.refreshToken);
    const refreshHashSeed = sanitizedRefreshToken.slice(-32);
    const refreshBucket = this.securityRateLimitService.check(`auth:refresh:${refreshHashSeed}`, 20, 10 * 60_000, 10 * 60_000);
    if (!refreshBucket.allowed) {
      throw new AppTooManyRequestsException("Cok fazla refresh istegi yapildi. Bir sure sonra tekrar deneyin.");
    }

    let payload: { sub: string; tenantId: string };

    try {
      payload = await this.jwtService.verifyAsync(sanitizedRefreshToken, {
        secret: apiRuntimeConfig.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException("Refresh token gecersiz.");
    }

    const sessions = await this.prisma.refreshTokenSession.findMany({
      where: {
        companyId: payload.tenantId,
        userId: payload.sub,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const matchingSession = await this.findMatchingRefreshSession(sanitizedRefreshToken, sessions);
    if (!matchingSession) {
      throw new UnauthorizedException("Aktif oturum bulunamadi.");
    }
    await this.cleanupRefreshSessions(payload.tenantId, payload.sub);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        company: {
          include: {
            branches: {
              select: {
                id: true,
              },
            },
          },
        },
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

    if (!user) {
      throw new UnauthorizedException("Kullanici bulunamadi.");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Kullanici pasif durumda.");
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

    const roleKeys = [...new Set(user.roles.map((roleLink) => roleLink.role.key))];
    const primaryRoleKey = resolvePrimaryRole(roleKeys);
    const permissions = mergeEffectivePermissions(
      roleKeys,
      [...new Set(user.roles.flatMap((roleLink) => roleLink.role.permissions.map((item) => item.permission.key)))],
    );
    const branchIds = this.resolveBranchIds(
      user.roles.map((roleLink) => roleLink.branchId),
      user.company.branches.map((branch) => branch.id),
    );

    const nextAccessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        tenantId: user.companyId,
        branchIds,
        role: primaryRoleKey,
        permissions,
      },
      {
        secret: apiRuntimeConfig.jwtAccessSecret,
        expiresIn: apiRuntimeConfig.jwtAccessTtl as never,
      },
    );

    return {
      accessToken: nextAccessToken,
      user: this.serializeSessionUser({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        companyId: user.companyId,
        defaultBranchId: user.defaultBranchId,
        role: primaryRoleKey,
        permissions,
        branchIds,
      }),
    };
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; tenantId: string }>(refreshToken, {
        secret: apiRuntimeConfig.jwtRefreshSecret,
      });

      const sessions = await this.prisma.refreshTokenSession.findMany({
        where: {
          companyId: payload.tenantId,
          userId: payload.sub,
          revokedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      const matchingSession = await this.findMatchingRefreshSession(refreshToken, sessions);
      if (!matchingSession) {
        return { success: true };
      }

      await this.prisma.refreshTokenSession.update({
        where: { id: matchingSession.id },
        data: { revokedAt: new Date() },
      });

      return { success: true };
    } catch {
      return { success: true };
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          include: {
            branches: {
              select: {
                id: true,
              },
            },
          },
        },
        defaultBranch: true,
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
            branch: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Kullanici bulunamadi.");
    }

    const roleKeys = [...new Set(user.roles.map((roleLink) => roleLink.role.key))];
    const primaryRoleKey = resolvePrimaryRole(roleKeys);
    const permissions = mergeEffectivePermissions(
      roleKeys,
      [...new Set(user.roles.flatMap((roleLink) => roleLink.role.permissions.map((item) => item.permission.key)))],
    );
    const branchIds = this.resolveBranchIds(
      user.roles.map((roleLink) => roleLink.branchId),
      user.company.branches.map((branch) => branch.id),
    );

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      tenant: {
        id: user.company.id,
        name: user.company.name,
        subscriptionState: user.company.subscriptionState,
      },
      defaultBranch: user.defaultBranch,
      role: primaryRoleKey,
      permissions,
      branchIds: branchIds.length > 0 ? branchIds : user.defaultBranchId ? [user.defaultBranchId] : [],
      roleAssignments: user.roles.map((roleLink) => ({
        id: roleLink.id,
        branchId: roleLink.branchId,
        branchName: roleLink.branch?.name ?? null,
        role: {
          key: roleLink.role.key,
          name: roleLink.role.name,
        },
      })),
    };
  }

  private async findMatchingRefreshSession(
    rawToken: string,
    sessions: Array<{ id: string; refreshTokenHash: string; expiresAt: Date }>,
  ) {
    for (const session of sessions) {
      if (session.expiresAt < new Date()) {
        continue;
      }

      const matches = await compare(rawToken, session.refreshTokenHash);
      if (matches) {
        return session;
      }
    }

    return null;
  }

  private resolveBranchIds(roleBranchIds: Array<string | null | undefined>, fallbackBranchIds: string[]) {
    const scopedBranchIds = [...new Set(roleBranchIds.filter(Boolean))] as string[];
    if (scopedBranchIds.length > 0) {
      return scopedBranchIds;
    }

    return [...new Set(fallbackBranchIds)];
  }

  private resolveRoleContext(
    user: {
      roles: Array<{
        branchId?: string | null;
        role: {
          key: string;
          permissions: Array<{ permission: { key: string } }>;
        };
      }>;
      company?: { branches: Array<{ id: string }> } | null;
      defaultBranchId?: string | null;
    },
    employeeProfile?: {
      branchId?: string | null;
      restaurantRole?: string | null;
      staffRole?: { key: string; permissions: Array<{ permission: { key: string } }> } | null;
    },
  ) {
    const roleLinks = user.roles ?? [];
    const roleBranchIds = roleLinks.map((roleLink) => roleLink.branchId ?? null);
    const fallbackBranchIds = [
      ...(user.company?.branches ?? []).map((branch) => branch.id),
      ...(user.defaultBranchId ? [user.defaultBranchId] : []),
      ...(employeeProfile?.branchId ? [employeeProfile.branchId] : []),
    ];

    if (roleLinks.length > 0) {
      const roleKeys = [...new Set(roleLinks.map((roleLink) => roleLink.role.key))];
      const primaryRoleKey = resolvePrimaryRole(roleKeys);
      const explicitPermissions = [
        ...new Set(roleLinks.flatMap((roleLink) => roleLink.role.permissions.map((item) => item.permission.key))),
      ];
      return {
        roleKeys,
        primaryRoleKey,
        permissions: mergeEffectivePermissions(roleKeys, explicitPermissions),
        branchIds: this.resolveBranchIds(roleBranchIds, fallbackBranchIds),
      };
    }

    const staffRoleKey = employeeProfile?.staffRole?.key?.trim();
    const restaurantRoleKey = employeeProfile?.restaurantRole?.trim().toLowerCase();
    const roleKeyMap: Record<string, string> = {
      garson: "waiter",
      waiter: "waiter",
      kasiyer: "cashier",
      cashier: "cashier",
    };
    const fallbackRoleKey =
      staffRoleKey ||
      (restaurantRoleKey ? roleKeyMap[restaurantRoleKey] : undefined) ||
      (employeeProfile ? "waiter" : undefined);

    if (!fallbackRoleKey) {
      throw new BadRequestException("Kullaniciya atanmis rol bulunamadi.");
    }

    const fallbackPermissions =
      employeeProfile?.staffRole?.permissions?.map((item) => item.permission.key) ?? [];
    const roleKeys = [fallbackRoleKey];
    return {
      roleKeys,
      primaryRoleKey: fallbackRoleKey,
      permissions: mergeEffectivePermissions(roleKeys, fallbackPermissions),
      branchIds: this.resolveBranchIds([employeeProfile?.branchId ?? null], fallbackBranchIds),
    };
  }

  private async cleanupRefreshSessions(companyId: string, userId: string) {
    const now = new Date();
    try {
      await this.prisma.refreshTokenSession.deleteMany({
        where: {
          companyId,
          userId,
          OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: now } }],
        },
      });
    } catch (error) {
      this.logger.warn(
        `Refresh session temizligi yapilamadi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
      );
    }
  }

  private serializeSessionUser(input: {
    id: string;
    fullName: string;
    email: string;
    companyId: string;
    defaultBranchId?: string | null;
    role: string;
    permissions: string[];
    branchIds: string[];
  }) {
    return {
      id: input.id,
      fullName: input.fullName,
      email: input.email,
      tenantId: input.companyId,
      defaultBranchId: input.defaultBranchId ?? null,
      role: input.role,
      permissions: input.permissions,
      branchIds: input.branchIds,
    };
  }
}
