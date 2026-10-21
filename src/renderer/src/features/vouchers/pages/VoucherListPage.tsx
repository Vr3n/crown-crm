import { useDeferredValue, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMinor } from '@/lib/money'
import type { VoucherListRow } from '../../../../../shared/contracts/vouchers'

type ListType = 'SALES' | 'PURCHASE' | 'RECEIPT' | 'PAYMENT'

const NEW_DOC: Record<ListType, { path: string; label: string }> = {
  SALES: { path: '/sales/new', label: 'New invoice' },
  PURCHASE: { path: '/purchases/new', label: 'New bill' },
  RECEIPT: { path: '/receipts/new', label: 'New receipt' },
  PAYMENT: { path: '/payments/new', label: 'New payment' }
}

function iso(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function currentMonth(): { from: string; to: string } {
  const now = new Date()
  return {
    from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  }
}

function statusClass(status: VoucherListRow['status']): string {
  if (status === 'POSTED') return 'text-success'
  if (status === 'CANCELLED') return 'text-destructive'
  return 'text-muted-foreground'
}

export function VoucherListPage({
  type,
  title
}: {
  type?: ListType
  title: string
}): React.JSX.Element {
  const [range, setRange] = useState(currentMonth)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'ALL' | 'POSTED' | 'CANCELLED'>('ALL')
  const deferredSearch = useDeferredValue(search)

  const {
    data = [],
    isLoading,
    isError
  } = useQuery({
    queryKey: ['vouchers', type ?? 'ALL', range.from, range.to, deferredSearch],
    queryFn: () =>
      window.api.vouchers.list({
        type,
        from: range.from,
        to: range.to,
        query: deferredSearch.trim() || undefined,
        limit: 200,
        offset: 0
      })
  })

  const rows = status === 'ALL' ? data : data.filter((row) => row.status === status)
  const total = rows.reduce((sum, row) => sum + row.totalMinor, 0)
  const action = type ? NEW_DOC[type] : null

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-6">
      <PageHeader
        title={title}
        description="Documents in date order. Status is shown as recorded; nothing is hidden."
        actions={
          action ? (
            <Button asChild size="sm">
              <Link to={action.path}>
                <Plus className="size-3.5" />
                {action.label}
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-3 border border-border bg-card px-3 py-2.5">
        <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          From
          <Input
            type="date"
            value={range.from}
            onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
            className="h-8 w-[150px] rounded-none font-mono text-[11.5px] shadow-none"
          />
        </label>
        <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          To
          <Input
            type="date"
            value={range.to}
            onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
            className="h-8 w-[150px] rounded-none font-mono text-[11.5px] shadow-none"
          />
        </label>
        <label className="flex min-w-[220px] flex-1 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Search
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Number or party"
            className="h-8 flex-1 rounded-none text-[11.5px] shadow-none"
          />
        </label>
        <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="h-8 cursor-pointer border border-input bg-transparent px-2 text-[11.5px] normal-case tracking-normal outline-none"
          >
            <option value="ALL">All</option>
            <option value="POSTED">Posted</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
      </div>

      <div className="border border-border bg-card">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-rule-strong bg-muted/40">
              <th className="h-8 w-[110px] px-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Date
              </th>
              <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Number
              </th>
              <th className="h-8 px-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Party
              </th>
              <th className="h-8 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Total
              </th>
              <th className="h-8 w-[120px] px-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr className="h-9">
                <td colSpan={5} className="px-3 text-[11.5px] text-muted-foreground">
                  Loading vouchers…
                </td>
              </tr>
            ) : null}
            {isError ? (
              <tr className="h-9">
                <td colSpan={5} className="px-3 text-[11.5px] text-destructive">
                  Could not load vouchers. Check the filters and try again.
                </td>
              </tr>
            ) : null}
            {!isLoading && !isError && rows.length === 0 ? (
              <tr className="h-9">
                <td colSpan={5} className="px-3 text-[11.5px] text-muted-foreground">
                  No vouchers in this period.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="h-9 border-b border-border last:border-b-0 hover:bg-muted/30"
              >
                <td className="px-3 font-mono text-[11.5px] tabular-nums">{row.date}</td>
                <td className="px-3">
                  <Link
                    to={`/vouchers/${row.id}`}
                    className="font-mono text-[11.5px] font-medium hover:text-primary hover:underline"
                  >
                    {row.number}
                  </Link>
                </td>
                <td className="px-3">{row.partyName ?? '—'}</td>
                <td className="px-3 text-right font-mono tabular-nums">
                  {formatMinor(row.totalMinor, 'INR')}
                </td>
                <td
                  className={`px-3 text-[10px] font-semibold uppercase tracking-[0.1em] ${statusClass(row.status)}`}
                >
                  {row.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-rule-strong px-3 py-2.5 text-[11.5px]">
          <span className="text-muted-foreground">
            {rows.length} voucher{rows.length === 1 ? '' : 's'}
          </span>
          <span className="flex items-baseline gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Total
            </span>
            <span className="font-mono text-[13px] tabular-nums">{formatMinor(total, 'INR')}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
