import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { KpiCard, type KpiTone } from '@/components/ui/kpi-card'
import { formatMinor } from '@/lib/money'
import { downloadCsv, safeFilename } from '@/lib/export'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  FileText,
  IndianRupee,
  Landmark,
  Printer,
  Scale,
  TrendingUp
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

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

  const needsRange =
    kind === 'profit-loss' ||
    kind === 'balance-sheet' ||
    kind === 'sales-register' ||
    kind === 'purchase-register'

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
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-6">
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
          <ReportBody kind={kind} data={query.data.rows as never} />
        </>
      ) : null}
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
    }[]
    const total = rows.reduce((sum, row) => sum + row.totalMinor, 0)
    return (
      <Table
        exportName={TITLES[kind]}
        empty={rows.length === 0}
        emptyTitle={kind === 'receivables' ? 'No receivables' : 'No payables'}
        emptyText="Post an invoice or a purchase bill and it will appear here."
        head={['Party', 'Not due', 'Overdue', 'Total']}
        rows={rows.map((row) => [
          row.partyName,
          money(row.notDueMinor),
          money(row.overdueMinor),
          money(row.totalMinor)
        ])}
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
      <Table
        exportName={TITLES[kind]}
        empty={rows.length === 0}
        emptyTitle="Nothing overdue"
        emptyText="Open bills appear here once they are posted."
        head={['Party', '0-30', '31-60', '61-90', '91-180', '180+', 'Total']}
        rows={rows.map((row) => [
          row.partyName,
          ...row.bucketsMinor.map(money),
          money(row.totalMinor)
        ])}
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
      <Table
        exportName={TITLES[kind]}
        empty={rows.length === 0}
        emptyTitle="No accounts"
        emptyText="The chart of accounts is empty."
        head={['Account', 'Group', 'Debit', 'Credit']}
        rows={rows
          .filter((row) => row.debitMinor !== 0 || row.creditMinor !== 0)
          .map((row) => [row.name, row.groupName, money(row.debitMinor), money(row.creditMinor)])}
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
    return (
      <div className="flex flex-col gap-4">
        <Table
          exportName={TITLES[kind]}
          empty={false}
          emptyTitle=""
          emptyText=""
          head={['Income', 'Amount']}
          rows={report.income.map((row) => [row.name, money(row.creditMinor)])}
          numeric={[1]}
          footer={['Total income', money(report.totalIncomeMinor)]}
        />
        <Table
          exportName={TITLES[kind]}
          empty={false}
          emptyTitle=""
          emptyText=""
          head={['Expense', 'Amount']}
          rows={report.expenses.map((row) => [row.name, money(row.debitMinor)])}
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
        <Table
          exportName={TITLES[kind]}
          empty={false}
          emptyTitle=""
          emptyText=""
          head={['Assets', 'Amount']}
          rows={report.assets.map((row) => [row.name, money(row.debitMinor)])}
          numeric={[1]}
          footer={['Total assets', money(report.totalAssetsMinor)]}
        />
        <div className="flex flex-col gap-4">
          <Table
            exportName={TITLES[kind]}
            empty={false}
            emptyTitle=""
            emptyText=""
            head={['Liabilities', 'Amount']}
            rows={report.liabilities.map((row) => [row.name, money(row.creditMinor)])}
            numeric={[1]}
            footer={['Total liabilities', money(report.totalLiabilitiesMinor)]}
          />
          <Table
            exportName={TITLES[kind]}
            empty={false}
            emptyTitle=""
            emptyText=""
            head={['Equity', 'Amount']}
            rows={report.equity.map((row) => [row.name, money(row.creditMinor)])}
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
    <Table
      exportName={TITLES[kind]}
      empty={rows.length === 0}
      emptyTitle="No documents"
      emptyText="Post a bill and it will appear in this register."
      head={['Date', 'Number', 'Party', 'Taxable', 'GST', 'Round off', 'Total']}
      rows={rows.map((row) => [
        row.date,
        row.number,
        row.partyName ?? '-',
        money(row.taxableMinor),
        money(row.cgstMinor + row.sgstMinor + row.igstMinor),
        money(row.roundOffMinor),
        money(row.totalMinor)
      ])}
      numeric={[3, 4, 5, 6]}
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

function Table({
  head,
  rows,
  numeric = [],
  footer,
  empty,
  emptyTitle,
  emptyText,
  note,
  noteTone,
  exportName = 'report'
}: {
  head: string[]
  rows: string[][]
  numeric?: number[]
  footer?: string[]
  empty: boolean
  emptyTitle: string
  emptyText: string
  note?: string
  noteTone?: 'ok' | 'bad'
  exportName?: string
}): React.JSX.Element {
  if (empty) {
    return <EmptyState icon={FileText} title={emptyTitle} description={emptyText} />
  }

  function saveCsv(): void {
    downloadCsv(safeFilename(exportName), head, footer ? [...rows, footer] : rows)
  }

  async function savePdf(): Promise<void> {
    try {
      const result = await window.api.exportPdf(exportName)
      if (result.saved) toast.success('PDF saved')
    } catch {
      toast.error('Could not create the PDF')
    }
  }

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-[0.75rem] text-muted-foreground">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="xs" onClick={saveCsv}>
            <Download className="size-3.5" strokeWidth={2} />
            CSV
          </Button>
          <Button variant="ghost" size="xs" onClick={() => void savePdf()}>
            <Printer className="size-3.5" strokeWidth={2} />
            PDF
          </Button>
        </div>
      </div>
      <table className="w-full border-collapse text-[0.875rem]">
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th
                key={cell}
                className={cn(
                  'border-b border-border px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
                  numeric.includes(index) ? 'text-right' : 'text-left'
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border last:border-0">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    'px-3 py-2',
                    numeric.includes(cellIndex) ? 'text-right font-mono tabular-nums' : 'text-left'
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {footer ? (
            <tr className="border-t border-ink bg-muted/40 font-semibold">
              {footer.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    'px-3 py-2',
                    numeric.includes(index) ? 'text-right font-mono tabular-nums' : ''
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
      {note ? (
        <div
          className={cn(
            'border-t border-border px-3 py-2 text-[0.75rem]',
            noteTone === 'ok' ? 'text-success' : 'text-destructive'
          )}
        >
          {note}
        </div>
      ) : null}
    </div>
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
