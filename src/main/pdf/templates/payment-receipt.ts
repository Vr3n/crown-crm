import type { ReceiptPrintContext } from '../types'
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
 * Payment Receipt template — premium print-only HTML with absolute CSS dimensions.
 * Produces a single A4 page with accent bar, org header, payment hero card,
 * allocation breakdown, and generation timestamp.
 */
export function renderPaymentReceipt(ctx: ReceiptPrintContext): string {
  const methodLabel = METHOD_LABELS[ctx.method] ?? ctx.method
  const isUnallocated = ctx.allocations.length === 0
  const totalAllocated = ctx.allocations.reduce((sum, a) => sum + a.amount, 0)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${escapeHtml(ctx.paymentNo)}</title>
  ${BASE_STYLES}
</head>
<body>
  <div class="page">

    <!-- Header: Org + Document Title -->
    <div class="header">
      ${buildOrgHeader(ctx.org)}
      ${buildDocTitle('Payment Receipt', ctx.paymentNo, formatDate(ctx.paymentDate))}
    </div>

    <!-- Accent bar -->
    <div class="accent-bar"></div>

    <!-- Payment Hero Card -->
    <div style="background: #ECFDF5; border: 0.5px solid #A7F3D0; border-radius: 3mm; padding: 5mm; margin-bottom: 6mm;">
      <div style="font-size: 8pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #065F46; margin-bottom: 2mm;">
        ✓ Payment Received
      </div>
      <div style="font-size: 20pt; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums;">
        ${formatRupees(ctx.amount)}
      </div>
      <div style="font-size: 9pt; color: #6B7280; margin-top: 1mm;">
        Paid by ${escapeHtml(ctx.customer.name)} via ${escapeHtml(methodLabel)} on ${escapeHtml(formatDate(ctx.paymentDate))}
      </div>
    </div>

    <!-- Customer Info -->
    <div class="section">
      <div class="section-title">Received From</div>
      <div class="info-value">${escapeHtml(ctx.customer.name)}</div>
      ${ctx.customer.phone ? `<div class="info-value muted">${escapeHtml(ctx.customer.phone)}</div>` : ''}
      ${ctx.customer.email ? `<div class="info-value muted">${escapeHtml(ctx.customer.email)}</div>` : ''}
      ${ctx.membershipName ? `<div class="info-value muted" style="margin-top: 1mm;"><span style="color: #2563EB;">${escapeHtml(ctx.membershipName)}</span></div>` : ''}
    </div>

    <hr class="divider" />

    <!-- Allocation Section -->
    <div class="section">
      <div class="section-title">Allocation</div>

      ${
        isUnallocated
          ? `
      <div class="unallocated-notice">
        <span class="text">⚠ This payment has not been allocated to any invoice yet.</span>
      </div>
      `
          : `
      <table>
        <thead>
          <tr>
            <th style="width: 50%;">Invoice</th>
            <th class="num" style="width: 50%;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${ctx.allocations
            .map(
              (alloc) => `
          <tr>
            <td style="font-variant-numeric: tabular-nums; font-size: 9pt; font-weight: 500;">${escapeHtml(alloc.invoiceNo)}</td>
            <td class="amount-col" style="font-weight: 600;">${formatRupees(alloc.amount)}</td>
          </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      <div class="totals-block" style="margin-top: 2mm;">
        <div class="totals-row">
          <span class="label">Total Allocated</span>
          <span class="value">${formatRupees(totalAllocated)}</span>
        </div>
        <div class="totals-row">
          <span class="label">Outstanding</span>
          <span class="value" style="color: ${ctx.outstanding > 0 ? '#991B1B' : '#6B7280'};">
            ${formatRupees(ctx.outstanding)}
          </span>
        </div>
      </div>
      `
      }
    </div>

    <hr class="divider" />

    <!-- Payment Details -->
    <div class="section">
      <div class="info-grid">
        <div class="info-block">
          <div class="info-label">Payment Method</div>
          <div class="info-value">${escapeHtml(methodLabel)}</div>
          ${ctx.reference ? `<div class="info-value muted" style="margin-top: 1mm;">Ref: ${escapeHtml(ctx.reference)}</div>` : ''}
        </div>
        <div class="info-block">
          <div class="info-label">Received By</div>
          <div class="info-value">${escapeHtml(ctx.receivedBy)}</div>
        </div>
      </div>
    </div>

    ${buildTermsBlock(ctx.org.receiptTerms)}

    <!-- Footer -->
    ${buildFooter(ctx.generatedAt)}

  </div>
</body>
</html>`
}
