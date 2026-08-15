import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { apiRuntimeConfig } from "@adisyon/config";
import type { AppRequest } from "../types/request-context";
import { AppException } from "../errors/app-error";
import { MonitoringService } from "../../modules/monitoring/monitoring.service";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly monitoringService: MonitoringService) {}

  private buildBasePayload(statusCode: number) {
    return {
      statusCode,
      code: undefined as string | undefined,
      message: "Beklenmeyen bir hata olustu.",
      errors: [] as Array<{ field?: string; message: string }>,
      metadata: undefined as Record<string, unknown> | undefined,
    };
  }

  private normalizeErrorPayload(payload: unknown, statusCode: number) {
    if (typeof payload === "string") {
      return {
        ...this.buildBasePayload(statusCode),
        message: payload,
      };
    }

    if (Array.isArray(payload)) {
      const details = payload.map((entry) => ({ message: String(entry) }));
      return {
        ...this.buildBasePayload(statusCode),
        message: details[0]?.message ?? "Istek dogrulanamadi.",
        errors: details,
      };
    }

    if (payload && typeof payload === "object") {
      const record = payload as {
        message?: string | string[];
        code?: string;
        error?: string;
        errors?: Array<{ field?: string; message?: string }> | Array<string>;
        metadata?: Record<string, unknown>;
      };

      const normalizedErrors = Array.isArray(record.errors)
        ? record.errors.map((entry) =>
            typeof entry === "string" ? { message: entry } : { field: entry.field, message: entry.message ?? "Gecersiz alan." },
          )
        : Array.isArray(record.message)
          ? record.message.map((entry) => ({ message: String(entry) }))
          : [];

      const message =
        typeof record.message === "string"
          ? record.message
          : Array.isArray(record.message)
            ? String(record.message[0] ?? record.error ?? "Istek dogrulanamadi.")
            : record.error ?? normalizedErrors[0]?.message ?? "Beklenmeyen bir hata olustu.";

      return {
        ...this.buildBasePayload(statusCode),
        code: typeof record.code === "string" ? record.code : undefined,
        message,
        errors: normalizedErrors,
        metadata: record.metadata,
      };
    }

    return {
      ...this.buildBasePayload(statusCode),
    };
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();
    const request = context.getRequest<AppRequest>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttpException ? exception.getResponse() : { message: "Beklenmeyen bir hata olustu." };
    const normalizedPayload = this.normalizeErrorPayload(payload, statusCode);
    const isProduction = apiRuntimeConfig.nodeEnv === "production";
    const safeMessage = statusCode >= 500 ? "Beklenmeyen bir hata olustu. Lutfen daha sonra tekrar dene." : normalizedPayload.message;
    const safeErrors = statusCode >= 500 ? [] : normalizedPayload.errors;
    const exceptionStack = exception instanceof Error ? exception.stack : undefined;

    this.logger.error({
      requestId: request.requestId,
      path: request.url,
      method: request.method,
      statusCode,
      userId: request.user?.userId,
      ipAddress: request.ip,
      payload: normalizedPayload,
      stack: exceptionStack,
    });

    if (!isHttpException && exception instanceof Error) {
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    void this.monitoringService.captureHttpError({
      companyId: request.user?.tenantId ?? request.scope?.tenantId ?? null,
      branchId: request.user?.branchIds?.[0] ?? null,
      userId: request.user?.userId ?? null,
      requestId: request.requestId ?? null,
      method: request.method,
      path: request.url,
      statusCode,
      errorCode:
        exception instanceof AppException
          ? exception.code
          : normalizedPayload.code ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "HTTP_ERROR"),
      errorMessage: normalizedPayload.message,
      stack: exceptionStack ?? null,
      durationMs: request.requestStartedAt ? Date.now() - request.requestStartedAt : request.auditTrail?.durationMs ?? 0,
      metadata: {
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        requestPath: request.url,
      },
    });

    response.setHeader("x-request-id", request.requestId ?? "");
    response.status(statusCode).json({
      success: false,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: {
        statusCode,
        code:
          exception instanceof AppException
            ? exception.code
            : normalizedPayload.code ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "HTTP_ERROR"),
        message: safeMessage,
        errors: safeErrors,
        ...(normalizedPayload.metadata ? { metadata: normalizedPayload.metadata } : {}),
        ...(!isProduction && exceptionStack ? { debug: { stack: exceptionStack } } : {}),
      },
    });
  }
}
