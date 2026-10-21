import type { InvoicePrintContext } from '../types'
import {
  BASE_STYLES,
  buildOrgHeader,
  buildDocTitle,
  buildFooter,
  buildTermsBlock,
  formatRupees,
  formatDate,
  escapeHtml,
  STATUS_BADGES
} from './shared'

/**
 * Strips bracketed duration from plan description (e.g. "Gold Plan (12 months)" → "Gold Plan").
 */
function stripDuration(description: string): string {
  return description.replace(/\s*\(.*$/, '')
}

/**
 * Invoice Document template — premium print-only HTML with absolute CSS dimensions.
 * Produces a single A4 page with accent bar, org header, customer info, line items,
 * duration info, totals in dark box, payment allocations, and settlement status.
 */
export function renderInvoiceDocument(ctx: InvoicePrintContext): string {
  const statusBadge = STATUS_BADGES[ctx.status] ?? 'badge-draft'
  const hasAllocations = ctx.allocations.length > 0
  const hasRefunds = ctx.refunds.length > 0
  const totalDiscount = ctx.lines.reduce((sum, l) => sum + l.discountAmount, 0)
  // Derive tax rate from first line (all lines share the same rate in membership invoices)
  const taxRate = ctx.lines.length > 0 ? ctx.lines[0].taxRate : '0%'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(ctx.invoiceNo)}</title>
  ${BASE_STYLES}
</head>
<body>
  <div class="page">

    <!-- Header: Org + Document Title -->
    <div class="header">
      ${buildOrgHeader(ctx.org)}
      ${buildDocTitle('Invoice', ctx.invoiceNo, formatDate(ctx.issuedAt))}
    </div>

    <!-- Accent bar -->
    <div class="accent-bar"></div>

    <!-- Status + Due Date -->
    <div style="display: flex; align-items: center; gap: 4mm; margin-bottom: 5mm;">
      <span class="badge ${statusBadge}">${escapeHtml(ctx.status.replace('_', ' '))}</span>
      ${ctx.dueAt ? `<span style="font-size: 9pt; color: #6B7280;">Due: ${escapeHtml(formatDate(ctx.dueAt))}</span>` : ''}
    </div>

    <!-- Customer Info -->
    <div class="section">
      <div class="info-grid">
        <div class="info-block">
          <div class="section-title">Bill To</div>
          <div class="info-value">${escapeHtml(ctx.customer.name)}</div>
          ${ctx.customer.phone ? `<div class="info-value muted">${escapeHtml(ctx.customer.phone)}</div>` : ''}
          ${ctx.customer.email ? `<div class="info-value muted">${escapeHtml(ctx.customer.email)}</div>` : ''}
        </div>
      </div>
    </div>

    <hr class="divider" />

    <!-- Line Items Table -->
    <div class="section">
      <div class="section-title">Line Items</div>
      <table>
        <thead>
          <tr>
            <th class="serial-col">#</th>
            <th style="width: 48%;">Description</th>
            <th class="num" style="width: 10%;">Qty</th>
            <th class="num" style="width: 18%;">Rate</th>
            <th class="num" style="width: 12%;">Discount</th>
            <th class="num" style="width: 12%;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${ctx.lines
            .map(
              (line, i) => `
          <tr>
            <td class="serial-col">${i + 1}</td>
            <td>${escapeHtml(stripDuration(line.description))}</td>
            <td class="amount-col">${line.quantity}</td>
            <td class="amount-col">${formatRupees(line.unitPrice)}</td>
            <td class="amount-col">${line.discountAmount > 0 ? formatRupees(line.discountAmount) : '—'}</td>
            <td class="amount-col" style="font-weight: 600;">${formatRupees(line.lineTotal)}</td>
          </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      <!-- Totals -->
      <div class="totals-block">
        <div class="totals-row">
          <span class="label">Subtotal</span>
          <span class="value">${formatRupees(ctx.subtotal)}</span>
        </div>
        ${
          totalDiscount > 0
            ? `
        <div class="totals-row">
          <span class="label">Discount</span>
          <span class="value" style="color: #991B1B;">− ${formatRupees(totalDiscount)}</span>
        </div>
        `
            : ''
        }
        <div class="totals-row">
          <span class="label">Tax (GST @ ${taxRate})</span>
          <span class="value">${formatRupees(ctx.taxTotal)}</span>
        </div>
        <div class="totals-row grand">
          <span class="label">Total</span>
          <span class="value">${formatRupees(ctx.total)}</span>
        </div>
      </div>
    </div>

    ${
      ctx.membership
        ? `
    <hr class="divider" />

    <!-- Membership Duration -->
    <div class="section">
      <div class="section-title">Membership Duration</div>
      <div style="display: flex; gap: 6mm; font-size: 10pt;">
        <div>
          <div class="info-label">Joining Date</div>
          <div class="info-value" style="color: #2563EB;">${escapeHtml(formatDate(ctx.membership.joiningDate))}</div>
        </div>
        <div>
          <div class="info-label">Start Date</div>
          <div class="info-value" style="color: #2563EB;">${escapeHtml(formatDate(ctx.membership.startDate))}</div>
        </div>
        <div>
          <div class="info-label">End Date</div>
          <div class="info-value" style="color: #7C3AED;">${escapeHtml(formatDate(ctx.membership.endDate))}</div>
        </div>
      </div>
    </div>
    `
        : ''
    }

    <hr class="divider" />

    <!-- Payment Allocations -->
    <div class="section">
      <div class="section-title">Payments Received</div>
      ${
        hasAllocations
          ? `
      <table>
        <thead>
          <tr>
            <th style="width: 30%;">Payment</th>
            <th style="width: 25%;">Method</th>
            <th class="num" style="width: 25%;">Amount</th>
            <th class="num" style="width: 20%;">Date</th>
          </tr>
        </thead>
        <tbody>
          ${ctx.allocations
            .map(
              (alloc) => `
          <tr>
            <td style="font-variant-numeric: tabular-nums; font-size: 9pt; font-weight: 500;">${escapeHtml(alloc.paymentNo)}</td>
            <td>${escapeHtml(alloc.method)}</td>
            <td class="amount-col" style="font-weight: 600;">${formatRupees(alloc.amount)}</td>
            <td class="amount-col" style="font-size: 9pt; color: #6B7280;">${escapeHtml(formatDate(alloc.receivedAt))}</td>
          </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
      `
          : `
      <p style="font-size: 10pt; color: #9CA3AF; font-style: italic;">No payments recorded against this invoice yet.</p>
      `
      }

      <!-- Settlement Summary -->
      <div class="totals-block" style="margin-top: 3mm;">
        <div class="totals-row">
          <span class="label">Paid</span>
          <span class="value" style="color: #065F46;">${formatRupees(ctx.paidAmount)}</span>
        </div>
        ${
          hasRefunds
            ? `
        <div class="totals-row">
          <span class="label">Refunded</span>
          <span class="value" style="color: #991B1B;">− ${formatRupees(ctx.refundedAmount)}</span>
        </div>
        <div class="totals-row">
          <span class="label">Net Paid</span>
          <span class="value" style="font-weight: 600;">${formatRupees(
            ctx.paidAmount - ctx.refundedAmount
          )}</span>
        </div>
        `
            : ''
        }
        <div class="totals-row">
          <span class="label">Outstanding</span>
          <span class="value" style="color: ${ctx.outstanding > 0 ? '#991B1B' : '#6B7280'};">
            ${formatRupees(ctx.outstanding)}
          </span>
        </div>
      </div>
    </div>

    ${
      hasRefunds
        ? `
    <hr class="divider" />

    <!-- Refunds Issued -->
    <div class="section">
      <div class="section-title" style="color: #991B1B;">Refunds Issued</div>
      <table>
        <thead>
          <tr>
            <th style="width: 22%;">Refund</th>
            <th style="width: 18%;">Date</th>
            <th style="width: 16%;">Method</th>
            <th style="width: 30%;">Reason</th>
            <th class="num" style="width: 14%;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${ctx.refunds
            .map(
              (r) => `
          <tr>
            <td style="font-variant-numeric: tabular-nums; font-size: 9pt; font-weight: 500;">${escapeHtml(r.refundNo)}</td>
            <td style="font-size: 9pt; color: #6B7280;">${escapeHtml(formatDate(r.refundDate))}</td>
            <td>${escapeHtml(r.method)}</td>
            <td style="font-size: 9pt; color: #6B7280;">${escapeHtml(r.reason)}</td>
            <td class="amount-col" style="font-weight: 600; color: #991B1B;">− ${formatRupees(r.amount)}</td>
          </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
    `
        : ''
    }

    ${
      ctx.finalizedBy
        ? `
    <!-- Attribution -->
    <div class="section">
      <div class="info-grid">
        <div class="info-block">
          <div class="info-label">Finalized By</div>
          <div class="info-value">${escapeHtml(ctx.finalizedBy)}</div>
        </div>
      </div>
    </div>
    `
        : ''
    }

    ${buildTermsBlock(ctx.org.invoiceTerms)}

    <!-- Footer -->
    ${buildFooter(ctx.generatedAt)}

  </div>
</body>
</html>`
}
