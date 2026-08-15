"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getStoredAccessToken } from "../../lib/auth/session";
import { apiClient } from "../../lib/api/client";

type FeatureFlagMap = Record<string, boolean>;

const FeatureFlagContext = createContext<FeatureFlagMap>({});

export function FeatureFlagProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlagMap>({});

  useEffect(() => {
    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      setFlags({});
      return;
    }

    let active = true;
    apiClient
      .evaluateFeatureFlags(accessToken, "admin-web")
      .then((response) => {
        if (!active) return;
        setFlags(Object.fromEntries(response.items.map((item) => [item.key, item.effectiveEnabled])));
      })
      .catch(() => {
        if (active) setFlags({});
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => flags, [flags]);
  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

export function useFeatureFlag(key: string) {
  const flags = useContext(FeatureFlagContext);
  return Boolean(flags[key]);
}
