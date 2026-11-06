import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Boxes, CircleSlash, Layers, Package } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/ui/kpi-card'
import { ChartCard } from '@/components/ui/chart-card'
import { StatusPill } from '@/components/ui/status-pill'
import { RankedBarsChart } from '@/components/charts/list-charts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { formatMinor } from '@/lib/money'
import {
  ANALYSIS_WINDOWS,
  REORDER_LABELS,
  REORDER_TONES,
  analyseItems,
  deadStock,
  windowStart,
  type AnalysisWindow
} from '@/lib/item-analysis'

function qty(e4: number): string {
  return (e4 / 10000).toLocaleString('en-IN', { maximumFractionDigits: 3 })
}

function coverText(days: number): string {
  return `${Number.isInteger(days) ? days : days.toFixed(1)}d`
}

/** Stock on hand, computed from posted movements, with cover analysis. */
export function StockPage(): React.JSX.Element {
  const [windowDays, setWindowDays] = useState<AnalysisWindow>(90)
  const [filter, setFilter] = useState<'ALL' | 'REORDER' | 'DEAD'>('ALL')
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const from = windowStart(today, windowDays)

  const { data = [], isLoading } = useQuery({
    queryKey: ['report', 'stock'],
    queryFn: () => window.api.reports.stock()
  })
  const items = useQuery({
    queryKey: ['items', 'stock-page'],
    queryFn: () => window.api.items.list(undefined, true)
  })
  const flow = useQuery({
    queryKey: ['report', 'stock-flow', from, today],
    queryFn: () => window.api.reports.stockFlow(from, today)
  })

  const analyses = useMemo(
    () => analyseItems(items.data ?? [], flow.data ?? [], { today, windowDays }),
    [items.data, flow.data, today, windowDays]
  )
  const byId = useMemo(
    () => new Map(analyses.map((analysis) => [analysis.item.id, analysis])),
    [analyses]
  )
  const dead = useMemo(() => deadStock(analyses, { windowDays }), [analyses, windowDays])
  const reorder = useMemo(
    () =>
      analyses.filter(
        (analysis) =>
          analysis.reorder === REORDER_LABELS.Low || analysis.reorder === REORDER_LABELS.Out
      ),
    [analyses]
  )
  const low = analyses.filter((analysis) => analysis.reorder === REORDER_LABELS.Low).length
  const out = analyses.filter((analysis) => analysis.reorder === REORDER_LABELS.Out).length
  const deadIds = useMemo(() => new Set(dead.map((analysis) => analysis.item.id)), [dead])
  const reorderIds = useMemo(() => new Set(reorder.map((analysis) => analysis.item.id)), [reorder])

  const visible = data.filter((row) => {
    if (filter === 'REORDER') return reorderIds.has(row.id)
    if (filter === 'DEAD') return deadIds.has(row.id)
    return true
  })

  const totalValue = data.reduce((sum, row) => sum + row.valueMinor, 0)
  const totalUnits = data.reduce((sum, row) => sum + row.qtyE4, 0)

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-6">
      <PageHeader
        title="Stock Summary"
        description="Quantity and value on hand, from every posted purchase, sale and return."
      />

      <section className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-6">
        <KpiCard
          label="Stock value"
          value={formatMinor(totalValue, 'INR')}
          context="Held at cost"
          icon={Boxes}
          tone="success"
        />
        <KpiCard
          label="Units on hand"
          value={qty(totalUnits)}
          context="Across tracked items"
          icon={Layers}
        />
        <KpiCard
          label="Low stock"
          value={String(low)}
          context="At or below reorder level"
          icon={AlertTriangle}
          tone="warning"
        />
        <KpiCard
          label="Out of stock"
          value={String(out)}
          context="Nothing on hand"
          icon={CircleSlash}
          tone="stamp"
        />
        <KpiCard
          label="Needs reorder"
          value={String(reorder.length)}
          context="Low or out of stock"
          icon={AlertTriangle}
          tone="warning"
        />
        <KpiCard
          label="Dead stock"
          value={String(dead.length)}
          context={`No outward movement in ${windowDays} days`}
          icon={Package}
          tone="stamp"
        />
      </section>

      {!isLoading && data.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Stock value by item" subtitle="Largest inventory balances">
            <RankedBarsChart
              rows={data.map((row) => ({ label: row.name, valueMinor: row.valueMinor }))}
              ariaLabel="Stock value by item"
            />
          </ChartCard>
          <ChartCard title="Value concentration" subtitle="Top items as a share of stock value">
            <ul className="divide-y divide-border">
              {[...data]
                .sort((a, b) => b.valueMinor - a.valueMinor)
                .slice(0, 6)
                .map((row) => {
                  const share = totalValue > 0 ? Math.round((row.valueMinor / totalValue) * 100) : 0
                  return (
                    <li key={row.id} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[0.875rem]">{row.name}</span>
                      <span className="h-1.5 w-24 overflow-hidden bg-muted" aria-hidden>
                        <span className="block h-full bg-primary" style={{ width: `${share}%` }} />
                      </span>
                      <span className="w-16 text-right font-mono text-[0.8125rem] tabular-nums">
                        {formatMinor(row.valueMinor, 'INR')}
                      </span>
                    </li>
                  )
                })}
            </ul>
          </ChartCard>
        </div>
      ) : null}

      {isLoading ? (
        <div className="border border-border bg-card p-8 text-[0.875rem] text-muted-foreground">
          Loading stock...
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No stock yet"
          description="Post a purchase bill with goods items and the stock summary fills itself."
        />
      ) : (
        <div className="border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ['ALL', 'All stock', data.length],
                  ['REORDER', 'Reorder', reorder.length],
                  ['DEAD', 'Dead stock', dead.length]
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`flex h-7 items-center gap-1.5 border px-2 text-[0.75rem] transition-colors ${
                    filter === value
                      ? 'border-primary bg-accent-soft/60 font-medium text-primary'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                  <span className="font-mono text-[0.6875rem] tabular-nums">{count}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[0.75rem] text-muted-foreground">
                Cover and last sold use outward movement in the last {windowDays} days.
              </span>
              <label className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
                Window
                <Select
                  value={String(windowDays)}
                  onValueChange={(value) => setWindowDays(Number(value) as AnalysisWindow)}
                >
                  <SelectTrigger aria-label="Analysis window" className="h-7 w-24 text-[0.75rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANALYSIS_WINDOWS.map((days) => (
                      <SelectItem key={days} value={String(days)}>
                        {days} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          </div>
          <table className="w-full border-collapse text-[0.875rem]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/95">
                {['Item', 'Unit', 'Quantity', 'Cover', 'Last sold', 'Avg cost', 'Value'].map(
                  (head, index) => (
                    <th
                      key={head}
                      className={
                        index > 1
                          ? 'border-b border-border px-3 py-2 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
                          : 'border-b border-border px-3 py-2 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
                      }
                    >
                      {head}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-[0.875rem] text-muted-foreground"
                  >
                    No items in this filter.
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const analysis = byId.get(row.id)
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.9375rem] font-medium">{row.name}</span>
                          {analysis ? (
                            <StatusPill tone={REORDER_TONES[analysis.reorder]}>
                              {REORDER_LABELS[analysis.reorder]}
                            </StatusPill>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{row.uom ?? '-'}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {qty(row.qtyE4)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {analysis === undefined ? (
                          <span className="text-muted-foreground">—</span>
                        ) : analysis.coverDays === null ? (
                          <span className="text-[0.75rem] text-muted-foreground">No movement</span>
                        ) : (
                          coverText(analysis.coverDays)
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[0.8125rem] tabular-nums text-muted-foreground">
                        {analysis?.lastOutwardDate ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.qtyE4 > 0
                          ? formatMinor((row.valueMinor * 10000) / row.qtyE4, 'INR')
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                        {formatMinor(row.valueMinor, 'INR')}
                      </td>
                    </tr>
                  )
                })
              )}
              <tr className="border-t border-ink bg-muted/40 font-semibold">
                <td className="px-3 py-2" colSpan={6}>
                  Total stock value
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatMinor(totalValue, 'INR')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
