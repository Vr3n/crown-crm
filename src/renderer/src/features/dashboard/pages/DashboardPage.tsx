import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Landmark,
  Package,
  Receipt,
  Users
} from 'lucide-react'
import { useSession } from '@/context/session-context'
import { formatMinor } from '@/lib/money'
import { Badge } from '@/components/ui/badge'

const summaryKey = ['dashboard', 'summary'] as const

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

/**
 * Books dashboard. Four questions, one screen: what is owed to us, what we owe,
 * what is in the bank, and what needs doing next. All numbers are queries.
 */
export function DashboardPage(): React.JSX.Element {
  const session = useSession()
  const { data, isLoading } = useQuery({
    queryKey: summaryKey,
    queryFn: () => window.api.dashboard.summary()
  })

  const firstName = session.userFullName.split(' ')[0]
  const money = (minor: number | undefined): string => formatMinor(minor ?? 0, 'INR')

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {longDate()}
          </p>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {session.companyName}. Here is where the books stand today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/parties"
            className="flex h-8 items-center gap-1.5 border border-border bg-card px-3 text-[12px] font-medium transition-colors hover:border-rule-strong"
          >
            <Users className="size-3.5" strokeWidth={1.75} />
            Add a party
          </Link>
          <Link
            to="/sales/new"
            className="flex h-8 items-center gap-1.5 bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Receipt className="size-3.5" strokeWidth={1.75} />
            New invoice
          </Link>
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
          mono
        />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-[13px] font-semibold">Set up the books</h2>
              <p className="text-[11.5px] text-muted-foreground">
                Five steps to the first invoice.
              </p>
            </div>
            <Badge variant="secondary">Phase 0 of 4</Badge>
          </div>
          <ol>
            <Step
              done
              title="Company and financial year"
              detail="GSTIN, state and books begin date are set."
            />
            <Step
              done
              title="Chart of accounts"
              detail="19 groups and the reserved system accounts are seeded."
            />
            <Step
              title="Parties"
              detail="Customers, suppliers, credit days and opening balances."
              phase="P1"
            />
            <Step title="Items" detail="HSN, unit, GST rate and opening stock." phase="P1" />
            <Step
              title="First purchase bill"
              detail="Post a bill, write the ledger and move stock in one transaction."
              phase="P2"
            />
          </ol>
          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5">
            <span className="text-[11.5px] text-muted-foreground">
              Phase 1 adds the two master screens.
            </span>
            <Link
              to="/parties"
              className="flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
            >
              Open parties <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className="border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-[13px] font-semibold">What this version does</h2>
            </div>
            <div className="space-y-2.5 px-4 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Debtors and creditors</span> with
                bill-wise settlement, ageing and statements.
              </p>
              <p>
                <span className="font-medium text-foreground">GST invoices and bills</span> with
                inclusive or exclusive rates, CGST/SGST or IGST, and round off.
              </p>
              <p>
                <span className="font-medium text-foreground">One write path</span> for every
                document, so the trial balance always proves itself.
              </p>
            </div>
          </div>

          <div className="border border-border bg-accent-soft/60 px-4 py-3">
            <h2 className="text-[12px] font-semibold text-primary">A note on data</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              This installation starts on a new database. The previous product file is untouched and
              is never read by Crown Books.
            </p>
          </div>
        </section>
      </div>

      <section className="border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold">Recent vouchers</h2>
          <Link to="/day-book" className="text-[11.5px] text-primary hover:underline">
            Open day book
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <Package className="size-5 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-[12.5px] font-medium">No vouchers yet</p>
          <p className="max-w-[46ch] text-[11.5px] text-muted-foreground">
            Post a purchase bill or a sales invoice and it will appear here with its ledger and
            stock effect.
          </p>
        </div>
      </section>
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  loading,
  mono
}: {
  label: string
  value: string
  hint: string
  icon: typeof Package
  tone?: 'credit' | 'debit'
  loading: boolean
  mono?: boolean
}): React.JSX.Element {
  return (
    <div className="bg-card px-4 py-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <Icon
          className={
            tone === 'credit'
              ? 'size-4 text-success'
              : tone === 'debit'
                ? 'size-4 text-destructive'
                : 'size-4 text-muted-foreground'
          }
          strokeWidth={1.6}
        />
      </div>
      <div
        className={
          mono
            ? 'mt-3 font-mono text-[26px] leading-none tracking-tight'
            : 'mt-3 font-mono text-[26px] leading-none tracking-tight'
        }
      >
        {loading ? <span className="text-muted-foreground">--</span> : value}
      </div>
      <div className="mt-2 text-[10.5px] text-muted-foreground">{hint}</div>
    </div>
  )
}

function Step({
  done,
  title,
  detail,
  phase
}: {
  done?: boolean
  title: string
  detail: string
  phase?: string
}): React.JSX.Element {
  return (
    <li className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span
        className={
          done
            ? 'mt-0.5 flex size-4 items-center justify-center rounded-full bg-success text-[9px] text-white'
            : 'mt-0.5 size-4 rounded-full border border-rule-strong'
        }
        aria-hidden="true"
      >
        {done ? '✓' : ''}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={done ? 'text-[12.5px] font-medium' : 'text-[12.5px]'}>{title}</span>
          {phase ? (
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {phase}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </li>
  )
}
