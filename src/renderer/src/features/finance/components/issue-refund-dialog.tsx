import { useMemo, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { Undo2 } from 'lucide-react'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { formatMinor, minorToMajor, parseToMinor, sanitizeMoneyInput } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { PAYMENT_METHODS } from '../constants'
import { useIssueRefund, usePaymentsFor } from '../queries'
import { CustomerPicker } from './customer-picker'
import type { PersonRef } from '@/features/dashboard/types'
import type { Refund } from '../types'

const REQUIRED = <span className="text-destructive">*</span>

/**
 * Issue a refund (Module 05 §17). The refund is a separate, dated, reasoned
 * event against one of the customer's recorded payments — the source payment is
 * never edited. The amount can't exceed what is still available on that payment
 * (its value minus any refunds already issued against it).
 */
export function IssueRefundDialog({
  open,
  onOpenChange,
  refunds
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  refunds: Refund[]
}): React.JSX.Element {
  const issue = useIssueRefund()
  const currency = useCurrency()
  const [picked, setPicked] = useState<PersonRef | null>(null)
  const { data: payments, isLoading: loadingPayments } = usePaymentsFor(picked?.id)

  const remainingByPayment = useMemo(
    () =>
      new Map<string, { remaining: number; total: number }>(
        (payments ?? []).map((p) => {
          const pid = String(p.id)
          const used = refunds
            .filter((r) => r.status === 'ISSUED' && r.sourcePaymentId === pid)
            .reduce((s, r) => s + r.amountMinor, 0)
          return [pid, { remaining: p.amountMinor - used, total: p.amountMinor }]
        })
      ),
    [payments, refunds]
  )

  const form = useForm({
    defaultValues: {
      refundDate: new Date().toISOString(),
      amount: '',
      sourcePaymentId: '',
      method: 'UPI' as string,
      reason: ''
    },
    onSubmit: async ({ value }) => {
      if (!picked) return
      const source = payments?.find((p) => String(p.id) === value.sourcePaymentId)
      if (!source) return
      try {
        await issue.mutateAsync({
          paymentId: Number(source.id),
          amountMinor: parseToMinor(String(value.amount), currency) ?? 0,
          reason: value.reason
        })
        setPicked(null)
        form.reset()
        onOpenChange(false)
      } catch {
        // error toast handled by the mutation hook
      }
    }
  })

  const submitted = useStore(form.store, (s) => s.isSubmitted)
  const sourcePaymentId = useStore(form.store, (s) => s.values.sourcePaymentId)
  const selected = sourcePaymentId ? remainingByPayment.get(sourcePaymentId) : undefined
  const remaining = selected?.remaining ?? 0
  const totalAmount = selected?.total ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="size-4 text-destructive" />
            Issue a refund
          </DialogTitle>
          <DialogDescription>
            Money returned to the customer — a separate record layered on top of a payment.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <FieldGroup className="gap-4">
            <div className="grid gap-1.5">
              <Label>Customer {REQUIRED}</Label>
              <CustomerPicker
                value={picked?.id ?? ''}
                onChange={(customer) => {
                  setPicked(customer)
                  form.setFieldValue('sourcePaymentId', '')
                  form.setFieldValue('amount', '')
                }}
              />
            </div>

            {picked ? (
              <form.Field
                name="sourcePaymentId"
                validators={{
                  onChange: ({ value }) =>
                    value ? undefined : 'Select the payment this refund is against'
                }}
              >
                {(field) => (
                  <FormField
                    name={field.name}
                    state={field.state}
                    handleChange={field.handleChange}
                    handleBlur={field.handleBlur}
                    submitted={submitted}
                    label={<>Refund against {REQUIRED}</>}
                    validate={(v) => (v ? undefined : 'Select the payment this refund is against')}
                    completeWhen={(v) => Boolean(v)}
                    labelEnd={
                      remaining > 0 ? (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatMinor(remaining, currency)} of {formatMinor(totalAmount, currency)}
                        </span>
                      ) : undefined
                    }
                  >
                    {({ id, value, invalid, valid, describedBy }) => (
                      <Select
                        value={value}
                        onValueChange={(v) => {
                          field.handleChange(v)
                          // Auto-fill amount with available on the selected payment
                          const entry = remainingByPayment.get(v)
                          if (entry && entry.remaining > 0) {
                            form.setFieldValue('amount', minorToMajor(entry.remaining, currency))
                          } else {
                            form.setFieldValue('amount', '')
                          }
                        }}
                      >
                        <SelectTrigger
                          id={id}
                          aria-invalid={invalid}
                          data-valid={valid}
                          aria-describedby={describedBy}
                          size="default"
                          className="h-9 rounded-md text-sm"
                        >
                          <SelectValue
                            placeholder={loadingPayments ? 'Loading…' : 'Select a payment'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(payments ?? []).map((p) => {
                            const pid = String(p.id)
                            const entry = remainingByPayment.get(pid)
                            const avail = entry?.remaining ?? 0
                            const total = entry?.total ?? 0
                            return (
                              <SelectItem key={pid} value={pid} disabled={avail <= 0}>
                                <span className="font-mono tabular-nums">
                                  {p.paymentNo} ·{' '}
                                  {avail <= 0
                                    ? 'Fully refunded'
                                    : `${formatMinor(avail, currency)} from ${formatMinor(total, currency)}`}
                                </span>
                              </SelectItem>
                            )
                          })}
                          {!loadingPayments && !payments?.length ? (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">
                              No payments recorded for this customer.
                            </p>
                          ) : null}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                )}
              </form.Field>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="refundDate"
                validators={{
                  onChange: ({ value }) => (value ? undefined : 'Select the refund date')
                }}
              >
                {(field) => (
                  <FormField
                    name={field.name}
                    state={field.state}
                    handleChange={field.handleChange}
                    handleBlur={field.handleBlur}
                    submitted={submitted}
                    label={<>Date {REQUIRED}</>}
                    validate={(v) => (v ? undefined : 'Select the refund date')}
                    completeWhen={(v) => Boolean(v)}
                  >
                    {({ id, invalid, describedBy }) => (
                      <DateTimePicker
                        value={field.state.value}
                        onChange={(iso) => field.handleChange(iso)}
                        id={id}
                        invalid={invalid}
                        aria-describedby={describedBy}
                      />
                    )}
                  </FormField>
                )}
              </form.Field>

              <form.Field
                name="amount"
                validators={{
                  onChangeListenTo: ['sourcePaymentId'],
                  onChange: ({ value, fieldApi }) => {
                    const n = Number(value)
                    if (!value) return 'Enter the refund amount'
                    if (!Number.isFinite(n) || n <= 0) return 'Amount must be greater than zero'
                    const sourceId = fieldApi.form.getFieldValue('sourcePaymentId')
                    const entry = sourceId ? remainingByPayment.get(sourceId) : undefined
                    const avail = entry?.remaining ?? 0
                    const amtMinor = parseToMinor(value, currency) ?? 0
                    if (avail > 0 && amtMinor > avail)
                      return `Refund cannot exceed ${formatMinor(avail, currency)} available on this payment`
                    return undefined
                  }
                }}
              >
                {(field) => (
                  <FormField
                    name={field.name}
                    state={field.state}
                    handleChange={field.handleChange}
                    handleBlur={field.handleBlur}
                    submitted={submitted}
                    label={<>Amount {REQUIRED}</>}
                    validate={(v) => {
                      const n = Number(v)
                      if (!v) return 'Enter the refund amount'
                      if (!Number.isFinite(n) || n <= 0) return 'Amount must be greater than zero'
                      return undefined
                    }}
                    completeWhen={(v) => Boolean(v) && Number(v) > 0}
                  >
                    {({ id, value, invalid, valid, describedBy, onBlur, onChange }) => (
                      <Input
                        id={id}
                        type="text"
                        inputMode="decimal"
                        value={value}
                        onBlur={onBlur}
                        onChange={(e) => onChange(sanitizeMoneyInput(e.target.value))}
                        placeholder="0.00"
                        aria-invalid={invalid}
                        data-valid={valid}
                        aria-describedby={describedBy}
                      />
                    )}
                  </FormField>
                )}
              </form.Field>
            </div>

            <form.Field
              name="method"
              validators={{
                onChange: ({ value }) =>
                  value ? undefined : 'Select how the money is being returned'
              }}
            >
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label={<>Return method {REQUIRED}</>}
                  validate={(v) => (v ? undefined : 'Select how the money is being returned')}
                  completeWhen={(v) => Boolean(v)}
                >
                  {({ id, value, invalid, valid, describedBy }) => (
                    <Select value={value} onValueChange={field.handleChange}>
                      <SelectTrigger
                        id={id}
                        aria-invalid={invalid}
                        data-valid={valid}
                        aria-describedby={describedBy}
                        size="default"
                        className="h-9 rounded-md text-sm"
                      >
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
                  )}
                </FormField>
              )}
            </form.Field>

            <form.Field
              name="reason"
              validators={{
                onChange: ({ value }) =>
                  value.trim().length > 0 ? undefined : 'Enter a reason for the refund'
              }}
            >
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label={<>Reason {REQUIRED}</>}
                  validate={(v) =>
                    v.trim().length > 0 ? undefined : 'Enter a reason for the refund'
                  }
                  completeWhen={(v) => v.trim().length > 0}
                >
                  {({ id, value, invalid, valid, describedBy, onBlur, onChange }) => (
                    <Textarea
                      id={id}
                      value={value}
                      onBlur={onBlur}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="e.g. PT package cancelled — unused sessions"
                      rows={2}
                      aria-invalid={invalid}
                      data-valid={valid}
                      aria-describedby={describedBy}
                    />
                  )}
                </FormField>
              )}
            </form.Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <LoadingButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </LoadingButton>
            <form.Subscribe
              selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}
            >
              {({ canSubmit, isSubmitting }) => (
                <LoadingButton
                  type="submit"
                  variant="destructive"
                  disabled={!canSubmit || !picked}
                  loading={isSubmitting}
                  loadingLabel="Issuing…"
                >
                  Issue refund
                </LoadingButton>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
