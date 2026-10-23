import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  PhoneOff,
  Plus,
  Search,
  Users,
  UserX
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { KpiCard } from '@/components/ui/kpi-card'
import { Balance } from '@/components/ui/balance'
import { StatusPill } from '@/components/ui/status-pill'
import { ChartCard } from '@/components/ui/chart-card'
import { InsightList, type InsightItem } from '@/components/ui/insight-list'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { AgeingChart } from '@/components/charts/dashboard-charts'
import { RankedBarsChart } from '@/components/charts/list-charts'
import { formatMinor } from '@/lib/money'
import { initials } from '@/lib/validation'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type { PartyRole, PartyRow } from '../../../../../shared/contracts/masters'
import { PartyDialog } from '../components/party-dialog'

type Scope = 'ALL' | 'CUSTOMER' | 'SUPPLIER'

const SCOPE: Record<Scope, { title: string; description: string; role: PartyRole }> = {
  ALL: {
    title: 'Parties',
    description: 'Customers and suppliers, with who owes whom.',
    role: 'BOTH'
  },
  CUSTOMER: {
    title: 'Customers',
    description: 'Who owes you, who is late, and who is a credit risk.',
    role: 'CUSTOMER'
  },
  SUPPLIER: {
    title: 'Suppliers',
    description: 'Who you owe, what is due, and who you buy from.',
    role: 'SUPPLIER'
  }
}

const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-11 border-b border-border px-3 align-middle'

