import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Ban, FileDown, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatMinor } from '@/lib/money'
import { can, useSession } from '@/context/session-context'
import type { VoucherType } from '../../../../../shared/contracts/vouchers'

const BACK: Partial<Record<VoucherType, string>> = {
  SALES: '/sales',
  PURCHASE: '/purchases',
  CREDIT_NOTE: '/sales',
  DEBIT_NOTE: '/purchases',
  RECEIPT: '/receipts',
  PAYMENT: '/payments',
  JOURNAL: '/journals',
  CONTRA: '/journals'
}

const TITLES: Partial<Record<VoucherType, string>> = {
  SALES: 'Tax invoice',
  PURCHASE: 'Purchase bill',
  CREDIT_NOTE: 'Credit note',
  DEBIT_NOTE: 'Debit note',
  RECEIPT: 'Receipt',
  PAYMENT: 'Payment',
  JOURNAL: 'Journal entry',
  CONTRA: 'Contra entry'
}

const AUDIT_ACTIONS: Record<string, string> = {
  CREATE: 'Created',
  POST: 'Posted',
  CANCEL: 'Cancelled',
  UPDATE: 'Updated'
}

function displayDate(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

function displayDateTime(value: string | null): string {
  if (!value) return '—'
  const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatQty(qtyE4: number): string {
  return (qtyE4 / 10_000).toLocaleString('en-IN', { maximumFractionDigits: 4 })
}

function TotalRow({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-[0.875rem]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{formatMinor(value, 'INR')}</span>
    </div>
  )
}

export function VoucherDetailPage({ id }: { id: number }): React.JSX.Element {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const session = useSession()
  const mayCancel = can(session.permissions, session.isSuper, 'voucher.cancel')
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['voucher', id],
    queryFn: () => window.api.vouchers.get(id)
  })
  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: () => window.api.identity.company()
  })

  const exportInvoice = useMutation({
    mutationFn: () => window.api.invoice.exportPdf(id),
    onSuccess: (result) => {
      if (result.saved) toast.success('Invoice PDF saved')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save the invoice PDF')
    }
  })

  const cancel = useMutation({
    mutationFn: (value: string) => window.api.vouchers.cancel(id, value),
    onSuccess: () => {
      toast.success(`Cancelled ${data?.number ?? 'voucher'}`)
      setOpen(false)
      setReason('')
      void queryClient.invalidateQueries({ queryKey: ['voucher', id] })
      void queryClient.invalidateQueries({ queryKey: ['vouchers'] })
    }
  })

  if (isLoading) {
    return <p className="p-6 text-[0.9375rem] text-muted-foreground">Loading voucher…</p>
  }
  if (isError || !data) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-[0.9375rem] font-medium">Voucher not found.</p>
        <Link to="/" className="text-[0.875rem] text-primary hover:underline">
          Back to the dashboard
        </Link>
      </div>
    )
  }

  const back = BACK[data.type] ?? '/'
  const title = TITLES[data.type] ?? data.type
  const cancelled = data.status === 'CANCELLED'
  const isInvoice = data.type === 'SALES' || data.type === 'PURCHASE'
  const mayExportInvoice = isInvoice && data.status === 'POSTED'
  const cancelError =
    cancel.error instanceof Error ? cancel.error.message : 'Could not cancel the voucher.'

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-6 print:max-w-none print:p-0">
      <style>{`@media print { aside, header { display: none !important } main { overflow: visible !important } body { background: #fff } }`}</style>

      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          to={back}
          className="flex items-center gap-1.5 text-[0.875rem] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.75} />
          Back
        </Link>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (isInvoice ? navigate(`/print/vouchers/${id}`) : window.print())}
          >
            <Printer className="size-3.5" />
            Print
          </Button>
          {mayExportInvoice ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportInvoice.isPending}
              onClick={() => exportInvoice.mutate()}
            >
              <FileDown className="size-3.5" />
              {exportInvoice.isPending ? 'Preparing…' : 'Export PDF'}
            </Button>
          ) : null}
          {data.status === 'POSTED' && mayCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setOpen(true)}
            >
              <Ban className="size-3.5" />
              Cancel voucher
            </Button>
          ) : null}
        </div>
      </div>

      <div className="hidden print:block">
        <p className="font-heading text-[1.25rem] font-semibold">
          {company?.name ?? 'Crown Books'}
        </p>
        <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
          {[company?.address, company?.city, company?.pincode].filter(Boolean).join(', ')}
        </p>
        <p className="text-[0.75rem] text-muted-foreground">
          {company?.gstin ? `GSTIN ${company.gstin}` : ''}
          {company?.phone ? ` · ${company.phone}` : ''}
        </p>
      </div>

      <div className="border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {title}
            </p>
            <h1 className="mt-1 font-mono text-[1.375rem] font-semibold leading-none tracking-tight">
              {data.number}
            </h1>
            <p className="mt-2 text-[0.875rem] text-muted-foreground">
              {displayDate(data.date)}
              {data.dueDate ? ` · due ${displayDate(data.dueDate)}` : ''}
              {data.referenceNo ? ` · ref ${data.referenceNo}` : ''}
            </p>
          </div>
          <div className="text-right">
            <StatusPill
              tone={
                data.status === 'POSTED'
                  ? 'success'
                  : data.status === 'CANCELLED'
                    ? 'destructive'
                    : 'neutral'
              }
            >
              {data.status}
            </StatusPill>
            {data.partyId ? (
              <p className="mt-2 text-[0.9375rem] font-medium">
                <Link
                  to={`/parties/${data.partyId}`}
                  className="hover:text-primary hover:underline"
                >
                  {data.partyName ?? 'No party'}
                </Link>
              </p>
            ) : (
              <p className="mt-2 text-[0.9375rem] font-medium">{data.partyName ?? 'No party'}</p>
            )}
            {data.partyGstin ? (
              <p className="font-mono text-[0.75rem] text-muted-foreground">
                GSTIN {data.partyGstin}
              </p>
            ) : null}
          </div>
        </div>

        {data.lines.length > 0 ? (
          <table className="w-full border-collapse text-[0.875rem]">
            <thead>
              <tr className="border-b border-rule-strong bg-muted/40">
                {['#', 'Description', 'Qty', 'Rate', 'Disc', 'GST', 'Taxable', 'Tax', 'Amount'].map(
                  (heading) => (
                    <th
                      key={heading}
                      className={`h-8 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground ${heading === '#' || heading === 'Description' ? 'text-left' : 'text-right'}`}
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line, index) => (
                <tr key={line.id} className="h-9 border-b border-border last:border-b-0">
                  <td className="px-3 font-mono text-[0.75rem] text-muted-foreground">
                    {index + 1}
                  </td>
                  <td className="px-3">
                    {line.description}
                    {line.hsn ? (
                      <span className="ml-2 font-mono text-[0.6875rem] text-muted-foreground">
                        HSN {line.hsn}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums">
                    {formatQty(line.qtyE4)} {line.uom ?? ''}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums">
                    {formatMinor(line.rateMinor, 'INR')}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums">
                    {line.discountBps / 100}%
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums">
                    {line.gstRateBps / 100}%
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums">
                    {formatMinor(line.taxableMinor, 'INR')}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums">
                    {formatMinor(line.taxMinor, 'INR')}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums">
                    {formatMinor(line.totalMinor, 'INR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <div className="grid gap-4 border-t border-border px-5 py-4 sm:grid-cols-[1fr_280px]">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Narration
            </p>
            <p className="mt-1 text-[0.875rem] leading-relaxed">
              {data.narration ?? 'No narration recorded.'}
            </p>
          </div>
          <div>
            <TotalRow label="Taxable value" value={data.taxableMinor} />
            {data.cgstMinor !== 0 ? <TotalRow label="CGST" value={data.cgstMinor} /> : null}
            {data.sgstMinor !== 0 ? <TotalRow label="SGST" value={data.sgstMinor} /> : null}
            {data.igstMinor !== 0 ? <TotalRow label="IGST" value={data.igstMinor} /> : null}
            <TotalRow label="Round off" value={data.roundOffMinor} />
            <div className="mt-2 flex items-baseline justify-between border-t border-rule-strong pt-2">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em]">
                Total
              </span>
              <span className="font-mono text-[1rem] tabular-nums">
                {formatMinor(data.totalMinor, 'INR')}
              </span>
            </div>
          </div>
        </div>

        {data.allocations.length > 0 ? (
          <div className="border-t border-border px-5 py-3">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Settled against
            </p>
            <ul className="mt-1 divide-y divide-border">
              {data.allocations.map((allocation) => (
                <li
                  key={`${allocation.toVoucherId}-${allocation.amountMinor}`}
                  className="flex items-center justify-between py-1.5 text-[0.875rem]"
                >
                  <Link
                    to={`/vouchers/${allocation.toVoucherId}`}
                    className="font-mono hover:text-primary hover:underline"
                  >
                    {allocation.toNumber}
                  </Link>
                  <span className="font-mono tabular-nums">
                    {formatMinor(allocation.amountMinor, 'INR')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-2.5 text-[0.75rem] text-muted-foreground print:hidden">
          <span>
            Created {displayDateTime(data.createdAt)}
            {data.createdByName ? ` by ${data.createdByName}` : ''}
          </span>
          {data.postedByName && data.postedByName !== data.createdByName ? (
            <span>Posted by {data.postedByName}</span>
          ) : null}
          {data.cancelledAt ? (
            <span>
              Cancelled {displayDateTime(data.cancelledAt)}
              {data.cancelledByName ? ` by ${data.cancelledByName}` : ''}
            </span>
          ) : null}
          {data.cancelReason ? (
            <span>
              Reason <span className="text-foreground">{data.cancelReason}</span>
            </span>
          ) : null}
        </div>

        {data.audit.length > 0 ? (
          <div className="border-t border-border px-5 py-3 print:hidden">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Audit trail
            </p>
            <ul className="mt-1 divide-y divide-border">
              {data.audit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-[0.75rem]"
                >
                  <span>
                    <span className="font-medium text-foreground">
                      {AUDIT_ACTIONS[entry.action] ?? entry.action}
                    </span>
                    <span className="text-muted-foreground">
                      {entry.actorName ? ` by ${entry.actorName}` : ' by system'}
                      {entry.actorEmail ? ` (${entry.actorEmail})` : ''}
                    </span>
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {displayDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {cancelled ? (
        <div className="border-l-2 border-destructive bg-destructive-soft px-3 py-2 text-[0.8125rem] print:hidden">
          <p className="font-medium text-destructive">
            {data.cancelledAt
              ? `Cancelled ${displayDateTime(data.cancelledAt)}`
              : 'Cancelled voucher'}
            {data.cancelledByName ? ` by ${data.cancelledByName}` : ''}
          </p>
          {data.cancelReason ? (
            <p className="mt-0.5 text-muted-foreground">Reason: {data.cancelReason}</p>
          ) : null}
          <p className="mt-0.5 text-muted-foreground">
            This voucher stays in the books and its number is not reused.
          </p>
        </div>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) setReason('')
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {data.number}</DialogTitle>
            <DialogDescription>
              The voucher stays in the books as cancelled. Its ledger and stock effect are reversed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason" className="text-[0.75rem]">
              Reason <span className="font-normal text-muted-foreground">(required)</span>
            </Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Why is this voucher being cancelled?"
            />
            {cancel.isError ? (
              <p role="alert" className="text-[0.75rem] text-destructive">
                {cancelError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Keep voucher
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={reason.trim().length < 3 || cancel.isPending}
              onClick={() => cancel.mutate(reason.trim())}
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel voucher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
