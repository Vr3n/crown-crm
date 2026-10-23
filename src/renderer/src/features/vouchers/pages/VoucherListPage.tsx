import { useDeferredValue, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download, FileText, IndianRupee, ListChecks, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KpiCard } from '@/components/ui/kpi-card'
import { StatusPill } from '@/components/ui/status-pill'
import { ChartCard } from '@/components/ui/chart-card'
import { MonthlyBarsChart, RankedBarsChart } from '@/components/charts/list-charts'
import { formatMinor } from '@/lib/money'
import { downloadCsv, safeFilename } from '@/lib/export'
import type { VoucherListRow } from '../../../../../shared/contracts/vouchers'

type ListType = 'SALES' | 'PURCHASE' | 'RECEIPT' | 'PAYMENT'

const NEW_DOC: Record<ListType, { path: string; label: string }> = {
  SALES: { path: '/sales/new', label: 'New invoice' },
  PURCHASE: { path: '/purchases/new', label: 'New bill' },
  RECEIPT: { path: '/receipts/new', label: 'New receipt' },
  PAYMENT: { path: '/payments/new', label: 'New payment' }
}

const DESCRIPTION: Record<ListType, string> = {
  SALES: 'Every invoice you issued, with what was billed and what is still open.',
  PURCHASE: 'Every supplier bill, with what you owe and what is already settled.',
  RECEIPT: 'Money received from customers, with the invoice each receipt settles.',
  PAYMENT: 'Money paid to suppliers, with the bill each payment settles.'
}

const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-10 border-b border-border px-3 align-middle'

