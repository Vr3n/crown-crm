import type { OrgBranding } from '../types'
import { formatMinor, type CurrencyCode } from '../../../shared/contracts/money'

/**
 * Shared CSS reset and base styles for print-only HTML templates.
 * Premium design: Inter font, Indian billing conventions, A4 layout.
 * Uses absolute dimensions (mm), inline styles, print-color-adjust.
 */
export const BASE_STYLES = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 10pt;
      color: #111827;
      line-height: 1.5;
      background: #fff;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 15mm 18mm 20mm 18mm;
      margin: 0 auto;
    }

    /* ── Header ────────────────────────────────────────────── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 4mm;
      border-bottom: 2px solid #111827;
      margin-bottom: 6mm;
    }
    .header-left { flex: 1; }
    .header-logo {
      max-height: 14mm;
      max-width: 40mm;
      object-fit: contain;
      margin-bottom: 2mm;
    }
    .header-company {
      font-size: 14pt;
      font-weight: 700;
      color: #111827;
    }
    .header-detail {
      font-size: 8pt;
      color: #6B7280;
      line-height: 1.6;
    }
    .header-right { text-align: right; }
    .header-doc-type {
      font-size: 22pt;
      font-weight: 700;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .header-doc-no {
      font-size: 10pt;
      font-weight: 600;
      color: #2563EB;
      font-variant-numeric: tabular-nums;
      margin-top: 1mm;
    }
    .header-meta {
      font-size: 9pt;
      color: #6B7280;
      margin-top: 1mm;
    }

    /* ── Accent bar ─────────────────────────────────────────── */
    .accent-bar {
      height: 1mm;
      background: linear-gradient(90deg, #2563EB, #7C3AED);
      margin-bottom: 6mm;
    }

    /* ── Sections ───────────────────────────────────────────── */
    .section { margin-bottom: 5mm; }
    .section-title {
      font-size: 8pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6B7280;
      margin-bottom: 2mm;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm;
    }
    .info-label {
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #9CA3AF;
      margin-bottom: 1mm;
    }
    .info-value {
      font-size: 10pt;
      color: #111827;
      font-weight: 500;
    }
    .info-value.muted {
      font-size: 9pt;
      color: #6B7280;
    }

    /* ── Status badge ───────────────────────────────────────── */
    .badge {
      display: inline-block;
      padding: 1mm 3mm;
      border-radius: 1.5mm;
      font-size: 8pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 0.5px solid;
    }
    .badge-paid { background: #ECFDF5; color: #065F46; border-color: #A7F3D0; }
    .badge-pending { background: #FFFBEB; color: #92400E; border-color: #FDE68A; }
    .badge-overdue { background: #FEF2F2; color: #991B1B; border-color: #FECACA; }
    .badge-partial { background: #EFF6FF; color: #1E40AF; border-color: #BFDBFE; }
    .badge-cancelled { background: #F3F4F6; color: #6B7280; border-color: #D1D5DB; }
    .badge-draft { background: #F3F4F6; color: #6B7280; border-color: #D1D5DB; }

    /* ── Tables ─────────────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead th {
      background: #F3F4F6;
      color: #374151;
      font-size: 7.5pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2.5mm 2mm;
      border-bottom: 1.5px solid #D1D5DB;
      text-align: left;
    }
    thead th.num { text-align: right; }
    tbody td {
      padding: 2.5mm 2mm;
      border-bottom: 0.5px solid #E5E7EB;
      font-size: 10pt;
      color: #111827;
      vertical-align: top;
    }
    tbody tr:nth-child(even) { background: #F9FAFB; }
    .amount-col {
      font-variant-numeric: tabular-nums;
      text-align: right;
      font-weight: 500;
    }
    .serial-col {
      width: 8mm;
      color: #6B7280;
      font-size: 9pt;
      text-align: center;
    }

    /* ── Totals block ───────────────────────────────────────── */
    .totals-block {
      width: 70mm;
      margin-left: auto;
      margin-top: 4mm;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 1.5mm 0;
      font-size: 10pt;
    }
    .totals-row .label { color: #6B7280; }
    .totals-row .value {
      font-variant-numeric: tabular-nums;
      text-align: right;
      min-width: 30mm;
      font-weight: 500;
    }
    .totals-row.grand {
      background: #111827;
      color: #FFFFFF;
      padding: 2.5mm 3mm;
      margin-top: 2mm;
      border-radius: 2mm;
      font-size: 12pt;
      font-weight: 700;
    }
    .totals-row.grand .label { color: #FFFFFF; }
    .totals-row.grand .value { color: #FFFFFF; }

    /* ── Dividers ───────────────────────────────────────────── */
    .divider {
      border: none;
      border-top: 0.5px solid #D1D5DB;
      margin: 4mm 0;
    }

    /* ── Unallocated notice ─────────────────────────────────── */
    .unallocated-notice {
      background: #FFFBEB;
      border: 0.5px solid #FDE68A;
      border-radius: 2mm;
      padding: 3mm 4mm;
      margin-top: 2mm;
    }
    .unallocated-notice .text {
      font-size: 10pt;
      color: #92400E;
      font-weight: 500;
    }

    /* ── Discount note ──────────────────────────────────────── */
    .discount-note {
      font-size: 8pt;
      color: #9CA3AF;
      margin-top: 1mm;
    }

    /* ── Footer ─────────────────────────────────────────────── */
    .footer {
      margin-top: 8mm;
      padding-top: 3mm;
      border-top: 0.5px solid #D1D5DB;
      text-align: center;
      font-size: 7.5pt;
      color: #9CA3AF;
    }

    /* ── Terms & Conditions ─────────────────────────────────── */
    .terms {
      margin-top: 5mm;
    }
    .terms-body {
      font-size: 7.5pt;
      line-height: 1.6;
      color: #6B7280;
    }
  </style>
`

/** Builds the org header HTML (logo conditional on presence). */
export function buildOrgHeader(org: OrgBranding): string {
  const logoHtml = org.logo ? `<img src="${org.logo}" alt="${org.name}" class="header-logo" />` : ''

  const detailLines = [
    org.address,
    org.gstin ? `GSTIN: ${org.gstin}` : null,
    org.mobileNumber ? `Ph: ${org.mobileNumber}` : null
  ]
    .filter(Boolean)
    .join(' · ')

  return `
    <div class="header-left">
      ${logoHtml}
      <div class="header-company">${escapeHtml(org.name)}</div>
      ${detailLines ? `<div class="header-detail">${escapeHtml(detailLines)}</div>` : ''}
    </div>
  `
}

/** Builds the document title block (right-aligned). */
export function buildDocTitle(title: string, docNo: string, date: string): string {
  return `
    <div class="header-right">
      <div class="header-doc-type">${escapeHtml(title)}</div>
      <div class="header-doc-no">${escapeHtml(docNo)}</div>
      <div class="header-meta">${escapeHtml(date)}</div>
    </div>
  `
}

/** Builds the footer with generation timestamp. */
export function buildFooter(generatedAt: string): string {
  return `
    <div class="footer">
      Generated by CrownCRM · ${escapeHtml(generatedAt)} · This is a computer-generated document
    </div>
  `
}

/**
 * Builds the Terms & Conditions block printed above the footer. Returns '' when
 * no terms are set so the document is never left with an empty box. Line breaks
 * in the source text are preserved; all user text is HTML-escaped.
 */
export function buildTermsBlock(terms: string | null | undefined): string {
  if (!terms) return ''
  return `
    <div class="terms">
      <div class="section-title">Terms &amp; Conditions</div>
      <div class="terms-body">${terms
        .split('\n')
        .map((line) => escapeHtml(line))
        .join('<br />')}</div>
    </div>
  `
}

/** Formats a money amount in minor units for display. */
export function formatRupees(amountMinor: number, currency: CurrencyCode = 'INR'): string {
  return formatMinor(amountMinor, currency)
}

/** Formats an ISO date string to a readable format. */
export function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

/** Formats an ISO datetime string to a readable format. */
export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return iso
  }
}

/** Escapes HTML special characters to prevent XSS in templates. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Maps payment method codes to human-readable labels. */
export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
  OTHER: 'Other'
}

/** Maps invoice statuses to badge CSS classes. */
export const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'badge-draft',
  OPEN: 'badge-pending',
  PARTIALLY_PAID: 'badge-partial',
  PAID: 'badge-paid',
  VOID: 'badge-cancelled',
  UNCOLLECTIBLE: 'badge-overdue'
}
