import { cn } from '@/lib/utils'

export interface ChartLegendItem {
  label: string
  color: string
}

/** Shared chart legend. Colour is never the only signal: the label is text. */
export function ChartLegend({
  items,
  label = 'Chart legend'
}: {
  items: ChartLegendItem[]
  label?: string
}): React.JSX.Element {
  return (
    <ul className="flex flex-wrap items-center gap-4" aria-label={label}>
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground"
        >
          <span
            className="inline-block size-2.5 shrink-0"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * The exact values behind a chart. A disclosure keeps the table available to
 * everyone without turning the chart into a table, and the caption gives the
 * table an accessible name of its own.
 */
export function ChartDataTable({
  caption,
  columns,
  rows,
  rowHeaders = true
}: {
  caption: string
  columns: string[]
  rows: (string | number)[][]
  rowHeaders?: boolean
}): React.JSX.Element {
  return (
    <details className="mt-2 text-[0.75rem]" data-chart-data-table>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Show data table
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border">
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    'px-2 py-1 font-medium text-muted-foreground',
                    index > 0 && 'text-right'
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                {row.map((cell, cellIndex) =>
                  rowHeaders && cellIndex === 0 ? (
                    <th
                      key={cellIndex}
                      scope="row"
                      className="px-2 py-1 text-left font-normal text-foreground"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td key={cellIndex} className="px-2 py-1 text-right font-mono tabular-nums">
                      {cell}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
