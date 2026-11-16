import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMinor } from '@/lib/money'
import type { ImportBill, ImportTarget } from '@shared/excel-import/types'
import { IssueList } from './issue-list'

function displayDate(iso: string | null): string {
  if (!iso) return 'No date'
  const [year, month, day] = iso.split('-')
  return `${day}-${month}-${year}`
}

function qty(value: number): string {
  const major = value / 10_000
  return Number.isInteger(major)
    ? String(major)
    : major.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

export function BillPreview({
  bill,
  target
}: {
  bill: ImportBill
  target: ImportTarget
}): React.JSX.Element {
  const blocked = bill.status === 'blocked'
  const label = bill.billNo ?? `Row ${bill.lines[0]?.rowNumber ?? ''}`

  return (
    <details className="group border border-border bg-card" open={blocked}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-accent-soft/30 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-[0.875rem] font-medium">{label}</span>
            <span className="text-[0.8125rem] text-muted-foreground">{displayDate(bill.date)}</span>
            <span className="text-[0.8125rem]">{bill.partyName || 'No party'}</span>
          </span>
          <span className="mt-0.5 block text-[0.75rem] text-muted-foreground">
            {bill.lines.length} line{bill.lines.length === 1 ? '' : 's'} · source row
            {bill.lines.length === 1 ? '' : 's'}{' '}
            {bill.lines.map((line) => line.rowNumber).join(', ')}
          </span>
        </span>
        <span className="font-mono text-[0.9375rem] tabular-nums">
          {formatMinor(bill.totalMinor, 'INR')}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[0.75rem] font-medium',
            blocked ? 'text-destructive' : 'text-success'
          )}
        >
          {blocked ? (
            <AlertTriangle className="size-3.5" strokeWidth={1.9} />
          ) : (
            <CheckCircle2 className="size-3.5" strokeWidth={1.9} />
          )}
          {blocked ? 'Blocked' : 'Ready'}
        </span>
      </summary>

      <div className="border-t border-border">
        {bill.issues.length > 0 ? (
          <div className="border-b border-border">
            <IssueList issues={bill.issues} target={target} />
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[0.875rem]">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="h-8 w-14 px-2 text-left font-mono text-[0.6875rem] font-medium text-muted-foreground">
                  Row
                </th>
                <th className="h-8 px-2 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Item
                </th>
                <th className="h-8 w-16 px-2 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Qty
                </th>
                <th className="h-8 w-28 px-2 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Rate
                </th>
                <th className="h-8 w-16 px-2 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  GST
                </th>
                <th className="h-8 w-32 px-2 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((line) => (
                <tr key={line.rowNumber} className="h-8 border-b border-border last:border-b-0">
                  <td className="px-2 font-mono text-[0.75rem] text-muted-foreground">
                    {line.rowNumber}
                  </td>
                  <td className="px-2">
                    <span className="truncate">{line.description}</span>
                    {line.itemId === null && line.newItemKey === null ? (
                      <span className="ml-2 text-[0.6875rem] uppercase tracking-[0.08em] text-warning">
                        Free text
                      </span>
                    ) : null}
                    {line.hsn ? (
                      <span className="ml-2 font-mono text-[0.6875rem] text-muted-foreground">
                        HSN {line.hsn}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 text-right font-mono tabular-nums">
                    {qty(line.qtyE4)}
                    {line.uom ? (
                      <span className="ml-1 text-muted-foreground">{line.uom}</span>
                    ) : null}
                  </td>
                  <td className="px-2 text-right font-mono tabular-nums">
                    {formatMinor(line.rateMinor, 'INR')}
                  </td>
                  <td className="px-2 text-right font-mono tabular-nums">
                    {line.gstRateBps / 100}%
                  </td>
                  <td className="px-2 text-right font-mono tabular-nums">
                    {formatMinor(line.totalMinor, 'INR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end border-t border-border bg-muted/30 px-3 py-2">
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[0.8125rem]">
            <dt className="text-muted-foreground">Taxable</dt>
            <dd className="text-right font-mono tabular-nums">
              {formatMinor(bill.taxableMinor, 'INR')}
            </dd>
            {bill.igstMinor > 0 ? (
              <>
                <dt className="text-muted-foreground">IGST</dt>
                <dd className="text-right font-mono tabular-nums">
                  {formatMinor(bill.igstMinor, 'INR')}
                </dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">CGST</dt>
                <dd className="text-right font-mono tabular-nums">
                  {formatMinor(bill.cgstMinor, 'INR')}
                </dd>
                <dt className="text-muted-foreground">SGST</dt>
                <dd className="text-right font-mono tabular-nums">
                  {formatMinor(bill.sgstMinor, 'INR')}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Round off</dt>
            <dd className="text-right font-mono tabular-nums">
              {formatMinor(bill.roundOffMinor, 'INR')}
            </dd>
            <dt className="border-t border-rule-strong pt-0.5 font-semibold">Total</dt>
            <dd className="border-t border-rule-strong pt-0.5 text-right font-mono font-semibold tabular-nums">
              {formatMinor(bill.totalMinor, 'INR')}
            </dd>
          </dl>
        </div>
      </div>
    </details>
  )
}
