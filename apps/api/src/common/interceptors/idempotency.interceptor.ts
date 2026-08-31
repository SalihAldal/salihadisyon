import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, catchError, concatMap, defer, from, map, switchMap, throwError } from "rxjs";
import { IdempotencyStoreService } from "../idempotency/idempotency-store.service";
import type { AppRequest } from "../types/request-context";

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyStore: IdempotencyStoreService) {}

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

    return defer(() => from(this.handleScopedRequest(scopedKey, request, next))).pipe(switchMap((stream) => stream));
  }

  private async handleScopedRequest(
    scopedKey: string,
    request: AppRequest,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const acquired = await this.idempotencyStore.acquire(scopedKey);
    if (acquired.kind === "replay") {
      request.auditTrail = {
        ...(request.auditTrail ?? { action: request.method, path: request.url, durationMs: 0 }),
        entityType: "idempotency-replay",
      };
      return new Observable((subscriber) => {
        subscriber.next(acquired.response);
        subscriber.complete();
      });
    }
    if (acquired.kind === "processing") {
      throw this.idempotencyStore.processingConflict();
    }

    return next.handle().pipe(
      concatMap((response) =>
        from(this.idempotencyStore.complete(scopedKey, response)).pipe(map(() => response)),
      ),
      catchError((error: unknown) =>
        from(this.idempotencyStore.release(scopedKey)).pipe(switchMap(() => throwError(() => error))),
      ),
    );
  }
}
