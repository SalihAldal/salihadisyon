import type { Request } from "express";

export type ScopeLevel = "public" | "tenant" | "branch" | "user";

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  branchIds: string[];
  role: string;
  permissions: string[];
  terminalId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
}

export interface RequestScopeContext {
  tenantId: string;
  branchIds: string[];
  role: string;
  permissions: string[];
  scopeLevel: ScopeLevel;
}

export interface AuditTrailContext {
  action: string;
  path: string;
  durationMs: number;
  entityType?: string;
  entityId?: string;
  statusCode?: number;
}

export interface AppRequest extends Request {
  requestId?: string;
  requestStartedAt?: number;
  user?: AuthenticatedUser;
  scope?: RequestScopeContext;
  auditTrail?: AuditTrailContext;
  idempotencyKey?: string;
}
