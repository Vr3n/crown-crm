import { AlertCircle, HandCoins, IndianRupee, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { formatMinor, formatRate, parseToMinor, sanitizeMoneyInput } from '@/lib/money'
import { billingDateCautions } from '@/lib/billing-warnings'
import { useCurrency } from '@/hooks/use-currency'
import { PAYMENT_METHODS } from '@/lib/payment-methods'
import { CatalogDatePicker } from '@/features/catalog/components/catalog-date-picker'
import type { Plan } from '@/features/catalog/types'

const BILLING_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export function OrderSummary({
  plan = null,
  basePrice = null,
  discountType = '',
  discountValue = '',
  discountAmount = 0,
  finalPrice = null,
  maxPayment = null,
  paidInput = '',
  paidAmount = null,
  paymentMethod = '',
  chequeNumber = '',
  billingDate = '',
  todayIso = '',
  onPaidChange,
  onPaymentMethodChange,
  onChequeNumberChange,
  onBillingDateChange,
  isDirty = false,
  leadName = null
}: {
  plan?: Plan | null
  basePrice?: number | null
  discountType?: string
  discountValue?: string
  discountAmount?: number
  finalPrice?: number | null
  maxPayment?: number | null
  paidInput?: string
  paidAmount?: number | null
  paymentMethod?: string | null
  chequeNumber?: string
  billingDate?: string
  todayIso?: string
  onPaidChange?: (v: string) => void
  onPaymentMethodChange?: (v: string) => void
  onChequeNumberChange?: (v: string) => void
  onBillingDateChange?: (v: string) => void
  isDirty?: boolean
  leadName?: string | null
}): React.JSX.Element {
  const currency = useCurrency()
  const billingValid = BILLING_DATE_REGEX.test(billingDate)
  const cautions = billingValid ? billingDateCautions(billingDate, todayIso || billingDate) : []
  const amountDue =
    finalPrice !== null && paidAmount !== null ? Math.max(0, finalPrice - paidAmount) : null
  const exceedsMax = maxPayment !== null && paidAmount !== null && paidAmount > maxPayment

  const discountTypeLabel =
    !discountType || discountType === 'NONE' ? 'None' : discountType.replace('_', ' ')
  const discountValueLabel =
    discountValue !== '' && discountType
      ? discountType === 'PERCENTAGE'
        ? `${discountValue}%`
        : discountType === 'FREE_PERIOD'
          ? `${discountValue} months`
          : formatMinor(parseToMinor(discountValue, currency) ?? 0, currency)
      : '—'
  const discountAmountLabel = discountAmount > 0 ? `-${formatMinor(discountAmount, currency)}` : '—'

  return (
    <Card className="gap-0 rounded-2xl border bg-card py-0 shadow-sm">
      <CardHeader className="px-5 py-4">
        <CardTitle className="text-sm font-semibold tracking-tight">Order summary</CardTitle>
        <p className="text-xs text-muted-foreground">Live preview — updates as you type</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 px-0 pb-0">
        {/* Plan line */}
        <div className="px-5 pb-3">
          {plan ? (
            <>
              <p className="truncate text-sm font-medium">{plan.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {plan.duration} (
                {plan.duration === 'MONTHLY'
                  ? 30
                  : plan.duration === 'QUARTERLY'
                    ? 90
                    : plan.duration === 'HALF_YEARLY'
                      ? 180
                      : 365}{' '}
                days)
                {leadName ? ` · ${leadName}` : ''}
                {isDirty && basePrice !== null ? ` · Edited` : ''}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">No plan selected</p>
              <p className="text-[11px] text-muted-foreground/70">Pick a plan to see pricing</p>
            </>
          )}
        </div>

        <Separator />

        {/* Totals */}
        <div className="flex flex-col gap-2 px-5 py-3 text-sm">
          <Row
            label="Base Price"
            value={basePrice !== null ? formatMinor(basePrice, currency) : '—'}
          />
          <Row label="Discount type" value={discountTypeLabel} muted />
          <Row label="Discount value" value={discountValueLabel} muted />
          <Row
            label="Discount amount"
            value={discountAmountLabel}
            muted
            valueClass={discountAmount > 0 ? 'text-success font-medium' : undefined}
          />
          <Row label="Tax" value={plan ? formatRate(plan.taxRateBps) : '—'} muted dim />
          <Row
            label="Registration fee"
            value={
              plan && plan.registrationFeeMinor > 0
                ? formatMinor(plan.registrationFeeMinor, currency)
                : '—'
            }
            muted
            dim
          />
        </div>

        <Separator />

        {/* Final */}
        <div className="flex items-center justify-between bg-emerald-50 px-5 py-3 dark:bg-emerald-950/20">
          <span className="text-sm font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">
            Final Price
          </span>
          <span
            aria-live="polite"
            className="font-mono text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300"
          >
            {finalPrice !== null ? formatMinor(finalPrice, currency) : '—'}
          </span>
        </div>

        <Separator />

        {/* Billing date — one date drives Invoice finalized_at + Payment date */}
        <div className="flex flex-col gap-1.5 px-5 py-3">
          <Label className="text-xs">
            Billing date <span className="text-destructive">*</span>{' '}
            <span className="font-normal text-muted-foreground">· sets Invoice + Payment</span>
          </Label>
          <CatalogDatePicker
            value={billingDate}
            onChange={(v) => onBillingDateChange?.(v)}
            placeholder="Pick billing date"
            testId="billing-date-picker"
          />
          {!billingValid ? (
            <p className="text-[11px] text-destructive" role="alert">
              Enter a valid billing date
            </p>
          ) : (
            cautions.map((c) => (
              <p key={c.code} className="text-[11px] text-amber-600">
                {c.message}
                {c.source ? (
                  <span className="block text-muted-foreground">{c.source}</span>
                ) : null}
              </p>
            ))
          )}
        </div>

        <Separator />

        {/* Paid Amount — editable inside summary */}
        <div className="flex flex-col gap-3 px-5 py-3">
          <div className="grid gap-1.5">
            <Label htmlFor="summary-paid" className="text-xs">
              Paid Amount <span className="text-destructive">*</span>
              {maxPayment !== null ? (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · max {formatMinor(maxPayment, currency)}
                </span>
              ) : null}
            </Label>
            <InputGroup>
              <InputGroupAddon align="start" className="pointer-events-none">
                <IndianRupee className="size-3.5" />
              </InputGroupAddon>
              <Input
                id="summary-paid"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 4000"
                value={paidInput}
                onChange={(e) => onPaidChange?.(sanitizeMoneyInput(e.target.value))}
                className="pl-9 font-mono tabular-nums"
              />
            </InputGroup>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="summary-method" className="text-xs">
              Payment Type <span className="text-destructive">*</span>
            </Label>
            <Select value={paymentMethod ?? ''} onValueChange={(v) => onPaymentMethodChange?.(v)}>
              <SelectTrigger id="summary-method">
                <div className="flex items-center gap-2">
                  <Wallet className="size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Choose method" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {paymentMethod === 'CHEQUE' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="summary-cheque" className="text-xs">
                Cheque number <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="summary-cheque"
                type="text"
                maxLength={200}
                placeholder="e.g. 123456"
                value={chequeNumber}
                onChange={(e) => onChequeNumberChange?.(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
          ) : null}
        </div>

        <Separator />

        {/* Emphasis */}
        <div className="px-5 py-3">
          {finalPrice !== null && paidAmount !== null ? (
            exceedsMax ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-center text-base font-bold text-destructive shadow-sm">
                <AlertCircle className="size-5 shrink-0" />
                Exceeds max {formatMinor(maxPayment!, currency)}
              </div>
            ) : amountDue !== null && amountDue > 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-center text-base font-bold text-amber-700 shadow-sm dark:border-amber-900/30 dark:bg-amber-950/30 dark:text-amber-400">
                <HandCoins className="size-5 shrink-0" />
                Amount due {formatMinor(amountDue, currency)}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center text-sm font-semibold text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/30 dark:text-emerald-400">
                Paid in full ✓
              </div>
            )
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-center text-xs text-muted-foreground">
              <AlertCircle className="size-3.5 shrink-0" />
              Amount due / change appears after payment
            </div>
          )}
        </div>

        {/* Live region for screen readers */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Order summary — {finalPrice !== null ? `final ${finalPrice}` : 'no final'}{' '}
          {paidAmount !== null ? `paid ${paidAmount}` : ''}
        </p>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  muted,
  dim,
  valueClass
}: {
  label: string
  value: string
  muted?: boolean
  dim?: boolean
  valueClass?: string
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span
        className={
          muted ? (dim ? 'text-xs text-muted-foreground/60' : 'text-muted-foreground') : ''
        }
      >
        {label}
      </span>
      <span className={['font-mono tabular-nums', valueClass ?? ''].filter(Boolean).join(' ')}>
        {value}
      </span>
    </div>
  )
}
