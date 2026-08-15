import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(actor: AuthenticatedUser) {
    const companies = await this.prisma.company.findMany({
      where: actor.role === "super_admin" ? undefined : { id: actor.tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        branches: true,
      },
    });

    return companies.map((company) => ({
      id: company.id,
      name: company.name,
      legalName: company.legalName,
      taxNumber: company.taxNumber,
      subscriptionState: company.subscriptionState,
      timezone: company.timezone,
      currency: company.currency,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      branches: company.branches,
    }));
  }

  async detail(id: string, actor: AuthenticatedUser) {
    if (actor.role !== "super_admin" && id !== actor.tenantId) {
      throw new ForbiddenException("Bu sirket icin yetkin yok.");
    }
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        branches: true,
        roles: true,
        users: true,
      },
    });

    if (!company) {
      throw new NotFoundException("Sirket bulunamadi.");
    }

    return {
      id: company.id,
      name: company.name,
      legalName: company.legalName,
      taxNumber: company.taxNumber,
      subscriptionState: company.subscriptionState,
      timezone: company.timezone,
      currency: company.currency,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      branches: company.branches,
      roles: company.roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
      })),
      users: company.users.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        defaultBranchId: user.defaultBranchId,
        lastLoginAt: user.lastLoginAt,
      })),
    };
  }

  async create(dto: CreateCompanyDto, actor: AuthenticatedUser) {
    if (actor.role !== "super_admin") {
      throw new ForbiddenException("Yeni sirket olusturma yetkin yok.");
    }
    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        legalName: dto.legalName ?? null,
        taxNumber: dto.taxNumber ?? null,
        timezone: dto.timezone ?? "Europe/Istanbul",
        currency: dto.currency ?? "TRY",
      },
    });

    await this.auditLogService.create({
      companyId: company.id,
      module: "companies",
      action: "create",
      entityType: "company",
      entityId: company.id,
      payload: dto,
    });

    return company;
  }

  async update(id: string, dto: UpdateCompanyDto, actor: AuthenticatedUser) {
    await this.detail(id, actor);
    const company = await this.prisma.company.update({
      where: { id },
      data: {
        name: dto.name,
        legalName: dto.legalName,
        taxNumber: dto.taxNumber,
        timezone: dto.timezone,
        currency: dto.currency,
      },
    });

    await this.auditLogService.create({
      companyId: company.id,
      module: "companies",
      action: "update",
      entityType: "company",
      entityId: company.id,
      payload: dto,
    });

    return company;
  }
}
