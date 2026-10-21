import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { Ban, Info } from 'lucide-react'
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
import { LoadingButton } from '@/components/ui/loading-button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useCancelMembership, useRefundState } from '../mutations'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { Membership } from '@/features/customers/types'
import type {
  CancellationTiming,
  CancellationReasonCode
} from '../../../../../shared/contracts/membership-cancel-renew'
import { CANCELLATION_REASON_CODES } from '../../../../../shared/contracts/membership-cancel-renew'

const TIMING_LABELS: Record<CancellationTiming, string> = {
  IMMEDIATE: 'Cancel immediately',
  END_OF_PERIOD: 'Cancel at end of period',
  NOTICE_DAYS: 'Cancel after notice period'
}

const REASON_LABELS: Record<CancellationReasonCode, string> = {
  COST: 'Too expensive',
  RELOCATION: 'Relocating',
  HEALTH: 'Health reasons',
  FACILITIES: 'Facility issues',
  SERVICE: 'Service quality',
  COMPETITOR: 'Switched to competitor',
  UNUSED: 'Not using membership',
  FAMILY: 'Family reasons',
  OTHER: 'Other'
}

const DEFAULT_NOTICE_DAYS = 14

/** Adds days to a YYYY-MM-DD date string, returning YYYY-MM-DD. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Caps a date string at the membership end date. */
function capAtEnd(dateStr: string, endDate: string): string {
  return dateStr > endDate ? endDate : dateStr
}

/** Formats a YYYY-MM-DD date for display. */
function formatDateStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Inclusive days between two YYYY-MM-DD dates (clamped ≥ 0). */
function daysUsed(startDate: string, throughDate: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime()
  const through = new Date(`${throughDate}T00:00:00`).getTime()
  return Math.max(0, Math.floor((through - start) / 86400000) + 1)
}

/** Mirrors the backend prorated refund formula: paid × (unused / total). */
function calculateProratedRefund(input: {
  paidMinor: number
  usedDays: number
  totalDays: number
}): number {
  const { paidMinor, usedDays, totalDays } = input
  if (totalDays <= 0 || usedDays >= totalDays) return 0
  if (usedDays <= 0) return paidMinor
  const unusedDays = totalDays - usedDays
  return Math.max(0, Math.min(paidMinor, Math.round((paidMinor * unusedDays) / totalDays)))
}

type RefundTiming = 'IMMEDIATE' | 'ON_EFFECTIVE_DATE'

/**
 * CancelMembershipDialog — single dialog for all cancellation paths (R1.1).
 * Timing pre-selected from plan's cancellation policy.
 * Refund section shown only for IMMEDIATE with an invoice.
 */
