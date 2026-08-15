export interface ApiRuntimeEnv {
  nodeEnv: string;
  appEnv: string;
  port: number;
  apiCurrentVersion: string;
  apiSupportedVersions: string;
  databaseUrl: string;
  redisUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtl: string;
  jwtRefreshTtl: string;
  monitoringWebhookUrl: string;
  monitoringWebhookToken: string;
  monitoringEmailEndpoint: string;
  monitoringEmailToken: string;
  monitoringEmailTo: string;
  monitoringAlertStatusCodes: string;
  monitoringAlertErrorCodes: string;
  monitoringAlertDedupMs: number;
}

export interface WebRuntimeEnv {
  appName: string;
  apiUrl: string;
  socketUrl: string;
  s3Bucket: string;
}

function getSafeProcessEnv() {
  if (typeof globalThis !== "undefined" && "process" in globalThis) {
    const candidate = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    if (candidate?.env) {
      return candidate.env;
    }
  }
  return {};
}

export function getApiRuntimeEnv(env?: Record<string, string | undefined>): ApiRuntimeEnv {
  const source = env ?? getSafeProcessEnv();
  return {
    nodeEnv: source.NODE_ENV ?? "development",
    appEnv: source.APP_ENV ?? "local",
    port: Number(source.PORT ?? 4000),
    apiCurrentVersion: source.API_CURRENT_VERSION ?? "v1",
    apiSupportedVersions: source.API_SUPPORTED_VERSIONS ?? "v1,v2",
    databaseUrl: source.DATABASE_URL ?? "",
    redisUrl: source.REDIS_URL ?? "",
    jwtAccessSecret: source.JWT_ACCESS_SECRET ?? "",
    jwtRefreshSecret: source.JWT_REFRESH_SECRET ?? "",
    jwtAccessTtl: source.JWT_ACCESS_TTL ?? "15m",
    jwtRefreshTtl: source.JWT_REFRESH_TTL ?? "7d",
    monitoringWebhookUrl: source.MONITORING_ALERT_WEBHOOK_URL ?? "",
    monitoringWebhookToken: source.MONITORING_ALERT_WEBHOOK_TOKEN ?? "",
    monitoringEmailEndpoint: source.MONITORING_ALERT_EMAIL_ENDPOINT ?? "",
    monitoringEmailToken: source.MONITORING_ALERT_EMAIL_TOKEN ?? "",
    monitoringEmailTo: source.MONITORING_ALERT_EMAIL_TO ?? "",
    monitoringAlertStatusCodes: source.MONITORING_ALERT_STATUS_CODES ?? "500,502,503,504",
    monitoringAlertErrorCodes: source.MONITORING_ALERT_ERROR_CODES ?? "INTERNAL_ERROR",
    monitoringAlertDedupMs: Number(source.MONITORING_ALERT_DEDUP_MS ?? 300000),
  };
}

export function getWebRuntimeEnv(env?: Record<string, string | undefined>): WebRuntimeEnv {
  const source = env ?? getSafeProcessEnv();
  return {
    appName: source.NEXT_PUBLIC_APP_NAME ?? "Adisyon SaaS Platform",
    apiUrl: source.NEXT_PUBLIC_API_URL ?? "/api/v1",
    socketUrl: source.NEXT_PUBLIC_SOCKET_URL ?? "/pos",
    s3Bucket: source.S3_BUCKET ?? "adisyon",
  };
}
