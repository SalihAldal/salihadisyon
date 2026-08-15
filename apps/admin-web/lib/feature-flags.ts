export type FeatureFlagClient = "admin-web" | "pos-web" | "api";

export interface FeatureFlagItem {
  key: string;
  label: string;
  description: string;
  category: string;
  targets: FeatureFlagClient[];
  defaultEnabled: boolean;
  effectiveEnabled: boolean;
  constraints: {
    rolloutPercentage: number;
    allowedRoleKeys: string[];
    allowedUserIds: string[];
    allowedBranchIds: string[];
    clients: FeatureFlagClient[];
  };
  override?: {
    enabled: boolean;
    rolloutPercentage: number;
    allowedRoleKeys: string[];
    allowedUserIds: string[];
    allowedBranchIds: string[];
    clients: FeatureFlagClient[];
    note: string | null;
    updatedAt: string | null;
    updatedByUserId: string | null;
  } | null;
}

export interface FeatureFlagListResponse {
  items: FeatureFlagItem[];
}
