import { HttpException, HttpStatus } from "@nestjs/common";

export interface AppErrorOptions {
  statusCode?: number;
  code?: string;
  message: string;
  details?: Array<{ field?: string; message: string }>;
  metadata?: Record<string, unknown>;
  cause?: unknown;
}

export class AppException extends HttpException {
  readonly code: string;
  readonly details: Array<{ field?: string; message: string }>;
  readonly metadata?: Record<string, unknown>;
  override readonly cause: unknown;

  constructor(options: AppErrorOptions) {
    const statusCode = options.statusCode ?? HttpStatus.BAD_REQUEST;
    const code = options.code ?? "APP_ERROR";
    const details = options.details ?? [];
    super(
      {
        statusCode,
        code,
        message: options.message,
        errors: details,
        metadata: options.metadata,
      },
      statusCode,
    );
    this.code = code;
    this.details = details;
    this.metadata = options.metadata;
    this.cause = options.cause ?? null;
  }
}

export class AppValidationException extends AppException {
  constructor(message: string, details?: Array<{ field?: string; message: string }>, metadata?: Record<string, unknown>) {
    super({
      statusCode: HttpStatus.BAD_REQUEST,
      code: "VALIDATION_ERROR",
      message,
      details,
      metadata,
    });
  }
}

export class AppUnauthorizedException extends AppException {
  constructor(message = "Oturum gecersiz veya suresi dolmus.", metadata?: Record<string, unknown>) {
    super({
      statusCode: HttpStatus.UNAUTHORIZED,
      code: "UNAUTHORIZED",
      message,
      metadata,
    });
  }
}

export class AppForbiddenException extends AppException {
  constructor(message = "Bu islem icin yetkin yok.", metadata?: Record<string, unknown>) {
    super({
      statusCode: HttpStatus.FORBIDDEN,
      code: "FORBIDDEN",
      message,
      metadata,
    });
  }
}

export class AppNotFoundException extends AppException {
  constructor(message = "Kayit bulunamadi.", metadata?: Record<string, unknown>) {
    super({
      statusCode: HttpStatus.NOT_FOUND,
      code: "NOT_FOUND",
      message,
      metadata,
    });
  }
}

export class AppConflictException extends AppException {
  constructor(message = "Islem cakisiyor.", metadata?: Record<string, unknown>) {
    super({
      statusCode: HttpStatus.CONFLICT,
      code: "CONFLICT",
      message,
      metadata,
    });
  }
}

export class AppTooManyRequestsException extends AppException {
  constructor(message = "Cok fazla istek gonderildi. Lutfen daha sonra tekrar dene.", metadata?: Record<string, unknown>) {
    super({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      code: "TOO_MANY_REQUESTS",
      message,
      metadata,
    });
  }
}

export class AppInternalException extends AppException {
  constructor(message = "Islem su anda tamamlanamiyor. Lutfen tekrar dene.", metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message,
      metadata,
      cause,
    });
  }
}
