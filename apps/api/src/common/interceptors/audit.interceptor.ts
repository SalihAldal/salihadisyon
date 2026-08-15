import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import type { AppRequest } from "../types/request-context";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const startedAt = Date.now();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        request.auditTrail = {
          action: request.method,
          path: request.url,
          durationMs: Date.now() - startedAt,
          statusCode: response.statusCode,
        };
      }),
    );
  }
}
