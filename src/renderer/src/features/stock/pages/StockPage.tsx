import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { formatMinor } from '@/lib/money'
import { Boxes } from 'lucide-react'

/** Stock on hand, computed from posted movements. */
export function StockPage(): React.JSX.Element {
  const { data = [], isLoading } = useQuery({
    queryKey: ['report', 'stock'],
    queryFn: () => window.api.reports.stock()
  })

  const totalValue = data.reduce((sum, row) => sum + row.valueMinor, 0)

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-6">
      <PageHeader
        title="Stock Summary"
        description="Quantity and value on hand, from every posted purchase, sale and return."
      />

      {isLoading ? (
        <div className="border border-border bg-card p-8 text-[12px] text-muted-foreground">
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
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {['Item', 'Unit', 'Quantity', 'Value'].map((head, index) => (
                  <th
                    key={head}
                    className={
                      index > 1
                        ? 'border-b border-border px-3 py-2 text-right text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
                        : 'border-b border-border px-3 py-2 text-left text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
                    }
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.uom ?? '-'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {(row.qtyE4 / 10000).toLocaleString('en-IN', {
                      maximumFractionDigits: 3
                    })}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatMinor(row.valueMinor, 'INR')}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-ink bg-muted/40 font-semibold">
                <td className="px-3 py-2" colSpan={3}>
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
