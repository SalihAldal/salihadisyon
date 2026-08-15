import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { CreateBranchDto } from "./dto/create-branch.dto";
import { UpdateBranchDto } from "./dto/update-branch.dto";

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(companyId: string | undefined, actor: AuthenticatedUser) {
    const resolvedCompanyId = actor.role === "super_admin" ? companyId : actor.tenantId;
    return this.prisma.branch.findMany({
      where: resolvedCompanyId ? { companyId: resolvedCompanyId } : undefined,
      orderBy: [{ companyId: "asc" }, { name: "asc" }],
      include: {
        company: true,
      },
    });
  }

  async detail(id: string, actor: AuthenticatedUser) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        company: true,
      },
    });

    if (!branch) {
      throw new NotFoundException("Sube bulunamadi.");
    }

    if (actor.role !== "super_admin" && branch.companyId !== actor.tenantId) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }

    return branch;
  }

  async create(dto: CreateBranchDto, actor: AuthenticatedUser) {
    const companyId = actor.role === "super_admin" ? dto.companyId : actor.tenantId;
    const branch = await this.prisma.branch.create({
      data: {
        companyId,
        name: dto.name,
        code: dto.code,
        city: dto.city ?? null,
        district: dto.district ?? null,
        addressLine: dto.addressLine ?? null,
        phone: dto.phone ?? null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditLogService.create({
      companyId,
      branchId: branch.id,
      module: "branches",
      action: "create",
      entityType: "branch",
      entityId: branch.id,
      payload: dto,
    });

    return branch;
  }

  async update(id: string, dto: UpdateBranchDto, actor: AuthenticatedUser) {
    const existing = await this.detail(id, actor);
    const branch = await this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        city: dto.city,
        district: dto.district,
        addressLine: dto.addressLine,
        phone: dto.phone,
        isActive: dto.isActive,
      },
    });

    await this.auditLogService.create({
      companyId: existing.companyId,
      branchId: branch.id,
      module: "branches",
      action: "update",
      entityType: "branch",
      entityId: branch.id,
      payload: dto,
    });

    return branch;
  }
}
