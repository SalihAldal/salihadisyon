import { createHash } from "crypto";
import { apiRuntimeConfig, hasPermission } from "@adisyon/config";
import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { MonitoringAnalysisQueryDto } from "./dto/monitoring-analysis-query.dto";

type MonitoringCaptureInput = {
  companyId?: string | null;
  branchId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  errorCode?: string | null;
  errorMessage: string;
  stack?: string | null;
  metadata?: Record<string, unknown>;
  durationMs?: number;
};

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly alertCache = new Map<string, number>();
  private readonly alertStatusCodes = new Set(
    apiRuntimeConfig.monitoringAlertStatusCodes
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item)),
  );
  private readonly alertErrorCodes = new Set(
    apiRuntimeConfig.monitoringAlertErrorCodes
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

  constructor(private readonly prisma: PrismaService) {}

  async captureHttpError(input: MonitoringCaptureInput) {
    const severity = this.resolveSeverity(input.statusCode);
    const fingerprint = this.buildFingerprint(input);
    const shouldAlert = this.shouldSendAlert(input.statusCode, input.errorCode ?? null, severity, fingerprint);
    const alertChannels = shouldAlert ? await this.dispatchAlerts({ ...input, severity, fingerprint }) : [];

    try {
      await Promise.all([
        this.prisma.apiLog.create({
          data: {
            companyId: input.companyId ?? null,
            branchId: input.branchId ?? null,
            method: input.method,
            path: input.path,
            statusCode: input.statusCode,
            durationMs: input.durationMs ?? 0,
            requestId: input.requestId ?? crypto.randomUUID?.() ?? createHash("sha1").update(fingerprint).digest("hex").slice(0, 24),
          },
        }),
        this.prisma.systemMonitorEvent.create({
          data: {
            companyId: input.companyId ?? null,
            branchId: input.branchId ?? null,
            userId: input.userId ?? null,
            requestId: input.requestId ?? null,
            method: input.method,
            path: input.path,
            statusCode: input.statusCode,
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage,
            severity,
            fingerprint,
            isAlertSent: alertChannels.length > 0,
            alertChannels: alertChannels.length > 0 ? alertChannels : undefined,
            metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            stack: input.stack ?? undefined,
          },
        }),
      ]);
    } catch (error) {
      this.logger.error(
        `Monitoring kaydi yazilamadi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async analyzeErrors(actor: AuthenticatedUser, query: MonitoringAnalysisQueryDto) {
    if (!hasPermission(actor, "monitoring.view")) {
      throw new ForbiddenException("Monitoring verisini gormek icin yetkin yok.");
    }
    if (query.branchId && !actor.branchIds.includes(query.branchId)) {
      throw new ForbiddenException("Istenen sube icin yetkin yok.");
    }

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
    const limit = query.limit ?? 25;
    const where: Prisma.SystemMonitorEventWhereInput = {
      companyId: actor.tenantId,
      createdAt: {
        gte: dateFrom,
        lte: dateTo,
      },
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
    };

    const events = await this.prisma.systemMonitorEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.max(limit, 100),
    });

    const summary = {
      totalErrors: events.length,
      criticalCount: events.filter((event) => event.severity === "CRITICAL").length,
      alertSentCount: events.filter((event) => event.isAlertSent).length,
      uniqueFingerprints: new Set(events.map((event) => event.fingerprint)).size,
    };

    const topPaths = this.buildTopList(events, (event) => event.path);
    const topCodes = this.buildTopList(events, (event) => event.errorCode ?? "UNKNOWN");
    const byStatus = this.buildTopList(events, (event) => String(event.statusCode));
    const bySeverity = this.buildTopList(events, (event) => event.severity);

    return {
      filters: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        branchId: query.branchId ?? null,
        severity: query.severity ?? null,
      },
      summary,
      byStatus,
      bySeverity,
      topPaths,
      topCodes,
      recentEvents: events.slice(0, limit).map((event) => ({
        id: event.id,
        requestId: event.requestId,
        method: event.method,
        path: event.path,
        statusCode: event.statusCode,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage,
        severity: event.severity,
        branchId: event.branchId,
        isAlertSent: event.isAlertSent,
        alertChannels: Array.isArray(event.alertChannels) ? event.alertChannels : [],
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  private buildTopList(events: Array<Record<string, any>>, selector: (event: any) => string) {
    const counts = new Map<string, number>();
    for (const event of events) {
      const key = selector(event);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([key, count]) => ({ key, count }));
  }

  private resolveSeverity(statusCode: number): "WARNING" | "ERROR" | "CRITICAL" {
    if (statusCode >= 500) {
      return "CRITICAL";
    }
    if (statusCode === 429 || statusCode === 401 || statusCode === 403 || statusCode === 404) {
      return "WARNING";
    }
    return "ERROR";
  }

  private buildFingerprint(input: MonitoringCaptureInput) {
    return createHash("sha256")
      .update(`${input.method}:${input.path}:${input.statusCode}:${input.errorCode ?? ""}:${input.errorMessage}`)
      .digest("hex");
  }

  private shouldSendAlert(statusCode: number, errorCode: string | null, severity: string, fingerprint: string) {
    if (severity !== "CRITICAL" && !this.alertStatusCodes.has(statusCode) && !(errorCode && this.alertErrorCodes.has(errorCode))) {
      return false;
    }

    const now = Date.now();
    const lastSentAt = this.alertCache.get(fingerprint) ?? 0;
    if (now - lastSentAt < apiRuntimeConfig.monitoringAlertDedupMs) {
      return false;
    }

    this.alertCache.set(fingerprint, now);
    return true;
  }

  private async dispatchAlerts(input: MonitoringCaptureInput & { severity: string; fingerprint: string }) {
    const channels: string[] = [];
    const payload = {
      title: `API ${input.severity} hatasi`,
      severity: input.severity,
      requestId: input.requestId ?? null,
      companyId: input.companyId ?? null,
      branchId: input.branchId ?? null,
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage,
      fingerprint: input.fingerprint,
      createdAt: new Date().toISOString(),
      metadata: input.metadata ?? {},
    };

    if (apiRuntimeConfig.monitoringWebhookUrl) {
      try {
        await fetch(apiRuntimeConfig.monitoringWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiRuntimeConfig.monitoringWebhookToken
              ? { Authorization: `Bearer ${apiRuntimeConfig.monitoringWebhookToken}` }
              : {}),
          },
          body: JSON.stringify(payload),
        });
        channels.push("webhook");
      } catch (error) {
        this.logger.warn(`Webhook alert gonderilemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
      }
    }

    if (apiRuntimeConfig.monitoringEmailEndpoint && apiRuntimeConfig.monitoringEmailTo) {
      try {
        await fetch(apiRuntimeConfig.monitoringEmailEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiRuntimeConfig.monitoringEmailToken
              ? { Authorization: `Bearer ${apiRuntimeConfig.monitoringEmailToken}` }
              : {}),
          },
          body: JSON.stringify({
            to: apiRuntimeConfig.monitoringEmailTo,
            subject: `[${input.severity}] API hatasi - ${input.statusCode} ${input.method} ${input.path}`,
            text: [
              `Request ID: ${input.requestId ?? "-"}`,
              `Tenant: ${input.companyId ?? "-"}`,
              `Sube: ${input.branchId ?? "-"}`,
              `Yol: ${input.method} ${input.path}`,
              `Status: ${input.statusCode}`,
              `Kod: ${input.errorCode ?? "-"}`,
              `Mesaj: ${input.errorMessage}`,
            ].join("\n"),
            payload,
          }),
        });
        channels.push("email");
      } catch (error) {
        this.logger.warn(`Email alert gonderilemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
      }
    }

    return channels;
  }
}
