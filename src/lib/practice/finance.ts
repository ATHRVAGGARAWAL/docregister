export interface FinancialInvoiceItem {
  quantity: number;
  unit_price_paise: number;
  discount_paise: number;
  tax_paise: number;
}

export interface FinancialInvoicePayment {
  amount_paise: number;
  refunds?: readonly { amount_paise: number }[] | null;
}

/**
 * An invoice included in the finance overview. The route only supplies
 * non-draft, non-void invoices, so every nested payment and refund here is
 * attached to a financially valid invoice in the current clinic.
 */
export interface FinancialInvoice {
  status: string;
  invoice_items?: readonly FinancialInvoiceItem[] | null;
  payments?: readonly FinancialInvoicePayment[] | null;
}

export function summariseFinance(invoices: readonly FinancialInvoice[]) {
  let invoiced = 0;
  let collected = 0;
  let refunded = 0;
  let openInvoices = 0;

  for (const invoice of invoices) {
    invoiced += (invoice.invoice_items ?? []).reduce(
      (sum, item) =>
        sum +
        Math.round(item.quantity * item.unit_price_paise) -
        item.discount_paise +
        item.tax_paise,
      0,
    );

    for (const payment of invoice.payments ?? []) {
      collected += payment.amount_paise;
      refunded += (payment.refunds ?? []).reduce(
        (sum, refund) => sum + refund.amount_paise,
        0,
      );
    }

    if (["issued", "part_paid", "overdue"].includes(invoice.status)) openInvoices += 1;
  }

  return {
    invoiced_paise: invoiced,
    collected_paise: collected,
    refunded_paise: refunded,
    outstanding_paise: Math.max(0, invoiced - collected + refunded),
    open_invoices: openInvoices,
  };
}
