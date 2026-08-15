import { createHash } from "crypto";
import {
  featureFlagClients,
  getFeatureFlagDefinition,
  hasPermission,
  listFeatureFlagDefinitions,
  type FeatureFlagClient,
  type FeatureFlagDefinition,
  type FeatureFlagKey,
} from "@adisyon/config";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { sanitizeTextInput } from "../../common/security/sanitize";
import { EvaluateFeatureFlagsDto } from "./dto/evaluate-feature-flags.dto";
import { UpdateFeatureFlagDto } from "./dto/update-feature-flag.dto";

type StoredFeatureFlagOverride = {
  enabled?: boolean;
  rolloutPercentage?: number;
  allowedRoleKeys?: string[];
  allowedUserIds?: string[];
  allowedBranchIds?: string[];
  clients?: FeatureFlagClient[];
  note?: string | null;
  updatedAt?: string;
  updatedByUserId?: string;
};

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async evaluateForActor(query: EvaluateFeatureFlagsDto, actor: AuthenticatedUser) {
    const client = query.client ?? "admin-web";
    const overrides = await this.readOverrides(actor.tenantId);

    return {
      client,
      items: listFeatureFlagDefinitions().map((definition) => {
        const override = overrides.get(definition.key);
        return this.serializeFlag(definition, override, actor, client);
      }),
    };
  }

  async listForAdmin(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "feature_flags.view");
    const overrides = await this.readOverrides(actor.tenantId);

    return {
      items: listFeatureFlagDefinitions().map((definition) => {
        const override = overrides.get(definition.key);
        return {
          ...this.serializeFlag(definition, override, actor, "admin-web"),
          override: this.serializeOverride(override),
        };
      }),
    };
  }

  async update(key: string, dto: UpdateFeatureFlagDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "feature_flags.manage");
    const definition = this.requireDefinition(key);
    const current = await this.prisma.posSetting.findFirst({
      where: {
        companyId: actor.tenantId,
        branchId: null,
        key: this.buildStorageKey(definition.key),
      },
    });

    const override = this.normalizeOverride(dto, actor);
    const saved = current
      ? await this.prisma.posSetting.update({
          where: { id: current.id },
          data: {
            valueJson: override,
            description: definition.description,
            isActive: true,
          },
        })
      : await this.prisma.posSetting.create({
          data: {
            companyId: actor.tenantId,
            branchId: null,
            key: this.buildStorageKey(definition.key),
            valueJson: override,
            description: definition.description,
            isActive: true,
          },
        });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: null,
      userId: actor.userId,
      module: "feature_flags",
      action: "feature_flag.update",
      entityType: "feature_flag",
      entityId: definition.key,
      payload: dto as unknown as Record<string, unknown>,
      oldValues: current?.valueJson as Record<string, unknown> | null,
      newValues: saved.valueJson as Record<string, unknown>,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? null,
    });

    return {
      ...this.serializeFlag(definition, override, actor, "admin-web"),
      override: this.serializeOverride(override),
    };
  }

  async reset(key: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "feature_flags.manage");
    const definition = this.requireDefinition(key);
    const current = await this.prisma.posSetting.findFirst({
      where: {
        companyId: actor.tenantId,
        branchId: null,
        key: this.buildStorageKey(definition.key),
      },
    });

    if (!current) {
      throw new NotFoundException("Bu flag icin ozel ayar bulunamadi.");
    }

    await this.prisma.posSetting.delete({
      where: { id: current.id },
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: null,
      userId: actor.userId,
      module: "feature_flags",
      action: "feature_flag.reset",
      entityType: "feature_flag",
      entityId: definition.key,
      payload: { key: definition.key },
      oldValues: current.valueJson as Record<string, unknown>,
      newValues: null,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? null,
    });

    return {
      ...this.serializeFlag(definition, undefined, actor, "admin-web"),
      override: null,
    };
  }

  private ensurePermission(actor: AuthenticatedUser, permission: string) {
    if (!hasPermission(actor, permission)) {
      throw new ForbiddenException("Feature flag yonetimi icin yetkin yok.");
    }
  }

  private buildStorageKey(key: FeatureFlagKey) {
    return `feature_flag:${key}`;
  }

  private requireDefinition(key: string) {
    const definition = getFeatureFlagDefinition(key);
    if (!definition) {
      throw new BadRequestException("Gecersiz feature flag anahtari.");
    }
    return definition;
  }

  private async readOverrides(companyId: string) {
    const records = await this.prisma.posSetting.findMany({
      where: {
        companyId,
        branchId: null,
        key: {
          in: listFeatureFlagDefinitions().map((definition) => this.buildStorageKey(definition.key)),
        },
      },
    });

    return new Map(
      records.map((record) => [record.key.replace("feature_flag:", ""), (record.valueJson ?? {}) as StoredFeatureFlagOverride]),
    );
  }

  private normalizeOverride(dto: UpdateFeatureFlagDto, actor: AuthenticatedUser): StoredFeatureFlagOverride {
    return {
      enabled: typeof dto.enabled === "boolean" ? dto.enabled : false,
      rolloutPercentage: dto.rolloutPercentage ?? 100,
      allowedRoleKeys: this.normalizeStringArray(dto.allowedRoleKeys, 20),
      allowedUserIds: this.normalizeStringArray(dto.allowedUserIds, 100),
      allowedBranchIds: this.normalizeStringArray(dto.allowedBranchIds, 100),
      clients: this.normalizeClients(dto.clients),
      note: dto.note ? sanitizeTextInput(dto.note).slice(0, 240) : null,
      updatedAt: new Date().toISOString(),
      updatedByUserId: actor.userId,
    };
  }

  private normalizeClients(clients?: string[]): FeatureFlagClient[] {
    if (!clients?.length) {
      return [];
    }
    return [...new Set(clients.filter((client): client is FeatureFlagClient => featureFlagClients.includes(client as FeatureFlagClient)))];
  }

  private normalizeStringArray(values: string[] | undefined, maxItems: number) {
    if (!values?.length) {
      return [];
    }
    return [...new Set(values.map((value) => sanitizeTextInput(String(value))).filter(Boolean))].slice(0, maxItems);
  }

  private serializeOverride(override?: StoredFeatureFlagOverride) {
    if (!override) {
      return null;
    }
    return {
      enabled: override.enabled ?? false,
      rolloutPercentage: override.rolloutPercentage ?? 100,
      allowedRoleKeys: override.allowedRoleKeys ?? [],
      allowedUserIds: override.allowedUserIds ?? [],
      allowedBranchIds: override.allowedBranchIds ?? [],
      clients: override.clients ?? [],
      note: override.note ?? null,
      updatedAt: override.updatedAt ?? null,
      updatedByUserId: override.updatedByUserId ?? null,
    };
  }

  private serializeFlag(
    definition: FeatureFlagDefinition,
    override: StoredFeatureFlagOverride | undefined,
    actor: AuthenticatedUser,
    client: FeatureFlagClient,
  ) {
    const effectiveEnabled = this.evaluateFlag(definition, override, actor, client);
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      category: definition.category,
      targets: definition.targets,
      defaultEnabled: definition.defaultEnabled,
      effectiveEnabled,
      constraints: {
        rolloutPercentage: override?.rolloutPercentage ?? 100,
        allowedRoleKeys: override?.allowedRoleKeys ?? [],
        allowedUserIds: override?.allowedUserIds ?? [],
        allowedBranchIds: override?.allowedBranchIds ?? [],
        clients: override?.clients ?? [],
      },
    };
  }

  private evaluateFlag(
    definition: FeatureFlagDefinition,
    override: StoredFeatureFlagOverride | undefined,
    actor: AuthenticatedUser,
    client: FeatureFlagClient,
  ) {
    if (!definition.targets.includes(client)) {
      return false;
    }

    const enabled = override?.enabled ?? definition.defaultEnabled;
    if (!enabled) {
      return false;
    }

    if (override?.clients?.length && !override.clients.includes(client)) {
      return false;
    }

    if (override?.allowedRoleKeys?.length && !override.allowedRoleKeys.includes(actor.role)) {
      return false;
    }

    if (override?.allowedUserIds?.length && !override.allowedUserIds.includes(actor.userId)) {
      return false;
    }

    if (override?.allowedBranchIds?.length && !actor.branchIds.some((branchId) => override.allowedBranchIds?.includes(branchId))) {
      return false;
    }

    const rolloutPercentage = override?.rolloutPercentage ?? 100;
    if (rolloutPercentage >= 100) {
      return true;
    }

    const hash = createHash("sha256").update(`${definition.key}:${actor.userId}`).digest("hex");
    const bucket = Number.parseInt(hash.slice(0, 2), 16) % 100;
    return bucket < rolloutPercentage;
  }
}
