import { useMemo } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { ArrowRight, BadgePercent, IndianRupee, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { LoadingButton } from '@/components/ui/loading-button'
import { CatalogDatePicker } from '@/features/catalog/components/catalog-date-picker'
import { useAvailablePlans } from '@/features/catalog/queries'
import type { Plan } from '@/features/catalog/types'
import { PAYMENT_METHODS } from '@/features/finance/constants'
import { parseToMinor, formatMinor, minorToMajor, sanitizeMoneyInput } from '@/lib/money'
import { billingDateCautions } from '@/lib/billing-warnings'
import { useCurrency } from '@/hooks/use-currency'
import type { Membership } from '@/features/customers/types'
import { useRenewMembership } from '../mutations'
import type { RenewMembershipInput } from '../../../../../shared/contracts/membership-cancel-renew'

function daysForDuration(duration: Plan['duration']): number {
  switch (duration) {
    case 'MONTHLY':
      return 30
    case 'QUARTERLY':
      return 90
    case 'HALF_YEARLY':
      return 180
    case 'YEARLY':
      return 365
    default:
      return 30
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return formatISO(d)
}

function todayISO(): string {
  return formatISO(new Date())
}

/**
 * Renewal dialog for a membership. Re-issues the membership for the next period
 * via the `renewMembership` command, defaulting plan/dates from the current
 * membership so the front desk mostly confirms rather than re-enters. Mirrors
 * the membership sale form's pricing/date/payment fields.
 */
export function RenewMembershipDialog({
  membership,
  open,
  onOpenChange
}: {
  membership: Membership
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const currency = useCurrency()
  const { data: plans = [] } = useAvailablePlans()
  const renew = useRenewMembership()
  const currentPlanId = membership.planId ? Number(membership.planId) : undefined
  const defaultStart = addDays(membership.endDate, 1)
  const defaultPlan = plans.find((p) => p.id === currentPlanId)

  const form = useForm({
    defaultValues: {
      planId: currentPlanId ?? 0,
      joiningDate: membership.joiningDate ?? todayISO(),
      startDate: defaultStart,
      endDate: defaultPlan
        ? addDays(defaultStart, daysForDuration(defaultPlan.duration) - 1)
        : addDays(defaultStart, 29),
      baseInput: defaultPlan ? minorToMajor(defaultPlan.basePriceMinor, currency) : '',
      discountType: 'NONE' as RenewMembershipInput['discountType'],
      discountValue: '',
      paidInput: '',
      paymentMethod: '' as string,
      billingDate: todayISO()
    },
    onSubmit: async ({ value }) => {
      if (!value.planId) return
      const baseMinor = value.baseInput === '' ? 0 : (parseToMinor(value.baseInput, currency) ?? 0)
      let discountValueMinor: number | null = null
      if (value.discountType !== 'NONE') {
        const raw = value.discountValue.replace(/,/g, '')
        const n = Number(raw)
        if (value.discountType === 'PERCENTAGE') discountValueMinor = Math.round(n)
        else discountValueMinor = parseToMinor(raw, currency) ?? 0
      }
      const paidMinor = value.paidInput === '' ? 0 : (parseToMinor(value.paidInput, currency) ?? 0)
      try {
        await renew.mutateAsync({
          customerId: Number(membership.customerId),
          sourceMembershipId: Number(membership.id),
          planId: value.planId,
          offerId: null,
          joiningDate: value.joiningDate,
          startDate: value.startDate,
          endDate: value.endDate,
          issueDate: value.billingDate,
          basePriceMinor: baseMinor,
          discountType: value.discountType,
          discountValueMinor,
          paidAmountMinor: paidMinor,
          paymentMethod: value.paymentMethod as RenewMembershipInput['paymentMethod'],
          transactionId: crypto.randomUUID()
        })
        onOpenChange(false)
      } catch {
        // The mutation hook toasts the error.
      }
    }
  })

  const planId = useStore(form.store, (s) => s.values.planId)
  const joiningDate = useStore(form.store, (s) => s.values.joiningDate)
  const startDate = useStore(form.store, (s) => s.values.startDate)
  const endDate = useStore(form.store, (s) => s.values.endDate)
  const discountType = useStore(form.store, (s) => s.values.discountType)
  const baseInput = useStore(form.store, (s) => s.values.baseInput)
  const discountValue = useStore(form.store, (s) => s.values.discountValue)
  const paymentMethod = useStore(form.store, (s) => s.values.paymentMethod)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)

  const displayBase = baseInput === '' ? null : (parseToMinor(baseInput, currency) ?? 0)
  const discountAmount = useMemo(() => {
    if (displayBase === null) return 0
    if (discountType === 'PERCENTAGE') {
      const pct = Number(discountValue.replace(/,/g, ''))
      return Number.isFinite(pct) ? Math.round((displayBase * pct) / 100) : 0
    }
    if (discountType === 'FIXED_AMOUNT' || discountType === 'OVERRIDE_PRICE') {
      return discountValue === '' ? 0 : (parseToMinor(discountValue, currency) ?? 0)
    }
    return 0
  }, [displayBase, discountType, discountValue, currency])

  const finalPrice = displayBase === null ? null : Math.max(0, displayBase - discountAmount)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4 text-primary" />
            Renew membership
          </DialogTitle>
          <DialogDescription>
            Re-issue {membership.plan} for the next period, starting {defaultStart}.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs">Plan</Label>
              <form.Field name="planId">
                {(field) => (
                  <Select
                    value={field.state.value ? String(field.state.value) : ''}
                    onValueChange={(v) => {
                      const pid = v === '' ? 0 : Number(v)
                      field.handleChange(pid)
                      const plan = plans.find((p) => p.id === pid)
                      if (plan) {
                        form.setFieldValue('baseInput', minorToMajor(plan.basePriceMinor, currency))
                        form.setFieldValue(
                          'endDate',
                          addDays(form.getFieldValue('startDate'), daysForDuration(plan.duration) - 1)
                        )
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} · {formatMinor(p.basePriceMinor, currency)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </form.Field>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">
                  Joining date{' '}
                  {joiningDate === startDate ? (
                    <span className="font-normal text-muted-foreground">· same as start</span>
                  ) : null}
                </Label>
                <form.Field name="joiningDate">
                  {(field) => (
                    <CatalogDatePicker
                      value={field.state.value}
                      onChange={(v) => field.handleChange(v)}
                      placeholder="Pick joining date"
                    />
                  )}
                </form.Field>
              </div>
              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-1.5">
                  <Label className="text-xs">Start date</Label>
                  <form.Field name="startDate">
                    {(field) => (
                      <CatalogDatePicker
                        value={field.state.value}
                        onChange={(v) => {
                          field.handleChange(v)
                          const plan = plans.find((p) => p.id === planId)
                          if (plan) {
                            form.setFieldValue(
                              'endDate',
                              addDays(v, daysForDuration(plan.duration) - 1)
                            )
                          }
                        }}
                        placeholder="Pick start date"
                      />
                    )}
                  </form.Field>
                </div>
                <div className="flex h-9 shrink-0 items-center justify-center pb-1">
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
                <div className="grid flex-1 gap-1.5">
                  <Label className="text-xs">End date</Label>
                  <form.Field name="endDate">
                    {(field) => (
                      <CatalogDatePicker
                        value={field.state.value}
                        onChange={(v) => field.handleChange(v)}
                        placeholder="Pick end date"
                      />
                    )}
                  </form.Field>
                </div>
              </div>
            </div>
            {endDate < startDate ? (
              <p className="text-[11px] text-destructive">End date cannot be before start date</p>
            ) : null}

            <div className="grid gap-1.5">
              <Label className="text-xs">
                Billing date{' '}
                <span className="font-normal text-muted-foreground">· sets Invoice + Payment</span>
              </Label>
              <form.Field
                name="billingDate"
                validators={{
                  onChange: ({ value }) =>
                    /^\d{4}-\d{2}-\d{2}$/.test(value) ? undefined : 'Enter a valid billing date'
                }}
              >
                {(field) => (
                  <>
                    <CatalogDatePicker
                      value={field.state.value}
                      onChange={(v) => field.handleChange(v)}
                      placeholder="Pick billing date"
                      testId="renew-billing-date-picker"
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <p className="text-[11px] text-destructive" role="alert">
                        {field.state.meta.errors.join(', ')}
                      </p>
                    ) : (
                      billingDateCautions(field.state.value, todayISO()).map((c) => (
                        <p key={c.code} className="text-[11px] text-amber-600">
                          {c.message}
                          {c.source ? (
                            <span className="block text-muted-foreground">{c.source}</span>
                          ) : null}
                        </p>
                      ))
                    )}
                  </>
                )}
              </form.Field>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Base price</Label>
                <form.Field name="baseInput">
                  {(field) => (
                    <InputGroup>
                      <InputGroupAddon align="start" className="pointer-events-none">
                        <IndianRupee className="size-3.5" />
                      </InputGroupAddon>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(sanitizeMoneyInput(e.target.value))}
                        className="pl-9 font-mono tabular-nums"
                      />
                    </InputGroup>
                  )}
                </form.Field>
              </div>
              <div className="flex gap-3">
                <div className="grid flex-1 gap-1.5">
                  <Label className="text-xs">Discount type</Label>
                  <form.Field name="discountType">
                    {(field) => (
                      <Select
                        value={field.state.value}
                        onValueChange={(v) => field.handleChange(v as typeof field.state.value)}
                      >
                        <SelectTrigger>
                          <div className="flex items-center gap-2">
                            <BadgePercent className="size-3.5 text-muted-foreground" />
                            <SelectValue placeholder="Type" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">None</SelectItem>
                          <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                          <SelectItem value="FIXED_AMOUNT">Fixed amount</SelectItem>
                          <SelectItem value="OVERRIDE_PRICE">Override price</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </form.Field>
                </div>
                <div className="grid flex-1 gap-1.5">
                  <Label className="text-xs">Discount value</Label>
                  <form.Field name="discountValue">
                    {(field) => (
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder={discountType === 'PERCENTAGE' ? 'e.g. 20' : 'e.g. 500'}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(sanitizeMoneyInput(e.target.value))}
                        className="font-mono tabular-nums"
                      />
                    )}
                  </form.Field>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Final price</Label>
                <div className="flex h-9 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-mono font-bold tabular-nums text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {finalPrice !== null ? formatMinor(finalPrice, currency) : '—'}
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Paid amount</Label>
                <form.Field name="paidInput">
                  {(field) => (
                    <InputGroup>
                      <InputGroupAddon align="start" className="pointer-events-none">
                        <IndianRupee className="size-3.5" />
                      </InputGroupAddon>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(sanitizeMoneyInput(e.target.value))}
                        className="pl-9 font-mono tabular-nums"
                      />
                    </InputGroup>
                  )}
                </form.Field>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Payment method</Label>
                <form.Field name="paymentMethod">
                  {(field) => (
                    <Select
                      value={field.state.value}
                      onValueChange={(v) => field.handleChange(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
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
                </form.Field>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={renew.isPending}
              disabled={!canSubmit || !planId || !paymentMethod}
              loadingLabel="Renewing…"
            >
              Renew membership
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
