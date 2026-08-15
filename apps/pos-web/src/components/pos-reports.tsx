type ReportCard = {
  key: string;
  label: string;
  value: number;
  helper: string;
  tone: string;
};

type PaymentBreakdown = {
  method: string;
  amount: number;
  ratio: number;
};

type CategorySale = {
  categoryName: string;
  quantity: number;
  revenue: number;
};

type PosReportScreenProps = {
  loading: boolean;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onApply: () => void;
  onPrint: () => void;
  onExport: () => void;
  data: {
    cards?: ReportCard[];
    totals?: {
      totalSales: number;
      totalProductQuantity: number;
      totalDiscount: number;
      cancelTotal: number;
      refundTotal: number;
    };
    cancelRefundSummary?: {
      cancelledTicketCount: number;
      cancelledAmount: number;
      refundCount: number;
      refundAmount: number;
    };
    paymentBreakdown?: PaymentBreakdown[];
    categorySales?: CategorySale[];
  } | null;
};

function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value ?? 0);
}

export function PosReportScreen({
  loading,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onApply,
  onPrint,
  onExport,
  data,
}: PosReportScreenProps) {
  return (
    <div className="report-screen">
      <div className="report-filters">
        <label className="pos-field">
          <span>Baslangic Tarihi</span>
          <input type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} />
        </label>
        <label className="pos-field">
          <span>Bitis Tarihi</span>
          <input type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} />
        </label>
        <div className="pos-inline-actions">
          <button type="button" onClick={onApply} disabled={loading}>
            {loading ? "Yukleniyor..." : "Filtreyi Uygula"}
          </button>
          <button type="button" onClick={onPrint} disabled={!data}>
            Print
          </button>
          <button className="primary" type="button" onClick={onExport} disabled={!data}>
            Export
          </button>
        </div>
      </div>

      <div className="report-card-grid">
        {(data?.cards ?? []).map((card) => (
          <div key={card.key} className="report-card">
            <span>{card.label}</span>
            <strong>{formatCurrency(card.value)}</strong>
            <small>{card.helper}</small>
          </div>
        ))}
      </div>

      <div className="report-grid">
        <div className="finance-card">
          <div className="finance-card__head">
            <strong>Odeme Dagilimi</strong>
            <span>{(data?.paymentBreakdown ?? []).length} yontem</span>
          </div>
          <div className="payment-breakdown-card">
            {(data?.paymentBreakdown ?? []).map((item) => (
              <div key={item.method} className="payment-breakdown-card__row">
                <div>
                  <span>{item.method}</span>
                  <small>{`${item.ratio.toFixed(1)}%`}</small>
                </div>
                <strong>{formatCurrency(item.amount)}</strong>
              </div>
            ))}
            {(data?.paymentBreakdown ?? []).length === 0 ? <div className="status">Odeme verisi yok.</div> : null}
          </div>
        </div>

        <div className="finance-card">
          <div className="finance-card__head">
            <strong>Iptal / Iade</strong>
            <span>Durum ozeti</span>
          </div>
          <div className="payment-breakdown-card">
            <div className="payment-breakdown-card__row">
              <div>
                <span>Iptal Fis</span>
                <small>{`${data?.cancelRefundSummary?.cancelledTicketCount ?? 0} adet`}</small>
              </div>
              <strong>{formatCurrency(data?.cancelRefundSummary?.cancelledAmount ?? 0)}</strong>
            </div>
            <div className="payment-breakdown-card__row">
              <div>
                <span>Iade</span>
                <small>{`${data?.cancelRefundSummary?.refundCount ?? 0} adet`}</small>
              </div>
              <strong>{formatCurrency(data?.cancelRefundSummary?.refundAmount ?? 0)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="finance-card">
        <div className="finance-card__head">
          <strong>Kategori Bazli Satis</strong>
          <span>{(data?.categorySales ?? []).length} kategori</span>
        </div>
        <div className="report-category-table">
          <div className="report-category-table__head">
            <span>Kategori</span>
            <span>Adet</span>
            <span>Ciro</span>
          </div>
          {(data?.categorySales ?? []).map((item) => (
            <div key={item.categoryName} className="report-category-table__row">
              <strong>{item.categoryName}</strong>
              <span>{item.quantity}</span>
              <span>{formatCurrency(item.revenue)}</span>
            </div>
          ))}
          {(data?.categorySales ?? []).length === 0 ? <div className="status">Kategori satis verisi yok.</div> : null}
        </div>
      </div>
    </div>
  );
}
