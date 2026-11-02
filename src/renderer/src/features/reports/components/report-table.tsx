import { useLocation } from 'react-router-dom'
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { downloadCsv, safeFilename } from '@/lib/export'
import { toneForPath } from '@/lib/module-tone'
import { cn } from '@/lib/utils'
import {
  AMOUNT_TONE,
  REPORT_STATUS,
  STATUS_STRIPE,
  STATUS_TEXT,
  type AmountTone,
  type ReportStatus
} from '../report-status'

export interface ReportTableRow {
  /** Display text, also the export value. Never pre-formatted colour markup. */
  cells: string[]
  status?: ReportStatus
  /** Overrides the status word, e.g. "Due in 3 days". */
  statusLabel?: string
  /** Per-cell money tone. Only the cells that carry meaning need an entry. */
  tones?: (AmountTone | undefined)[]
  /** When set the row is a tinted section header, rendered but not exported. */
  group?: string
}

/**
 * The report table.
 *
 * Neutral rows, no zebra striping, horizontal rules only. The header carries
 * the report module's accent rule; totals sit on a muted band behind a strong
 * top rule with no colour. Status and amount tones are screen-only: exports use
 * the same columns, values and totals as before.
 */
export function ReportTable({
  head,
  rows,
  numeric = [],
  dateColumns = [],
  footer,
  empty,
  emptyTitle,
  emptyText,
  note,
  noteTone,
  exportName = 'report'
}: {
  head: string[]
  rows: ReportTableRow[]
  numeric?: number[]
  dateColumns?: number[]
  footer?: string[]
  empty: boolean
  emptyTitle: string
  emptyText: string
  note?: string
  noteTone?: 'ok' | 'bad'
  exportName?: string
}): React.JSX.Element {
  const location = useLocation()
  const accent = toneForPath(location.pathname).rule
  const dataRows = rows.filter((row) => row.group === undefined)

  if (empty) {
    return <EmptyState icon={FileText} title={emptyTitle} description={emptyText} />
  }

  async function saveCsv(): Promise<void> {
    try {
      const result = await downloadCsv(
        safeFilename(exportName),
        head,
        footer ? [...dataRows.map((row) => row.cells), footer] : dataRows.map((row) => row.cells)
      )
      if (result.saved) toast.success('CSV saved')
    } catch {
      toast.error('Could not save the CSV')
    }
  }

  async function saveXlsx(): Promise<void> {
    try {
      const result = await window.api.exportXlsx({
        filename: safeFilename(exportName),
        sheetName: exportName,
        head,
        rows: dataRows.map((row) => row.cells),
        numeric,
        dateColumns,
        footer
      })
      if (result.saved) toast.success('Spreadsheet saved')
    } catch {
      toast.error('Could not create the spreadsheet')
    }
  }

  async function savePdf(): Promise<void> {
    try {
      const result = await window.api.exportPdf(exportName)
      if (result.saved) toast.success('PDF saved')
      else if (result.printed) toast.success('Print dialog opened — choose Save as PDF')
    } catch {
      toast.error('Could not create the PDF')
    }
  }

  return (
    <div className="report-table-card border border-border bg-card">
      <div className="report-table-toolbar flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-[0.75rem] text-muted-foreground">
          {dataRows.length} row{dataRows.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="xs" onClick={() => void saveCsv()}>
            <Download className="size-3.5" strokeWidth={2} />
            CSV
          </Button>
          <Button variant="ghost" size="xs" onClick={() => void saveXlsx()}>
            <FileSpreadsheet className="size-3.5" strokeWidth={2} />
            XLSX
          </Button>
          <Button variant="ghost" size="xs" onClick={() => void savePdf()}>
            <Printer className="size-3.5" strokeWidth={2} />
            PDF
          </Button>
        </div>
      </div>
      <table className="report-table w-full border-collapse text-[0.875rem]">
        <thead>
          <tr className={cn('border-t-2 bg-muted/40', accent)}>
            {head.map((cell, index) => (
              <th
                key={cell}
                scope="col"
                className={cn(
                  'border-b border-border px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
                  numeric.includes(index) ? 'text-right' : 'text-left'
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            if (row.group !== undefined) {
              return (
                <tr key={`group-${rowIndex}`} className="bg-accent-soft/60" data-report-group>
                  <th
                    scope="colgroup"
                    colSpan={head.length}
                    className="border-b border-border px-3 py-1.5 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-foreground"
                  >
                    {row.group}
                  </th>
                </tr>
              )
            }

            const status = row.status ? REPORT_STATUS[row.status] : undefined
            const StatusIcon = status?.icon
            const stripe = status ? STATUS_STRIPE[status.tone] : undefined

            return (
              <tr
                key={rowIndex}
                className="border-b border-border last:border-0"
                data-report-row
                data-status={row.status}
              >
                {row.cells.map((cell, cellIndex) => {
                  const amountTone = row.tones?.[cellIndex]
                  return (
                    <td
                      key={cellIndex}
                      data-tone={amountTone}
                      className={cn(
                        'px-3 py-2 align-middle',
                        numeric.includes(cellIndex)
                          ? 'text-right font-mono tabular-nums'
                          : 'text-left',
                        cellIndex === 0 && stripe
                          ? cn('border-l-[3px] pl-2.5', stripe)
                          : undefined,
                        amountTone ? AMOUNT_TONE[amountTone] : undefined
                      )}
                    >
                      {cell}
                      {cellIndex === 0 && status && StatusIcon ? (
                        <span
                          className={cn(
                            'ml-2 inline-flex items-center gap-1 align-middle text-[0.6875rem] font-semibold uppercase tracking-[0.08em]',
                            STATUS_TEXT[status.tone]
                          )}
                        >
                          <StatusIcon className="size-3" aria-hidden strokeWidth={2.2} />
                          {row.statusLabel ?? status.label}
                        </span>
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        {footer ? (
          <tfoot>
            <tr className="border-t-2 border-t-ink bg-muted/50 font-semibold">
              {footer.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    'px-3 py-2',
                    numeric.includes(index) ? 'text-right font-mono tabular-nums' : ''
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
      {note ? (
        <div
          className={cn(
            'report-note border-t border-border px-3 py-2 text-[0.75rem]',
            noteTone === 'ok' ? 'text-success' : 'text-destructive'
          )}
        >
          {note}
        </div>
      ) : null}
    </div>
  )
}
