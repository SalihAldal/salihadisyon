export interface MobileAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  activeRole: "owner" | "regional_manager" | "branch_manager" | "operations_manager";
  biometricEnabled: boolean;
}

export interface MobileBranchContext {
  selectedBranchId: string | null;
  availableBranchIds: string[];
  dateRange: "today" | "week" | "month" | "custom";
}

export interface MobileNetworkState {
  isOnline: boolean;
  websocketConnected: boolean;
  lastSyncAt: string | null;
  hasUnreadCriticalAlert: boolean;
}

export interface MobileManagerRootState {
  auth: MobileAuthState;
  branch: MobileBranchContext;
  network: MobileNetworkState;
}

export const initialMobileManagerState: MobileManagerRootState = {
  auth: {
    accessToken: null,
    refreshToken: null,
    activeRole: "owner",
    biometricEnabled: false,
  },
  branch: {
    selectedBranchId: "branch_nisantasi",
    availableBranchIds: ["branch_nisantasi", "branch_etiler", "branch_kadikoy"],
    dateRange: "today",
  },
  network: {
    isOnline: true,
    websocketConnected: true,
    lastSyncAt: null,
    hasUnreadCriticalAlert: true,
  },
};
