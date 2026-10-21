import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatMinor, parseToMinor } from '@/lib/money'
import type { PostVoucherInput } from '../../../../../shared/contracts/vouchers'

type Mode = 'RECEIPT' | 'PAYMENT'

const METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'NEFT', 'RTGS']

function todayIso(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function minor(value: string): number {
  return parseToMinor(value, 'INR') ?? 0
}

export function ReceiptEntryPage({ mode }: { mode: Mode }): React.JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const receipt = mode === 'RECEIPT'
  const role = receipt ? 'CUSTOMER' : 'SUPPLIER'
  const kind = receipt ? 'RECEIVABLE' : 'PAYABLE'
  const back = receipt ? '/receipts' : '/payments'
  const label = receipt ? 'receipt' : 'payment'

  const [partyId, setPartyId] = useState<number | null>(null)
  const [date, setDate] = useState(todayIso())
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [allocations, setAllocations] = useState<Record<number, string>>({})

  const { data: parties = [] } = useQuery({
    queryKey: ['parties', role],
    queryFn: () => window.api.parties.list({ role, includeInactive: false })
  })
  const party = parties.find((row) => row.id === partyId) ?? null
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['outstanding', mode, partyId, date],
    queryFn: () =>
      window.api.vouchers.outstanding({
        partyId: partyId ?? undefined,
        asOf: date,
        basis: 'DUE_DATE',
        kind
      }),
    enabled: partyId !== null
  })

  const amountMinor = minor(amount)
  const allocatedMinor = bills.reduce((sum, bill) => sum + minor(allocations[bill.id] ?? ''), 0)
  const overBill = bills.some((bill) => minor(allocations[bill.id] ?? '') > bill.outstandingMinor)
  const reason = !party
    ? `Select a ${receipt ? 'customer' : 'supplier'} to post.`
    : amountMinor <= 0
      ? 'Enter an amount greater than zero.'
      : allocatedMinor > amountMinor
        ? `Allocated ${formatMinor(allocatedMinor, 'INR')} is more than the amount.`
        : overBill
          ? 'An allocation is more than the bill outstanding.'
          : ''

  const post = useMutation({
    mutationFn: (input: PostVoucherInput) => window.api.vouchers.post(input),
    onSuccess: (result) => {
      toast.success(`${receipt ? 'Receipt' : 'Payment'} ${result.number} posted`)
      void queryClient.invalidateQueries({ queryKey: ['vouchers'] })
      void queryClient.invalidateQueries({ queryKey: ['outstanding'] })
      navigate(`/vouchers/${result.id}`)
    }
  })

  function submit(): void {
    if (reason || post.isPending || partyId === null) return
    post.mutate({
      requestId: crypto.randomUUID(),
      type: mode,
      date,
      partyId,
      amountMinor,
      paymentMethodId: undefined,
      referenceNo: reference.trim() || null,
      narration: notes.trim() || null,
      lines: [],
      journalLines: [],
      allocations: bills
        .map((bill) => ({
          toVoucherId: bill.id,
          amountMinor: minor(allocations[bill.id] ?? ''),
          type: 'AGAINST_REF' as const
        }))
        .filter((allocation) => allocation.amountMinor > 0)
    })
  }

  function chooseParty(value: string): void {
    setPartyId(value ? Number(value) : null)
    setAllocations({})
  }

  const unallocated = amountMinor - allocatedMinor
  const postError =
    post.error instanceof Error ? post.error.message : `Could not post the ${label}.`

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border border-border bg-card px-5 py-4">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {receipt ? 'Money received' : 'Money paid'}
          </p>
          <h1 className="mt-1 font-heading text-[1.5rem] font-semibold leading-none tracking-tight">
            New {label}
          </h1>
          <p className="mt-1.5 font-mono text-[0.75rem] text-muted-foreground">
            Series {receipt ? 'RCT' : 'PAY'} · number assigned on posting
          </p>
        </div>
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground">
          {receipt ? 'Receipt voucher' : 'Payment voucher'}
        </p>
      </div>

      <div className="grid border border-border bg-card sm:grid-cols-2">
        <Field label="Party" className="border-b border-border sm:col-span-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <select
              value={partyId ?? ''}
              onChange={(event) => chooseParty(event.target.value)}
              aria-label="Party"
              className="h-7 min-w-[240px] flex-1 cursor-pointer border-0 bg-transparent text-[0.9375rem] font-medium outline-none"
            >
              <option value="">Select {receipt ? 'customer' : 'supplier'}…</option>
              {parties.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} — {formatMinor(row.balanceMinor, 'INR')}
                </option>
              ))}
            </select>
            <span className="text-[0.75rem] text-muted-foreground">
              {party
                ? `Balance ${formatMinor(party.balanceMinor, 'INR')}`
                : 'Search by name in the list'}
            </span>
          </div>
        </Field>
        <Field label="Date" className="border-b border-border sm:border-r">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-label="Voucher date"
            className="h-7 w-full border-0 bg-transparent font-mono text-[0.875rem] outline-none"
          />
        </Field>
        <Field label="Amount" className="border-b border-border">
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Amount"
            className="h-7 w-full border-0 bg-transparent text-right font-mono text-[0.9375rem] tabular-nums outline-none placeholder:text-muted-foreground/60"
          />
        </Field>
        <Field label="Method" className="border-b border-border sm:border-r">
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            aria-label="Payment method"
            className="h-7 w-full cursor-pointer border-0 bg-transparent text-[0.875rem] outline-none"
          >
            {METHODS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference" className="border-b border-border">
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Cheque or UTR number"
            aria-label="Reference"
            className="h-7 w-full border-0 bg-transparent text-[0.875rem] outline-none placeholder:text-muted-foreground/60"
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Narration for the voucher"
            aria-label="Notes"
            className="w-full resize-none border-0 bg-transparent text-[0.875rem] outline-none placeholder:text-muted-foreground/60"
          />
        </Field>
      </div>

      <div className="border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {receipt ? 'Open invoices' : 'Open bills'}
          </h2>
          <span className="text-[0.75rem] text-muted-foreground">
            As on {date} · due date basis
          </span>
        </div>
        <table className="w-full border-collapse text-[0.875rem]">
          <thead>
            <tr className="border-b border-rule-strong bg-muted/40">
              {['Bill', 'Date', 'Due', 'Outstanding', 'Allocate'].map((heading) => (
                <th
                  key={heading}
                  className={`h-8 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground ${heading === 'Outstanding' || heading === 'Allocate' ? 'text-right' : 'text-left'}`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {partyId === null ? (
              <tr className="h-9">
                <td colSpan={5} className="px-3 text-[0.875rem] text-muted-foreground">
                  Select a party to see {receipt ? 'invoices' : 'bills'} open for settlement.
                </td>
              </tr>
            ) : null}
            {partyId !== null && isLoading ? (
              <tr className="h-9">
                <td colSpan={5} className="px-3 text-[0.875rem] text-muted-foreground">
                  Loading open {receipt ? 'invoices' : 'bills'}…
                </td>
              </tr>
            ) : null}
            {partyId !== null && !isLoading && bills.length === 0 ? (
              <tr className="h-9">
                <td colSpan={5} className="px-3 text-[0.875rem] text-muted-foreground">
                  Nothing open. The amount will remain on account.
                </td>
              </tr>
            ) : null}
            {bills.map((bill) => (
              <tr key={bill.id} className="h-9 border-b border-border last:border-b-0">
                <td className="px-3 font-mono text-[0.875rem]">{bill.number}</td>
                <td className="px-3 font-mono text-[0.875rem]">{bill.date}</td>
                <td className="px-3 font-mono text-[0.875rem]">
                  {bill.dueDate ?? '—'}
                  {bill.daysOverdue > 0 ? (
                    <span className="ml-2 text-[0.6875rem] text-destructive">
                      {bill.daysOverdue}d over
                    </span>
                  ) : null}
                </td>
                <td className="px-3 text-right font-mono tabular-nums">
                  {formatMinor(bill.outstandingMinor, 'INR')}
                </td>
                <td className="p-0">
                  <input
                    value={allocations[bill.id] ?? ''}
                    onChange={(event) =>
                      setAllocations((current) => ({ ...current, [bill.id]: event.target.value }))
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`Allocate to ${bill.number}`}
                    className="h-9 w-full border-0 bg-transparent px-3 text-right font-mono text-[0.875rem] tabular-nums outline-none placeholder:text-muted-foreground/60"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-end gap-6 border-t border-rule-strong px-4 py-2.5 text-[0.875rem]">
          <span className="flex items-baseline gap-2">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {receipt ? 'Received' : 'Paid'}
            </span>
            <span className="font-mono tabular-nums">{formatMinor(amountMinor, 'INR')}</span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Allocated
            </span>
            <span className="font-mono tabular-nums">{formatMinor(allocatedMinor, 'INR')}</span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              On account
            </span>
            <span className={`font-mono tabular-nums ${unallocated < 0 ? 'text-destructive' : ''}`}>
              {formatMinor(unallocated, 'INR')}
            </span>
          </span>
        </div>
      </div>

      {post.isError ? (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-[0.875rem] text-destructive"
        >
          {postError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate(back)}>
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          {reason ? <span className="text-[0.75rem] text-muted-foreground">{reason}</span> : null}
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={Boolean(reason) || post.isPending}
          >
            {post.isPending ? 'Posting…' : `Post ${label}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  className
}: {
  label: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 ${className ?? ''}`}>
      <span className="w-[76px] shrink-0 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