export function CancelMembershipDialog({
  open,
  onOpenChange,
  membership,
  defaultTiming = 'END_OF_PERIOD'
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  membership: Membership
  defaultTiming?: CancellationTiming
}): React.JSX.Element {
  const cancel = useCancelMembership()
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const currency = useCurrency()
  const { data: refundState } = useRefundState(open ? parseInt(membership.id) : undefined)

  const hasInvoice = !!refundState?.invoiceId
  const isExpired = membership.status === 'EXPIRED'
  const refundableMinor = refundState?.refundableMinor ?? 0

  const today = new Date().toISOString().slice(0, 10)
  const defaultNoticeEnd = capAtEnd(addDays(today, DEFAULT_NOTICE_DAYS), membership.endDate)

  const form = useForm({
    defaultValues: {
      timing: defaultTiming,
      reasonCode: '' as CancellationReasonCode | '',
      reasonDetail: '',
      noticeEndDate: defaultNoticeEnd,
      refundMode: 'NONE' as 'NONE' | 'FULL' | 'PRORATED' | 'CUSTOM',
      refundTiming: 'ON_EFFECTIVE_DATE' as RefundTiming,
      refundAmount: ''
    },
    onSubmit: async ({ value }) => {
      if (!value.reasonCode) return

      // Validate custom refund amount against the refundable max.
      if (value.refundMode === 'CUSTOM') {
        const minor = Math.round(parseFloat(value.refundAmount || '0') * 100)
        if (Number.isNaN(minor) || minor <= 0 || minor > refundableMinor) {
          return
        }
      }

      const refund =
        hasInvoice && !isExpired
          ? {
              mode: value.refundMode,
              amountMinor:
                value.refundMode === 'CUSTOM'
                  ? Math.round(parseFloat(value.refundAmount || '0') * 100)
                  : undefined,
              timing:
                value.timing === 'IMMEDIATE'
                  ? ('IMMEDIATE' as const)
                  : (value.refundTiming as RefundTiming)
            }
          : null

      try {
        await cancel.mutateAsync({
          membershipId: parseInt(membership.id),
          timing: isExpired ? 'IMMEDIATE' : (value.timing as CancellationTiming),
          reasonCode: value.reasonCode as CancellationReasonCode,
          reasonDetail: value.reasonDetail.trim() || null,
          noticeEndDate: value.timing === 'NOTICE_DAYS' ? value.noticeEndDate : null,
          refund
        })
        setSubmitSuccess(true)
        window.setTimeout(() => onOpenChange(false), 700)
      } catch {
        setSubmitSuccess(false)
      }
    }
  })

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)
  const timingValue = useStore(form.store, (s) => s.values.timing)
  const refundModeValue = useStore(form.store, (s) => s.values.refundMode)
  const noticeEndValue = useStore(form.store, (s) => s.values.noticeEndDate)
  const refundAmountValue = useStore(form.store, (s) => s.values.refundAmount)

  // Refund section shows whenever the membership has an invoice (any timing).
  const showRefund = hasInvoice && !isExpired

  const effectivePreview = noticeEndValue
    ? capAtEnd(noticeEndValue, membership.endDate)
    : defaultNoticeEnd
  const cappedAtEnd = noticeEndValue !== null && effectivePreview !== noticeEndValue

  // Cancellation effective date — the basis for prorated refunds (industry standard:
  // unused days measured from the effective date to the end date).
  const refundEffectiveDate =
    timingValue === 'IMMEDIATE'
      ? today
      : timingValue === 'END_OF_PERIOD'
        ? membership.endDate
        : noticeEndValue
          ? capAtEnd(noticeEndValue, membership.endDate)
          : defaultNoticeEnd

  // Reactive prorated suggestion for the current timing/effective date.
  const proratedSuggested = calculateProratedRefund({
    paidMinor: refundState?.finalPriceMinor ?? 0,
    usedDays: daysUsed(refundState?.startDate ?? membership.startDate, refundEffectiveDate),
    totalDays: refundState?.durationDays ?? 0
  })
  const reactiveProrated = Math.min(proratedSuggested, refundableMinor)

  // Live custom-amount validation.
  const customAmountMinor = Math.round(parseFloat(refundAmountValue || '0') * 100)
  const customInvalid =
    refundModeValue === 'CUSTOM' &&
    (Number.isNaN(customAmountMinor) ||
      customAmountMinor <= 0 ||
      customAmountMinor > refundableMinor)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="size-4 text-destructive" />
            Cancel membership
          </DialogTitle>
          <DialogDescription>
            Cancel &ldquo;{membership.plan}&rdquo; ({membership.startDate} → {membership.endDate}).
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
            {/* Timing (hidden for EXPIRED — always immediate) */}
            {!isExpired && (
              <form.Field name="timing">
                {(field) => (
                  <FormField
                    name={field.name}
                    state={field.state}
                    handleChange={(v) => field.handleChange(v as CancellationTiming)}
                    handleBlur={field.handleBlur}
                    submitted={false}
                    label="Cancellation timing"
                    validate={() => undefined}
                  >
                    {({ id, invalid, describedBy }) => (
                      <Select
                        value={field.state.value}
                        onValueChange={(v) => field.handleChange(v as CancellationTiming)}
                      >
                        <SelectTrigger
                          id={id}
                          aria-invalid={invalid}
                          aria-describedby={describedBy}
                        >
                          <SelectValue placeholder="Select timing" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IMMEDIATE">{TIMING_LABELS.IMMEDIATE}</SelectItem>
                          <SelectItem value="END_OF_PERIOD">
                            {TIMING_LABELS.END_OF_PERIOD}
                          </SelectItem>
                          <SelectItem value="NOTICE_DAYS">{TIMING_LABELS.NOTICE_DAYS}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                )}
              </form.Field>
            )}

            {/* Notice end date override (NOTICE_DAYS only) */}
            {timingValue === 'NOTICE_DAYS' && (
              <>
                <form.Field name="noticeEndDate">
                  {(field) => (
                    <FormField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={false}
                      label="Effective date"
                      hint={`Default is ${DEFAULT_NOTICE_DAYS} days from today (${defaultNoticeEnd}). You can override it.`}
                      validate={() => undefined}
                    >
                      {({ id, invalid, describedBy, onChange }) => (
                        <Input
                          id={id}
                          type="date"
                          min={addDays(today, 1)}
                          value={field.state.value}
                          aria-invalid={invalid}
                          aria-describedby={describedBy}
                          onChange={(e) => onChange(e.target.value)}
                          className="h-9"
                        />
                      )}
                    </FormField>
                  )}
                </form.Field>
                <p className="-mt-2 text-xs text-muted-foreground">
                  Membership stays active until <strong>{effectivePreview}</strong>
                  {cappedAtEnd
                    ? ` (capped at period end ${membership.endDate})`
                    : ` (${DEFAULT_NOTICE_DAYS}-day notice from ${today})`}
                  .
                </p>
              </>
            )}

            {/* Reason code */}
            <form.Field name="reasonCode">
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={(v) => field.handleChange(v as CancellationReasonCode)}
                  handleBlur={field.handleBlur}
                  submitted={false}
                  label="Reason"
                  hint="Required for churn analytics"
                  validate={() => undefined}
                >
                  {({ id, invalid, describedBy }) => (
                    <Select
                      value={field.state.value}
                      onValueChange={(v) => field.handleChange(v as CancellationReasonCode)}
                    >
                      <SelectTrigger id={id} aria-invalid={invalid} aria-describedby={describedBy}>
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {CANCELLATION_REASON_CODES.map((code) => (
                          <SelectItem key={code} value={code}>
                            {REASON_LABELS[code]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              )}
            </form.Field>

            {/* Reason detail */}
            <form.Field name="reasonDetail">
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={false}
                  label="Detail (optional)"
                  validate={() => undefined}
                >
                  {({ id, value, invalid, describedBy, onChange }) => (
                    <Textarea
                      id={id}
                      value={value}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="Any additional context..."
                      rows={2}
                      maxLength={500}
                    />
                  )}
                </FormField>
              )}
            </form.Field>

            {/* Refund section (any timing, with invoice) */}
            {showRefund && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Info className="size-3.5" />
                  Refund
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Refundable: <strong>{formatMinor(refundableMinor, currency)}</strong>
                  {refundModeValue === 'PRORATED' && reactiveProrated > 0
                    ? ` · Prorated (effective ${formatDateStr(refundEffectiveDate)}): ${formatMinor(reactiveProrated, currency)}`
                    : ''}
                </p>

                <form.Field name="refundMode">
                  {(field) => (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(['NONE', 'FULL', 'PRORATED', 'CUSTOM'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                            field.state.value === mode
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted bg-background text-muted-foreground hover:border-primary/50'
                          }`}
                          onClick={() => {
                            field.handleChange(mode)
                            if (mode === 'CUSTOM') {
                              form.setFieldValue('refundAmount', (refundableMinor / 100).toFixed(2))
                            }
                          }}
                        >
                          {mode === 'NONE'
                            ? 'No refund'
                            : mode === 'FULL'
                              ? 'Full refund'
                              : mode === 'PRORATED'
                                ? 'Prorated'
                                : 'Custom'}
                        </button>
                      ))}
                    </div>
                  )}
                </form.Field>

                {/* Refund timing: schedule to the cancellation date (default) or issue now */}
                {timingValue !== 'IMMEDIATE' && (
                  <form.Field name="refundTiming">
                    {(field) => (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">Issue the refund…</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {(['ON_EFFECTIVE_DATE', 'IMMEDIATE'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                field.state.value === t
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-muted bg-background text-muted-foreground hover:border-primary/50'
                              }`}
                              onClick={() => field.handleChange(t)}
                            >
                              {t === 'ON_EFFECTIVE_DATE'
                                ? `On ${formatDateStr(refundEffectiveDate)}`
                                : 'Immediately'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </form.Field>
                )}

                {refundModeValue === 'CUSTOM' && (
                  <form.Field name="refundAmount">
                    {(field) => (
                      <div className="mt-2">
                        <Label htmlFor="refund-amount" className="text-xs">
                          Amount (₹)
                        </Label>
                        <Input
                          id="refund-amount"
                          type="number"
                          min="0"
                          max={(refundableMinor / 100).toFixed(2)}
                          step="0.01"
                          value={field.state.value}
                          aria-invalid={customInvalid}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="0.00"
                          className="mt-1 h-8 text-sm"
                        />
                        {customInvalid && (
                          <p className="mt-1 text-xs text-destructive">
                            Enter an amount between ₹0.01 and{' '}
                            {formatMinor(refundableMinor, currency)}
                          </p>
                        )}
                      </div>
                    )}
                  </form.Field>
                )}
              </div>
            )}
          </FieldGroup>

          <DialogFooter className="mt-6">
            <LoadingButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Keep membership
            </LoadingButton>
            <LoadingButton
              type="submit"
              variant="destructive"
              loading={isSubmitting}
              success={submitSuccess}
              loadingLabel="Cancelling…"
              successLabel="Cancelled!"
            >
              Cancel membership
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
