const SUSPICIOUS_INPUT_PATTERNS = [
  /<script\b/gi,
  /<\/script>/gi,
  /javascript:/gi,
  /onerror\s*=/gi,
  /onload\s*=/gi,
  /union\s+select/gi,
  /drop\s+table/gi,
  /insert\s+into/gi,
  /delete\s+from/gi,
  /update\s+\w+\s+set/gi,
  /--/g,
  /\/\*/g,
  /\*\//g,
];

export function sanitizeTextInput(value: string) {
  let next = value;
  for (const pattern of SUSPICIOUS_INPUT_PATTERNS) {
    next = next.replace(pattern, "");
  }
  return next
    .replace(/[<>]/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

export function sanitizeUnknownInput<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeTextInput(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknownInput(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeUnknownInput(item)]),
    ) as T;
  }
  return value;
}
