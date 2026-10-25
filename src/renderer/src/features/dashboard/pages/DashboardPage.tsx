import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Info,
  Landmark,
  Package,
  Receipt,
  Users
} from 'lucide-react'
import { useSession } from '@/context/session-context'
import { formatMinor } from '@/lib/money'
import { AgeingChart, MonthlyFlowChart } from '@/components/charts/dashboard-charts'
import { SetupChecklist } from '../components/setup-checklist'
import type {
  AttentionItem,
  DashboardSummary,
  RecentVoucher
} from '../../../../../shared/contracts/dashboard'

const summaryKey = ['dashboard', 'summary'] as const

const TYPE_LABEL: Record<string, string> = {
  SALES: 'Sales invoice',
  PURCHASE: 'Purchase bill',
  RECEIPT: 'Receipt',
  PAYMENT: 'Payment',
  CREDIT_NOTE: 'Credit note',
  DEBIT_NOTE: 'Debit note',
  JOURNAL: 'Journal',
  CONTRA: 'Contra',
  OPENING: 'Opening balances'
}

function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function longDate(date = new Date()): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

const TONE: Record<AttentionItem['tone'], { icon: typeof Info; className: string; label: string }> =
  {
    destructive: {
      icon: AlertTriangle,
      className: 'border-destructive/35 bg-destructive/5 text-destructive',
      label: 'Attention'
    },
    warning: {
      icon: AlertTriangle,
      className: 'border-warning/40 bg-warning-soft/60 text-warning',
      label: 'Due soon'
    },
    info: {
      icon: Info,
      className: 'border-success/30 bg-success-soft/60 text-success',
      label: 'Clear'
    }
  }

/**
 * Books dashboard. The four money questions, a setup checklist driven by real
 * rows, what needs attention, and two charts. Nothing on this page is hard
 * coded to a phase.
 */
