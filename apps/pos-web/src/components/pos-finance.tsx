type NumericKeypadProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
};

type PaymentBreakdownRow = {
  key: string;
  label: string;
  amount: number;
  draftAmount?: number;
};

type PaymentBreakdownCardProps = {
  title: string;
  rows: PaymentBreakdownRow[];
  total: number;
};

type CashCountGridProps = {
  quantities: Record<string, number>;
  onChange: (denomination: number, quantity: number) => void;
  denominations: number[];
  total: number;
};

function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value ?? 0);
}

function sanitizeNumericInput(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = normalized.split(".");
  if (rest.length === 0) {
    return whole;
  }
  return `${whole}.${rest.join("")}`;
}

export function NumericKeypad({ value, onChange, onSubmit, submitLabel = "Ekle", submitDisabled = false }: NumericKeypadProps) {
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "00", "0", ",", "Sil", "Temizle"];

  function appendKey(key: string) {
    if (key === "Sil") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "Temizle") {
      onChange("");
      return;
    }
    if (key === ",") {
      if (!value.includes(".")) {
        onChange(value ? `${value}.` : "0.");
      }
      return;
    }
    onChange(sanitizeNumericInput(`${value}${key}`));
  }

  return (
    <div className="numeric-keypad">
      <div className="numeric-keypad__grid">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className={`${key === "Temizle" || key === "Sil" ? "danger-outline" : ""} ${key === "00" ? "double" : ""}`.trim()}
            onClick={() => appendKey(key)}
          >
            {key}
          </button>
        ))}
      </div>
      {onSubmit ? (
        <button type="button" className="numeric-keypad__submit" onClick={onSubmit} disabled={submitDisabled}>
          {submitLabel}
        </button>
      ) : null}
    </div>
  );
}

export function PaymentBreakdownCard({ title, rows, total }: PaymentBreakdownCardProps) {
  return (
    <div className="finance-card">
      <div className="finance-card__head">
        <strong>{title}</strong>
        <span>{formatCurrency(total)}</span>
      </div>
      <div className="payment-breakdown-card">
        {rows.map((row) => (
          <div key={row.key} className="payment-breakdown-card__row">
            <div>
              <span>{row.label}</span>
              {row.draftAmount && row.draftAmount > 0 ? <small>{`Taslak + ${formatCurrency(row.draftAmount)}`}</small> : null}
            </div>
            <strong>{formatCurrency(row.amount)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CashCountGrid({ quantities, onChange, denominations, total }: CashCountGridProps) {
  return (
    <div className="finance-card">
      <div className="finance-card__head">
        <strong>Nakit Sayim Grid</strong>
        <span>{formatCurrency(total)}</span>
      </div>
      <div className="cash-count-grid">
        {denominations.map((denomination) => {
          const quantity = quantities[String(denomination)] ?? 0;
          const rowTotal = denomination * quantity;
          return (
            <div key={denomination} className="cash-count-grid__cell">
              <div className="cash-count-grid__meta">
                <strong>{formatCurrency(denomination)}</strong>
                <span>{formatCurrency(rowTotal)}</span>
              </div>
              <div className="cash-count-grid__controls">
                <button type="button" onClick={() => onChange(denomination, Math.max(0, quantity - 1))}>
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={(event) => onChange(denomination, Math.max(0, Number(event.target.value) || 0))}
                />
                <button type="button" onClick={() => onChange(denomination, quantity + 1)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
