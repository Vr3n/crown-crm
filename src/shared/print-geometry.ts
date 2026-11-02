import geometry from './print-geometry.json'

export type PrintAlign = 'left' | 'center' | 'right'

export interface PrintColumnGeometry {
  key: string
  weight: number
  align: PrintAlign
}

/**
 * The one geometry spec for the printed invoice. The Rust builder reads the
 * same JSON with `include_str!`; do not copy these numbers into CSS or Rust.
 */
export const printGeometry = geometry

export const itemColumns = geometry.itemTable.columns as PrintColumnGeometry[]

/** CSS percentage widths that fill the table exactly, from the shared weights. */
export function columnWidths(columns: readonly { weight: number }[]): string[] {
  const total = columns.reduce((sum, column) => sum + column.weight, 0)
  return columns.map((column) => `${(column.weight / total) * 100}%`)
}

/** The tax-summary columns for the current document shape. */
export function taxSummaryColumns(interState: boolean, hasCess: boolean): PrintColumnGeometry[] {
  const weights = geometry.taxSummary.columns
  const columns: PrintColumnGeometry[] = [
    { key: 'hsn', weight: weights.hsn, align: 'left' },
    { key: 'taxable', weight: weights.taxable, align: 'right' }
  ]

  if (interState) {
    columns.push(
      { key: 'igst-rate', weight: weights.rate, align: 'center' },
      { key: 'igst-amount', weight: weights.tax, align: 'right' }
    )
  } else {
    columns.push(
      { key: 'cgst-rate', weight: weights.rate, align: 'center' },
      { key: 'cgst-amount', weight: weights.tax, align: 'right' },
      { key: 'sgst-rate', weight: weights.rate, align: 'center' },
      { key: 'sgst-amount', weight: weights.tax, align: 'right' }
    )
  }

  if (hasCess) {
    columns.push(
      { key: 'cess-rate', weight: weights.cessRate, align: 'center' },
      { key: 'cess-amount', weight: weights.cess, align: 'right' }
    )
  }

  columns.push({ key: 'total-tax', weight: weights.total, align: 'right' })
  return columns
}

/**
 * CSS custom properties derived from the shared spec. They are set on the
 * print route root and on each sheet, so the stylesheet never restates a
 * border weight, page size or margin.
 */
export const printCssVars: Record<string, string> = {
  '--print-page-width': `${geometry.page.widthMm}mm`,
  '--print-page-height': `${geometry.page.heightMm}mm`,
  '--print-margin-top': `${geometry.marginsMm.top}mm`,
  '--print-margin-right': `${geometry.marginsMm.right}mm`,
  '--print-margin-bottom': `${geometry.marginsMm.bottom}mm`,
  '--print-margin-left': `${geometry.marginsMm.left}mm`,
  '--print-frame-top': `${geometry.frameMm.top}mm`,
  '--print-frame-right': `${geometry.frameMm.right}mm`,
  '--print-frame-bottom': `${geometry.frameMm.bottom}mm`,
  '--print-frame-left': `${geometry.frameMm.left}mm`,
  '--print-border-outer': `${geometry.borderPt.outer}pt`,
  '--print-border-section': `${geometry.borderPt.section}pt`,
  '--print-border-cell': `${geometry.borderPt.cell}pt`,
  '--print-border-total': `${geometry.borderPt.total}pt`,
  '--print-row-height': `${geometry.itemTable.rowHeightMm}mm`,
  '--print-header-height': `${geometry.itemTable.headerHeightMm}mm`,
  '--print-cell-padding-x': `${geometry.text.cellPaddingXMm}mm`,
  '--print-cell-padding-y': `${geometry.text.cellPaddingYMm}mm`
}
