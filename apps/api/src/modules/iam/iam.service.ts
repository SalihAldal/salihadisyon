import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";

@Injectable()
export class IamService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(companyId: string | undefined, actor: AuthenticatedUser) {
    const resolvedCompanyId = actor.role === "super_admin" ? companyId : actor.tenantId;
    const users = await this.prisma.user.findMany({
      where: resolvedCompanyId ? { companyId: resolvedCompanyId } : { companyId: actor.tenantId },
      include: {
        defaultBranch: true,
        roles: {
          include: {
            role: true,
            branch: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return users.map((user) => ({
      id: user.id,
      companyId: user.companyId,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      defaultBranchId: user.defaultBranchId,
      lastLoginAt: user.lastLoginAt,
      defaultBranch: user.defaultBranch,
      roles: user.roles.map((roleLink) => ({
        id: roleLink.id,
        branchId: roleLink.branchId,
        branch: roleLink.branch,
        role: {
          id: roleLink.role.id,
          key: roleLink.role.key,
          name: roleLink.role.name,
          description: roleLink.role.description,
        },
      })),
    }));
  }

  async listRoles(companyId: string | undefined, actor: AuthenticatedUser) {
    const resolvedCompanyId = actor.role === "super_admin" ? companyId : actor.tenantId;
    return this.prisma.role.findMany({
      where: resolvedCompanyId ? { companyId: resolvedCompanyId } : { companyId: actor.tenantId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: "asc" }, { action: "asc" }],
    });
  }
}
