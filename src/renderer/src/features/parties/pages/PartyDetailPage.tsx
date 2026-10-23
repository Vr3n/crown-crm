import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowUpRight,
  FileText,
  IndianRupee,
  Pencil,
  Plus,
  Receipt,
  Wallet
} from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/ui/kpi-card'
import { Balance } from '@/components/ui/balance'
import { StatusPill } from '@/components/ui/status-pill'
import { ChartCard } from '@/components/ui/chart-card'
import { Button } from '@/components/ui/button'
import { MonthlyBarsChart } from '@/components/charts/list-charts'
import { formatMinor } from '@/lib/money'
import { PartyDialog } from '../components/party-dialog'

const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-10 border-b border-border px-3 align-middle'

function fyStart(now = new Date()): string {
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-04-01`
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })
}

export function PartyDetailPage(): React.JSX.Element {
  const { id } = useParams()
  const partyId = Number(id)
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'LEDGER' | 'DOCUMENTS'>('LEDGER')
  const [editing, setEditing] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const from = fyStart()

  const party = useQuery({
    queryKey: ['party', partyId],
    queryFn: () => window.api.parties.get(partyId),
    enabled: Number.isFinite(partyId)
  })
  const statement = useQuery({
    queryKey: ['party', partyId, 'statement', from, today],
    queryFn: () => window.api.reports.statement(partyId, from, today),
    enabled: Number.isFinite(partyId)
  })
  const vouchers = useQuery({
    queryKey: ['party', partyId, 'vouchers'],
    queryFn: () => window.api.vouchers.list({ partyId, limit: 100, offset: 0 }),
    enabled: Number.isFinite(partyId)
  })
  const receivable = useQuery({
    queryKey: ['report', 'receivables', today],
    queryFn: () => window.api.reports.receivables(today, 'DUE_DATE')
  })
  const payable = useQuery({
    queryKey: ['report', 'payables', today],
    queryFn: () => window.api.reports.payables(today, 'DUE_DATE')
  })

  const scope = location.pathname.startsWith('/customers')
    ? 'CUSTOMER'
    : location.pathname.startsWith('/suppliers')
      ? 'SUPPLIER'
      : 'ALL'
  const backTo =
    scope === 'CUSTOMER' ? '/customers' : scope === 'SUPPLIER' ? '/suppliers' : '/parties'
  const list = scope === 'SUPPLIER' ? payable.data : receivable.data
  const open = (list ?? []).find((row) => row.partyId === partyId)
  const documents = vouchers.data ?? []
  const ledger = statement.data ?? []
  const p = party.data

  const billed = documents
    .filter((row) => (scope === 'SUPPLIER' ? row.type === 'PURCHASE' : row.type === 'SALES'))
    .reduce((sum, row) => sum + row.totalMinor, 0)

  const monthlyMap = new Map<string, number>()
  for (const row of documents) {
    if (row.status !== 'POSTED') continue
    if (
      row.type !== 'SALES' &&
      row.type !== 'PURCHASE' &&
      row.type !== 'RECEIPT' &&
      row.type !== 'PAYMENT'
    )
      continue
    const month = row.date.slice(0, 7)
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + row.totalMinor)
  }
  const monthly = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, totalMinor]) => ({ label: monthLabel(month), totalMinor }))

  function onSaved(): void {
    setEditing(false)
    void queryClient.invalidateQueries({ queryKey: ['party', partyId] })
    void queryClient.invalidateQueries({ queryKey: ['parties'] })
    void queryClient.invalidateQueries({ queryKey: ['parties', 'summary'] })
  }

  if (party.isPending) {
    return <div className="p-6 text-[0.875rem] text-muted-foreground">Loading party...</div>
  }

  if (party.isError || !p) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-6">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 text-[0.875rem] text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back
        </Link>
        <EmptyState
          icon={FileText}
          title="Party not found"
          description="It may have been removed or belongs to another company."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to={backTo}>Back to the list</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-6">
      <Link
        to={backTo}
        className="inline-flex w-fit items-center gap-1 text-[0.875rem] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />{' '}
        {scope === 'CUSTOMER' ? 'Customers' : scope === 'SUPPLIER' ? 'Suppliers' : 'Parties'}
      </Link>

      <PageHeader
        title={p.name}
        description={
          [
            p.isCustomer ? 'Customer' : null,
            p.isSupplier ? 'Supplier' : null,
            p.gstin,
            p.phone,
            p.email
          ]
            .filter(Boolean)
            .join(' · ') || 'No contact details on file'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" strokeWidth={2} />
              Edit
            </Button>
            <Button size="sm" asChild>
              <Link to={scope === 'SUPPLIER' ? '/purchases/new' : '/sales/new'}>
                <Plus className="size-3.5" strokeWidth={2} />
                {scope === 'SUPPLIER' ? 'New bill' : 'New invoice'}
              </Link>
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-4">
        <KpiCard
          label="Balance"
          value={<Balance minor={p.balanceMinor} />}
          context={
            p.balanceMinor > 0 ? 'They owe you' : p.balanceMinor < 0 ? 'You owe them' : 'Settled'
          }
          icon={Wallet}
          tone={p.balanceMinor >= 0 ? 'success' : 'stamp'}
        />
        <KpiCard
          label={scope === 'SUPPLIER' ? 'Billed this year' : 'Invoiced this year'}
          value={formatMinor(billed, 'INR')}
          context={`${documents.length} documents on file`}
          icon={IndianRupee}
        />
        <KpiCard
          label="Open"
          value={formatMinor(open?.totalMinor ?? 0, 'INR')}
          context={open ? 'Across open bills' : 'No open bills'}
          icon={Receipt}
          tone="warning"
        />
        <KpiCard
          label="Overdue"
          value={formatMinor(open?.overdueMinor ?? 0, 'INR')}
          context={open && open.overdueMinor > 0 ? 'Past the due date' : 'Nothing overdue'}
          icon={ArrowUpRight}
          tone={open && open.overdueMinor > 0 ? 'stamp' : 'success'}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ChartCard title="Recent activity" subtitle="Value recorded per month, last six months">
          {monthly.length > 0 ? (
            <MonthlyBarsChart points={monthly} ariaLabel="Recent party activity by month" />
          ) : (
            <p className="py-14 text-center text-[0.8125rem] text-muted-foreground">
              No documents posted yet.
            </p>
          )}
        </ChartCard>
        <ChartCard title="Terms" subtitle="What was agreed at the time of setup">
          <dl className="divide-y divide-border text-[0.875rem]">
            {[
              ['Credit days', p.creditDays > 0 ? `${p.creditDays} days` : 'On receipt'],
              [
                'Credit limit',
                p.creditLimitMinor > 0 ? formatMinor(p.creditLimitMinor, 'INR') : 'None'
              ],
              ['State code', p.stateCode ?? '—'],
              ['Billing address', p.billingAddress ?? '—'],
              ['Notes', p.notes ?? '—']
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="max-w-[60%] text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </ChartCard>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {(
          [
            ['LEDGER', 'Ledger'],
            ['DOCUMENTS', 'Documents']
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`-mb-px border-b-2 px-3 py-2 text-[0.875rem] font-medium transition-colors ${
              tab === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'LEDGER' ? (
        ledger.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No ledger entries this year"
            description="Post an invoice, bill or receipt and it will appear here."
          />
        ) : (
          <div className="overflow-auto border border-border bg-card">
            <table className="w-full border-collapse text-[0.875rem]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/95">
                  <th className={TH}>Date</th>
                  <th className={TH}>Document</th>
                  <th className={TH}>Narration</th>
                  <th className={`${TH} text-right`}>Debit</th>
                  <th className={`${TH} text-right`}>Credit</th>
                  <th className={`${TH} text-right`}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row, index) => (
                  <tr key={`${row.date}-${row.number}-${index}`} className="hover:bg-muted/30">
                    <td className={`${TD} font-mono text-muted-foreground`}>{row.date}</td>
                    <td className={TD}>
                      <span className="font-mono text-[0.8125rem]">{row.number}</span>
                      <span className="ml-2 text-[0.75rem] text-muted-foreground">{row.type}</span>
                    </td>
                    <td className={`${TD} text-muted-foreground`}>{row.narration ?? '—'}</td>
                    <td className={`${TD} text-right font-mono tabular-nums`}>
                      {row.debitMinor > 0 ? formatMinor(row.debitMinor, 'INR') : '—'}
                    </td>
                    <td className={`${TD} text-right font-mono tabular-nums`}>
                      {row.creditMinor > 0 ? formatMinor(row.creditMinor, 'INR') : '—'}
                    </td>
                    <td className={`${TD} text-right`}>
                      <Balance minor={row.balanceMinor} mutedWhenZero={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Invoices, bills, receipts and payments for this party appear here."
        />
      ) : (
        <div className="overflow-auto border border-border bg-card">
          <table className="w-full border-collapse text-[0.875rem]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/95">
                <th className={TH}>Date</th>
                <th className={TH}>Number</th>
                <th className={TH}>Type</th>
                <th className={`${TH} text-right`}>Total</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className={`${TD} font-mono text-muted-foreground`}>{row.date}</td>
                  <td className={TD}>
                    <button
                      type="button"
                      onClick={() => navigate(`/vouchers/${row.id}`)}
                      className="font-mono font-medium hover:text-primary hover:underline"
                    >
                      {row.number}
                    </button>
                  </td>
                  <td className={TD}>
                    <StatusPill tone="neutral">{row.type}</StatusPill>
                  </td>
                  <td className={`${TD} text-right font-mono font-semibold tabular-nums`}>
                    {formatMinor(row.totalMinor, 'INR')}
                  </td>
                  <td className={TD}>
                    <StatusPill
                      tone={
                        row.status === 'POSTED'
                          ? 'success'
                          : row.status === 'CANCELLED'
                            ? 'destructive'
                            : 'neutral'
                      }
                    >
                      {row.status}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <PartyDialog open={editing} onOpenChange={setEditing} party={p} onSaved={onSaved} />
      ) : null}
    </div>
  )
}
