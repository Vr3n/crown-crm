import { useMemo } from 'react'
import { barX, barY, defineChart, group } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { ChartDataTable, ChartLegend } from './chart-frame'

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

export interface MonthlyPoint {
  label: string
  totalMinor: number
}

/** Vertical bars for a monthly trend within a period. */
export function MonthlyBarsChart({
  points,
  color = 'oklch(0.55 0.07 235)',
  ariaLabel
}: {
  points: MonthlyPoint[]
  color?: string
  ariaLabel: string
}): React.JSX.Element {
  const data = useMemo(
    () => points.map((point) => ({ label: point.label, value: point.totalMinor / 100 })),
    [points]
  )

  const definition = useMemo(
    () =>
      defineChart({
        marks: [barY(data, { x: 'label', y: 'value', inset: 2, radius: 1, fill: color })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.3) },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { ticks: { format: axisFormat } }
          }
        },
        tooltip
      }),
    [data, color]
  )

  return (
    <Chart definition={definition} height={220} ariaLabel={ariaLabel} className="text-foreground" />
  )
}

export interface FlowPoint {
  label: string
  inQtyE4: number
  outQtyE4: number
}

const qtyFormat = (value: number): string =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value)

const qtyCell = (e4: number): string =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(e4 / 10000)

/**
 * Grouped monthly bars for quantity in and out. Quantities stay in E4 on the
 * way in and are shown as units only at the chart edge; the axis never claims
 * to be rupees.
 */
export function MonthlyFlowChart({
  points,
  ariaLabel,
  inColor = 'oklch(0.57 0.08 158)',
  outColor = 'oklch(0.68 0.09 75)'
}: {
  points: FlowPoint[]
  ariaLabel: string
  inColor?: string
  outColor?: string
}): React.JSX.Element {
  const series = useMemo(
    () => [
      { label: 'In', color: inColor },
      { label: 'Out', color: outColor }
    ],
    [inColor, outColor]
  )

  const data = useMemo(
    () =>
      points.flatMap((point) => [
        { label: point.label, series: 'In', value: point.inQtyE4 / 10000 },
        { label: point.label, series: 'Out', value: point.outQtyE4 / 10000 }
      ]),
    [points]
  )

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(data, {
            x: 'label',
            y: 'value',
            z: 'series',
            color: 'series',
            layout: group(),
            inset: 1,
            radius: 1
          })
        ],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.25) },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label: 'Qty', ticks: { format: qtyFormat } }
          }
        },
        color: {
          domain: series.map((item) => item.label),
          range: series.map((item) => item.color)
        },
        focus: 'group-x',
        tooltip
      }),
    [data, series]
  )

  return (
    <figure className="min-w-0">
      <ChartLegend items={series} />
      <Chart
        definition={definition}
        height={220}
        ariaLabel={ariaLabel}
        className="mt-2 text-foreground"
      />
      <ChartDataTable
        caption={ariaLabel}
        columns={['Month', 'In', 'Out']}
        rows={points.map((point) => [point.label, qtyCell(point.inQtyE4), qtyCell(point.outQtyE4)])}
      />
    </figure>
  )
}
