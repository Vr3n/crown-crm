import { useMemo } from 'react'
import { areaY, barX, barY, defineChart, dot, lineY, stack } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { ChartDataTable, ChartLegend, type ChartLegendItem } from './chart-frame'
import { chartMoney } from './chart-format'
import { CHART_NET, REPORT_ACCENT, REPORT_EXPENSE } from './report-chart-palette'
import type { RankedItem, StackedRow } from '@/features/reports/report-shaping'

const MINOR_PER_MAJOR = 100

function major(minor: number): number {
  return minor / MINOR_PER_MAJOR
}

const axisFormat = (value: string | number): string =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(
    Number(value)
  )

const yAxis = {
  scale: scaleLinear,
  nice: true,
  grid: true,
  axis: { label: 'INR', ticks: { format: axisFormat } }
}

export interface ReportAreaPoint {
  label: string
  primaryMinor: number
  secondaryMinor?: number
  netMinor?: number
}

/**
 * Time series with one filled area, an optional overlay line and an optional
 * net line. Used for revenue with tax, purchases with input tax, and income
 * against expense with the net profit line.
 */
export function ReportAreaChart({
  points,
  primaryLabel,
  secondaryLabel,
  netLabel,
  primaryColor = REPORT_ACCENT,
  secondaryColor = REPORT_EXPENSE,
  netColor = CHART_NET,
  secondaryAsArea = false,
  ariaLabel,
  description,
  height = 240
}: {
  points: ReportAreaPoint[]
  primaryLabel: string
  secondaryLabel?: string
  netLabel?: string
  primaryColor?: string
  secondaryColor?: string
  netColor?: string
  /** Draw the secondary series as its own area instead of an overlay line. */
  secondaryAsArea?: boolean
  ariaLabel: string
  description?: string
  height?: number
}): React.JSX.Element {
  const rows = useMemo(
    () =>
      points.map((point) => ({
        label: point.label,
        primary: major(point.primaryMinor),
        secondary:
          point.secondaryMinor === undefined ? undefined : major(point.secondaryMinor),
        net: point.netMinor === undefined ? undefined : major(point.netMinor)
      })),
    [points]
  )

  const hasSecondary = points.some((point) => point.secondaryMinor !== undefined)
  const hasNet = points.some((point) => point.netMinor !== undefined)
  const secondaryDots = useMemo(() => rows.filter((row) => row.secondary !== undefined), [rows])
  const netDots = useMemo(() => rows.filter((row) => row.net !== undefined), [rows])

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          areaY(rows, {
            id: primaryLabel,
            x: 'label',
            y: 'primary',
            fill: primaryColor,
            fillOpacity: 0.22,
            stroke: primaryColor,
            strokeWidth: 1.6
          }),
          ...(hasSecondary
            ? [
                secondaryAsArea
                  ? areaY(rows, {
                      id: secondaryLabel,
                      x: 'label',
                      y: 'secondary',
                      fill: secondaryColor,
                      fillOpacity: 0.16,
                      stroke: secondaryColor,
                      strokeWidth: 1.6
                    })
                  : lineY(rows, {
                      id: secondaryLabel,
                      x: 'label',
                      y: 'secondary',
                      stroke: secondaryColor,
                      strokeWidth: 1.8
                    })
              ]
            : []),
          ...(hasNet
            ? [
                lineY(rows, {
                  id: netLabel,
                  x: 'label',
                  y: 'net',
                  stroke: netColor,
                  strokeWidth: 1.6,
                  strokeDasharray: '4 3'
                })
              ]
            : []),
          // A dot per point keeps a one-month period readable, where an area
          // or line has no length to draw.
          dot(rows, { x: 'label', y: 'primary', r: 2.4, fill: primaryColor }),
          ...(hasSecondary
            ? [dot(secondaryDots, { x: 'label', y: 'secondary', r: 2.2, fill: secondaryColor })]
            : []),
          ...(hasNet ? [dot(netDots, { x: 'label', y: 'net', r: 2, fill: netColor })] : [])
        ],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.3) },
          y: yAxis
        },
        focus: 'group-x',
        tooltip
      }),
    [
      rows,
      secondaryDots,
      netDots,
      hasSecondary,
      hasNet,
      secondaryAsArea,
      primaryLabel,
      secondaryLabel,
      netLabel,
      primaryColor,
      secondaryColor,
      netColor
    ]
  )

  const legend = [
    { label: primaryLabel, color: primaryColor },
    ...(hasSecondary && secondaryLabel ? [{ label: secondaryLabel, color: secondaryColor }] : []),
    ...(hasNet && netLabel ? [{ label: netLabel, color: netColor }] : [])
  ]

  return (
    <figure className="min-w-0">
      <ChartLegend items={legend} />
      <Chart
        definition={definition}
        height={height}
        ariaLabel={ariaLabel}
        ariaDescription={description}
        className="mt-2 text-foreground"
      />
      <ChartDataTable
        caption={ariaLabel}
        columns={[
          'Month',
          primaryLabel,
          ...(hasSecondary && secondaryLabel ? [secondaryLabel] : []),
          ...(hasNet && netLabel ? [netLabel] : [])
        ]}
        rows={points.map((point) => [
          point.label,
          chartMoney(point.primaryMinor),
          ...(hasSecondary ? [chartMoney(point.secondaryMinor ?? 0)] : []),
          ...(hasNet ? [chartMoney(point.netMinor ?? 0)] : [])
        ])}
      />
    </figure>
  )
}

