import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { SubscriptionUsageService } from "../subscriptions/subscription-usage.service";

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly usageService: SubscriptionUsageService,
  ) {}

  async getMeta(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "support.view");
    const branches = await this.prisma.branch.findMany({ where: { id: { in: actor.branchIds } }, orderBy: { name: "asc" } });
    return {
      branches: branches.map((branch) => ({ id: branch.id, name: branch.name })),
      statuses: ["open", "in_progress", "resolved", "closed"],
      priorities: ["low", "medium", "high", "urgent"],
      categories: ["teknik", "odeme", "entegrasyon", "egitim", "diger"],
    };
  }

  async listTickets(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "support.view");
    const tickets = await this.prisma.supportTicket.findMany({
      where: {
        companyId: actor.tenantId,
        OR: [{ branchId: null }, { branchId: { in: actor.branchIds } }],
      },
      include: { branch: true },
      orderBy: { updatedAt: "desc" },
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      branchName: ticket.branch?.name ?? "Genel",
      assigneeEmail: ticket.assigneeEmail,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      description: ticket.description,
      messagesJson: ticket.messagesJson,
      branchId: ticket.branchId,
    }));
  }

  async upsertTicket(id: string | null, data: Record<string, unknown>, actor: AuthenticatedUser) {
    this.ensurePermission(actor, id ? "support.manage" : "support.view");
    if (data.branchId && !actor.branchIds.includes(String(data.branchId))) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }

    const payload = {
      companyId: actor.tenantId,
      branchId: data.branchId ? String(data.branchId) : null,
      subject: String(data.subject ?? ""),
      category: String(data.category ?? "diger"),
      priority: String(data.priority ?? "medium"),
      status: String(data.status ?? "open"),
      description: String(data.description ?? ""),
      assigneeEmail: data.assigneeEmail ? String(data.assigneeEmail) : null,
      messagesJson: data.messagesJson ?? [],
      resolvedAt: data.status === "resolved" || data.status === "closed" ? new Date() : null,
    };

    if (id) {
      const current = await this.prisma.supportTicket.findUnique({ where: { id } });
      if (!current || current.companyId !== actor.tenantId) {
        throw new NotFoundException("Destek kaydi bulunamadi.");
      }
    }

    const ticket = id
      ? await this.prisma.supportTicket.update({ where: { id }, data: payload, include: { branch: true } })
      : await this.prisma.supportTicket.create({ data: payload, include: { branch: true } });

    if (!id) {
      await this.usageService.adjustUsageMetric(actor.tenantId, "support_tickets", 1, 100);
    }

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: ticket.branchId,
      userId: actor.userId,
      module: "support",
      action: id ? "ticket.update" : "ticket.create",
      entityType: "support_ticket",
      entityId: ticket.id,
      payload: data,
    });

    return ticket;
  }

  async deleteTicket(id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "support.manage");
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket || ticket.companyId !== actor.tenantId) throw new NotFoundException("Destek kaydi bulunamadi.");
    await this.prisma.supportTicket.delete({ where: { id } });
    await this.usageService.adjustUsageMetric(actor.tenantId, "support_tickets", -1, 100);
    return { success: true };
  }

  private ensurePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.permissions.includes(permission) && actor.role !== "super_admin") {
      throw new ForbiddenException("Bu modul icin yetkin yok.");
    }
  }
}
