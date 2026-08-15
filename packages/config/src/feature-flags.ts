export const featureFlagClients = ["admin-web", "pos-web", "api"] as const;

export type FeatureFlagClient = (typeof featureFlagClients)[number];

export const featureFlagRegistry = {
  new_payment_system: {
    key: "new_payment_system",
    label: "Yeni Odeme Sistemi",
    description: "Yeni odeme akisini kontrollu sekilde canliya almak icin kullanilir.",
    category: "payments",
    targets: ["admin-web", "pos-web", "api"] as FeatureFlagClient[],
    defaultEnabled: false,
  },
  new_report_screen: {
    key: "new_report_screen",
    label: "Yeni Rapor Ekrani",
    description: "Yeni rapor deneyimini secili kullanicilar veya subeler icin acmaya yarar.",
    category: "reports",
    targets: ["admin-web"] as FeatureFlagClient[],
    defaultEnabled: false,
  },
  beta_features: {
    key: "beta_features",
    label: "Beta Ozellikler",
    description: "Deneysel modulleri sadece secili kitleye gostermek icin kullanilir.",
    category: "beta",
    targets: ["admin-web", "pos-web"] as FeatureFlagClient[],
    defaultEnabled: false,
  },
} as const;

export type FeatureFlagKey = keyof typeof featureFlagRegistry;
export type FeatureFlagDefinition = (typeof featureFlagRegistry)[FeatureFlagKey];

export function getFeatureFlagDefinition(key: string) {
  return featureFlagRegistry[key as FeatureFlagKey] ?? null;
}

export function listFeatureFlagDefinitions() {
  return Object.values(featureFlagRegistry);
}
