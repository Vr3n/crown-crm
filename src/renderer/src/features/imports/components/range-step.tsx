import { useEffect, useRef, useState } from 'react'
import { Grid3X3, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cellText, columnLetter, rangeAddress } from '@shared/excel-import/parse'
import type { CellRange, CellValue, SheetData } from '@shared/excel-import/types'

const MAX_ROWS = 80
const MAX_COLS = 24

interface Point {
  row: number
  col: number
}

function rect(anchor: Point, current: Point): CellRange {
  return {
    sheet: '',
    startRow: Math.min(anchor.row, current.row),
    startCol: Math.min(anchor.col, current.col),
    endRow: Math.max(anchor.row, current.row),
    endCol: Math.max(anchor.col, current.col)
  }
}

function inRange(range: CellRange, row: number, col: number): boolean {
  return (
    row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol
  )
}

function edgeClass(range: CellRange, row: number, col: number): string {
  return cn(
    row === range.startRow && 'border-t-2 border-t-primary',
    row === range.endRow && 'border-b-2 border-b-primary',
    col === range.startCol && 'border-l-2 border-l-primary',
    col === range.endCol && 'border-r-2 border-r-primary'
  )
}

function SheetGrid({
  sheet,
  range,
  headerRow,
  onRangeChange,
  onHeaderRowChange
}: {
  sheet: SheetData
  range: CellRange
  headerRow: number | null
  onRangeChange: (range: CellRange) => void
  onHeaderRowChange: (row: number) => void
}): React.JSX.Element {
  const dragAnchor = useRef<Point | null>(null)
  const [active, setActive] = useState<Point>({ row: range.startRow, col: range.startCol })
  const rowCount = Math.min(sheet.rowCount, MAX_ROWS)
  const colCount = Math.min(sheet.colCount, MAX_COLS)

  useEffect(() => {
    const clear = (): void => {
      dragAnchor.current = null
    }
    window.addEventListener('pointerup', clear)
    window.addEventListener('pointercancel', clear)
    return () => {
      window.removeEventListener('pointerup', clear)
      window.removeEventListener('pointercancel', clear)
    }
  }, [])

  function select(anchor: Point, current: Point): void {
    const next = rect(anchor, current)
    onRangeChange({ ...next, sheet: sheet.name })
  }

  function begin(event: React.PointerEvent, row: number, col: number): void {
    event.preventDefault()
    const anchor = event.shiftKey
      ? (dragAnchor.current ?? { row: range.startRow, col: range.startCol })
      : { row, col }
    dragAnchor.current = anchor
    setActive({ row, col })
    select(anchor, { row, col })
    const grid = (event.currentTarget as HTMLElement).closest<HTMLElement>('[role="grid"]')
    grid?.focus()
  }

  function move(event: React.PointerEvent): void {
    if (!dragAnchor.current) return
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-row][data-col]')
    if (!element) return
    const row = Number(element.dataset.row)
    const col = Number(element.dataset.col)
    if (!Number.isFinite(row) || !Number.isFinite(col)) return
    setActive({ row, col })
    select(dragAnchor.current, { row, col })
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const current = active
    const next = { ...current }
    if (event.key === 'ArrowUp') next.row = Math.max(0, current.row - 1)
    if (event.key === 'ArrowDown') next.row = Math.min(rowCount - 1, current.row + 1)
    if (event.key === 'ArrowLeft') next.col = Math.max(0, current.col - 1)
    if (event.key === 'ArrowRight') next.col = Math.min(colCount - 1, current.col + 1)
    setActive(next)
    if (event.shiftKey) {
      const anchor = dragAnchor.current ?? { row: range.startRow, col: range.startCol }
      dragAnchor.current = anchor
      select(anchor, next)
    } else {
      dragAnchor.current = next
      select(next, next)
    }
  }

  return (
    <div className="overflow-hidden border border-border">
      <div
        className="max-h-[420px] overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        tabIndex={0}
        role="grid"
        aria-label="Sheet cells. Drag to select a range. Use the arrow keys, and hold Shift to extend."
        aria-rowcount={rowCount}
        aria-colcount={colCount}
        onPointerMove={move}
        onKeyDown={onKeyDown}
      >
        <table className="border-collapse text-[0.75rem]">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 h-7 w-10 border-r border-b border-border bg-muted" />
              {Array.from({ length: colCount }, (_, col) => (
                <th
                  key={col}
                  scope="col"
                  className={cn(
                    'h-7 min-w-[92px] max-w-[140px] border-r border-b border-border bg-muted px-1.5 text-center font-mono text-[0.6875rem] font-medium text-muted-foreground',
                    col >= range.startCol && col <= range.endCol && 'bg-accent-soft text-primary'
                  )}
                >
                  {columnLetter(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, row) => {
              const values = sheet.rows[row] ?? []
              const isHeader = headerRow === row
              return (
                <tr key={row}>
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-0 z-10 h-7 w-10 border-r border-b border-border bg-muted p-0 text-center font-mono text-[0.6875rem] font-normal text-muted-foreground',
                      isHeader && 'bg-primary text-primary-foreground'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onHeaderRowChange(row)}
                      aria-label={`Use row ${row + 1} as the column names`}
                      aria-pressed={isHeader}
                      title={`Use row ${row + 1} as the column names`}
                      className="flex h-7 w-full items-center justify-center hover:bg-primary/15"
                    >
                      {isHeader ? 'H' : row + 1}
                    </button>
                  </th>
                  {Array.from({ length: colCount }, (_, col) => {
                    const text = cellText(values[col] as CellValue)
                    const selected = inRange(range, row, col)
                    const isActive = active.row === row && active.col === col
                    return (
                      <td
                        key={col}
                        data-row={row}
                        data-col={col}
                        role="gridcell"
                        aria-selected={selected}
                        aria-rowindex={row + 1}
                        aria-colindex={col + 1}
                        title={text}
                        onPointerDown={(event) => begin(event, row, col)}
                        className={cn(
                          'h-7 max-w-[140px] cursor-cell overflow-hidden border-r border-b border-border/70 px-1.5 text-left align-middle',
                          selected && 'bg-accent-soft/60',
                          isHeader && 'bg-primary/10 font-medium',
                          selected && edgeClass(range, row, col),
                          isActive && 'outline outline-2 -outline-offset-2 outline-primary'
                        )}
                      >
                        <span className="block truncate">{text}</span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sheet.rowCount > MAX_ROWS || sheet.colCount > MAX_COLS ? (
        <p className="border-t border-border bg-muted/40 px-2 py-1.5 text-[0.75rem] text-muted-foreground">
          Showing the first {MAX_ROWS} rows and {MAX_COLS} columns. Use the range boxes above for a
          larger table.
        </p>
      ) : null}
    </div>
  )
}

export function RangeStep({
  sheet,
  sheets,
  range,
  headerRow,
  onSelectSheet,
  onRangeChange,
  onHeaderRowChange
}: {
  sheet: SheetData
  sheets: { name: string; rowCount: number; colCount: number }[]
  range: CellRange
  headerRow: number | null
  onSelectSheet: (name: string) => void
  onRangeChange: (range: CellRange) => void
  onHeaderRowChange: (row: number) => void
}): React.JSX.Element {
  const dataRows = Math.max(0, range.endRow - (headerRow ?? range.startRow))

  function setEdge(edge: 'startRow' | 'endRow' | 'startCol' | 'endCol', value: number): void {
    if (!Number.isFinite(value)) return
    const maxRow = Math.max(0, sheet.rowCount - 1)
    const maxCol = Math.max(0, sheet.colCount - 1)
    const max = edge === 'startRow' || edge === 'endRow' ? maxRow : maxCol
    const next = { ...range, [edge]: Math.min(max, Math.max(0, Math.floor(value))) }
    if (next.startRow > next.endRow) next.endRow = next.startRow
    if (next.startCol > next.endCol) next.endCol = next.startCol
    onRangeChange(next)
  }

  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Table2 className="size-4 text-info" strokeWidth={1.75} />
          <h2 className="text-[0.9375rem] font-semibold">Sheet and range</h2>
          <span className="text-[0.75rem] text-muted-foreground">
            {dataRows} data row{dataRows === 1 ? '' : 's'}
          </span>
        </div>
        <span className="font-mono text-[0.75rem] text-muted-foreground" aria-live="polite">
          {rangeAddress(range)}
        </span>
      </div>

      <div className="border-b border-border px-4 py-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Workbook sheets">
          {sheets.map((row) => {
            const active = row.name === sheet.name
            return (
              <button
                key={row.name}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectSheet(row.name)}
                className={cn(
                  'border px-2.5 py-1.5 text-[0.8125rem] transition-colors',
                  active
                    ? 'border-primary bg-accent-soft font-medium text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted'
                )}
              >
                {row.name}
                <span className="ml-1.5 font-mono text-[0.6875rem] opacity-70">
                  {row.rowCount}×{row.colCount}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-3 border-b border-border px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="header-row"
            className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Column names are in row
          </label>
          <select
            id="header-row"
            value={headerRow ?? ''}
            onChange={(event) => {
              if (event.target.value === '') return
              onHeaderRowChange(Number(event.target.value))
            }}
            className="h-9 border border-input bg-background px-2 text-[0.875rem] outline-none focus:border-primary"
          >
            <option value="">Choose a row</option>
            {Array.from({ length: range.endRow - range.startRow + 1 }, (_, index) => {
              const row = range.startRow + index
              const preview = (sheet.rows[row] ?? [])
                .slice(range.startCol, range.startCol + 4)
                .map((cell) => cellText(cell as CellValue))
                .filter(Boolean)
                .join(' · ')
              return (
                <option key={row} value={row}>
                  Row {row + 1}
                  {preview ? ` · ${preview.slice(0, 48)}` : ''}
                </option>
              )
            })}
          </select>
          <p className="text-[0.75rem] leading-snug text-muted-foreground">
            Click a row number in the grid to move this. The header row is shaded blue.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              From row
            </span>
            <input
              type="number"
              min={1}
              value={range.startRow + 1}
              onChange={(event) => setEdge('startRow', Number(event.target.value) - 1)}
              className="h-9 w-full border border-input bg-background px-2 font-mono text-[0.8125rem] outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              To row
            </span>
            <input
              type="number"
              min={1}
              value={range.endRow + 1}
              onChange={(event) => setEdge('endRow', Number(event.target.value) - 1)}
              className="h-9 w-full border border-input bg-background px-2 font-mono text-[0.8125rem] outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              From col
            </span>
            <select
              value={range.startCol}
              onChange={(event) => setEdge('startCol', Number(event.target.value))}
              className="h-9 w-full border border-input bg-background px-1 font-mono text-[0.8125rem] outline-none focus:border-primary"
            >
              {Array.from({ length: sheet.colCount }, (_, col) => (
                <option key={col} value={col}>
                  {columnLetter(col)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              To col
            </span>
            <select
              value={range.endCol}
              onChange={(event) => setEdge('endCol', Number(event.target.value))}
              className="h-9 w-full border border-input bg-background px-1 font-mono text-[0.8125rem] outline-none focus:border-primary"
            >
              {Array.from({ length: Math.max(0, sheet.colCount - range.startCol) }, (_, index) => {
                const col = range.startCol + index
                return (
                  <option key={col} value={col}>
                    {columnLetter(col)}
                  </option>
                )
              })}
            </select>
          </label>
        </div>
      </div>

      <div className="p-3">
        <SheetGrid
          sheet={sheet}
          range={range}
          headerRow={headerRow}
          onRangeChange={onRangeChange}
          onHeaderRowChange={(row) => {
            if (row < range.startRow || row > range.endRow) {
              onRangeChange({
                ...range,
                startRow: Math.min(range.startRow, row),
                endRow: Math.max(range.endRow, row)
              })
            }
            onHeaderRowChange(row)
          }}
        />
        <p className="mt-2 flex items-start gap-1.5 text-[0.75rem] leading-snug text-muted-foreground">
          <Grid3X3 className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
          Drag across the table. Shift and click to extend. Leave out titles, totals and notes.
        </p>
      </div>
    </section>
  )
}
