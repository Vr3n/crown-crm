import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CatalogDatePicker } from '@/features/catalog/components/catalog-date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { PAYMENT_METHODS } from '../constants'
import { useCustomers, useOutstandingInvoices, useRecordPayment } from '../queries'
import { pdfApi } from '@/features/pdf/api'
import { CustomerPicker } from './customer-picker'
import { AllocationSection, type AllocationDraft } from './allocation-section'
import { parseToMinor, sanitizeMoneyInput } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { PersonRef } from '@/features/dashboard/types'

/**
 * Props for contextual entry. When opened from an Invoice Details Sheet,
 * both customerId and invoiceId are pre-set so the user sees the invoice
 * already checked in the allocation section.
 */
interface RecordPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Full person ref — preferred, avoids a lookup. */
  preSelectedCustomer?: PersonRef
  /** Customer ID string — falls back to lookup in the customers list. */
  preSelectedCustomerId?: string
  preSelectedInvoiceId?: string
}

/**
 * Record a payment (Module 05 §15–16, Module 07 §47). Money received is never
 * a one-to-one with an invoice: the dialog lets a single payment be spread
 * across the customer's outstanding invoices, exactly as the allocation model
 * intends. A live reconciliation line keeps the "money in" honest against the
 * "money spread".
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  preSelectedCustomer,
  preSelectedCustomerId,
  preSelectedInvoiceId
}: RecordPaymentDialogProps): React.JSX.Element {
  const navigate = useNavigate()
  const currency = useCurrency()
  const record = useRecordPayment()
  const { data: allCustomers = [] } = useCustomers()
  const [picked, setPicked] = useState<PersonRef | null>(preSelectedCustomer ?? null)
  const effectiveCustomerId = preSelectedCustomer?.id ?? preSelectedCustomerId ?? picked?.id
  const { data: outstanding, isLoading: loadingInvoices } =
    useOutstandingInvoices(effectiveCustomerId)

  const [allocations, setAllocations] = useState<AllocationDraft[]>([])

  const totalAllocated = useMemo(
    () => allocations.filter((a) => a.enabled).reduce((s, a) => s + (a.amountMinor || 0), 0),
    [allocations]
  )

  const form = useForm({
    defaultValues: {
      // Date-only business value (#110); time-of-day is not recorded.
      paymentDate: new Date().toISOString().slice(0, 10),
      amount: '',
      method: 'UPI' as string,
      reference: '',
      notes: ''
    },
    onSubmit: async ({ value }) => {
      if (!picked) return
      const allocs = allocations
        .filter((a) => a.enabled && (a.amountMinor || 0) > 0)
        .map((a) => ({
          invoiceId: a.invoiceId,
          amountMinor: a.amountMinor
        }))
      try {
        const result = await record.mutateAsync({
          customerId: picked.id,
          paymentDate: value.paymentDate,
          amountMinor: parseToMinor(String(value.amount), currency) ?? 0,
          paymentMethod: value.method,
          reference: value.reference,
          notes: value.notes,
          allocations: allocs
        })
        setPicked(null)
        setAllocations([])
        onOpenChange(false)

        // Navigate to first allocated invoice, then generate PDFs in background
        const paidInvoiceIds = result.allocations.map((a) => a.invoiceId)
        if (paidInvoiceIds.length > 0) {
          navigate(`/invoices/${paidInvoiceIds[0]}`)
          // Generate receipt PDF
          pdfApi.exportReceipt(result.id, 'preview').catch(() => {})
          // Generate invoice PDF for each allocated invoice
          for (const invId of paidInvoiceIds) {
            pdfApi.exportInvoice(invId, 'preview').catch(() => {})
          }
        }
      } catch {
        // error toast handled by the mutation hook
      }
    }
  })

  // Subscribe to amount field reactively — form.state doesn't trigger re-renders
  const amount = useStore(form.store, (s) => s.values.amount)

  // When only a preSelectedCustomerId is provided (no full PersonRef), seed from the customers list.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: seed picked customer from ID fallback */
  useEffect(() => {
    if (!open) return
    if (preSelectedCustomerId && !preSelectedCustomer && allCustomers.length > 0) {
      setPicked((prev) => {
        if (prev) return prev
        return allCustomers.find((c) => c.id === preSelectedCustomerId) ?? null
      })
    }
  }, [open, preSelectedCustomer, preSelectedCustomerId, allCustomers])
  /* eslint-enable react-hooks/set-state-in-effect */

  // When invoices load and we have a pre-selected invoice, auto-check it.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: seed allocations from loaded invoices */
  useEffect(() => {
    if (!open || !outstanding?.length || !preSelectedInvoiceId) return
    setAllocations((prev) => {
      // Don't re-seed if already seeded
      if (prev.some((a) => a.invoiceId === preSelectedInvoiceId)) return prev

      return outstanding.map((inv) => ({
        invoiceId: inv.id,
        amountMinor:
          inv.id === preSelectedInvoiceId ? Math.max(0, inv.totalMinor - inv.paidMinor) : 0,
        enabled: inv.id === preSelectedInvoiceId
      }))
    })
  }, [open, outstanding, preSelectedInvoiceId])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-distribute payment amount across outstanding invoices (oldest-first)
  // whenever the Amount field changes. Only runs when there are outstanding
  // invoices and a positive amount — manual toggles are handled separately.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: derive allocations from amount */
  useEffect(() => {
    if (!outstanding?.length) return
    const amt = parseToMinor(amount, currency) ?? 0
    if (amt <= 0) {
      setAllocations((prev) => prev.map((a) => ({ ...a, amountMinor: 0 })))
      return
    }

    const sorted = [...outstanding]
      .filter((i) => i.status === 'OPEN' || i.status === 'PARTIALLY_PAID')
      .sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime())

    let remaining = amt
    const newAllocations: AllocationDraft[] = sorted.map((inv) => {
      const due = Math.max(0, inv.totalMinor - inv.paidMinor)
      const allocAmount = Math.min(due, remaining)
      remaining = Math.max(0, remaining - allocAmount)
      return { invoiceId: inv.id, amountMinor: allocAmount, enabled: allocAmount > 0 }
    })

    setAllocations(newAllocations)
  }, [amount, currency, outstanding])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Default the date to the linked invoice's issue date on contextual entry
  // (#110). Only seeds while the clerk hasn't touched the field.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: one-shot contextual default */
  const paymentDateTouched = useStore(
    form.store,
    (s) => s.fieldMeta.paymentDate?.isTouched ?? false
  )
  useEffect(() => {
    if (!preSelectedInvoiceId || !outstanding?.length || paymentDateTouched) return
    const linked = outstanding.find((i) => String(i.id) === String(preSelectedInvoiceId))
    const issueDay = linked?.issuedAt.slice(0, 10)
    if (issueDay && /^\d{4}-\d{2}-\d{2}$/.test(issueDay)) {
      form.setFieldValue('paymentDate', issueDay)
    }
  }, [preSelectedInvoiceId, outstanding, paymentDateTouched, form])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCustomerChange = useCallback((customer: PersonRef) => {
    setPicked(customer)
    setAllocations([])
  }, [])

  const overAllocated =
    !!amount &&
    (parseToMinor(amount, currency) ?? 0) > 0 &&
    totalAllocated > (parseToMinor(amount, currency) ?? 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            Record a payment
          </DialogTitle>
          <DialogDescription>
            Money received — optionally spread across the customer&apos;s outstanding invoices.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <div className="grid gap-3">
            {/* Customer picker — locked when pre-selected from contextual entry */}
            <div className="grid gap-1.5">
              <Label>
                Customer <span className="text-destructive">*</span>
              </Label>
              {(preSelectedCustomer || preSelectedCustomerId) && picked ? (
                <div className="flex h-9 items-center rounded-md border border-border bg-muted/50 px-3 text-sm">
                  {picked.name}
                </div>
              ) : (
                <CustomerPicker value={picked?.id ?? ''} onChange={handleCustomerChange} />
              )}
            </div>

            {/* Payment fields */}
            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="paymentDate"
                validators={{
                  onChange: ({ value }) =>
                    /^\d{4}-\d{2}-\d{2}$/.test(value) ? undefined : 'Pick a valid payment date'
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`pay-${field.name}`}>
                      Date <span className="text-destructive">*</span>
                    </Label>
                    <CatalogDatePicker
                      value={field.state.value}
                      onChange={(v) => field.handleChange(v)}
                      placeholder="Pick payment date"
                      testId="payment-date-picker"
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>

              <form.Field
                name="amount"
                validators={{
                  onChange: ({ value }) => {
                    const n = Number(value)
                    if (!value) return 'Enter an amount'
                    if (!Number.isFinite(n) || n <= 0) return 'Amount must be positive'
                    return undefined
                  }
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`pay-${field.name}`}>
                      Amount <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`pay-${field.name}`}
                      type="text"
                      inputMode="decimal"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(sanitizeMoneyInput(e.target.value))}
                      placeholder="0"
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="method"
                validators={{
                  onChange: ({ value }) => (value ? undefined : 'Pick a method')
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`pay-${field.name}`}>
                      Method <span className="text-destructive">*</span>
                    </Label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger size="default" className="h-9 rounded-md text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m.key} value={m.key}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>

              <form.Field name="reference">
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`pay-${field.name}`}>Reference</Label>
                    <Input
                      id={`pay-${field.name}`}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="UTR / cheque no."
                    />
                  </div>
                )}
              </form.Field>
            </div>

            {/* Allocation section — replaces the old manual grid */}
            {picked ? (
              <AllocationSection
                invoices={outstanding ?? []}
                paymentAmountMinor={parseToMinor(amount, currency) ?? 0}
                allocations={allocations}
                onAllocationsChange={setAllocations}
                isLoading={loadingInvoices}
              />
            ) : null}

            <form.Field name="notes">
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`pay-${field.name}`}>Notes</Label>
                  <Textarea
                    id={`pay-${field.name}`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Optional context"
                    rows={2}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(s) => ({
                canSubmit: s.canSubmit,
                isSubmitting: s.isSubmitting
              })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" disabled={!canSubmit || !picked || overAllocated}>
                  {isSubmitting ? 'Recording…' : 'Record payment'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