/**
 * Stacked bars for a part-to-whole comparison: ageing buckets or tax heads.
 * Vertical bars over time, horizontal bars when the category labels are long
 * (parties, or a single composition bar).
 */
export function ReportStackedBars({
  rows,
  series,
  orientation = 'vertical',
  ariaLabel,
  description,
  categoryLabel = 'Category',
  height = 240
}: {
  rows: StackedRow[]
  series: ChartLegendItem[]
  orientation?: 'vertical' | 'horizontal'
  ariaLabel: string
  description?: string
  categoryLabel?: string
  height?: number
}): React.JSX.Element {
  const values = useMemo(
    () => rows.map((row) => ({ x: row.x, series: row.series, value: major(row.valueMinor) })),
    [rows]
  )

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          orientation === 'vertical'
            ? barY(values, {
                x: 'x',
                y: 'value',
                z: 'series',
                color: 'series',
                layout: stack(),
                inset: 1,
                radius: 1
              })
            : barX(values, {
                y: 'x',
                x: 'value',
                z: 'series',
                color: 'series',
                layout: stack(),
                inset: 1,
                radius: 1
              })
        ],
        scales:
          orientation === 'vertical'
            ? {
                x: { scale: () => scaleBand<string>().padding(0.25) },
                y: yAxis
              }
            : {
                y: { scale: () => scaleBand<string>().padding(0.25) },
                x: {
                  scale: scaleLinear,
                  nice: true,
                  grid: true,
                  axis: { label: 'INR', ticks: { format: axisFormat } }
                }
              },
        color: {
          domain: series.map((item) => item.label),
          range: series.map((item) => item.color)
        },
        focus: orientation === 'vertical' ? 'group-x' : 'group-y',
        tooltip
      }),
    [values, orientation, series]
  )

  return (
    <figure className="min-w-0">
      <ChartLegend items={series} />
      <Chart
        definition={definition}
        height={height}
        ariaLabel={ariaLabel}
        ariaDescription={description}
        className="mt-2 text-foreground"
      />
      <ChartDataTable
        caption={ariaLabel}
        columns={[categoryLabel, ...series.map((item) => item.label)]}
        rows={stackedTableRows(rows, series)}
      />
    </figure>
  )
}

/** Ranked horizontal bars for "top parties" comparisons. */
export function ReportRankedBars({
  items,
  ariaLabel,
  description,
  color = REPORT_ACCENT,
  valueLabel = 'Amount',
  height
}: {
  items: RankedItem[]
  ariaLabel: string
  description?: string
  color?: string
  valueLabel?: string
  height?: number
}): React.JSX.Element {
  const rows = useMemo(
    () => items.map((item) => ({ label: item.label, value: major(item.valueMinor) })),
    [items]
  )

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barX(rows, {
            y: 'label',
            x: 'value',
            inset: 1,
            radius: 1,
            fill: color
          })
        ],
        scales: {
          y: { scale: () => scaleBand<string>().padding(0.28) },
          x: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label: 'INR', ticks: { format: axisFormat } }
          }
        },
        tooltip
      }),
    [rows, color]
  )

  return (
    <figure className="min-w-0">
      <Chart
        definition={definition}
        height={height ?? Math.max(150, items.length * 38 + 48)}
        ariaLabel={ariaLabel}
        ariaDescription={description}
        className="text-foreground"
      />
      <ChartDataTable
        caption={ariaLabel}
        columns={['Party', valueLabel]}
        rows={items.map((item) => [item.label, chartMoney(item.valueMinor)])}
      />
    </figure>
  )
}

/** Pivot long stacked rows into one table row per category. */
function stackedTableRows(
  rows: StackedRow[],
  series: ChartLegendItem[]
): (string | number)[][] {
  const categories = [...new Set(rows.map((row) => row.x))]
  return categories.map((category) => [
    category,
    ...series.map((item) =>
      chartMoney(
        rows
          .filter((row) => row.x === category && row.series === item.label)
          .reduce((sum, row) => sum + row.valueMinor, 0)
      )
    )
  ])
}
