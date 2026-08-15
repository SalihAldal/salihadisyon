export function getValueByPath(item: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), item);
}