function Monogram({ name }: { name: string }): React.JSX.Element {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center bg-accent-soft text-[0.75rem] font-semibold text-primary"
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

function CreditUsed({
  usedMinor,
  limitMinor
}: {
  usedMinor: number
  limitMinor: number
}): React.JSX.Element {
  if (limitMinor <= 0) return <span className="text-muted-foreground">No limit</span>
  const ratio = Math.min(1, Math.max(0, usedMinor / limitMinor))
  const over = usedMinor > limitMinor
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-14 overflow-hidden bg-muted" aria-hidden>
        <span
          className={`block h-full ${over ? 'bg-destructive' : ratio > 0.8 ? 'bg-warning' : 'bg-success'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground">
        {formatMinor(usedMinor, 'INR')} / {formatMinor(limitMinor, 'INR')}
      </span>
    </span>
  )
}

export function PartiesPage(): React.JSX.Element {
  const location = useLocation()
  const scope: Scope = location.pathname.startsWith('/customers')
    ? 'CUSTOMER'
    : location.pathname.startsWith('/suppliers')
      ? 'SUPPLIER'
      : 'ALL'
  const meta = SCOPE[scope]

  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search, 250)
  const [role, setRole] = useState<PartyRole>(meta.role)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PartyRow | null>(null)
  const [target, setTarget] = useState<PartyRow | null>(null)

  const effectiveRole = scope === 'ALL' ? role : meta.role

  const list = useQuery({
    queryKey: ['parties', query, effectiveRole, includeInactive],
    queryFn: () =>
      window.api.parties.list({
        query: query.trim() || undefined,
        role: effectiveRole,
        includeInactive
      })
  })
  const summary = useQuery({
    queryKey: ['parties', 'summary'],
    queryFn: () => window.api.summaries.parties()
  })

  const rows = list.data ?? []
  const filtered = query.trim().length > 0 || (scope === 'ALL' && role !== 'BOTH')
  const s = summary.data

  const deactivate = useMutation({
    mutationFn: (id: number) => window.api.parties.deactivate(id),
    onSuccess: () => {
      toast.success('Party deactivated')
      void queryClient.invalidateQueries({ queryKey: ['parties'] })
      void queryClient.invalidateQueries({ queryKey: ['parties', 'summary'] })
      setTarget(null)
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not deactivate the party'))
  })

  function show(next: PartyRow | null): void {
    setEditing(next)
    setOpen(true)
  }

  function onSaved(): void {
    setOpen(false)
    void queryClient.invalidateQueries({ queryKey: ['parties'] })
    void queryClient.invalidateQueries({ queryKey: ['parties', 'summary'] })
  }

  const money = (minor: number | undefined): string => formatMinor(minor ?? 0, 'INR')

  const insights: InsightItem[] = []
  if (scope !== 'SUPPLIER' && (s?.overdueReceivableMinor ?? 0) > 0) {
    insights.push({
      id: 'overdue',
      tone: 'destructive',
      title: `${money(s?.overdueReceivableMinor)} receivable overdue`,
      detail: 'Chase the oldest invoices first.',
      href: '/reports/receivables',
      icon: AlertTriangle
    })
  }
  if (scope !== 'CUSTOMER' && (s?.overduePayableMinor ?? 0) > 0) {
    insights.push({
      id: 'due',
      tone: 'warning',
      title: `${money(s?.overduePayableMinor)} payable overdue`,
      detail: 'Pay suppliers before terms worsen.',
      href: '/reports/payables',
      icon: ArrowUpRight
    })
  }
  if ((s?.overLimitCount ?? 0) > 0) {
    insights.push({
      id: 'over-limit',
      tone: 'warning',
      title: `${s?.overLimitCount} ${s?.overLimitCount === 1 ? 'party' : 'parties'} over credit limit`,
      detail: 'Review limits or collect before the next sale.',
      href: '/parties',
      icon: UserX
    })
  }
  const missingContact = rows.filter((party) => !party.phone && !party.email).length
  if (missingContact > 0) {
    insights.push({
      id: 'no-contact',
      tone: 'neutral',
      title: `${missingContact} without a phone or email`,
      detail: 'A contact makes reminders possible.',
      href: '/parties',
      icon: PhoneOff
    })
  }

  const rankRows =
    scope === 'SUPPLIER'
      ? (s?.topPayables ?? []).map((p) => ({ label: p.name, valueMinor: p.balanceMinor }))
      : (s?.topReceivables ?? []).map((p) => ({ label: p.name, valueMinor: p.balanceMinor }))

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-6">
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <Button size="sm" onClick={() => show(null)}>
            <Plus className="size-3.5" strokeWidth={2} />
            New {scope === 'SUPPLIER' ? 'supplier' : scope === 'CUSTOMER' ? 'customer' : 'party'}
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-4">
        {scope !== 'SUPPLIER' ? (
          <KpiCard
            label="Receivables"
            value={money(s?.receivableMinor)}
            context={`${s?.customerCount ?? 0} customers`}
            icon={ArrowDownLeft}
            tone="success"
          />
        ) : (
          <KpiCard
            label="Payables"
            value={money(s?.payableMinor)}
            context={`${s?.supplierCount ?? 0} suppliers`}
            icon={ArrowUpRight}
            tone="stamp"
          />
        )}
        {scope === 'ALL' ? (
          <KpiCard
            label="Payables"
            value={money(s?.payableMinor)}
            context={`${s?.supplierCount ?? 0} suppliers`}
            icon={ArrowUpRight}
            tone="stamp"
          />
        ) : (
          <KpiCard
            label="Overdue"
            value={money(scope === 'SUPPLIER' ? s?.overduePayableMinor : s?.overdueReceivableMinor)}
            context="Past the due date"
            icon={AlertTriangle}
            tone="warning"
          />
        )}
        <KpiCard
          label={scope === 'SUPPLIER' ? 'Due soon' : 'Over credit limit'}
          value={scope === 'SUPPLIER' ? `${s?.supplierCount ?? 0}` : `${s?.overLimitCount ?? 0}`}
          context={scope === 'SUPPLIER' ? 'Suppliers on file' : 'Customers above their limit'}
          icon={scope === 'SUPPLIER' ? ArrowUpRight : UserX}
          tone="stamp"
        />
        <KpiCard
          label="On file"
          value={String(rows.length)}
          context={filtered ? 'in this view' : 'active parties'}
          icon={Users}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr_0.9fr]">
        <ChartCard
          title="Open bills by age"
          subtitle={
            scope === 'SUPPLIER'
              ? 'What you still owe, by how late'
              : 'What you are owed, by how late'
          }
        >
          {s ? (
            <AgeingChart ageing={s.ageing} />
          ) : (
            <p className="py-10 text-center text-muted-foreground">Loading…</p>
          )}
        </ChartCard>
        <ChartCard
          title={scope === 'SUPPLIER' ? 'Top suppliers' : 'Top receivables'}
          subtitle="Largest outstanding balances"
        >
          {rankRows.length > 0 ? (
            <RankedBarsChart
              rows={rankRows}
              color={scope === 'SUPPLIER' ? 'oklch(0.55 0.12 32)' : 'oklch(0.55 0.07 235)'}
              ariaLabel={`${scope === 'SUPPLIER' ? 'Top suppliers by balance' : 'Top receivables by balance'}`}
            />
          ) : (
            <p className="py-10 text-center text-[0.8125rem] text-muted-foreground">
              No open balances.
            </p>
          )}
        </ChartCard>
        <InsightList items={insights.slice(0, 3)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="party-search"
            aria-label="Search parties"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone or GSTIN"
            className="h-8 border-0 bg-transparent pl-8 text-[0.9375rem] focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        {scope === 'ALL' ? (
          <div className="flex items-center" role="group" aria-label="Filter by role">
            {(['BOTH', 'CUSTOMER', 'SUPPLIER'] as PartyRole[]).map((option, index) => (
              <button
                key={option}
                type="button"
                aria-pressed={role === option}
                onClick={() => setRole(option)}
                className={`h-8 border border-border px-2.5 text-[0.875rem] transition-colors ${index > 0 ? '-ml-px' : ''} ${
                  role === option
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {option === 'BOTH' ? 'All' : option === 'CUSTOMER' ? 'Customers' : 'Suppliers'}
              </button>
            ))}
          </div>
        ) : null}
        <label
          htmlFor="party-inactive"
          className="flex cursor-pointer items-center gap-1.5 pl-1 text-[0.875rem] text-muted-foreground"
        >
          <Checkbox
            id="party-inactive"
            checked={includeInactive}
            onCheckedChange={(checked) => setIncludeInactive(checked === true)}
          />
          Show inactive
        </label>
      </div>

      {list.isError ? (
        <div className="border border-border bg-card px-4 py-8 text-center">
          <p className="text-[0.9375rem] font-medium">Could not load parties</p>
          <p className="mt-1 text-[0.875rem] text-muted-foreground">
            {errorMessage(list.error, 'Try again in a moment.')}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 && !list.isPending ? (
        <EmptyState
          icon={Users}
          title={
            filtered
              ? 'No parties match'
              : `No ${scope === 'ALL' ? 'parties' : scope === 'CUSTOMER' ? 'customers' : 'suppliers'} yet`
          }
          description={
            filtered
              ? 'Clear the search or switch the role filter to see more.'
              : 'Add the people and businesses you trade with, with their credit terms.'
          }
          action={
            filtered ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setRole(meta.role)
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={() => show(null)}>
                <Plus className="size-3.5" strokeWidth={2} />
                New{' '}
                {scope === 'SUPPLIER' ? 'supplier' : scope === 'CUSTOMER' ? 'customer' : 'party'}
              </Button>
            )
          }
        />
      ) : (
        <div className="max-h-[calc(100vh-15.5rem)] overflow-auto border border-border bg-card">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/95">
                {['Name', 'Phone', 'Type', 'Balance', 'Credit', 'Status'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className={`${TH} ${['Balance', 'Credit'].includes(heading) ? 'text-right' : ''}`}
                  >
                    {heading}
                  </th>
                ))}
                <th scope="col" className={`${TH} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.isPending ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-[0.875rem] text-muted-foreground"
                  >
                    Loading parties...
                  </td>
                </tr>
              ) : (
                rows.map((party) => (
                  <tr key={party.id} className="hover:bg-muted/40">
                    <td className={TD}>
                      <div className="flex items-center gap-2.5">
                        <Monogram name={party.name} />
                        <div className="min-w-0">
                          <div className="truncate text-[0.9375rem] font-medium">{party.name}</div>
                          {party.gstin ? (
                            <div className="font-mono text-[0.6875rem] text-muted-foreground">
                              {party.gstin}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} font-mono text-[0.8125rem] text-muted-foreground`}>
                      {party.phone ?? '—'}
                    </td>
                    <td className={TD}>
                      <div className="flex gap-1">
                        {party.isCustomer ? <StatusPill tone="success">Customer</StatusPill> : null}
                        {party.isSupplier ? <StatusPill tone="stamp">Supplier</StatusPill> : null}
                      </div>
                    </td>
                    <td className={`${TD} text-right`}>
                      <Balance minor={party.balanceMinor} />
                    </td>
                    <td className={`${TD} text-right`}>
                      {party.isCustomer ? (
                        <CreditUsed
                          usedMinor={Math.max(0, party.balanceMinor)}
                          limitMinor={party.creditLimitMinor}
                        />
                      ) : (
                        <span className="font-mono text-[0.8125rem] tabular-nums text-muted-foreground">
                          {party.creditDays}d
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <StatusPill tone={party.isActive ? 'neutral' : 'destructive'}>
                        {party.isActive ? 'Active' : 'Inactive'}
                      </StatusPill>
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="xs" onClick={() => show(party)}>
                          Edit
                        </Button>
                        {party.isActive ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setTarget(party)}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <PartyDialog open={open} onOpenChange={setOpen} party={editing} onSaved={onSaved} />
      ) : null}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(next) => {
          if (!next && !deactivate.isPending) setTarget(null)
        }}
        title="Deactivate this party?"
        description={
          target ? `${target.name} stays on past vouchers but is hidden from new entries.` : ''
        }
        confirmLabel="Deactivate"
        destructive
        isPending={deactivate.isPending}
        onConfirm={() => {
          if (target) deactivate.mutate(target.id)
        }}
      />
    </div>
  )
}
