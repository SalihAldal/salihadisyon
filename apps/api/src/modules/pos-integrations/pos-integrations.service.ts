import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PosConnectionType, PosTransactionStatus, Prisma } from "@prisma/client";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { AssignPosDeviceDto } from "./dto/assign-pos-device.dto";
import { CreatePosDeviceDto } from "./dto/create-pos-device.dto";
import { ListPosDeviceDto } from "./dto/list-pos-device.dto";
import { StartPosTransactionDto } from "./dto/start-pos-transaction.dto";
import { UpdatePosDeviceDto } from "./dto/update-pos-device.dto";
import { MockPosProvider } from "./providers/mock-pos-provider";

const ipRegex = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)(\.(25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/;

@Injectable()
export class PosIntegrationsService {
  private readonly provider = new MockPosProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getMeta(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    const [branches, terminals, brandModels] = await Promise.all([
      this.prisma.branch.findMany({ where: { id: { in: actor.branchIds } }, orderBy: { name: "asc" } }),
      this.prisma.terminal.findMany({ where: { branchId: { in: actor.branchIds } }, orderBy: { name: "asc" } }),
      this.prisma.posBrandModel.findMany({ where: { isActive: true }, orderBy: [{ brand: "asc" }, { model: "asc" }] }),
    ]);

    return {
      success: true,
      message: "POS meta hazir.",
      data: {
        branches: branches.map((item) => ({ id: item.id, name: item.name })),
        terminals: terminals.map((item) => ({ id: item.id, name: item.name, code: item.code, branchId: item.branchId })),
        brandModels: this.groupBrandModels(brandModels),
        connectionTypes: [
          { value: "NETWORK", label: "Ethernet / Network" },
          { value: "USB", label: "USB" },
        ],
      },
      errors: [],
    };
  }

  async listDevices(query: ListPosDeviceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildListWhere(query, actor);
    const [rows, total] = await Promise.all([
      this.prisma.posDevice.findMany({
        where,
        include: {
          branch: true,
          assignments: {
            where: { isActive: true },
            include: { terminal: true },
            orderBy: { isDefault: "desc" },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.posDevice.count({ where }),
    ]);

    return {
      success: true,
      message: "POS cihazlari listelendi.",
      data: {
        items: rows.map((row) => this.serializeDeviceListRow(row)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      },
      errors: [],
    };
  }

  async getDeviceDetail(id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    const device = await this.getScopedDevice(id, actor);
    const [assignments, transactions, logs] = await Promise.all([
      this.prisma.posDeviceAssignment.findMany({
        where: { posDeviceId: id, isActive: true },
        include: { terminal: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.posDeviceTransaction.findMany({
        where: { posDeviceId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      this.prisma.posDeviceLog.findMany({
        where: { posDeviceId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return {
      success: true,
      message: "POS cihaz detayi getirildi.",
      data: {
        device: this.serializeDeviceDetail(device),
        assignments,
        recentTransactions: transactions,
        recentLogs: logs,
      },
      errors: [],
    };
  }

  async createDevice(dto: CreatePosDeviceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    this.ensureBranchAccess(actor, dto.branchId);
    await this.validateDevicePayload(dto, actor);
    const pinCodeEnc = dto.pinCode ? this.encodeSensitive(dto.pinCode) : null;
    const code = this.createDeviceCode(dto.serialNumber, dto.branchId);

    const created = await this.prisma.posDevice.create({
      data: {
        branchId: dto.branchId,
        name: dto.name,
        code,
        deviceType: "payment_pos",
        platform: dto.brand,
        ipAddress: dto.ipAddress ?? null,
        status: "offline",
        isActive: dto.isActive ?? true,
        brand: dto.brand,
        model: dto.model,
        serialNumber: dto.serialNumber,
        registryNumber: dto.registryNumber ?? null,
        connectionType: dto.connectionType as PosConnectionType,
        port: dto.port ?? null,
        pinCodeEnc,
        capabilitiesJson: (dto.capabilitiesJson ?? this.defaultCapabilities()) as Prisma.InputJsonValue,
        settingsJson: (dto.settingsJson ?? {}) as Prisma.InputJsonValue,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.writeDeviceLog(created.id, created.branchId, "info", "device_created", "POS cihaz kaydi olusturuldu.", { createdBy: actor.userId });
    await this.writeAudit(actor, created.branchId, "device.create", created.id, dto);

    return {
      success: true,
      message: "POS cihazi olusturuldu.",
      data: { id: created.id },
      errors: [],
    };
  }

  async updateDevice(id: string, dto: UpdatePosDeviceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const current = await this.getScopedDevice(id, actor);
    const nextBranchId = dto.branchId ?? current.branchId;
    this.ensureBranchAccess(actor, nextBranchId);
    await this.validateDevicePayload({ ...current, ...dto, branchId: nextBranchId } as CreatePosDeviceDto, actor, id);

    const updated = await this.prisma.posDevice.update({
      where: { id },
      data: {
        branchId: nextBranchId,
        name: dto.name ?? undefined,
        ipAddress: dto.ipAddress ?? undefined,
        brand: dto.brand ?? undefined,
        model: dto.model ?? undefined,
        serialNumber: dto.serialNumber ?? undefined,
        registryNumber: dto.registryNumber ?? undefined,
        connectionType: dto.connectionType ? (dto.connectionType as PosConnectionType) : undefined,
        port: dto.port ?? undefined,
        pinCodeEnc: dto.pinCode !== undefined ? (dto.pinCode ? this.encodeSensitive(dto.pinCode) : null) : undefined,
        capabilitiesJson: dto.capabilitiesJson ? (dto.capabilitiesJson as Prisma.InputJsonValue) : undefined,
        settingsJson: dto.settingsJson ? (dto.settingsJson as Prisma.InputJsonValue) : undefined,
        isActive: dto.isActive ?? undefined,
        updatedBy: actor.userId,
      },
    });

    await this.writeDeviceLog(updated.id, updated.branchId, "info", "device_updated", "POS cihaz kaydi guncellendi.", { updatedBy: actor.userId });
    await this.writeAudit(actor, updated.branchId, "device.update", id, dto);

    return {
      success: true,
      message: "POS cihazi guncellendi.",
      data: { id: updated.id },
      errors: [],
    };
  }

  async activateDevice(id: string, actor: AuthenticatedUser) {
    return this.setDeviceActive(id, true, actor);
  }

  async deactivateDevice(id: string, actor: AuthenticatedUser) {
    const inProgress = await this.prisma.posDeviceTransaction.count({
      where: {
        posDeviceId: id,
        status: { in: [PosTransactionStatus.PENDING, PosTransactionStatus.PROCESSING] },
      },
    });
    if (inProgress > 0) {
      throw new BadRequestException("Cihazda devam eden islem var. Pasife alinamaz.");
    }
    return this.setDeviceActive(id, false, actor);
  }

  async softDeleteDevice(id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const device = await this.getScopedDevice(id, actor);
    const activeAssignments = await this.prisma.posDeviceAssignment.count({ where: { posDeviceId: id, isActive: true } });
    if (activeAssignments > 0) {
      throw new BadRequestException("Cihaz aktif atamada oldugu icin silinemez.");
    }
    await this.prisma.posDevice.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        updatedBy: actor.userId,
      },
    });
    await this.writeDeviceLog(id, device.branchId, "warning", "device_deleted", "POS cihazi soft-delete olarak isaretlendi.", { deletedBy: actor.userId });
    return { success: true, message: "POS cihazi pasife alinip silindi.", data: null, errors: [] };
  }

  async testConnection(id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const device = await this.getScopedDevice(id, actor);
    const config = this.deviceConnectionConfig(device);
    const testResult = await this.provider.test(config);

    await this.prisma.posDevice.update({
      where: { id },
      data: {
        status: testResult.success ? "online" : "error",
        lastTestedAt: new Date(),
        lastTestStatus: testResult.success ? "success" : "failed",
        lastSeenAt: testResult.success ? new Date() : device.lastSeenAt,
        updatedBy: actor.userId,
      },
    });
    await this.writeDeviceLog(
      id,
      device.branchId,
      testResult.success ? "info" : "error",
      "test",
      testResult.message,
      { testPayload: testResult.payload ?? null },
    );

    return {
      success: testResult.success,
      message: testResult.message,
      data: {
        status: testResult.deviceStatus,
        testedAt: new Date().toISOString(),
        payload: testResult.payload ?? {},
      },
      errors: testResult.success ? [] : [{ field: "connection", message: testResult.message }],
    };
  }

  async listDeviceLogs(id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    const device = await this.getScopedDevice(id, actor);
    const logs = await this.prisma.posDeviceLog.findMany({
      where: { posDeviceId: id, branchId: device.branchId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { success: true, message: "POS loglari getirildi.", data: logs, errors: [] };
  }

  async listDeviceTransactions(id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    const device = await this.getScopedDevice(id, actor);
    const rows = await this.prisma.posDeviceTransaction.findMany({
      where: { posDeviceId: id, branchId: device.branchId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { success: true, message: "POS islem gecmisi getirildi.", data: rows, errors: [] };
  }

  async assignDevice(dto: AssignPosDeviceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const device = await this.getScopedDevice(dto.posDeviceId, actor);
    this.ensureBranchAccess(actor, dto.branchId);
    if (dto.branchId !== device.branchId) {
      throw new BadRequestException("Cihaz farkli subeye ait.");
    }
    if (dto.terminalId) {
      const terminal = await this.prisma.terminal.findUnique({ where: { id: dto.terminalId } });
      if (!terminal || terminal.branchId !== dto.branchId) {
        throw new BadRequestException("Terminal secilen subeye ait degil.");
      }
    }
    if (dto.isDefault && dto.terminalId) {
      const conflicting = await this.prisma.posDeviceAssignment.findFirst({
        where: {
          terminalId: dto.terminalId,
          isDefault: true,
          isActive: true,
          id: { not: undefined as any },
        },
      });
      if (conflicting) {
        await this.prisma.posDeviceAssignment.update({ where: { id: conflicting.id }, data: { isDefault: false } });
      }
    }

    const created = await this.prisma.posDeviceAssignment.create({
      data: {
        posDeviceId: dto.posDeviceId,
        branchId: dto.branchId,
        terminalId: dto.terminalId ?? null,
        cashRegisterId: dto.cashRegisterId ?? null,
        stationId: dto.stationId ?? null,
        assignedUserId: dto.assignedUserId ?? null,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
    });
    await this.writeDeviceLog(dto.posDeviceId, dto.branchId, "info", "assignment_created", "POS cihaz atamasi yapildi.", dto);
    return { success: true, message: "Atama kaydedildi.", data: created, errors: [] };
  }

  async setAssignmentActive(assignmentId: string, isActive: boolean, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const assignment = await this.prisma.posDeviceAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException("Atama bulunamadi.");
    this.ensureBranchAccess(actor, assignment.branchId);
    const updated = await this.prisma.posDeviceAssignment.update({
      where: { id: assignmentId },
      data: { isActive, isDefault: isActive ? assignment.isDefault : false },
    });
    await this.writeDeviceLog(
      assignment.posDeviceId,
      assignment.branchId,
      "info",
      isActive ? "assignment_enabled" : "assignment_disabled",
      isActive ? "Atama aktif edildi." : "Atama pasif edildi.",
      { assignmentId },
    );
    return { success: true, message: "Atama durumu guncellendi.", data: updated, errors: [] };
  }

  async removeAssignment(assignmentId: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const assignment = await this.prisma.posDeviceAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException("Atama bulunamadi.");
    this.ensureBranchAccess(actor, assignment.branchId);
    await this.prisma.posDeviceAssignment.delete({ where: { id: assignmentId } });
    await this.writeDeviceLog(assignment.posDeviceId, assignment.branchId, "warning", "assignment_removed", "Atama silindi.", { assignmentId });
    return { success: true, message: "Atama silindi.", data: null, errors: [] };
  }

  async getDefaultDeviceForTerminal(terminalId: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.view");
    const terminal = await this.prisma.terminal.findUnique({ where: { id: terminalId } });
    if (!terminal) throw new NotFoundException("Terminal bulunamadi.");
    this.ensureBranchAccess(actor, terminal.branchId);
    const assignment = await this.prisma.posDeviceAssignment.findFirst({
      where: {
        terminalId,
        branchId: terminal.branchId,
        isDefault: true,
        isActive: true,
        posDevice: { isActive: true, deletedAt: null },
      },
      include: { posDevice: true },
    });
    if (!assignment) {
      return { success: false, message: "Terminal icin varsayilan POS cihazi tanimli degil.", data: null, errors: [{ field: "terminalId", message: "Varsayilan cihaz yok." }] };
    }
    return { success: true, message: "Varsayilan cihaz bulundu.", data: assignment.posDevice, errors: [] };
  }

  async startSale(dto: StartPosTransactionDto, actor: AuthenticatedUser) {
    return this.startTransaction("sale", dto, actor);
  }

  async startRefund(dto: StartPosTransactionDto, actor: AuthenticatedUser) {
    return this.startTransaction("refund", dto, actor);
  }

  async cancelTransaction(transactionId: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "payment.manage");
    const tx = await this.prisma.posDeviceTransaction.findUnique({ where: { id: transactionId }, include: { posDevice: true } });
    if (!tx) throw new NotFoundException("POS islemi bulunamadi.");
    this.ensureBranchAccess(actor, tx.branchId);
    const cancelResult = await this.provider.cancel(this.deviceConnectionConfig(tx.posDevice), { referenceNo: tx.referenceNo ?? undefined });
    const updated = await this.prisma.posDeviceTransaction.update({
      where: { id: transactionId },
      data: {
        status: cancelResult.status === "cancelled" ? PosTransactionStatus.CANCELLED : PosTransactionStatus.FAILED,
        providerStatus: cancelResult.status,
        responseMessage: cancelResult.providerMessage,
        completedAt: new Date(),
      },
    });
    await this.writeDeviceLog(tx.posDeviceId, tx.branchId, "warning", "transaction_cancelled", cancelResult.providerMessage, { transactionId });
    return {
      success: cancelResult.success,
      message: cancelResult.providerMessage,
      data: {
        transaction_id: updated.id,
        current_status: updated.status,
        provider_message: cancelResult.providerMessage,
        next_action: cancelResult.success ? "cancelled" : "manual_control",
      },
      errors: cancelResult.success ? [] : [{ field: "transaction", message: cancelResult.providerMessage }],
    };
  }

  async syncDeviceStatus(deviceId: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const device = await this.getScopedDevice(deviceId, actor);
    const statusResult = await this.provider.status(this.deviceConnectionConfig(device));
    await this.prisma.posDevice.update({
      where: { id: deviceId },
      data: {
        status: statusResult.deviceStatus,
        lastSeenAt: statusResult.success ? new Date() : device.lastSeenAt,
      },
    });
    await this.writeDeviceLog(deviceId, device.branchId, "info", "sync", "Cihaz durumu senkronlandi.", statusResult);
    return { success: true, message: "Cihaz durumu senkronlandi.", data: statusResult, errors: [] };
  }

  async seedBrandModels() {
    const rows = [
      { brand: "Ingenico", model: "IWE280", requiresIp: true, requiresPort: true, requiresPin: true },
      { brand: "Ingenico", model: "VE280", requiresIp: true, requiresPort: true, requiresPin: true },
      { brand: "Ingenico", model: "MOVE 5000F", requiresIp: false, requiresPort: false, requiresPin: true },
      { brand: "Ingenico", model: "PAX A910F", requiresIp: false, requiresPort: false, requiresPin: true },
      { brand: "Pavo", model: "Pavo E200", requiresIp: true, requiresPort: true, requiresPin: false },
      { brand: "InPOS", model: "InPOS S1", requiresIp: true, requiresPort: true, requiresPin: true },
      { brand: "Beko", model: "Beko X30", requiresIp: true, requiresPort: true, requiresPin: true },
      { brand: "Hugin", model: "Hugin T300", requiresIp: true, requiresPort: true, requiresPin: true },
      { brand: "PugGo", model: "PugGo Lite", requiresIp: false, requiresPort: false, requiresPin: false },
      { brand: "Beko Cloud", model: "BC Pay", requiresIp: true, requiresPort: false, requiresPin: true },
    ];
    for (const row of rows) {
      await this.prisma.posBrandModel.upsert({
        where: { brand_model: { brand: row.brand, model: row.model } as any },
        update: {
          supportedConnectionTypesJson: row.requiresIp || row.requiresPort ? ["NETWORK", "USB"] : ["USB"],
          requiresIp: row.requiresIp,
          requiresPort: row.requiresPort,
          requiresPin: row.requiresPin,
          isActive: true,
          capabilitiesJson: this.defaultCapabilities(),
        },
        create: {
          ...row,
          supportedConnectionTypesJson: row.requiresIp || row.requiresPort ? ["NETWORK", "USB"] : ["USB"],
          capabilitiesJson: this.defaultCapabilities(),
        } as any,
      });
    }
  }

  private async startTransaction(type: "sale" | "refund", dto: StartPosTransactionDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "payment.manage");
    this.ensureBranchAccess(actor, dto.branchId);
    const resolved = await this.resolveDeviceForTransaction(dto, actor);

    const duplicateInProgress = await this.prisma.posDeviceTransaction.findFirst({
      where: {
        ticketId: dto.ticketId ?? null,
        status: { in: [PosTransactionStatus.PENDING, PosTransactionStatus.PROCESSING] },
      },
    });
    if (duplicateInProgress) {
      throw new BadRequestException("Ayni siparis icin devam eden POS islemi var.");
    }

    const created = await this.prisma.posDeviceTransaction.create({
      data: {
        posDeviceId: resolved.device.id,
        branchId: dto.branchId,
        terminalId: resolved.terminalId ?? null,
        ticketId: dto.ticketId ?? null,
        transactionType: type,
        amount: dto.amount,
        currency: dto.currency ?? "TRY",
        installmentCount: dto.installmentCount ?? null,
        requestPayloadJson: dto.meta ? (dto.meta as Prisma.InputJsonValue) : Prisma.JsonNull,
        status: PosTransactionStatus.PROCESSING,
        createdBy: actor.userId,
      },
    });

    await this.writeDeviceLog(resolved.device.id, dto.branchId, "info", `${type}_start`, `${type === "sale" ? "Satis" : "Iade"} islemi baslatildi.`, {
      transactionId: created.id,
      amount: dto.amount,
    });

    const providerResult =
      type === "sale"
        ? await this.provider.sale(this.deviceConnectionConfig(resolved.device), {
            amount: dto.amount,
            currency: dto.currency ?? "TRY",
            installmentCount: dto.installmentCount,
            meta: dto.meta,
          })
        : await this.provider.refund(this.deviceConnectionConfig(resolved.device), {
            amount: dto.amount,
            currency: dto.currency ?? "TRY",
            installmentCount: dto.installmentCount,
            meta: dto.meta,
          });

    const nextStatus =
      providerResult.status === "success"
        ? PosTransactionStatus.SUCCESS
        : providerResult.status === "timeout"
          ? PosTransactionStatus.TIMEOUT
          : providerResult.status === "cancelled"
            ? PosTransactionStatus.CANCELLED
            : PosTransactionStatus.FAILED;

    const updated = await this.prisma.posDeviceTransaction.update({
      where: { id: created.id },
      data: {
        status: nextStatus,
        providerStatus: providerResult.status,
        responseCode: providerResult.responseCode ?? null,
        responseMessage: providerResult.providerMessage,
        referenceNo: providerResult.referenceNo ?? null,
        rrnNo: providerResult.rrnNo ?? null,
        stanNo: providerResult.stanNo ?? null,
        batchNo: providerResult.batchNo ?? null,
        authCode: providerResult.authCode ?? null,
        maskedCardNo: providerResult.maskedCardNo ?? null,
        cardBrand: providerResult.cardBrand ?? null,
        providerPayloadJson: providerResult.rawResponse ? (providerResult.rawResponse as Prisma.InputJsonValue) : Prisma.JsonNull,
        completedAt: new Date(),
      },
    });

    await this.writeDeviceLog(
      resolved.device.id,
      dto.branchId,
      providerResult.success ? "info" : "error",
      providerResult.success ? `${type}_success` : providerResult.status === "timeout" ? "timeout" : `${type}_fail`,
      providerResult.providerMessage,
      { transactionId: updated.id, status: nextStatus },
    );

    return {
      success: providerResult.success,
      message: providerResult.providerMessage,
      data: {
        transaction_id: updated.id,
        current_status: updated.status,
        device_status: resolved.device.status,
        provider_message: providerResult.providerMessage,
        next_action: providerResult.success ? "complete_order_payment" : providerResult.status === "timeout" ? "retry_or_manual_control" : "show_error_and_retry",
      },
      errors: providerResult.success ? [] : [{ field: "provider", message: providerResult.providerMessage }],
    };
  }

  private async resolveDeviceForTransaction(dto: StartPosTransactionDto, actor: AuthenticatedUser) {
    if (dto.deviceId) {
      const direct = await this.getScopedDevice(dto.deviceId, actor);
      this.assertDeviceReady(direct);
      return { device: direct, terminalId: dto.terminalId ?? null };
    }

    const terminalId = dto.terminalId;
    if (!terminalId) {
      throw new BadRequestException("Terminal secimi gerekli.");
    }
    const terminal = await this.prisma.terminal.findUnique({ where: { id: terminalId } });
    if (!terminal) throw new NotFoundException("Terminal bulunamadi.");
    this.ensureBranchAccess(actor, terminal.branchId);

    const assignments = await this.prisma.posDeviceAssignment.findMany({
      where: {
        branchId: terminal.branchId,
        terminalId,
        isActive: true,
        posDevice: { isActive: true, deletedAt: null },
      },
      include: { posDevice: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    if (!assignments.length) {
      throw new BadRequestException("Terminale atanmis varsayilan POS cihaz bulunamadi.");
    }
    const defaultAssignment = assignments.find((item) => item.isDefault) ?? assignments[0];
    const readyAssignment = assignments.find((item) => this.isDeviceReady(item.posDevice as any)) ?? null;
    if (readyAssignment && defaultAssignment.id !== readyAssignment.id) {
      await this.writeDeviceLog(
        readyAssignment.posDeviceId,
        terminal.branchId,
        "warning",
        "device_fallback_used",
        "Varsayilan cihaz hazir degildi. Baska bir aktif cihaz fallback olarak secildi.",
        {
          terminalId,
          defaultDeviceId: defaultAssignment.posDeviceId,
          fallbackDeviceId: readyAssignment.posDeviceId,
        },
      );
    }
    const resolvedAssignment = readyAssignment ?? defaultAssignment;
    this.assertDeviceReady(resolvedAssignment.posDevice as any);
    return { device: resolvedAssignment.posDevice as any, terminalId };
  }

  private assertDeviceReady(device: any) {
    if (!device.isActive || device.deletedAt) {
      throw new BadRequestException("POS cihaz pasif.");
    }
    if (!device.connectionType) {
      throw new BadRequestException("POS cihaz baglanti tipi tanimli degil.");
    }
    if (device.connectionType === PosConnectionType.NETWORK && (!device.ipAddress || !device.port)) {
      throw new BadRequestException("Network cihazlarda IP ve Port zorunlu.");
    }
  }

  private isDeviceReady(device: any) {
    return Boolean(
      device.isActive &&
        !device.deletedAt &&
        device.connectionType &&
        (device.connectionType !== PosConnectionType.NETWORK || (device.ipAddress && device.port)),
    );
  }

  private async setDeviceActive(id: string, isActive: boolean, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "integrations.manage");
    const current = await this.getScopedDevice(id, actor);
    const updated = await this.prisma.posDevice.update({
      where: { id },
      data: {
        isActive,
        updatedBy: actor.userId,
      },
    });
    await this.writeDeviceLog(id, current.branchId, "info", isActive ? "device_activated" : "device_deactivated", isActive ? "Cihaz aktif edildi." : "Cihaz pasife alindi.", {
      updatedBy: actor.userId,
    });
    return {
      success: true,
      message: isActive ? "POS cihazi aktif edildi." : "POS cihazi pasife alindi.",
      data: { id: updated.id, isActive: updated.isActive },
      errors: [],
    };
  }

  private async validateDevicePayload(dto: CreatePosDeviceDto, actor: AuthenticatedUser, ignoreId?: string) {
    this.ensureBranchAccess(actor, dto.branchId);
    if (!dto.brand || !dto.model || !dto.serialNumber || !dto.connectionType) {
      throw new BadRequestException("brand, model, serial_number ve connection_type zorunlu.");
    }

    const brandModel = await this.prisma.posBrandModel.findFirst({
      where: { brand: dto.brand, model: dto.model, isActive: true },
    });
    if (!brandModel) {
      throw new BadRequestException("Marka-model eslesmesi gecersiz.");
    }

    if (dto.connectionType === "NETWORK") {
      if (!dto.ipAddress || !dto.port) {
        throw new BadRequestException("Network baglanti tipinde IP ve Port zorunlu.");
      }
      if (!ipRegex.test(dto.ipAddress)) {
        throw new BadRequestException("IP adresi formati gecersiz.");
      }
      if (!Number.isFinite(dto.port) || dto.port < 1 || dto.port > 65535) {
        throw new BadRequestException("Port degeri gecersiz.");
      }
    }

    if (brandModel.requiresPin && !dto.pinCode) {
      throw new BadRequestException("Secili marka/model icin pin zorunlu.");
    }

    const duplicate = await this.prisma.posDevice.findFirst({
      where: {
        branchId: dto.branchId,
        serialNumber: dto.serialNumber,
        isActive: true,
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
    });
    if (duplicate) {
      throw new BadRequestException("Ayni subede ayni seri numarasi ile aktif cihaz olamaz.");
    }
  }

  private buildListWhere(query: ListPosDeviceDto, actor: AuthenticatedUser) {
    const where: Record<string, unknown> = {
      branchId: query.branchId ? query.branchId : { in: actor.branchIds },
      deletedAt: null,
    };
    if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
    if (query.brand) where.brand = query.brand;
    if (query.model) where.model = query.model;
    if (query.connectionType) where.connectionType = query.connectionType;
    if (query.status) where.status = query.status;
    if (query.isActive !== undefined) where.isActive = query.isActive === "true";
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { serialNumber: { contains: query.search, mode: "insensitive" } },
        { registryNumber: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } },
      ];
    }
    return where;
  }

  private serializeDeviceListRow(row: any) {
    const defaultAssignment = (row.assignments ?? []).find((item: any) => item.isDefault);
    return {
      id: row.id,
      branchId: row.branchId,
      branchName: row.branch?.name ?? "-",
      name: row.name,
      brand: row.brand,
      model: row.model,
      serialNumber: row.serialNumber,
      registryNumber: row.registryNumber,
      connectionType: row.connectionType,
      ipAddress: row.ipAddress,
      port: row.port,
      status: row.status,
      isActive: row.isActive,
      lastTestedAt: row.lastTestedAt,
      lastTestStatus: row.lastTestStatus,
      assignedTerminal: defaultAssignment?.terminal ? `${defaultAssignment.terminal.name} (${defaultAssignment.terminal.code})` : "-",
    };
  }

  private serializeDeviceDetail(row: any) {
    return {
      ...row,
      pinCodeMasked: this.maskSensitive(row.pinCodeEnc ? this.decodeSensitive(row.pinCodeEnc) : ""),
    };
  }

  private async getScopedDevice(id: string, actor: AuthenticatedUser) {
    const row = await this.prisma.posDevice.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw new NotFoundException("POS cihazi bulunamadi.");
    this.ensureBranchAccess(actor, row.branchId);
    return row;
  }

  private ensurePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.permissions.includes(permission) && actor.role !== "super_admin") {
      throw new ForbiddenException("Bu islem icin yetkin yok.");
    }
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }

  private async writeDeviceLog(
    posDeviceId: string,
    branchId: string,
    level: string,
    eventType: string,
    message: string,
    context: unknown,
  ) {
    await this.prisma.posDeviceLog.create({
      data: {
        posDeviceId,
        branchId,
        level,
        eventType,
        message,
        contextJson: (context as any) ?? null,
      },
    });
  }

  private async writeAudit(actor: AuthenticatedUser, branchId: string, action: string, entityId: string, payload: unknown) {
    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId,
      userId: actor.userId,
      module: "pos_integrations",
      action,
      entityType: "pos_device",
      entityId,
      payload,
    });
  }

  private groupBrandModels(rows: Array<{ brand: string; model: string; requiresPin: boolean; requiresIp: boolean; requiresPort: boolean }>) {
    const map = new Map<string, Array<{ model: string; requiresPin: boolean; requiresIp: boolean; requiresPort: boolean }>>();
    for (const row of rows) {
      const list = map.get(row.brand) ?? [];
      list.push({
        model: row.model,
        requiresPin: row.requiresPin,
        requiresIp: row.requiresIp,
        requiresPort: row.requiresPort,
      });
      map.set(row.brand, list);
    }
    return [...map.entries()].map(([brand, models]) => ({ brand, models }));
  }

  private createDeviceCode(serialNumber: string, branchId: string) {
    const normalized = serialNumber.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
    return `POS-${branchId.slice(0, 4).toUpperCase()}-${normalized || "000000"}`;
  }

  private defaultCapabilities() {
    return {
      sale: true,
      refund: true,
      void: true,
      slip: true,
      qr: false,
      contactless: true,
      installment: true,
    };
  }

  private deviceConnectionConfig(device: any) {
    return {
      id: device.id,
      brand: device.brand,
      model: device.model,
      connectionType: device.connectionType,
      ipAddress: device.ipAddress,
      port: device.port,
      pinCode: device.pinCodeEnc ? this.decodeSensitive(device.pinCodeEnc) : null,
      settings: device.settingsJson ?? {},
      mockMode: (device.settingsJson as any)?.mockMode ?? "success",
    };
  }

  private encodeSensitive(value: string) {
    return Buffer.from(value, "utf8").toString("base64");
  }

  private decodeSensitive(value: string) {
    try {
      return Buffer.from(value, "base64").toString("utf8");
    } catch {
      return "";
    }
  }

  private maskSensitive(value: string) {
    if (!value) return "";
    if (value.length <= 2) return "*".repeat(value.length);
    return `${"*".repeat(Math.max(0, value.length - 2))}${value.slice(-2)}`;
  }
}
