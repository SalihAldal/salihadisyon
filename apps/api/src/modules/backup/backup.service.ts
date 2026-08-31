import { createHash } from "crypto";
import { promises as fs } from "fs";
import { createReadStream } from "fs";
import { join, resolve } from "path";
import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { CreateSystemBackupDto } from "./dto/create-system-backup.dto";
import { RestoreSystemBackupDto } from "./dto/restore-system-backup.dto";
import { runPgDump, runPgRestore } from "./pg-tools";

type BackupManifest = {
  backupId: string;
  trigger: "MANUAL" | "DAILY_AUTO" | "PRE_RESTORE";
  generatedAt: string;
  databaseName: string;
  backupFile: string;
  criticalSummary: Record<string, number>;
  criticalTables: string[];
  appEnv: string;
  nodeEnv: string;
};

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupRoot = resolve(process.cwd(), process.env.BACKUP_STORAGE_DIR ?? "storage/backups");
  private readonly criticalTables = [
    { key: "companies", count: () => this.prisma.company.count() },
    { key: "branches", count: () => this.prisma.branch.count() },
    { key: "users", count: () => this.prisma.user.count() },
    { key: "tickets", count: () => this.prisma.ticket.count() },
    { key: "ticketItems", count: () => this.prisma.ticketItem.count() },
    { key: "payments", count: () => this.prisma.payment.count() },
    { key: "registerClosings", count: () => this.prisma.registerClosing.count() },
    { key: "registerTransactions", count: () => this.prisma.registerTransaction.count() },
    { key: "inventoryItems", count: () => this.prisma.inventoryItem.count() },
    { key: "stockEntries", count: () => this.prisma.stockEntry.count() },
  ] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private get systemBackup() {
    return (this.prisma as any).systemBackup;
  }

  @Cron("0 3 * * *", { timeZone: "Europe/Istanbul" })
  async handleDailyBackup() {
    if (process.env.DISABLE_DAILY_BACKUP === "true" || process.env.DISABLE_BACKUPS === "true") {
      return;
    }
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const existing = await this.systemBackup.findFirst({
        where: {
          trigger: "DAILY_AUTO",
          status: "COMPLETED",
          createdAt: {
            gte: startOfDay,
          },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        return;
      }
      await this.createBackupInternal({
        trigger: "DAILY_AUTO",
        label: `Gunluk otomatik backup ${new Date().toISOString().slice(0, 10)}`,
      });
    } catch (error) {
      this.logger.error("Gunluk backup basarisiz.", error instanceof Error ? error.stack : undefined);
    }
  }

  async listBackups(actor: AuthenticatedUser) {
    this.ensureSystemBackupAccess(actor);
    const [items, completedCount, failedCount] = await Promise.all([
      this.systemBackup.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.systemBackup.count({ where: { status: "COMPLETED" } }),
      this.systemBackup.count({ where: { status: "FAILED" } }),
    ]);

    return {
      items: items.map((item: any) => this.serializeBackup(item)),
      summary: {
        total: items.length,
        completedCount,
        failedCount,
        backupRoot: this.backupRoot,
      },
    };
  }

  async createManualBackup(dto: CreateSystemBackupDto, actor: AuthenticatedUser) {
    this.ensureSystemBackupAccess(actor);
    const backup = await this.createBackupInternal({
      trigger: "MANUAL",
      label: dto.label?.trim() || "Manuel backup",
      actor,
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      userId: actor.userId,
      module: "backup",
      action: "backup.create",
      entityType: "system_backup",
      entityId: backup.id,
      payload: {
        trigger: backup.trigger,
        fileName: backup.fileName,
        sizeBytes: backup.sizeBytes,
      },
      oldValues: null,
      newValues: backup,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? null,
    });

    return backup;
  }

  async restoreBackup(dto: RestoreSystemBackupDto, actor: AuthenticatedUser) {
    this.ensureSystemBackupAccess(actor);
    if (dto.confirmationText.trim().toUpperCase() !== "RESTORE") {
      throw new BadRequestException("Restore islemi icin confirmationText alani RESTORE olmali.");
    }

    const source = await this.systemBackup.findUnique({
      where: { id: dto.backupId },
    });
    if (!source) {
      throw new NotFoundException("Restore icin backup kaydi bulunamadi.");
    }
    if (source.status !== "COMPLETED" || !source.filePath) {
      throw new BadRequestException("Sadece tamamlanmis backup dosyalari restore edilebilir.");
    }

    await fs.access(source.filePath).catch(() => {
      throw new NotFoundException("Backup dosyasi diskte bulunamadi.");
    });

    let safetyBackup: Awaited<ReturnType<BackupService["createBackupInternal"]>> | null = null;
    if (dto.createSafetyBackup !== false) {
      safetyBackup = await this.createBackupInternal({
        trigger: "PRE_RESTORE",
        label: `Restore oncesi guvenlik backup ${source.id}`,
        actor,
        restoreSourceBackupId: source.id,
      });
    }

    await this.prisma.$disconnect();
    try {
      await runPgRestore(this.requireDatabaseUrl(), source.filePath);
    } catch (error) {
      await this.prisma.$connect();
      await this.auditLogService.create({
        companyId: actor.tenantId,
        userId: actor.userId,
        module: "backup",
        action: "backup.restore.failed",
        entityType: "system_backup",
        entityId: source.id,
        payload: {
          sourceBackupId: source.id,
          safetyBackupId: safetyBackup?.id ?? null,
          error: error instanceof Error ? error.message : "Restore hatasi",
        },
        oldValues: this.serializeBackup(source),
        newValues: null,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
        deviceInfo: actor.deviceInfo ?? null,
      });
      throw error;
    }

    await this.prisma.$connect();
    await this.auditLogService.create({
      companyId: actor.tenantId,
      userId: actor.userId,
      module: "backup",
      action: "backup.restore",
      entityType: "system_backup",
      entityId: source.id,
      payload: {
        sourceBackupId: source.id,
        safetyBackupId: safetyBackup?.id ?? null,
      },
      oldValues: null,
      newValues: {
        sourceBackupId: source.id,
        safetyBackupId: safetyBackup?.id ?? null,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? null,
    });

    return {
      success: true,
      restoredBackupId: source.id,
      safetyBackup,
    };
  }

  private async createBackupInternal(input: {
    trigger: "MANUAL" | "DAILY_AUTO" | "PRE_RESTORE";
    label?: string;
    actor?: AuthenticatedUser;
    restoreSourceBackupId?: string;
  }) {
    await fs.mkdir(this.backupRoot, { recursive: true });
    const backupRow = await this.systemBackup.create({
      data: {
        trigger: input.trigger,
        status: "RUNNING",
        requestedByUserId: input.actor?.userId ?? null,
        label: input.label ?? null,
        restoreSourceBackupId: input.restoreSourceBackupId ?? null,
      },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const databaseName = this.resolveDatabaseName();
    const fileName = `backup-${input.trigger.toLowerCase()}-${timestamp}-${backupRow.id}.dump`;
    const filePath = join(this.backupRoot, fileName);

    try {
      const criticalSummary = await this.buildCriticalSummary();
      await runPgDump(this.requireDatabaseUrl(), filePath);

      const checksumSha256 = await this.computeFileChecksum(filePath);
      const stat = await fs.stat(filePath);
      const manifest: BackupManifest = {
        backupId: backupRow.id,
        trigger: input.trigger,
        generatedAt: new Date().toISOString(),
        databaseName,
        backupFile: fileName,
        criticalSummary,
        criticalTables: Object.keys(criticalSummary),
        appEnv: process.env.APP_ENV ?? "local",
        nodeEnv: process.env.NODE_ENV ?? "development",
      };
      await fs.writeFile(`${filePath}.json`, JSON.stringify(manifest, null, 2), "utf8");

      const completed = await this.systemBackup.update({
        where: { id: backupRow.id },
        data: {
          status: "COMPLETED",
          fileName,
          filePath,
          checksumSha256,
          sizeBytes: BigInt(stat.size),
          databaseName,
          criticalSummary,
          manifest,
          finishedAt: new Date(),
        },
      });
      return this.serializeBackup(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Backup islemi basarisiz.";
      await this.systemBackup.update({
        where: { id: backupRow.id },
        data: {
          status: "FAILED",
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      throw new InternalServerErrorException(message);
    }
  }

  private ensureSystemBackupAccess(actor: AuthenticatedUser) {
    if (actor.role !== "super_admin") {
      throw new ForbiddenException("Backup ve restore islemleri sadece super admin tarafindan calistirilabilir.");
    }
  }

  private requireDatabaseUrl() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new InternalServerErrorException("DATABASE_URL tanimli olmadan backup islemi calistirilamaz.");
    }
    return databaseUrl;
  }

  private resolveDatabaseName() {
    try {
      const url = new URL(this.requireDatabaseUrl());
      return url.pathname.replace(/^\//, "").split("?")[0] || "database";
    } catch {
      return "database";
    }
  }

  private async buildCriticalSummary() {
    const pairs = await Promise.all(
      this.criticalTables.map(async (entry) => [entry.key, await entry.count()] as const),
    );
    return Object.fromEntries(pairs);
  }

  private async computeFileChecksum(filePath: string) {
    const hash = createHash("sha256");
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", rejectPromise);
      stream.on("end", () => resolvePromise());
    });
    return hash.digest("hex");
  }

  private serializeBackup(item: {
    id: string;
    trigger: string;
    status: string;
    requestedByUserId: string | null;
    label: string | null;
    fileName: string | null;
    filePath: string | null;
    checksumSha256: string | null;
    sizeBytes: bigint | null;
    databaseName: string | null;
    criticalSummary: unknown;
    manifest: unknown;
    restoreSourceBackupId: string | null;
    errorMessage: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: item.id,
      trigger: item.trigger,
      status: item.status,
      requestedByUserId: item.requestedByUserId,
      label: item.label,
      fileName: item.fileName,
      filePath: item.filePath,
      checksumSha256: item.checksumSha256,
      sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : null,
      databaseName: item.databaseName,
      criticalSummary: item.criticalSummary,
      manifest: item.manifest,
      restoreSourceBackupId: item.restoreSourceBackupId,
      errorMessage: item.errorMessage,
      startedAt: item.startedAt.toISOString(),
      finishedAt: item.finishedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
