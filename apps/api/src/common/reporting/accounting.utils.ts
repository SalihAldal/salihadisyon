type PaymentLike = {
  method?: string;
  amount: unknown;
  status?: string | null;
};

type TicketItemLike = {
  quantity: unknown;
  lineTotal: unknown;
  product?: {
    category?: {
      id?: string | null;
      name?: string | null;
    } | null;
  } | null;
};

type TicketLike = {
  grandTotal: unknown;
  subtotal?: unknown;
  discountTotal?: unknown;
  taxTotal?: unknown;
  payments?: PaymentLike[];
  items?: TicketItemLike[];
};

type RefundLike = {
  amount: unknown;
};

type RegisterTransactionLike = {
  type: string;
  paymentType: string;
  amount: unknown;
};

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sumTicketRevenue(tickets: TicketLike[]) {
  return roundCurrency(tickets.reduce((sum, ticket) => sum + Number(ticket.grandTotal ?? 0), 0));
}

export function sumTicketDiscount(tickets: TicketLike[]) {
  return roundCurrency(tickets.reduce((sum, ticket) => sum + Number(ticket.discountTotal ?? 0), 0));
}

export function sumRefundAmount(refunds: RefundLike[]) {
  return roundCurrency(refunds.reduce((sum, refund) => sum + Number(refund.amount ?? 0), 0));
}

export function flattenCompletedPayments(tickets: Array<{ payments?: PaymentLike[] }>) {
  return tickets.flatMap((ticket) => (ticket.payments ?? []).filter((payment) => !payment.status || payment.status === "COMPLETED"));
}

export function aggregatePaymentMethods(payments: PaymentLike[]) {
  const methodMap = new Map<string, { method: string; amount: number; count: number; averageAmount: number }>();
  for (const payment of payments) {
    const method = payment.method ?? "UNKNOWN";
    const amount = roundCurrency(Number(payment.amount ?? 0));
    const current = methodMap.get(method) ?? {
      method,
      amount: 0,
      count: 0,
      averageAmount: 0,
    };
    current.amount = roundCurrency(current.amount + amount);
    current.count += 1;
    current.averageAmount = current.count > 0 ? roundCurrency(current.amount / current.count) : 0;
    methodMap.set(method, current);
  }
  return methodMap;
}

export function summarizeRegisterTransactions(rows: RegisterTransactionLike[]) {
  const gross = {
    sales: 0,
    expenses: 0,
    refunds: 0,
  };
  const byMethod = {
    cash: 0,
    card: 0,
    mobile: 0,
  };

  for (const row of rows) {
    const amount = roundCurrency(Number(row.amount ?? 0));
    const paymentType = normalizeRegisterPaymentType(row.paymentType);

    if (row.type === "sale") {
      gross.sales = roundCurrency(gross.sales + amount);
      byMethod[paymentType] = roundCurrency(byMethod[paymentType] + amount);
      continue;
    }

    if (row.type === "refund") {
      gross.refunds = roundCurrency(gross.refunds + amount);
      byMethod[paymentType] = roundCurrency(byMethod[paymentType] - amount);
      continue;
    }

    if (row.type === "expense") {
      gross.expenses = roundCurrency(gross.expenses + amount);
      byMethod[paymentType] = roundCurrency(byMethod[paymentType] - amount);
    }
  }

  return {
    sales: gross.sales,
    expenses: gross.expenses,
    refunds: gross.refunds,
    net: {
      cash: byMethod.cash,
      card: byMethod.card,
      mobile: byMethod.mobile,
      total: roundCurrency(byMethod.cash + byMethod.card + byMethod.mobile),
    },
  };
}

export function buildCategoryDistribution(tickets: TicketLike[]) {
  const categoryMap = new Map<
    string,
    {
      categoryId: string | null;
      categoryName: string;
      quantity: number;
      grossRevenue: number;
      revenue: number;
      discount: number;
      tax: number;
      itemCount: number;
    }
  >();

  for (const ticket of tickets) {
    const items = ticket.items ?? [];
    if (!items.length) {
      continue;
    }

    const subtotal = roundCurrency(
      Number(ticket.subtotal ?? items.reduce((sum, item) => sum + Number(item.lineTotal ?? 0), 0)),
    );
    const discountTotal = roundCurrency(Number(ticket.discountTotal ?? 0));
    const taxTotal = roundCurrency(Number(ticket.taxTotal ?? 0));
    const grandTotal = roundCurrency(Number(ticket.grandTotal ?? 0));
    let allocatedNet = 0;
    let allocatedDiscount = 0;
    let allocatedTax = 0;

    items.forEach((item, index) => {
      const lineTotal = roundCurrency(Number(item.lineTotal ?? 0));
      const weight = subtotal > 0 ? lineTotal / subtotal : 1 / items.length;
      const isLast = index === items.length - 1;
      const discountShare = isLast ? roundCurrency(discountTotal - allocatedDiscount) : roundCurrency(discountTotal * weight);
      const taxShare = isLast ? roundCurrency(taxTotal - allocatedTax) : roundCurrency(taxTotal * weight);
      const netRevenue = isLast ? roundCurrency(grandTotal - allocatedNet) : roundCurrency(lineTotal - discountShare + taxShare);
      const categoryId = item.product?.category?.id ?? null;
      const categoryName = item.product?.category?.name ?? "Kategorisiz";
      const key = categoryId ?? "uncategorized";
      const current = categoryMap.get(key) ?? {
        categoryId,
        categoryName,
        quantity: 0,
        grossRevenue: 0,
        revenue: 0,
        discount: 0,
        tax: 0,
        itemCount: 0,
      };

      current.quantity = roundCurrency(current.quantity + Number(item.quantity ?? 0));
      current.grossRevenue = roundCurrency(current.grossRevenue + lineTotal);
      current.revenue = roundCurrency(current.revenue + netRevenue);
      current.discount = roundCurrency(current.discount + discountShare);
      current.tax = roundCurrency(current.tax + taxShare);
      current.itemCount += 1;
      categoryMap.set(key, current);

      allocatedNet = roundCurrency(allocatedNet + netRevenue);
      allocatedDiscount = roundCurrency(allocatedDiscount + discountShare);
      allocatedTax = roundCurrency(allocatedTax + taxShare);
    });
  }

  return [...categoryMap.values()].map((row) => ({
    ...row,
    averageLineRevenue: row.itemCount > 0 ? roundCurrency(row.revenue / row.itemCount) : 0,
  }));
}

function normalizeRegisterPaymentType(value?: string) {
  const normalized = (value ?? "cash").trim().toLowerCase();
  if (normalized === "card" || normalized === "mobile") {
    return normalized;
  }
  return "cash";
}
