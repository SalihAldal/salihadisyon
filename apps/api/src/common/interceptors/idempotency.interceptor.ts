import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, catchError, tap, throwError } from "rxjs";
import type { AppRequest } from "../types/request-context";

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly cache = new Map<string, { status: "processing" | "completed"; response?: unknown }>();

  private buildScopedKey(request: AppRequest, key: string) {
    const tenantScope = request.user?.tenantId ?? request.scope?.tenantId ?? "public";
    const actorScope = request.user?.userId ?? request.ip ?? "anonymous";
    const routePath = request.route?.path ?? request.url.split("?")[0] ?? request.url;
    return `${tenantScope}:${actorScope}:${request.method}:${routePath}:${key}`;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const key = request.idempotencyKey;

    if (!key || request.method === "GET") {
      return next.handle();
    }

    const scopedKey = this.buildScopedKey(request, key);
    const cached = this.cache.get(scopedKey);
    if (cached?.status === "completed" && cached.response) {
      request.auditTrail = {
        ...(request.auditTrail ?? { action: request.method, path: request.url, durationMs: 0 }),
        entityType: "idempotency-replay",
      };
      return new Observable((subscriber) => {
        subscriber.next(cached.response);
        subscriber.complete();
      });
    }

    this.cache.set(scopedKey, { status: "processing" });

    return next.handle().pipe(
      tap((response) => {
        this.cache.set(scopedKey, { status: "completed", response });
      }),
      catchError((error: unknown) => {
        this.cache.delete(scopedKey);
        return throwError(() => error);
      }),
    );
  }
}