function iso(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

type Preset = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR'

function presetRange(preset: Preset, now = new Date()): { from: string; to: string } {
  const year = now.getFullYear()
  const month = now.getMonth()
  if (preset === 'THIS_MONTH') {
    return { from: iso(new Date(year, month, 1)), to: iso(new Date(year, month + 1, 0)) }
  }
  if (preset === 'LAST_MONTH') {
    return { from: iso(new Date(year, month - 1, 1)), to: iso(new Date(year, month, 0)) }
  }
  if (preset === 'THIS_QUARTER') {
    const start = Math.floor(month / 3) * 3
    return { from: iso(new Date(year, start, 1)), to: iso(new Date(year, start + 3, 0)) }
  }
  return { from: iso(new Date(year, 0, 1)), to: iso(new Date(year, 11, 31)) }
}

function statusTone(status: VoucherListRow['status']): 'success' | 'destructive' | 'neutral' {
  if (status === 'POSTED') return 'success'
  if (status === 'CANCELLED') return 'destructive'
  return 'neutral'
}

export function VoucherListPage({
  type,
  title
}: {
  type?: ListType
  title: string
}): React.JSX.Element {
  const [range, setRange] = useState(() => presetRange('THIS_MONTH'))
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

  const summary = useQuery({
    queryKey: ['vouchers', 'summary', type ?? 'ALL', range.from, range.to],
    queryFn: () => window.api.summaries.vouchers({ type, from: range.from, to: range.to })
  })

  const rows = status === 'ALL' ? data : data.filter((row) => row.status === status)
  const total = rows.reduce((sum, row) => sum + row.totalMinor, 0)
  const action = type ? NEW_DOC[type] : null
  const s = summary.data
  const showOutstanding = type === 'SALES' || type === 'PURCHASE'

  const monthly = useMemo(
    () => (s?.monthly ?? []).map((point) => ({ label: point.label, totalMinor: point.totalMinor })),
    [s]
  )

  function exportCsv(): void {
    downloadCsv(
      safeFilename(`${title}-${range.from}-${range.to}`),
      ['Date', 'Number', 'Party', 'Total', 'Status'],
      rows.map((row) => [
        row.date,
        row.number,
        row.partyName ?? '',
        (row.totalMinor / 100).toFixed(2),
        row.status
      ])
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-6">
      <PageHeader
        title={title}
        description={type ? DESCRIPTION[type] : 'Every document in date order, across all types.'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="size-3.5" strokeWidth={2} />
              CSV
            </Button>
            {action ? (
              <Button asChild size="sm">
                <Link to={action.path}>
                  <Plus className="size-3.5" />
                  {action.label}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-4">
        <KpiCard
          label={type === 'RECEIPT' || type === 'PAYMENT' ? 'Received' : 'Value'}
          value={formatMinor(total, 'INR')}
          context={`${rows.length} ${rows.length === 1 ? 'document' : 'documents'}`}
          icon={IndianRupee}
          tone="success"
        />
        <KpiCard
          label="Documents"
          value={String(rows.length)}
          context={status === 'ALL' ? 'In this period' : `${status.toLowerCase()} only`}
          icon={ListChecks}
        />
        <KpiCard
          label="Average"
          value={formatMinor(rows.length > 0 ? Math.round(total / rows.length) : 0, 'INR')}
          context="Per document"
          icon={FileText}
        />
        {showOutstanding ? (
          <KpiCard
            label="Outstanding"
            value={formatMinor(s?.outstandingMinor ?? 0, 'INR')}
            context="Still open across all bills"
            icon={IndianRupee}
            tone="warning"
          />
        ) : (
          <KpiCard
            label="Posted"
            value={String(rows.filter((row) => row.status === 'POSTED').length)}
            context="Included in the books"
            icon={ListChecks}
            tone="primary"
          />
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ChartCard title="Monthly value" subtitle="Amount recorded in each month of this period">
          {monthly.length > 0 ? (
            <MonthlyBarsChart points={monthly} ariaLabel={`${title} value by month`} />
          ) : (
            <p className="py-14 text-center text-[0.8125rem] text-muted-foreground">
              Nothing recorded in this period yet.
            </p>
          )}
        </ChartCard>
        <ChartCard title="Largest parties" subtitle="Where most of the value sits">
          {s && s.topParties.length > 0 ? (
            <RankedBarsChart
              rows={s.topParties.map((party) => ({
                label: party.name,
                valueMinor: party.totalMinor
              }))}
              ariaLabel={`${title} value by party`}
            />
          ) : (
            <p className="py-14 text-center text-[0.8125rem] text-muted-foreground">
              No party totals yet.
            </p>
          )}
        </ChartCard>
      </div>

      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2">
        <div className="flex items-center" role="group" aria-label="Period presets">
          {(
            [
              ['THIS_MONTH', 'This month'],
              ['LAST_MONTH', 'Last month'],
              ['THIS_QUARTER', 'This quarter'],
              ['THIS_YEAR', 'This year']
            ] as const
          ).map(([value, label], index) => {
            const active =
              range.from === presetRange(value).from && range.to === presetRange(value).to
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setRange(presetRange(value))}
                className={`h-8 border border-border px-2.5 text-[0.875rem] transition-colors ${index > 0 ? '-ml-px' : ''} ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <label className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          From
          <Input
            type="date"
            value={range.from}
            onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
            className="h-8 w-[145px] rounded-none font-mono text-[0.875rem] shadow-none"
          />
        </label>
        <label className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          To
          <Input
            type="date"
            value={range.to}
            onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
            className="h-8 w-[145px] rounded-none font-mono text-[0.875rem] shadow-none"
          />
        </label>
        <label className="relative flex min-w-[200px] flex-1 items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <Input
            aria-label="Search documents"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search number or party"
            className="h-8 w-full rounded-none pl-8 text-[0.875rem] shadow-none"
          />
        </label>
        <label className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="h-8 cursor-pointer border border-input bg-transparent px-2 text-[0.875rem] normal-case tracking-normal outline-none"
          >
            <option value="ALL">All</option>
            <option value="POSTED">Posted</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
      </div>

      <div className="max-h-[calc(100vh-19rem)] overflow-auto border border-border bg-card">
        <table className="w-full border-collapse text-[0.875rem]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/95">
              <th className={`${TH} w-[110px]`}>Date</th>
              <th className={TH}>Number</th>
              <th className={TH}>Party</th>
              <th className={`${TH} text-right`}>Total</th>
              <th className={`${TH} w-[110px]`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Loading documents...
                </td>
              </tr>
            ) : null}
            {isError ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-destructive">
                  Could not load documents. Check the filters and try again.
                </td>
              </tr>
            ) : null}
            {!isLoading && !isError && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No documents in this period.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/40">
                <td className={`${TD} font-mono tabular-nums text-muted-foreground`}>{row.date}</td>
                <td className={TD}>
                  <Link
                    to={`/vouchers/${row.id}`}
                    className="font-mono font-medium hover:text-primary hover:underline"
                  >
                    {row.number}
                  </Link>
                </td>
                <td className={`${TD} font-medium`}>{row.partyName ?? '—'}</td>
                <td className={`${TD} text-right font-mono font-semibold tabular-nums`}>
                  {formatMinor(row.totalMinor, 'INR')}
                </td>
                <td className={TD}>
                  <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-card">
            <tr className="border-t-2 border-ink font-semibold">
              <td className="px-3 py-2.5 text-muted-foreground" colSpan={3}>
                {rows.length} document{rows.length === 1 ? '' : 's'}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-[0.9375rem] tabular-nums">
                {formatMinor(total, 'INR')}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
