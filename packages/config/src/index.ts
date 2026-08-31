import { getApiRuntimeEnv, getWebRuntimeEnv } from "./env";

export type { ApiRuntimeEnv, WebRuntimeEnv } from "./env";
export { assertProductionRuntimeConfig, getApiRuntimeEnv } from "./env";
export { allPermissionKeys, permissionCatalog } from "./permissions";
export type { PermissionDomain } from "./permissions";
export {
  ROLE_PERMISSION_DEFAULTS,
  getRoleDefaultPermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isFullAccessRole,
  isWaiterRole,
  mergeEffectivePermissions,
  resolvePrimaryRole,
  roleMatrix,
} from "./rbac";
export type { AppRoleKey, RoleKey } from "./rbac";
export { featureFlagClients, featureFlagRegistry, getFeatureFlagDefinition, listFeatureFlagDefinitions } from "./feature-flags";
export type { FeatureFlagClient, FeatureFlagDefinition, FeatureFlagKey } from "./feature-flags";

export const runtimeConfig = getWebRuntimeEnv();
export const apiRuntimeConfig = getApiRuntimeEnv();
