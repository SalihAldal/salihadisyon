import { getApiRuntimeEnv, getWebRuntimeEnv } from "./env";

export type { ApiRuntimeEnv, WebRuntimeEnv } from "./env";
export {
  ROLE_PERMISSION_DEFAULTS,
  getRoleDefaultPermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isFullAccessRole,
  mergeEffectivePermissions,
  resolvePrimaryRole,
} from "./rbac";
export type { AppRoleKey } from "./rbac";
export { featureFlagClients, featureFlagRegistry, getFeatureFlagDefinition, listFeatureFlagDefinitions } from "./feature-flags";
export type { FeatureFlagClient, FeatureFlagDefinition, FeatureFlagKey } from "./feature-flags";

export const runtimeConfig = getWebRuntimeEnv();
export const apiRuntimeConfig = getApiRuntimeEnv();
