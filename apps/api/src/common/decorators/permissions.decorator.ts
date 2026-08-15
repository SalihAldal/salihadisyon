import { SetMetadata } from "@nestjs/common";
import type { ScopeLevel as RequestScopeLevel } from "../types/request-context";

export const PERMISSIONS_KEY = "permissions";
export const SCOPE_LEVEL_KEY = "scopeLevel";

export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const ScopeLevel = (level: RequestScopeLevel) => SetMetadata(SCOPE_LEVEL_KEY, level);
