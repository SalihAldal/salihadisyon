import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TicketChannel } from "@prisma/client";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { SubscriptionUsageService } from "../subscriptions/subscription-usage.service";

const POS_LINK_PROVIDER_KEY = "pos-channel-link";
const POS_LINK_CHANNELS: TicketChannel[] = [TicketChannel.DELIVERY, TicketChannel.TAKEAWAY];

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly usageService: SubscriptionUsageService,
  ) {}

  async getOverview(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    const [providers, credentials, branches] = await Promise.all([
      this.prisma.integrationProvider.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
      this.prisma.integrationCredential.findMany({
        where: { branchId: { in: actor.branchIds } },
        include: { branch: true, provider: true },
        orderBy: { displayName: "asc" },
      }),
      this.prisma.branch.findMany({ where: { id: { in: actor.branchIds } }, orderBy: { name: "asc" } }),
    ]);

    return {
      cards: [
        { key: "providers", label: "Saglayici", value: providers.length },
        { key: "activeCredentials", label: "Aktif Baglanti", value: credentials.filter((item) => item.isActive).length },
        { key: "inactiveCredentials", label: "Pasif Baglanti", value: credentials.filter((item) => !item.isActive).length },
        { key: "coveredBranches", label: "Bagli Sube", value: new Set(credentials.map((item) => item.branchId)).size },
      ],
      providerOptions: providers.map((provider) => ({ id: provider.id, key: provider.key, name: provider.name, category: provider.category })),
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  async listProviders(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    return this.prisma.integrationProvider.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  }

  async listCredentials(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    const credentials = await this.prisma.integrationCredential.findMany({
      where: { branchId: { in: actor.branchIds } },
      include: { branch: true, provider: true },
      orderBy: { displayName: "asc" },
    });

    return credentials.map((credential) => ({
      id: credential.id,
      branchId: credential.branchId,
      branchName: credential.branch.name,
      providerId: credential.providerId,
      providerName: credential.provider.name,
      providerKey: credential.provider.key,
      displayName: credential.displayName,
      settings: this.decodePayload(credential.encryptedData),
      isActive: credential.isActive,
    }));
  }

  async createCredential(data: Record<string, unknown>, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const branchId = String(data.branchId ?? "");
    this.ensureBranchAccess(actor, branchId);
    const providerId = String(data.providerId ?? "");
    const settings = data.settings ?? {};
    if (!providerId || !branchId) throw new BadRequestException("Branch ve provider zorunlu.");

    const created = await this.prisma.integrationCredential.create({
      data: {
        branchId,
        providerId,
        displayName: String(data.displayName ?? "Yeni Entegrasyon"),
        encryptedData: this.encodePayload(settings),
        isActive: data.isActive !== false && data.isActive !== "false",
      },
      include: { branch: true, provider: true },
    });

    await this.usageService.adjustUsageMetric(actor.tenantId, "integration_credentials", 1, 25);
    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId,
      userId: actor.userId,
      module: "integrations",
      action: "credential.create",
      entityType: "integration_credential",
      entityId: created.id,
      payload: data,
    });

    return {
      id: created.id,
      displayName: created.displayName,
    };
  }

  async updateCredential(id: string, data: Record<string, unknown>, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const current = await this.prisma.integrationCredential.findUnique({ where: { id }, include: { branch: true } });
    if (!current) throw new NotFoundException("Entegrasyon bulunamadi.");
    this.ensureBranchAccess(actor, current.branchId);

    const updated = await this.prisma.integrationCredential.update({
      where: { id },
      data: {
        displayName: data.displayName ? String(data.displayName) : undefined,
        encryptedData: data.settings !== undefined ? this.encodePayload(data.settings) : undefined,
        isActive: data.isActive !== undefined ? data.isActive === true || data.isActive === "true" : undefined,
      },
    });

    return updated;
  }

  async deleteCredential(id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const current = await this.prisma.integrationCredential.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Entegrasyon bulunamadi.");
    this.ensureBranchAccess(actor, current.branchId);
    await this.prisma.integrationCredential.delete({ where: { id } });
    await this.usageService.adjustUsageMetric(actor.tenantId, "integration_credentials", -1, 25);
    return { success: true };
  }

  async getPosLinkMeta(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    const [branches, terminals, providers, credentials] = await Promise.all([
      this.prisma.branch.findMany({
        where: { id: { in: actor.branchIds } },
        orderBy: { name: "asc" },
      }),
      this.prisma.terminal.findMany({
        where: { branchId: { in: actor.branchIds } },
        include: { branch: true },
        orderBy: [{ branchId: "asc" }, { name: "asc" }],
      }),
      this.prisma.integrationProvider.findMany({
        where: { key: { not: POS_LINK_PROVIDER_KEY }, category: "marketplace" },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      this.prisma.integrationCredential.findMany({
        where: {
          branchId: { in: actor.branchIds },
          provider: { key: { not: POS_LINK_PROVIDER_KEY }, category: "marketplace" },
        },
        include: { provider: true, branch: true },
        orderBy: [{ branchId: "asc" }, { displayName: "asc" }],
      }),
    ]);

    return {
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
      terminalOptions: terminals.map((terminal) => ({
        id: terminal.id,
        branchId: terminal.branchId,
        branchName: terminal.branch.name,
        name: terminal.name,
        code: terminal.code,
      })),
      providerOptions: providers.map((provider) => ({ id: provider.id, key: provider.key, name: provider.name, category: provider.category })),
      integrationUserOptions: credentials.map((credential) => ({
        id: credential.id,
        branchId: credential.branchId,
        branchName: credential.branch.name,
        providerId: credential.providerId,
        providerName: credential.provider.name,
        displayName: credential.displayName,
        isActive: credential.isActive,
      })),
      channelOptions: POS_LINK_CHANNELS.map((channel) => ({
        value: channel,
        label: this.getTicketChannelLabel(channel),
      })),
    };
  }

  async listPosLinks(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    const provider = await this.prisma.integrationProvider.findUnique({ where: { key: POS_LINK_PROVIDER_KEY } });
    if (!provider) return [];

    const links = await this.prisma.integrationCredential.findMany({
      where: {
        providerId: provider.id,
        branchId: { in: actor.branchIds },
      },
      include: { branch: true },
      orderBy: [{ branchId: "asc" }, { displayName: "asc" }],
    });

    const settingsRows = links.map((item) => {
      const settings = this.decodePayload(item.encryptedData) as Record<string, unknown>;
      return {
        credentialId: item.id,
        branchId: item.branchId,
        settings,
      };
    });

    const linkedIntegrationIds = [...new Set(settingsRows.map((row) => String(row.settings.integrationCredentialId ?? "")).filter(Boolean))];
    const terminalIds = [...new Set(settingsRows.map((row) => String(row.settings.terminalId ?? "")).filter(Boolean))];

    const [linkedCredentials, terminals] = await Promise.all([
      linkedIntegrationIds.length
        ? this.prisma.integrationCredential.findMany({
            where: { id: { in: linkedIntegrationIds } },
            include: { provider: true },
          })
        : Promise.resolve([]),
      terminalIds.length
        ? this.prisma.terminal.findMany({
            where: { id: { in: terminalIds } },
          })
        : Promise.resolve([]),
    ]);

    const linkedCredentialMap = new Map(linkedCredentials.map((item) => [item.id, item]));
    const terminalMap = new Map(terminals.map((item) => [item.id, item]));

    return links.map((link) => {
      const settings = this.decodePayload(link.encryptedData) as Record<string, unknown>;
      const linkedCredentialId = String(settings.integrationCredentialId ?? "");
      const terminalId = String(settings.terminalId ?? "");
      const channel = String(settings.ticketChannel ?? "") as TicketChannel;
      const linkedCredential = linkedCredentialMap.get(linkedCredentialId);
      const terminal = terminalMap.get(terminalId);
      return {
        id: link.id,
        branchId: link.branchId,
        branchName: link.branch.name,
        displayName: link.displayName,
        isActive: link.isActive,
        integrationCredentialId: linkedCredentialId || null,
        integrationDisplayName: linkedCredential?.displayName ?? null,
        integrationProviderId: linkedCredential?.providerId ?? null,
        integrationProviderName: linkedCredential?.provider.name ?? null,
        terminalId: terminalId || null,
        terminalName: terminal ? `${terminal.name} (${terminal.code})` : null,
        ticketChannel: channel || null,
        ticketChannelLabel: channel ? this.getTicketChannelLabel(channel) : null,
      };
    });
  }

  async createPosLink(data: Record<string, unknown>, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const provider = await this.ensurePosLinkProvider();
    const payload = await this.normalizePosLinkPayload(data, actor);
    await this.ensureUniquePosLink(payload.branchId, payload.terminalId, payload.ticketChannel);

    const created = await this.prisma.integrationCredential.create({
      data: {
        branchId: payload.branchId,
        providerId: provider.id,
        displayName: payload.displayName,
        encryptedData: this.encodePayload({
          integrationCredentialId: payload.integrationCredentialId,
          terminalId: payload.terminalId,
          ticketChannel: payload.ticketChannel,
        }),
        isActive: payload.isActive,
      },
    });

    await this.usageService.adjustUsageMetric(actor.tenantId, "integration_credentials", 1, 25);
    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: payload.branchId,
      userId: actor.userId,
      module: "integrations",
      action: "pos_link.create",
      entityType: "integration_credential",
      entityId: created.id,
      payload,
    });

    return { id: created.id, success: true };
  }

  async updatePosLink(id: string, data: Record<string, unknown>, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const provider = await this.ensurePosLinkProvider();
    const current = await this.prisma.integrationCredential.findFirst({
      where: { id, providerId: provider.id },
    });
    if (!current) throw new NotFoundException("POS baglantisi bulunamadi.");
    this.ensureBranchAccess(actor, current.branchId);

    const mergedRaw = { ...((this.decodePayload(current.encryptedData) as Record<string, unknown>) ?? {}), ...data, branchId: data.branchId ?? current.branchId };
    const payload = await this.normalizePosLinkPayload(
      {
        ...mergedRaw,
        displayName: data.displayName ?? current.displayName,
        isActive: data.isActive ?? current.isActive,
      },
      actor,
    );

    await this.ensureUniquePosLink(payload.branchId, payload.terminalId, payload.ticketChannel, id);

    await this.prisma.integrationCredential.update({
      where: { id },
      data: {
        branchId: payload.branchId,
        displayName: payload.displayName,
        encryptedData: this.encodePayload({
          integrationCredentialId: payload.integrationCredentialId,
          terminalId: payload.terminalId,
          ticketChannel: payload.ticketChannel,
        }),
        isActive: payload.isActive,
      },
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: payload.branchId,
      userId: actor.userId,
      module: "integrations",
      action: "pos_link.update",
      entityType: "integration_credential",
      entityId: id,
      payload,
    });

    return { success: true };
  }

  async deletePosLink(id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const provider = await this.ensurePosLinkProvider();
    const current = await this.prisma.integrationCredential.findFirst({
      where: { id, providerId: provider.id },
    });
    if (!current) throw new NotFoundException("POS baglantisi bulunamadi.");
    this.ensureBranchAccess(actor, current.branchId);
    await this.prisma.integrationCredential.delete({ where: { id } });
    await this.usageService.adjustUsageMetric(actor.tenantId, "integration_credentials", -1, 25);
    return { success: true };
  }

  private encodePayload(value: unknown) {
    let normalized = value ?? {};
    if (typeof value === "string") {
      try {
        normalized = JSON.parse(value);
      } catch {
        normalized = { raw: value };
      }
    }
    return Buffer.from(JSON.stringify(normalized), "utf8").toString("base64");
  }

  private decodePayload(value: string) {
    try {
      return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    } catch {
      return {};
    }
  }

  private ensurePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.permissions.includes(permission) && actor.role !== "super_admin") {
      throw new ForbiddenException("Bu modul icin yetkin yok.");
    }
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }

  private async ensurePosLinkProvider() {
    const existing = await this.prisma.integrationProvider.findUnique({ where: { key: POS_LINK_PROVIDER_KEY } });
    if (existing) return existing;
    return this.prisma.integrationProvider.create({
      data: {
        key: POS_LINK_PROVIDER_KEY,
        name: "POS Kanal Baglama",
        category: "pos",
        configSchema: {
          fields: ["integrationCredentialId", "terminalId", "ticketChannel"],
        },
      },
    });
  }

  private getTicketChannelLabel(channel: TicketChannel) {
    switch (channel) {
      case TicketChannel.TABLE:
        return "Masa";
      case TicketChannel.SELF_SERVICE:
        return "Self Servis";
      case TicketChannel.DELIVERY:
        return "Paket Servis Siparisi";
      case TicketChannel.TAKEAWAY:
        return "Gel Al";
      case TicketChannel.QR_MENU:
        return "QR Menu";
      default:
        return channel;
    }
  }

  private async normalizePosLinkPayload(data: Record<string, unknown>, actor: AuthenticatedUser) {
    const branchId = String(data.branchId ?? "");
    const integrationCredentialId = String(data.integrationCredentialId ?? "");
    const terminalId = String(data.terminalId ?? "");
    const ticketChannel = String(data.ticketChannel ?? "") as TicketChannel;

    if (!branchId || !integrationCredentialId || !terminalId || !ticketChannel) {
      throw new BadRequestException("Sube, entegrasyon kullanicisi, terminal ve kanal zorunlu.");
    }

    if (!POS_LINK_CHANNELS.includes(ticketChannel)) {
      throw new BadRequestException("Gecersiz kanal secimi.");
    }

    this.ensureBranchAccess(actor, branchId);

    const [terminal, integrationCredential] = await Promise.all([
      this.prisma.terminal.findUnique({ where: { id: terminalId } }),
      this.prisma.integrationCredential.findUnique({
        where: { id: integrationCredentialId },
        include: { provider: true },
      }),
    ]);

    if (!terminal) throw new NotFoundException("Terminal bulunamadi.");
    if (terminal.branchId !== branchId) throw new BadRequestException("Terminal secilen subeye ait degil.");
    if (!integrationCredential) throw new NotFoundException("Entegrasyon kullanicisi bulunamadi.");
    if (integrationCredential.provider.key === POS_LINK_PROVIDER_KEY) throw new BadRequestException("POS baglama kaydi kullanici olarak secilemez.");
    if (integrationCredential.branchId !== branchId) throw new BadRequestException("Entegrasyon kullanicisi secilen subeye ait degil.");
    this.ensureBranchAccess(actor, integrationCredential.branchId);

    const displayName = String(data.displayName ?? `${terminal.name} / ${this.getTicketChannelLabel(ticketChannel)}`);
    const isActive = data.isActive !== false && data.isActive !== "false";

    return {
      branchId,
      integrationCredentialId,
      terminalId,
      ticketChannel,
      displayName,
      isActive,
    };
  }

  private async ensureUniquePosLink(branchId: string, terminalId: string, ticketChannel: TicketChannel, ignoreId?: string) {
    const provider = await this.ensurePosLinkProvider();
    const links = await this.prisma.integrationCredential.findMany({
      where: {
        providerId: provider.id,
        branchId,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true, encryptedData: true },
    });

    for (const link of links) {
      const settings = this.decodePayload(link.encryptedData) as Record<string, unknown>;
      if (String(settings.terminalId ?? "") === terminalId && String(settings.ticketChannel ?? "") === ticketChannel) {
        throw new BadRequestException("Bu terminal ve kanal icin zaten aktif bir POS baglantisi var.");
      }
    }
  }
}
