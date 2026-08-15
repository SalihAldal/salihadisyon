type CurrencyOptions = {
  maximumFractionDigits?: number;
};

type DateTimeOptions = Intl.DateTimeFormatOptions;

const DEFAULT_CURRENCY_OPTIONS: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
};

export function formatTryCurrency(value: number, options?: CurrencyOptions) {
  return new Intl.NumberFormat("tr-TR", {
    ...DEFAULT_CURRENCY_OPTIONS,
    maximumFractionDigits: options?.maximumFractionDigits ?? DEFAULT_CURRENCY_OPTIONS.maximumFractionDigits,
  }).format(value);
}

export function formatTryCurrencySafe(value: unknown, options?: CurrencyOptions) {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "-";
  return formatTryCurrency(amount, options);
}

export function formatTrDateTime(value: string, options?: DateTimeOptions) {
  return new Intl.DateTimeFormat("tr-TR", options).format(new Date(value));
}

export function formatTrDateTimeSafe(value: string | null | undefined, fallback = "-", options?: DateTimeOptions) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback === "-" ? String(value) : fallback;
  return new Intl.DateTimeFormat("tr-TR", options).format(date);
}

export function formatTrNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat("tr-TR", options).format(value);
}
