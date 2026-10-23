import { useMemo } from 'react'
import { barX, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'

export interface RankRow {
  label: string
  valueMinor: number
}

const axisFormat = (value: number): string =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

/**
 * Horizontal ranked bars for "top balances" or "top items by value". One mark,
 * one colour, sorted largest first, so the ranking is the message.
 */
export function RankedBarsChart({
  rows,
  color = 'oklch(0.55 0.07 235)',
  ariaLabel
}: {
  rows: RankRow[]
  color?: string
  ariaLabel: string
}): React.JSX.Element {
  const data = useMemo(
    () =>
      [...rows]
        .filter((row) => row.valueMinor !== 0)
        .sort((a, b) => b.valueMinor - a.valueMinor)
        .slice(0, 6)
        .map((row) => ({ label: row.label, value: row.valueMinor / 100 })),
    [rows]
  )

  const definition = useMemo(
    () =>
      defineChart({
        marks: [barX(data, { y: 'label', x: 'value', inset: 1, radius: 1, fill: color })],
        scales: {
          y: { scale: () => scaleBand<string>().padding(0.25) },
          x: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label: 'INR', ticks: { format: axisFormat } }
          }
        },
        tooltip
      }),
    [data, color]
  )

  return (
    <Chart
      definition={definition}
      height={Math.max(120, data.length * 40 + 40)}
      ariaLabel={ariaLabel}
      className="text-foreground"
    />
  )
}
