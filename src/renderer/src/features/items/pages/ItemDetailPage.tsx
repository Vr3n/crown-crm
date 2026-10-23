import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Boxes,
  CircleSlash,
  IndianRupee,
  Layers,
  Package,
  Plus,
  TrendingUp
} from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/ui/kpi-card'
import { StatusPill } from '@/components/ui/status-pill'
import { Button } from '@/components/ui/button'
import { formatMinor } from '@/lib/money'

const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-10 border-b border-border px-3 align-middle'

function fyStart(now = new Date()): string {
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-04-01`
}

function qty(e4: number): string {
  return (e4 / 10000).toLocaleString('en-IN', { maximumFractionDigits: 3 })
}

export function ItemDetailPage(): React.JSX.Element {
  const { id } = useParams()
  const itemId = Number(id)
  const today = new Date().toISOString().slice(0, 10)
  const from = fyStart()

  const item = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => window.api.items.get(itemId),
    enabled: Number.isFinite(itemId)
  })
  const stock = useQuery({
    queryKey: ['report', 'stock'],
    queryFn: () => window.api.reports.stock()
  })
  const movements = useQuery({
    queryKey: ['item', itemId, 'movements', from, today],
    queryFn: () => window.api.reports.stockMovements(itemId, from, today),
    enabled: Number.isFinite(itemId)
  })

  const i = item.data
  const stockRow = (stock.data ?? []).find((row) => row.id === itemId)
  const onHand = i?.stockQtyE4 ?? 0
  const value = stockRow?.valueMinor ?? 0
  const margin =
    i && i.purchasePriceMinor > 0
      ? Math.round(((i.salePriceMinor - i.purchasePriceMinor) / i.purchasePriceMinor) * 100)
      : null

  const movementRows = movements.data ?? []
  const rows = movementRows.map((row, index) => ({
    ...row,
    balanceE4: movementRows
      .slice(0, index + 1)
      .reduce((sum, entry) => sum + entry.qtyInE4 - entry.qtyOutE4, 0)
  }))

  if (item.isPending) {
    return <div className="p-6 text-[0.875rem] text-muted-foreground">Loading item...</div>
  }

  if (item.isError || !i) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-6">
        <Link
          to="/items"
          className="inline-flex items-center gap-1 text-[0.875rem] text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back
        </Link>
        <EmptyState
          icon={Package}
          title="Item not found"
          description="It may have been removed or belongs to another company."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/items">Back to items</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const out = !i.isService && onHand <= 0
  const low = !i.isService && !out && i.reorderLevelE4 > 0 && onHand <= i.reorderLevelE4
  const ratio = i.reorderLevelE4 > 0 ? Math.min(1, Math.max(0, onHand / i.reorderLevelE4)) : 0

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-6">
      <Link
        to="/items"
        className="inline-flex w-fit items-center gap-1 text-[0.875rem] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Items
      </Link>

      <PageHeader
        title={i.name}
        description={
          [
            i.sku ? `SKU ${i.sku}` : null,
            i.hsnSac ? `HSN ${i.hsnSac}` : null,
            i.uom,
            i.gstRateBps > 0 ? `${(i.gstRateBps / 100).toFixed(0)}% GST` : null,
            i.isService ? 'Service' : i.stockGroup
          ]
            .filter(Boolean)
            .join(' · ') || 'No code or group on file'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/purchases/new">
                <Plus className="size-3.5" strokeWidth={2} />
                New bill
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/sales/new">
                <Plus className="size-3.5" strokeWidth={2} />
                New invoice
              </Link>
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-4">
        <KpiCard
          label="On hand"
          value={i.isService ? 'Service' : qty(onHand)}
          context={
            i.isService
              ? 'Not tracked as stock'
              : out
                ? 'Out of stock'
                : low
                  ? 'At or below reorder'
                  : 'Available to sell'
          }
          icon={Layers}
          tone={out ? 'stamp' : low ? 'warning' : 'success'}
        />
        <KpiCard
          label="Stock value"
          value={formatMinor(value, 'INR')}
          context="At weighted cost"
          icon={Boxes}
        />
        <KpiCard
          label="Reorder level"
          value={i.isService ? '—' : qty(i.reorderLevelE4)}
          context={
            i.isService
              ? 'Tracked per service'
              : i.reorderLevelE4 > 0
                ? 'Low-stock trigger'
                : 'Not set'
          }
          icon={CircleSlash}
          tone="warning"
        />
        <KpiCard
          label="Margin"
          value={margin === null ? '—' : `${margin > 0 ? '+' : ''}${margin}%`}
          context={`Sale ${formatMinor(i.salePriceMinor, 'INR')} · Cost ${formatMinor(i.purchasePriceMinor, 'INR')}`}
          icon={TrendingUp}
          tone={margin !== null && margin < 0 ? 'stamp' : 'primary'}
        />
      </section>

      {!i.isService ? (
        <div className="border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[0.9375rem] font-semibold">Stock position</h2>
              <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                {i.reorderLevelE4 > 0
                  ? `On hand ${qty(onHand)} of a ${qty(i.reorderLevelE4)} reorder level.`
                  : 'Set a reorder level to see a low-stock warning here.'}
              </p>
            </div>
            <StatusPill tone={out ? 'destructive' : low ? 'warning' : 'success'}>
              {out ? 'Out of stock' : low ? 'Low stock' : 'In stock'}
            </StatusPill>
          </div>
          {i.reorderLevelE4 > 0 ? (
            <span className="mt-3 block h-2 overflow-hidden bg-muted" aria-hidden>
              <span
                className={`block h-full ${out ? 'bg-destructive' : low ? 'bg-warning' : 'bg-success'}`}
                style={{ width: `${ratio * 100}%` }}
              />
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[0.9375rem] font-semibold">Stock movements</h2>
        <span className="text-[0.75rem] text-muted-foreground">This financial year</span>
      </div>

      {i.isService ? (
        <EmptyState
          icon={Package}
          title="Services do not hold stock"
          description="A service is sold without a quantity on hand, so there are no movements to show."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No movements this year"
          description="Post a purchase bill or a sales invoice for this item and its movements appear here."
        />
      ) : (
        <div className="overflow-auto border border-border bg-card">
          <table className="w-full border-collapse text-[0.875rem]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/95">
                <th className={TH}>Date</th>
                <th className={TH}>Document</th>
                <th className={TH}>Party</th>
                <th className={`${TH} text-right`}>In</th>
                <th className={`${TH} text-right`}>Out</th>
                <th className={`${TH} text-right`}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className={`${TD} font-mono text-muted-foreground`}>{row.date}</td>
                  <td className={TD}>
                    <Link
                      to={`/vouchers/${row.voucherId}`}
                      className="font-mono font-medium hover:text-primary hover:underline"
                    >
                      {row.number}
                    </Link>
                    <span className="ml-2 text-[0.75rem] text-muted-foreground">{row.type}</span>
                  </td>
                  <td className={`${TD} text-muted-foreground`}>{row.partyName ?? '—'}</td>
                  <td className={`${TD} text-right font-mono tabular-nums`}>
                    {row.qtyInE4 > 0 ? qty(row.qtyInE4) : '—'}
                  </td>
                  <td className={`${TD} text-right font-mono tabular-nums`}>
                    {row.qtyOutE4 > 0 ? qty(row.qtyOutE4) : '—'}
                  </td>
                  <td className={`${TD} text-right font-mono font-semibold tabular-nums`}>
                    {qty(row.balanceE4)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink bg-muted/40 font-semibold">
                <td className="px-3 py-2.5" colSpan={3}>
                  Closing balance
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {qty(rows.reduce((sum, row) => sum + row.qtyInE4, 0))}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {qty(rows.reduce((sum, row) => sum + row.qtyOutE4, 0))}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{qty(onHand)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border pt-3 text-[0.875rem] text-muted-foreground">
        <span>Opening and closing values come from posted vouchers only.</span>
        <span className="inline-flex items-center gap-1 font-mono text-foreground">
          <IndianRupee className="size-3.5" />
          {formatMinor(value, 'INR')}
        </span>
      </div>
    </div>
  )
}
