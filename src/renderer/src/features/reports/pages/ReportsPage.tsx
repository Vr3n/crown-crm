import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/page-header'
import { KpiCard, type KpiTone } from '@/components/ui/kpi-card'
import { formatMinor } from '@/lib/money'
import { useCompanyProfile } from '@/lib/company-queries'
import { printCssVars } from '../../../../../shared/print-geometry'
import { cn } from '@/lib/utils'
import '../report-print.css'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  IndianRupee,
  Landmark,
  Scale,
  TrendingUp
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ReportTable, type ReportTableRow } from '../components/report-table'
import { ReportVisuals } from '../components/report-visuals'
import { amountTone, openBalanceStatus } from '../report-shaping'

/**
 * Page counters live in the paged-media margin box. This rule is injected by
 * the report page only, so another route can keep its own margins.
 */
const PRINT_PAGE_STYLE =
  '@page { size: A4; margin: 14mm 12mm 18mm; @bottom-center { content: "Page " counter(page) " of " counter(pages); } }'

const reportStyle = printCssVars as React.CSSProperties

export type ReportKind =
  | 'receivables'
  | 'payables'
  | 'ageing'
  | 'trial-balance'
  | 'profit-loss'
  | 'balance-sheet'
  | 'sales-register'
  | 'purchase-register'

