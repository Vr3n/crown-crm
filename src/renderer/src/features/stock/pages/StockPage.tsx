import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Boxes, CircleSlash, Layers } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/ui/kpi-card'
import { ChartCard } from '@/components/ui/chart-card'
import { StatusPill } from '@/components/ui/status-pill'
import { RankedBarsChart } from '@/components/charts/list-charts'
import { formatMinor } from '@/lib/money'

function qty(e4: number): string {
  return (e4 / 10000).toLocaleString('en-IN', { maximumFractionDigits: 3 })
}

/** Stock on hand, computed from posted movements. */
export function StockPage(): React.JSX.Element {
  const { data = [], isLoading } = useQuery({
    queryKey: ['report', 'stock'],
    queryFn: () => window.api.reports.stock()
  })
  const summary = useQuery({
    queryKey: ['items', 'summary'],
    queryFn: () => window.api.summaries.items()
  })

  const totalValue = data.reduce((sum, row) => sum + row.valueMinor, 0)
  const totalUnits = data.reduce((sum, row) => sum + row.qtyE4, 0)
  const s = summary.data

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-6">
      <PageHeader
        title="Stock Summary"
        description="Quantity and value on hand, from every posted purchase, sale and return."
      />

      <section className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-4">
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
          value={String(s?.lowStockCount ?? 0)}
          context="At or below reorder level"
          icon={AlertTriangle}
          tone="warning"
        />
        <KpiCard
          label="Out of stock"
          value={String(s?.outOfStockCount ?? 0)}
          context="Nothing on hand"
          icon={CircleSlash}
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
          <table className="w-full border-collapse text-[0.875rem]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/95">
                {['Item', 'Unit', 'Quantity', 'Avg cost', 'Value'].map((head, index) => (
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
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.9375rem] font-medium">{row.name}</span>
                      {row.qtyE4 <= 0 ? <StatusPill tone="destructive">Out</StatusPill> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{row.uom ?? '-'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{qty(row.qtyE4)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {row.qtyE4 > 0 ? formatMinor((row.valueMinor * 10000) / row.qtyE4, 'INR') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                    {formatMinor(row.valueMinor, 'INR')}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-ink bg-muted/40 font-semibold">
                <td className="px-3 py-2" colSpan={4}>
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
