import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Observable } from "rxjs";
import type { AppRequest } from "../types/request-context";

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    request.requestId = request.headers["x-request-id"]?.toString() ?? randomUUID();
    request.requestStartedAt = Date.now();
    request.idempotencyKey = request.headers["idempotency-key"]?.toString();
    return next.handle();
  }
}