const TITLES: Record<ReportKind, string> = {
  receivables: 'Receivables',
  payables: 'Payables',
  ageing: 'Ageing',
  'trial-balance': 'Trial Balance',
  'profit-loss': 'Profit and Loss',
  'balance-sheet': 'Balance Sheet',
  'sales-register': 'Sales Register',
  'purchase-register': 'Purchase Register'
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function fyStart(): string {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-04-01`
}

function money(value: number): string {
  return formatMinor(value, 'INR')
}

/**
 * Report surface. One shell, one table style, one date range. Each report reads
 * posted rows through the report IPC; nothing is cached in the database.
 */
export function ReportsPage({ kind }: { kind: ReportKind }): React.JSX.Element {
  const [from, setFrom] = useState(fyStart())
  const [to, setTo] = useState(today())
  const [basis, setBasis] = useState<'BILL_DATE' | 'DUE_DATE'>('DUE_DATE')
  const company = useCompanyProfile()
  const companyName = company.data?.name ?? 'Crown Books'

  const needsRange =
    kind === 'profit-loss' ||
    kind === 'balance-sheet' ||
    kind === 'sales-register' ||
    kind === 'purchase-register'

  const periodLabel = needsRange ? `${from} to ${to}` : `As of ${to}`
  const generatedAt = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  const query = useQuery({
    queryKey: ['report', kind, from, to, basis],
    queryFn: async () => {
      switch (kind) {
        case 'receivables':
          return { rows: await window.api.reports.receivables(to, basis) }
        case 'payables':
          return { rows: await window.api.reports.payables(to, basis) }
        case 'ageing':
          return { rows: await window.api.reports.ageing(to, basis) }
        case 'trial-balance':
          return { rows: await window.api.reports.trialBalance() }
        case 'profit-loss':
          return { rows: await window.api.reports.profitLoss(from, to) }
        case 'balance-sheet':
          return { rows: await window.api.reports.balanceSheet(from, to) }
        case 'sales-register':
          return { rows: await window.api.reports.register('SALES', from, to) }
        case 'purchase-register':
          return { rows: await window.api.reports.register('PURCHASE', from, to) }
      }
    }
  })

  return (
    <div
      className="report-page mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-6"
      style={reportStyle}
    >
      <style>{PRINT_PAGE_STYLE}</style>

      <div className="report-print-hide">
        <PageHeader
          title={TITLES[kind]}
          description={descriptionFor(kind)}
          actions={
            <div className="flex items-end gap-2">
              {needsRange ? (
                <>
                  <DateField label="From" value={from} onChange={setFrom} />
                  <DateField label="To" value={to} onChange={setTo} />
                </>
              ) : (
                <>
                  <DateField label="As of" value={to} onChange={setTo} />
                  <label className="flex flex-col gap-1">
                    <span className="text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
                      Basis
                    </span>
                    <select
                      value={basis}
                      onChange={(e) => setBasis(e.target.value as 'BILL_DATE' | 'DUE_DATE')}
                      className="h-8 border border-input bg-card px-2 text-[0.875rem]"
                    >
                      <option value="DUE_DATE">Due date</option>
                      <option value="BILL_DATE">Bill date</option>
                    </select>
                  </label>
                </>
              )}
            </div>
          }
        />
      </div>

      <div className="report-print-head">
        <div>
          <p className="report-print-company">{companyName}</p>
          <p className="report-print-title">{TITLES[kind]}</p>
        </div>
        <div className="report-print-meta">
          <p>Generated {generatedAt}</p>
          <p>{needsRange ? 'Period' : 'As of'}: {periodLabel}</p>
        </div>
      </div>

      {query.isLoading ? (
        <div className="border border-border bg-card p-8 text-[0.875rem] text-muted-foreground">
          Loading report...
        </div>
      ) : null}

      {query.error ? (
        <div className="border border-destructive/30 bg-destructive/5 p-4 text-[0.875rem] text-destructive">
          {query.error instanceof Error ? query.error.message : 'Could not load the report'}
        </div>
      ) : null}

      {query.data ? (
        <>
          <ReportStats kind={kind} data={query.data.rows} />
          <ReportVisuals kind={kind} data={query.data.rows} from={from} to={to} />
          <ReportBody kind={kind} data={query.data.rows as never} />
        </>
      ) : null}

      <div className="report-print-foot">
        <span>
          {companyName} · {TITLES[kind]}
        </span>
        <span>Generated {generatedAt}</span>
      </div>
    </div>
  )
}

function ReportStats({ kind, data }: { kind: ReportKind; data: unknown }): React.JSX.Element {
  const money = (minor: number): string => formatMinor(minor, 'INR')
  const cards: {
    label: string
    value: string
    context: string
    tone: KpiTone
    icon: LucideIcon
  }[] = []

  if (kind === 'receivables' || kind === 'payables') {
    const rows = data as { notDueMinor: number; overdueMinor: number; totalMinor: number }[]
    const total = rows.reduce((sum, row) => sum + row.totalMinor, 0)
    const overdue = rows.reduce((sum, row) => sum + row.overdueMinor, 0)
    cards.push(
      {
        label: kind === 'receivables' ? 'Receivable' : 'Payable',
        value: money(total),
        context: `${rows.length} ${rows.length === 1 ? 'party' : 'parties'}`,
        tone: 'primary',
        icon: kind === 'receivables' ? ArrowDownLeft : ArrowUpRight
      },
      {
        label: 'Overdue',
        value: money(overdue),
        context:
          total > 0 ? `${Math.round((overdue / total) * 100)}% of the total` : 'Nothing overdue',
        tone: 'warning',
        icon: AlertTriangle
      },
      {
        label: 'Not due yet',
        value: money(total - overdue),
        context: 'Within agreed terms',
        tone: 'success',
        icon: Scale
      }
    )
  }

  if (kind === 'ageing') {
    const rows = data as { bucketsMinor: number[]; totalMinor: number }[]
    const total = rows.reduce((sum, row) => sum + row.totalMinor, 0)
    const overdue = rows.reduce(
      (sum, row) => sum + row.bucketsMinor.slice(1).reduce((inner, value) => inner + value, 0),
      0
    )
    cards.push(
      {
        label: 'Open balance',
        value: money(total),
        context: `${rows.length} ${rows.length === 1 ? 'party' : 'parties'}`,
        tone: 'primary',
        icon: IndianRupee
      },
      {
        label: 'Overdue',
        value: money(overdue),
        context: 'Past the due date',
        tone: 'warning',
        icon: AlertTriangle
      },
      {
        label: 'Oldest',
        value: money(rows.reduce((sum, row) => sum + (row.bucketsMinor.at(-1) ?? 0), 0)),
        context: 'More than 180 days late',
        tone: 'stamp',
        icon: Landmark
      }
    )
  }

  if (kind === 'trial-balance') {
    const rows = data as { debitMinor: number; creditMinor: number }[]
    const debit = rows.reduce((sum, row) => sum + row.debitMinor, 0)
    const credit = rows.reduce((sum, row) => sum + row.creditMinor, 0)
    cards.push(
      {
        label: 'Total debit',
        value: money(debit),
        context: `${rows.length} accounts`,
        tone: 'primary',
        icon: ArrowDownLeft
      },
      {
        label: 'Total credit',
        value: money(credit),
        context: 'Must equal total debit',
        tone: 'success',
        icon: ArrowUpRight
      },
      {
        label: 'Difference',
        value: money(debit - credit),
        context: debit === credit ? 'The books balance' : 'The books do not balance',
        tone: debit === credit ? 'success' : 'stamp',
        icon: Scale
      }
    )
  }

  if (kind === 'profit-loss') {
    const report = data as {
      totalIncomeMinor: number
      totalExpenseMinor: number
      netProfitMinor: number
    }
    const margin =
      report.totalIncomeMinor > 0
        ? Math.round((report.netProfitMinor / report.totalIncomeMinor) * 100)
        : 0
    cards.push(
      {
        label: 'Income',
        value: money(report.totalIncomeMinor),
        context: 'For the period',
        tone: 'success',
        icon: ArrowDownLeft
      },
      {
        label: 'Expenses',
        value: money(report.totalExpenseMinor),
        context: 'For the period',
        tone: 'warning',
        icon: ArrowUpRight
      },
      {
        label: report.netProfitMinor >= 0 ? 'Net profit' : 'Net loss',
        value: money(Math.abs(report.netProfitMinor)),
        context: `${margin}% of income`,
        tone: report.netProfitMinor >= 0 ? 'success' : 'stamp',
        icon: TrendingUp
      }
    )
  }

  if (kind === 'balance-sheet') {
    const report = data as {
      totalAssetsMinor: number
      totalLiabilitiesMinor: number
      totalEquityMinor: number
      differenceMinor: number
    }
    cards.push(
      {
        label: 'Assets',
        value: money(report.totalAssetsMinor),
        context: 'As of the date',
        tone: 'primary',
        icon: Landmark
      },
      {
        label: 'Liabilities',
        value: money(report.totalLiabilitiesMinor),
        context: 'What the business owes',
        tone: 'warning',
        icon: ArrowUpRight
      },
      {
        label: 'Equity',
        value: money(report.totalEquityMinor + report.differenceMinor),
        context: 'Owners and reserves',
        tone: 'success',
        icon: Scale
      }
    )
  }

  if (kind === 'sales-register' || kind === 'purchase-register') {
    const rows = data as {
      taxableMinor: number
      cgstMinor: number
      sgstMinor: number
      igstMinor: number
      totalMinor: number
    }[]
    const taxable = rows.reduce((sum, row) => sum + row.taxableMinor, 0)
    const tax = rows.reduce((sum, row) => sum + row.cgstMinor + row.sgstMinor + row.igstMinor, 0)
    const total = rows.reduce((sum, row) => sum + row.totalMinor, 0)
    cards.push(
      {
        label: 'Taxable value',
        value: money(taxable),
        context: `${rows.length} documents`,
        tone: 'primary',
        icon: IndianRupee
      },
      {
        label: 'GST',
        value: money(tax),
        context: 'CGST + SGST + IGST',
        tone: 'warning',
        icon: Scale
      },
      {
        label: 'Invoice total',
        value: money(total),
        context: 'Including tax',
        tone: 'success',
        icon: FileText
      }
    )
  }

  if (cards.length === 0) return <></>

  return (
    <section className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-3">
      {cards.map((card) => (
        <KpiCard
          key={card.label}
          label={card.label}
          value={card.value}
          context={card.context}
          tone={card.tone}
          icon={card.icon}
        />
      ))}
    </section>
  )
}

function ReportBody({ kind, data }: { kind: ReportKind; data: never }): React.JSX.Element {
  if (kind === 'receivables' || kind === 'payables') {
    const rows = data as unknown as {
      partyId: number
      partyName: string
      notDueMinor: number
      overdueMinor: number
      totalMinor: number
      dueWithin7Minor: number
    }[]
    const total = rows.reduce((sum, row) => sum + row.totalMinor, 0)
    return (
      <ReportTable
        exportName={TITLES[kind]}
        empty={rows.length === 0}
        emptyTitle={kind === 'receivables' ? 'No receivables' : 'No payables'}
        emptyText="Post an invoice or a purchase bill and it will appear here."
        head={['Party', 'Not due', 'Overdue', 'Total']}
        rows={rows.map((row) => {
          const status = openBalanceStatus(row)
          return {
            cells: [
              row.partyName,
              money(row.notDueMinor),
              money(row.overdueMinor),
              money(row.totalMinor)
            ],
            status,
            tones: [
              undefined,
              row.notDueMinor === 0 ? 'zero' : undefined,
              row.overdueMinor === 0 ? 'zero' : undefined,
              undefined
            ]
          }
        })}
        numeric={[1, 2, 3]}
        footer={['Total', '', '', money(total)]}
      />
    )
  }

  if (kind === 'ageing') {
    const rows = data as unknown as {
      partyName: string
      bucketsMinor: number[]
      totalMinor: number
    }[]
    const totals = [0, 0, 0, 0, 0]
    rows.forEach((row) => row.bucketsMinor.forEach((value, index) => (totals[index] += value)))
    return (
      <ReportTable
        exportName={TITLES[kind]}
        empty={rows.length === 0}
        emptyTitle="Nothing overdue"
        emptyText="Open bills appear here once they are posted."
        head={['Party', '0-30', '31-60', '61-90', '91-180', '180+', 'Total']}
        rows={rows.map((row) => ({
          cells: [
            row.partyName,
            ...row.bucketsMinor.map(money),
            money(row.totalMinor)
          ],
          status: row.bucketsMinor.slice(1).some((value) => value > 0) ? 'overdue' : 'current',
          tones: [undefined, ...row.bucketsMinor.map((value) => (value === 0 ? 'zero' : undefined)), undefined]
        }))}
        numeric={[1, 2, 3, 4, 5, 6]}
        footer={['Total', ...totals.map(money), money(rows.reduce((s, r) => s + r.totalMinor, 0))]}
      />
    )
  }

  if (kind === 'trial-balance') {
    const rows = data as unknown as {
      id: number
      name: string
      groupName: string
      debitMinor: number
      creditMinor: number
    }[]
    const debit = rows.reduce((sum, row) => sum + row.debitMinor, 0)
    const credit = rows.reduce((sum, row) => sum + row.creditMinor, 0)
    return (
      <ReportTable
        exportName={TITLES[kind]}
        empty={rows.length === 0}
        emptyTitle="No accounts"
        emptyText="The chart of accounts is empty."
        head={['Account', 'Group', 'Debit', 'Credit']}
        rows={rows
          .filter((row) => row.debitMinor !== 0 || row.creditMinor !== 0)
          .map((row) => ({
            cells: [
              row.name,
              row.groupName,
              money(row.debitMinor),
              money(row.creditMinor)
            ]
          }))}
        numeric={[2, 3]}
        footer={['Total', '', money(debit), money(credit)]}
        note={
          debit === credit
            ? 'Debits equal credits.'
            : 'The books do not balance. Check the integrity report.'
        }
        noteTone={debit === credit ? 'ok' : 'bad'}
      />
    )
  }

  if (kind === 'profit-loss') {
    const report = data as unknown as {
      income: { id: number; name: string; debitMinor: number; creditMinor: number }[]
      expenses: { id: number; name: string; debitMinor: number; creditMinor: number }[]
      totalIncomeMinor: number
      totalExpenseMinor: number
      netProfitMinor: number
    }
    const incomeRows: ReportTableRow[] = [
      ...(report.income.length > 0 ? [{ group: 'Income', cells: [] }] : []),
      ...report.income.map((row) => ({
        cells: [row.name, money(row.creditMinor)],
        tones: [undefined, amountTone(row.creditMinor)]
      }))
    ]
    const expenseRows: ReportTableRow[] = [
      ...(report.expenses.length > 0 ? [{ group: 'Expense', cells: [] }] : []),
      ...report.expenses.map((row) => ({
        cells: [row.name, money(row.debitMinor)]
      }))
    ]
    return (
      <div className="flex flex-col gap-4">
        <ReportTable
          exportName={TITLES[kind]}
          empty={false}
          emptyTitle=""
          emptyText=""
          head={['Income', 'Amount']}
          rows={incomeRows}
          numeric={[1]}
          footer={['Total income', money(report.totalIncomeMinor)]}
        />
        <ReportTable
          exportName={TITLES[kind]}
          empty={false}
          emptyTitle=""
          emptyText=""
          head={['Expense', 'Amount']}
          rows={expenseRows}
          numeric={[1]}
          footer={['Total expense', money(report.totalExpenseMinor)]}
        />
        <div className="flex items-center justify-between border border-ink bg-card px-4 py-3">
          <span className="text-[0.875rem] font-semibold uppercase tracking-[0.1em]">
            Net profit
          </span>
          <span
            className={cn(
              'font-mono text-[1.125rem] font-semibold',
              report.netProfitMinor >= 0 ? 'text-success' : 'text-destructive'
            )}
          >
            {money(report.netProfitMinor)}
          </span>
        </div>
      </div>
    )
  }

  if (kind === 'balance-sheet') {
    const report = data as unknown as {
      assets: { id: number; name: string; debitMinor: number; creditMinor: number }[]
      liabilities: { id: number; name: string; debitMinor: number; creditMinor: number }[]
      equity: { id: number; name: string; debitMinor: number; creditMinor: number }[]
      totalAssetsMinor: number
      totalLiabilitiesMinor: number
      totalEquityMinor: number
      differenceMinor: number
    }
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ReportTable
          exportName={TITLES[kind]}
          empty={false}
          emptyTitle=""
          emptyText=""
          head={['Assets', 'Amount']}
          rows={[
            ...(report.assets.length > 0 ? [{ group: 'Assets', cells: [] }] : []),
            ...report.assets.map((row) => ({
              cells: [row.name, money(row.debitMinor)]
            }))
          ]}
          numeric={[1]}
          footer={['Total assets', money(report.totalAssetsMinor)]}
        />
        <div className="flex flex-col gap-4">
          <ReportTable
            exportName={TITLES[kind]}
            empty={false}
            emptyTitle=""
            emptyText=""
            head={['Liabilities', 'Amount']}
            rows={[
              ...(report.liabilities.length > 0 ? [{ group: 'Liabilities', cells: [] }] : []),
              ...report.liabilities.map((row) => ({
                cells: [row.name, money(row.creditMinor)],
                tones: [undefined, 'positive' as const]
              }))
            ]}
            numeric={[1]}
            footer={['Total liabilities', money(report.totalLiabilitiesMinor)]}
          />
          <ReportTable
            exportName={TITLES[kind]}
            empty={false}
            emptyTitle=""
            emptyText=""
            head={['Equity', 'Amount']}
            rows={[
              ...(report.equity.length > 0 ? [{ group: 'Equity', cells: [] }] : []),
              ...report.equity.map((row) => ({
                cells: [row.name, money(row.creditMinor)],
                tones: [undefined, 'positive' as const]
              }))
            ]}
            numeric={[1]}
            footer={['Total equity', money(report.totalEquityMinor)]}
          />
        </div>
        <div
          className={cn(
            'lg:col-span-2 border px-4 py-2 text-[0.875rem]',
            report.differenceMinor === 0
              ? 'border-success/40 bg-success/5 text-success'
              : 'border-destructive/40 bg-destructive/5 text-destructive'
          )}
        >
          {report.differenceMinor === 0
            ? 'Assets equal liabilities plus equity.'
            : `Difference of ${money(report.differenceMinor)}. Check the integrity report.`}
        </div>
      </div>
    )
  }

  const rows = data as unknown as {
    id: number
    date: string
    number: string
    partyName: string | null
    taxableMinor: number
    cgstMinor: number
    sgstMinor: number
    igstMinor: number
    roundOffMinor: number
    totalMinor: number
  }[]
  const tax = rows.reduce((sum, row) => sum + row.cgstMinor + row.sgstMinor + row.igstMinor, 0)
  return (
    <ReportTable
      exportName={TITLES[kind]}
      empty={rows.length === 0}
      emptyTitle="No documents"
      emptyText="Post a bill and it will appear in this register."
      head={['Date', 'Number', 'Party', 'Taxable', 'GST', 'Round off', 'Total']}
      rows={rows.map((row) => ({
        cells: [
          row.date,
          row.number,
          row.partyName ?? '-',
          money(row.taxableMinor),
          money(row.cgstMinor + row.sgstMinor + row.igstMinor),
          money(row.roundOffMinor),
          money(row.totalMinor)
        ],
        tones: [
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          amountTone(row.roundOffMinor),
          undefined
        ]
      }))}
      numeric={[3, 4, 5, 6]}
      dateColumns={[0]}
      footer={[
        'Total',
        '',
        '',
        money(rows.reduce((sum, row) => sum + row.taxableMinor, 0)),
        money(tax),
        money(rows.reduce((sum, row) => sum + row.roundOffMinor, 0)),
        money(rows.reduce((sum, row) => sum + row.totalMinor, 0))
      ]}
    />
  )
}

function DateField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 border border-input bg-card px-2 text-[0.875rem]"
      />
    </label>
  )
}

function descriptionFor(kind: ReportKind): string {
  switch (kind) {
    case 'receivables':
      return 'Who owes us, split by due and overdue.'
    case 'payables':
      return 'Who we owe, split by due and overdue.'
    case 'ageing':
      return 'Open bills by age bucket, from the due date or the bill date.'
    case 'trial-balance':
      return 'Every account with its debit and credit total.'
    case 'profit-loss':
      return 'Income, expenses and the profit for the period.'
    case 'balance-sheet':
      return 'Assets, liabilities and equity as of today.'
    case 'sales-register':
      return 'Invoice wise GST detail for the period.'
    case 'purchase-register':
      return 'Bill wise input tax detail for the period.'
  }
}
