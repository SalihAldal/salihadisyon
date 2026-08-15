import "reflect-metadata";
import "dotenv/config";
import { Logger, ValidationError, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import type { Request, Response, NextFunction } from "express";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { apiRuntimeConfig } from "@adisyon/config";
import { AppModule } from "./app.module";
import { AppValidationException } from "./common/errors/app-error";
import { sanitizeUnknownInput } from "./common/security/sanitize";

function flattenValidationErrors(errors: ValidationError[], parentPath = ""): Array<{ field: string; message: string }> {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const current = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    const nested = error.children?.length ? flattenValidationErrors(error.children, field) : [];
    return [...current, ...nested];
  });
}

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", reason instanceof Error ? reason.stack : JSON.stringify(reason));
  });
  process.on("uncaughtException", (error) => {
    logger.error(`Uncaught exception: ${error.message}`, error.stack);
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const currentApiVersion = apiRuntimeConfig.apiCurrentVersion || "v1";
  const supportedApiVersions = apiRuntimeConfig.apiSupportedVersions
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  app.set("trust proxy", 1);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const versionMatch = request.url.match(/^\/api\/(v\d+)(\/.*)?$/i);
    if (!versionMatch) {
      next();
      return;
    }

    const requestedVersion = versionMatch[1].toLowerCase();
    const restPath = versionMatch[2] ?? "";
    if (!supportedApiVersions.includes(requestedVersion)) {
      response.status(404).json({
        success: false,
        error: {
          statusCode: 404,
          code: "API_VERSION_NOT_SUPPORTED",
          message: `Desteklenmeyen API versiyonu: ${requestedVersion}`,
        },
      });
      return;
    }

    response.setHeader("x-api-version", requestedVersion);
    response.setHeader("x-api-current-version", currentApiVersion);
    if (requestedVersion !== currentApiVersion) {
      response.setHeader("x-api-version-mode", "compat");
      request.url = `/api/${currentApiVersion}${restPath}`;
    }
    next();
  });
  app.setGlobalPrefix(`api/${currentApiVersion}`);
  app.disable("x-powered-by");
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Cache-Control", "no-store");
    if (request.body && typeof request.body === "object") {
      request.body = sanitizeUnknownInput(request.body);
    }
    if (request.query && typeof request.query === "object") {
      const sanitizedQuery = sanitizeUnknownInput(request.query);
      if (sanitizedQuery && typeof sanitizedQuery === "object") {
        Object.keys(request.query).forEach((key) => {
          delete (request.query as Record<string, unknown>)[key];
        });
        Object.assign(request.query, sanitizedQuery);
      }
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      stopAtFirstError: true,
      validationError: {
        target: false,
        value: false,
      },
      exceptionFactory: (errors: ValidationError[]) => {
        const details = flattenValidationErrors(errors);
        return new AppValidationException(details[0]?.message ?? "Gecersiz istek verisi.", details);
      },
    }),
  );
  await app.listen(apiRuntimeConfig.port);
  logger.log(`API hazir: http://localhost:${apiRuntimeConfig.port}/api/${currentApiVersion}`);
}

bootstrap();