export function DashboardPage(): React.JSX.Element {
  const session = useSession()
  const { data, isLoading } = useQuery({
    queryKey: summaryKey,
    queryFn: () => window.api.dashboard.summary()
  })

  const firstName = session.userFullName.split(' ')[0]
  const money = (minor: number | undefined): string => formatMinor(minor ?? 0, 'INR')
  const setupComplete = data ? data.setup.done >= data.setup.total : false
  // Once setup is finished the checklist is gone and the two side panels share
  // the full width instead of leaving a hole where it used to be.
  const compact = !data || setupComplete

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-6">
      <header className="border border-border border-t-4 border-t-primary bg-card px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {longDate()}
            </p>
            <h1 className="mt-1 text-[1.625rem] font-semibold leading-tight tracking-tight">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-1 text-[0.9375rem] text-muted-foreground">
              {session.companyName}. Here is where the books stand today.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/parties?action=new"
              className="ui-press flex h-8 items-center gap-1.5 border border-border bg-card px-3 text-[0.875rem] font-medium hover:border-rule-strong"
            >
              <Users className="size-3.5" strokeWidth={1.75} />
              Add a party
            </Link>
            <Link
              to="/sales/new"
              className="ui-press flex h-8 items-center gap-1.5 bg-primary px-3 text-[0.875rem] font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Receipt className="size-3.5" strokeWidth={1.75} />
              New invoice
            </Link>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Receivables"
          value={money(data?.receivableMinor)}
          hint={`${data?.partyCount ?? 0} parties on file`}
          icon={ArrowDownLeft}
          tone="credit"
          loading={isLoading}
        />
        <Metric
          label="Payables"
          value={money(data?.payableMinor)}
          hint="Bills to pay suppliers"
          icon={ArrowUpRight}
          tone="debit"
          loading={isLoading}
        />
        <Metric
          label="Cash and bank"
          value={money(data?.cashBankMinor)}
          hint="Across all cash and bank accounts"
          icon={Landmark}
          loading={isLoading}
        />
        <Metric
          label="Vouchers posted"
          value={String(data?.voucherCount ?? 0)}
          hint={`${data?.itemCount ?? 0} items on file`}
          icon={CalendarClock}
          loading={isLoading}
        />
      </section>

      <div
        className={
          compact
            ? 'grid grid-cols-1 gap-5 xl:grid-cols-2'
            : 'grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_1fr]'
        }
      >
        {data ? <SetupChecklist setup={data.setup} /> : null}

        <div className={compact ? 'contents' : 'flex flex-col gap-5'}>
          <div className="border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-[0.9375rem] font-semibold">What needs attention</h2>
              <Link to="/reports/ageing" className="text-[0.8125rem] text-primary hover:underline">
                Ageing
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {(data?.attention ?? []).map((item) => {
                const tone = TONE[item.tone]
                const Icon = tone.icon
                return (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center border ${tone.className}`}
                      >
                        <Icon className="size-3.5" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[0.875rem] font-medium">{item.title}</p>
                        <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted-foreground">
                          {item.detail}
                        </p>
                        <Link
                          to={item.href}
                          className="mt-1 inline-flex items-center gap-1 text-[0.75rem] font-medium text-primary hover:underline"
                        >
                          Open <ChevronRight className="size-3" />
                        </Link>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-[0.9375rem] font-semibold">Recent vouchers</h2>
              <Link to="/day-book" className="text-[0.8125rem] text-primary hover:underline">
                Day book
              </Link>
            </div>
            {isLoading ? (
              <p className="px-4 py-6 text-center text-[0.875rem] text-muted-foreground">
                Loading vouchers...
              </p>
            ) : data && data.recentVouchers.length > 0 ? (
              <ul className="divide-y divide-border">
                {data.recentVouchers.map((voucher) => (
                  <RecentRow key={voucher.id} voucher={voucher} />
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <Package className="size-5 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-[0.875rem] font-medium">No vouchers yet</p>
                <p className="max-w-[40ch] text-[0.8125rem] text-muted-foreground">
                  Post a purchase bill or a sales invoice and it will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="grid gap-5 border border-border bg-card p-4 xl:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-[0.9375rem] font-semibold">Sales and purchases</h2>
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
              Last 6 months
            </span>
          </div>
          <p className="mb-2 text-[0.8125rem] text-muted-foreground">
            Posted totals, not estimates. Hover or focus a bar for the exact value.
          </p>
          {hasFlow(data) ? (
            <MonthlyFlowChart monthly={data!.monthly} />
          ) : (
            <ChartEmpty message="Post a sale or a purchase to start the trend." />
          )}
        </div>
        <div className="min-w-0 xl:border-l xl:border-border xl:pl-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-[0.9375rem] font-semibold">Open bills by age</h2>
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
              As of today
            </span>
          </div>
          <p className="mb-2 text-[0.8125rem] text-muted-foreground">
            What is still unpaid, bucketed by how late it is.
          </p>
          {hasAgeing(data) ? (
            <AgeingChart ageing={data!.ageing} />
          ) : (
            <ChartEmpty message="No open bills. The ageing chart fills as invoices and bills remain unpaid." />
          )}
        </div>
      </section>
    </div>
  )
}

function hasFlow(data: DashboardSummary | undefined): boolean {
  return Boolean(data?.monthly.some((month) => month.salesMinor > 0 || month.purchasesMinor > 0))
}

function hasAgeing(data: DashboardSummary | undefined): boolean {
  return Boolean(
    data?.ageing.some((bucket) => bucket.receivableMinor > 0 || bucket.payableMinor > 0)
  )
}

function ChartEmpty({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 border border-dashed border-border bg-muted/20 px-4 text-center">
      <Package className="size-5 text-muted-foreground" strokeWidth={1.5} />
      <p className="max-w-[42ch] text-[0.8125rem] text-muted-foreground">{message}</p>
    </div>
  )
}

function RecentRow({ voucher }: { voucher: RecentVoucher }): React.JSX.Element {
  return (
    <li>
      <Link
        to={`/vouchers/${voucher.id}`}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.875rem] font-medium">
            {voucher.partyName ?? TYPE_LABEL[voucher.type] ?? voucher.type}
          </p>
          <p className="font-mono text-[0.6875rem] text-muted-foreground">
            {voucher.number} · {voucher.date}
          </p>
        </div>
        <span className="font-mono text-[0.875rem] tabular-nums">
          {formatMinor(voucher.totalMinor, 'INR')}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  loading
}: {
  label: string
  value: string
  hint: string
  icon: typeof Package
  tone?: 'credit' | 'debit'
  loading: boolean
}): React.JSX.Element {
  const bar =
    tone === 'credit'
      ? 'border-t-success'
      : tone === 'debit'
        ? 'border-t-stamp'
        : 'border-t-primary'
  return (
    <div className={`ui-lift border-t-2 bg-card px-4 py-4 ${bar}`}>
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <Icon
          className={
            tone === 'credit'
              ? 'size-4 text-success'
              : tone === 'debit'
                ? 'size-4 text-stamp'
                : 'size-4 text-muted-foreground'
          }
          strokeWidth={1.6}
        />
      </div>
      <div className="mt-3 font-mono text-[1.875rem] leading-none tracking-tight">
        {loading ? <span className="text-muted-foreground">--</span> : value}
      </div>
      <div className="mt-2 text-[0.8125rem] text-muted-foreground">{hint}</div>
    </div>
  )
}
