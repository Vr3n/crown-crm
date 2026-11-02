import { ChartCard } from '@/components/ui/chart-card'
import {
  ReportAreaChart,
  ReportRankedBars,
  ReportStackedBars
} from '@/components/charts/report-charts'
import {
  AGEING_SERIES,
  REPORT_ACCENT,
  REPORT_EXPENSE,
  TAX_SERIES
} from '@/components/charts/report-chart-palette'
import type {
  AgeingRow,
  ProfitLossReport,
  ReceivableRow,
  RegisterRow
} from '../../../../../shared/contracts/reports'
import {
  ageingParties,
  ageingStackRows,
  bucketSlices,
  bucketTotals,
  expenseComposition,
  hasTax,
  monthlyRegisterSeries,
  profitMonthlySeries,
  rankedItems,
  taxSplitRows
} from '../report-shaping'
import type { ReportKind } from '../pages/ReportsPage'

/**
 * Charts for one report. At most two per screen, area for time and bars for
 * comparison. Trial balance and balance sheet are structural reads with no
 * chart. Every chart is skipped when the report has nothing to plot, so the
 * page's composed empty state is the only thing on an empty report.
 */
export function ReportVisuals({
  kind,
  data,
  from,
  to
}: {
  kind: ReportKind
  data: unknown
  from: string
  to: string
}): React.JSX.Element | null {
  if (kind === 'trial-balance' || kind === 'balance-sheet') return null

  if (kind === 'receivables' || kind === 'payables') {
    const rows = data as ReceivableRow[]
    const total = rows.reduce((sum, row) => sum + row.totalMinor, 0)
    if (total === 0) return null

    const isReceivable = kind === 'receivables'
    const composition = bucketSlices(bucketTotals(rows))
    const top = rankedItems(
      rows,
      (row) => row.partyName,
      (row) => (isReceivable ? row.overdueMinor : row.dueWithin30Minor),
      8
    )
    const secondaryTitle = isReceivable
      ? 'Top 8 customers by overdue'
      : 'Top 8 suppliers due within 30 days'

    return (
      <ChartGrid
        charts={[
          {
            title: 'Outstanding by ageing bucket',
            subtitle: 'Every open bill, bucketed from the due date',
            chart: (
              <ReportStackedBars
                rows={composition}
                series={AGEING_SERIES}
                orientation="horizontal"
                categoryLabel="Outstanding"
                ariaLabel={
                  isReceivable
                    ? 'Receivable outstanding by ageing bucket'
                    : 'Payable outstanding by ageing bucket'
                }
                description="Buckets are 0 to 30, 31 to 60, 61 to 90, 91 to 180 and over 180 days. The 0-30 bucket includes bills that are not due yet."
                height={170}
              />
            )
          },
          top.length > 0
            ? {
                title: secondaryTitle,
                subtitle: isReceivable
                  ? 'Largest overdue balances first'
                  : 'Bills falling due today or in the next thirty days',
                chart: (
                  <ReportRankedBars
                    items={top}
                    valueLabel={isReceivable ? 'Overdue' : 'Due in 30 days'}
                    ariaLabel={secondaryTitle}
                  />
                )
              }
            : null
        ]}
      />
    )
  }

  if (kind === 'ageing') {
    const rows = data as AgeingRow[]
    const total = rows.reduce((sum, row) => sum + row.totalMinor, 0)
    if (total === 0) return null

    const parties = ageingParties(rows, 10)
    return (
      <ChartGrid
        charts={[
          {
            title: 'Buckets by party',
            subtitle: 'Ten largest parties; the rest are folded into one row so totals match',
            chart: (
              <ReportStackedBars
                rows={ageingStackRows(parties)}
                series={AGEING_SERIES}
                orientation="horizontal"
                categoryLabel="Party"
                ariaLabel="Open balance by ageing bucket for each of the ten largest parties"
                description="A longer bar means a larger balance. Each layer is an age bucket, so the stripe pattern shows how old a party's balance is."
                height={Math.max(190, parties.length * 34 + 50)}
              />
            )
          }
        ]}
      />
    )
  }

  if (kind === 'sales-register' || kind === 'purchase-register') {
    const rows = data as RegisterRow[]
    const isSales = kind === 'sales-register'
    const months = monthlyRegisterSeries(rows, from, to)
    if (months.every((month) => month.totalMinor === 0)) return null

    const points = months.map((month) => ({
      label: month.label,
      primaryMinor: month.taxableMinor,
      secondaryMinor: month.taxMinor
    }))
    const split = taxSplitRows(months)
    const taxLabel = isSales ? 'GST' : 'Input tax'

    return (
      <ChartGrid
        charts={[
          {
            title: isSales ? 'Monthly revenue' : 'Monthly purchases',
            subtitle: `${isSales ? 'Taxable value' : 'Taxable purchases'} with ${taxLabel.toLowerCase()} overlaid`,
            chart: (
              <ReportAreaChart
                points={points}
                primaryLabel={isSales ? 'Revenue' : 'Purchases'}
                secondaryLabel={taxLabel}
                ariaLabel={
                  isSales
                    ? 'Monthly revenue with a GST overlay line'
                    : 'Monthly purchases with an input tax overlay line'
                }
                description="The shaded area is taxable value. The line is the tax booked on the same documents."
              />
            )
          },
          hasTax(months)
            ? {
                title: `${taxLabel} split`,
                subtitle: 'CGST, SGST and IGST by month',
                chart: (
                  <ReportStackedBars
                    rows={split}
                    series={TAX_SERIES}
                    categoryLabel="Month"
                    ariaLabel={`${taxLabel} split by month into CGST, SGST and IGST`}
                  />
                )
              }
            : null
        ]}
      />
    )
  }

  const report = data as ProfitLossReport
  if (report.totalIncomeMinor === 0 && report.totalExpenseMinor === 0) return null

  const points = profitMonthlySeries(report.monthly ?? [], from, to).map((month) => ({
    label: month.label,
    primaryMinor: month.incomeMinor,
    secondaryMinor: month.expenseMinor,
    netMinor: month.netProfitMinor
  }))
  const expenses = expenseComposition(report.expenses)

  return (
    <ChartGrid
      charts={[
        {
          title: 'Income and expenses by month',
          subtitle: 'Grouped areas with the net profit line',
          chart: (
            <ReportAreaChart
              points={points}
              primaryLabel="Income"
              secondaryLabel="Expense"
              netLabel="Net profit"
              primaryColor={REPORT_ACCENT}
              secondaryColor={REPORT_EXPENSE}
              secondaryAsArea
              ariaLabel="Monthly income and expenses with a net profit line"
              description="Income and expense are drawn as separate areas, not stacked. The dashed line is income less expense."
            />
          )
        },
        expenses.length > 0
          ? {
              title: 'Expense composition',
              subtitle: 'Largest expense accounts for the period',
              chart: (
                <ReportRankedBars
                  items={expenses}
                  valueLabel="Expense"
                  ariaLabel="Expense composition by account"
                />
              )
            }
          : null
      ]}
    />
  )
}

interface ChartSpec {
  title: string
  subtitle: string
  chart: React.JSX.Element
}

function ChartGrid({ charts }: { charts: (ChartSpec | null)[] }): React.JSX.Element {
  const visible = charts.filter((chart): chart is ChartSpec => chart !== null)
  return (
    <section className="report-print-hide grid grid-cols-1 gap-4 xl:grid-cols-2">
      {visible.map((chart) => (
        <ChartCard
          key={chart.title}
          title={chart.title}
          subtitle={chart.subtitle}
          className={visible.length === 1 ? 'xl:col-span-2' : undefined}
        >
          {chart.chart}
        </ChartCard>
      ))}
    </section>
  )
}
