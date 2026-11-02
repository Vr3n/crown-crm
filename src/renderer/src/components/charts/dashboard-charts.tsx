import { useMemo } from 'react'
import { barY, defineChart, group } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { ChartDataTable, ChartLegend } from './chart-frame'
import type { AgeingBucket, MonthlyTotals } from '../../../../shared/contracts/dashboard'

const SALES = 'oklch(0.55 0.07 235)'
const PURCHASES = 'oklch(0.7 0.09 75)'
const RECEIVABLE = 'oklch(0.55 0.07 235)'
const PAYABLE = 'oklch(0.55 0.12 32)'

const axisFormat = (value: number): string =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

/** Six month sales and purchases, grouped so both series share a baseline. */
export function MonthlyFlowChart({ monthly }: { monthly: MonthlyTotals[] }): React.JSX.Element {
  const rows = useMemo(
    () =>
      monthly.flatMap((month) => [
        { month: month.label, series: 'Sales', value: month.salesMinor / 100 },
        { month: month.label, series: 'Purchases', value: month.purchasesMinor / 100 }
      ]),
    [monthly]
  )

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(rows, {
            x: 'month',
            y: 'value',
            z: 'series',
            color: 'series',
            layout: group({ padding: 0.18 }),
            inset: 1,
            radius: 1
          })
        ],
        scales: {
          x: {
            scale: () => scaleBand<string>().padding(0.22)
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: {
              label: 'INR',
              ticks: { format: axisFormat }
            }
          }
        },
        color: {
          domain: ['Sales', 'Purchases'],
          range: [SALES, PURCHASES]
        },
        tooltip
      }),
    [rows]
  )

  return (
    <figure className="min-w-0">
      <ChartLegend
        items={[
          { label: 'Sales', color: SALES },
          { label: 'Purchases', color: PURCHASES }
        ]}
      />
      <Chart
        definition={definition}
        height={230}
        ariaLabel="Sales and purchases for the last six months"
        className="mt-2 text-foreground"
      />
      <ChartDataTable
        caption="Sales and purchases for the last six months"
        columns={['Month', 'Sales', 'Purchases']}
        rows={monthly.map((month) => [
          month.label,
          (month.salesMinor / 100).toLocaleString('en-IN'),
          (month.purchasesMinor / 100).toLocaleString('en-IN')
        ])}
      />
    </figure>
  )
}

/** Open bills by age, receivables against payables. */
export function AgeingChart({ ageing }: { ageing: AgeingBucket[] }): React.JSX.Element {
  const rows = useMemo(
    () =>
      ageing.flatMap((bucket) => [
        { bucket: bucket.bucket, series: 'Receivable', value: bucket.receivableMinor / 100 },
        { bucket: bucket.bucket, series: 'Payable', value: bucket.payableMinor / 100 }
      ]),
    [ageing]
  )

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(rows, {
            x: 'bucket',
            y: 'value',
            z: 'series',
            color: 'series',
            layout: group({ padding: 0.16 }),
            inset: 1,
            radius: 1
          })
        ],
        scales: {
          x: {
            scale: () => scaleBand<string>().padding(0.24)
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: {
              label: 'INR',
              ticks: { format: axisFormat }
            }
          }
        },
        color: {
          domain: ['Receivable', 'Payable'],
          range: [RECEIVABLE, PAYABLE]
        },
        tooltip
      }),
    [rows]
  )

  return (
    <figure className="min-w-0">
      <ChartLegend
        items={[
          { label: 'Receivable', color: RECEIVABLE },
          { label: 'Payable', color: PAYABLE }
        ]}
      />
      <Chart
        definition={definition}
        height={220}
        ariaLabel="Open receivables and payables by age"
        className="mt-2 text-foreground"
      />
      <ChartDataTable
        caption="Open receivables and payables by age"
        columns={['Age', 'Receivable', 'Payable']}
        rows={ageing.map((bucket) => [
          bucket.bucket,
          (bucket.receivableMinor / 100).toLocaleString('en-IN'),
          (bucket.payableMinor / 100).toLocaleString('en-IN')
        ])}
      />
    </figure>
  )
}
