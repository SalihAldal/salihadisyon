function isJsonLikeString(value: string) {
  const text = value.trim();
  return (text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"));
}

function isIsoDateString(value: string) {
  const text = value.trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text);
}

function formatDateTimeTr(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function parseLooseValue(value: string): unknown {
  const text = value.trim();
  if (!text) return "";
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

export function parsePossibleJsonString(value: string): unknown {
  if (!isJsonLikeString(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toInlineText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Aktif" : "Pasif";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (isIsoDateString(value)) {
      return formatDateTimeTr(value);
    }
    const parsed = parsePossibleJsonString(value);
    return parsed === value ? value : toInlineText(parsed);
  }
  if (Array.isArray(value)) {
    if (!value.length) return "-";
    return value.map((item) => toInlineText(item)).join(", ");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return "-";
    return entries.map(([key, entryValue]) => `${key}: ${toInlineText(entryValue)}`).join(" | ");
  }
  return String(value);
}

export function formatReadableValue(value: unknown) {
  if (typeof value === "number") return value;
  return toInlineText(value);
}

export function formatJsonFieldForTextarea(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const parsed = parsePossibleJsonString(value);
    if (parsed === value) return value;
    return formatJsonFieldForTextarea(parsed);
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "object" ? toInlineText(item) : String(item ?? ""))).join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => `${key}: ${Array.isArray(entryValue) ? entryValue.map((item) => String(item)).join(", ") : toInlineText(entryValue)}`)
      .join("\n");
  }
  return String(value);
}

export function parseJsonFieldFromTextarea(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return null;

  const parsed = parsePossibleJsonString(text);
  if (parsed !== text) return parsed;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  const allKeyValue = lines.every((line) => line.includes(":"));
  if (allKeyValue) {
    const result: Record<string, unknown> = {};
    lines.forEach((line) => {
      const separatorIndex = line.indexOf(":");
      const key = line.slice(0, separatorIndex).trim();
      const raw = line.slice(separatorIndex + 1).trim();
      if (!key) return;
      if (!raw) {
        result[key] = "";
        return;
      }
      if (raw.includes(",")) {
        result[key] = raw
          .split(",")
          .map((item) => parseLooseValue(item))
          .filter((item) => item !== "");
        return;
      }
      result[key] = parseLooseValue(raw);
    });
    return result;
  }

  if (text.includes(",")) {
    return text
      .split(",")
      .map((item) => parseLooseValue(item))
      .filter((item) => item !== "");
  }

  return lines.length > 1 ? lines.map((line) => parseLooseValue(line)) : parseLooseValue(text);
}

type FieldLike = { key: string; type: string };

export function normalizeJsonFieldsForSubmit(fields: FieldLike[], formData: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...formData };
  fields.forEach((field) => {
    if (field.type === "json") {
      next[field.key] = parseJsonFieldFromTextarea(next[field.key]);
    }
  });
  return next;
}
