import type { RefundPrintContext } from '../types'
import {
  BASE_STYLES,
  buildOrgHeader,
  buildDocTitle,
  buildFooter,
  buildTermsBlock,
  formatRupees,
  formatDate,
  escapeHtml,
  METHOD_LABELS
} from './shared'

/**
 * Refund Receipt template — premium print-only HTML with absolute CSS dimensions.
 * Produces a single A4 page with a red accent bar, org header, refund hero card,
 * the invoice(s) the source payment covered, and the reason for the refund.
 */
export function renderRefundReceipt(ctx: RefundPrintContext): string {
  const methodLabel = METHOD_LABELS[ctx.method] ?? ctx.method
  const hasInvoices = ctx.invoiceNumbers.length > 0

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Refund ${escapeHtml(ctx.refundNo)}</title>
  ${BASE_STYLES}
  <style>
    .refund-accent { background: linear-gradient(90deg, #DC2626, #7C3AED); }
    .refund-hero { background: #FEF2F2; border: 0.5px solid #FECACA; border-radius: 3mm; padding: 5mm; margin-bottom: 6mm; }
    .refund-hero .tag { font-size: 8pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #991B1B; margin-bottom: 2mm; }
    .refund-hero .amount { font-size: 20pt; font-weight: 700; color: #991B1B; font-variant-numeric: tabular-nums; }
    .refund-hero .sub { font-size: 9pt; color: #6B7280; margin-top: 1mm; }
  </style>
</head>
<body>
  <div class="page">

    <!-- Header: Org + Document Title -->
    <div class="header">
      ${buildOrgHeader(ctx.org)}
      ${buildDocTitle('Refund Receipt', ctx.refundNo, formatDate(ctx.refundDate))}
    </div>

    <!-- Red accent bar -->
    <div class="accent-bar refund-accent"></div>

    <!-- Refund Hero Card -->
    <div class="refund-hero">
      <div class="tag">↩ Refund Issued</div>
      <div class="amount">− ${formatRupees(ctx.amount)}</div>
      <div class="sub">
        Refunded to ${escapeHtml(ctx.customer.name)} via ${escapeHtml(methodLabel)} on ${escapeHtml(formatDate(ctx.refundDate))}
      </div>
    </div>

    <!-- Customer Info -->
    <div class="section">
      <div class="section-title">Refunded To</div>
      <div class="info-value">${escapeHtml(ctx.customer.name)}</div>
      ${ctx.customer.phone ? `<div class="info-value muted">${escapeHtml(ctx.customer.phone)}</div>` : ''}
      ${ctx.customer.email ? `<div class="info-value muted">${escapeHtml(ctx.customer.email)}</div>` : ''}
      ${ctx.membershipName ? `<div class="info-value muted" style="margin-top: 1mm;"><span style="color: #7C3AED;">${escapeHtml(ctx.membershipName)}</span></div>` : ''}
    </div>

    <hr class="divider" />

    <!-- Source / Coverage -->
    <div class="section">
      <div class="section-title">Against</div>
      <div class="info-grid">
        <div class="info-block">
          <div class="info-label">Source Payment</div>
          <div class="info-value" style="font-variant-numeric: tabular-nums;">${escapeHtml(ctx.sourcePaymentNo)}</div>
        </div>
        <div class="info-block">
          <div class="info-label">Method</div>
          <div class="info-value">${escapeHtml(methodLabel)}</div>
        </div>
      </div>

      ${
        hasInvoices
          ? `
      <table style="margin-top: 4mm;">
        <thead>
          <tr>
            <th>Covered Invoice</th>
          </tr>
        </thead>
        <tbody>
          ${ctx.invoiceNumbers
            .map(
              (no) => `
          <tr>
            <td style="font-variant-numeric: tabular-nums; font-size: 9pt; font-weight: 500;">${escapeHtml(no)}</td>
          </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
      `
          : `
      <p style="font-size: 10pt; color: #9CA3AF; font-style: italic; margin-top: 2mm;">Source payment is not allocated to any invoice.</p>
      `
      }
    </div>

    <hr class="divider" />

    <!-- Reason -->
    <div class="section">
      <div class="section-title">Reason</div>
      <div class="info-value" style="font-weight: 400; color: #374151;">${escapeHtml(ctx.reason)}</div>
    </div>

    <!-- Recorded By -->
    <div class="section">
      <div class="info-grid">
        <div class="info-block">
          <div class="info-label">Recorded By</div>
          <div class="info-value">${escapeHtml(ctx.recordedBy)}</div>
        </div>
      </div>
    </div>

    ${buildTermsBlock(ctx.org.refundTerms)}

    <!-- Footer -->
    ${buildFooter(ctx.generatedAt)}

  </div>
</body>
</html>`
}
