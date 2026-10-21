import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  CalendarDays,
  IndianRupee,
  Package,
  Percent,
  Plus,
  RotateCcw,
  Sparkles,
  Users,
  X
} from 'lucide-react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { CatalogDatePicker } from '@/features/catalog/components/catalog-date-picker'
import { PageHeader } from '@/components/page-header'
import { useSession } from '@/context/session-context'
import { Badge } from '@/components/ui/badge'
import { SaleSectionCard } from './components/sale-section-card'
import { OrderSummary } from './components/order-summary'
import { LeadPicker } from '@/features/leads/components/lead-picker'
import { NewLeadDialog } from '@/features/leads/components/new-lead-dialog'
import { PlanPicker } from './components/plan-picker'
import { OfferPicker } from './components/offer-picker'
import { PlanFormDialog } from '@/features/catalog/components/plan-form-dialog'
import { OfferFormDialog } from '@/features/catalog/components/offer-form-dialog'
import { useLead } from '@/features/leads/queries'
import { usePlans } from '@/features/catalog/queries'
import { displayPhone } from '@/features/leads/format'
import { useSellMembership } from './queries'
import type { SellMembershipInput } from '../../../../../shared/contracts/membership-sale'
import { pdfApi } from '@/features/pdf/api'
import {
  parseToMinor,
  formatMinor,
  formatRate,
  minorToMajor,
  sanitizeMoneyInput
} from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { Plan, Offer } from '@/features/catalog/types'

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

export function MembershipSalePage(): React.JSX.Element {
  const session = useSession()
  const navigate = useNavigate()
  const currency = useCurrency()
  const [showNewLead, setShowNewLead] = useState(false)
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [showNewOffer, setShowNewOffer] = useState(false)
  const [dateLinked, setDateLinked] = useState(true)

  const { data: plansList = [] } = usePlans()

  const sellMutation = useSellMembership()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      leadId: null as number | null,
      planId: null as number | null,
      offerId: null as number | null,
      joiningDate: todayISO(),
      startDate: todayISO(),
      endDate: todayISO(),
      billingDate: todayISO(),
      baseInput: '',
      discountType: 'NONE' as 'NONE' | Offer['discountType'],
      discountValue: '',
      paidInput: '',
      paymentMethod: '' as string,
      chequeNumber: '' as string
    },
    onSubmit: async ({ value }) => {
      setServerError(null)
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
        const res = await sellMutation.mutateAsync({
          leadId: value.leadId!,
          planId: value.planId!,
          offerId: value.offerId,
          joiningDate: value.joiningDate,
          startDate: value.startDate,
          endDate: value.endDate,
          issueDate: value.billingDate,
          basePriceMinor: baseMinor,
          discountType: value.discountType as SellMembershipInput['discountType'],
          discountValueMinor,
          paidAmountMinor: paidMinor,
          paymentMethod: value.paymentMethod as SellMembershipInput['paymentMethod'],
          reference: value.paymentMethod === 'CHEQUE' ? value.chequeNumber.trim() || null : null,
          transactionId: crypto.randomUUID()
        })
        // Navigate to invoice detail page
        navigate(`/invoices/${res.invoiceId}`)
        // Generate PDFs in background
        pdfApi.exportInvoice(res.invoiceId, 'preview').catch(() => {})
        if (res.paymentId > 0) {
          pdfApi.exportReceipt(res.paymentId, 'preview').catch(() => {})
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Sale failed'
        setServerError(msg)
      }
    }
  })

  // Derived lookups via store subscriptions
  const leadId = useStore(form.store, (s) => s.values.leadId)
  const planId = useStore(form.store, (s) => s.values.planId)
  const offerId = useStore(form.store, (s) => s.values.offerId)
  const startDate = useStore(form.store, (s) => s.values.startDate)
  const joiningDate = useStore(form.store, (s) => s.values.joiningDate)
  const endDate = useStore(form.store, (s) => s.values.endDate)
  const billingDate = useStore(form.store, (s) => s.values.billingDate)
  const baseInput = useStore(form.store, (s) => s.values.baseInput)
  const discountType = useStore(form.store, (s) => s.values.discountType)
  const discountValue = useStore(form.store, (s) => s.values.discountValue)
  const paidInput = useStore(form.store, (s) => s.values.paidInput)
  const paymentMethod = useStore(form.store, (s) => s.values.paymentMethod)
  const chequeNumber = useStore(form.store, (s) => s.values.chequeNumber)

  const { data: leadDetail } = useLead(leadId ?? undefined)
  const selectedPlan = plansList.find((p) => p.id === planId) ?? null
  // For offer lookup, fetch from useOffers? Use plansList's offers? Use a separate hook
  // Quick: derive via OfferPicker's internal list would be duplicated, so fetch here via useOffers
  // To avoid extra query, offer object is kept via onChange handler below storing it in form meta? Instead track offer object separately:
  // For prototype keep a local offer object synced via onChange
  const [offerObj, setOfferObj] = useState<Offer | null>(null)
  const displayBase = baseInput === '' ? null : (parseToMinor(baseInput, currency) ?? 0)
  const isDirty =
    selectedPlan !== null && displayBase !== null && displayBase !== selectedPlan.basePriceMinor

  const manualDiscount = (() => {
    if (
      displayBase === null ||
      !discountType ||
      (discountType as string) === 'NONE' ||
      discountValue === ''
    )
      return 0
    switch (discountType as string) {
      case 'PERCENTAGE': {
        const v = Number(discountValue.replace(/,/g, ''))
        if (Number.isNaN(v)) return 0
        return Math.round((displayBase * v) / 100)
      }
      case 'FIXED_AMOUNT': {
        const v = parseToMinor(discountValue, currency) ?? 0
        return Math.min(v, displayBase)
      }
      case 'OVERRIDE_PRICE': {
        const v = parseToMinor(discountValue, currency) ?? 0
        return Math.max(0, displayBase - v)
      }
      case 'FREE_PERIOD':
        return 0
      case 'NONE':
        return 0
      default:
        return 0
    }
  })()
  const discountAmount = manualDiscount
  const finalPrice = displayBase !== null ? Math.max(0, displayBase - discountAmount) : null
  const maxPayment =
    finalPrice !== null
      ? finalPrice + Math.round((finalPrice * (selectedPlan?.taxRateBps ?? 0)) / 10000)
      : null
  const paidAmount = paidInput === '' ? null : (parseToMinor(paidInput, currency) ?? 0)
  const paidValid = paidAmount === null || paidAmount >= 0
  const paidOverMax = paidAmount !== null && maxPayment !== null && paidAmount > maxPayment
  const billingValid = /^\d{4}-\d{2}-\d{2}$/.test(billingDate)

  // Use leadDetail as effective lead (simplified, no selectedLead cache needed because leadId now drives lookup)
  const effectiveLead = leadDetail ?? null

  return (
    <div className="flex w-full flex-col gap-0">
      <style>{`@keyframes gradient{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}} .animate-gradient{animation:gradient 3s ease infinite}`}</style>
      <div className="px-6 pb-2 pt-4">
        <PageHeader
          title="Membership Sale"
          description={`${session.organizationName} · create membership, invoice and payment in one sale`}
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate('/memberships')}>
              <ArrowLeft className="size-4" />
              View memberships
            </Button>
          }
        />
      </div>

      {serverError ? (
        <div
          role="alert"
          className="mx-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-6 px-6 pb-6 pt-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <SaleSectionCard
            id="lead"
            step={1}
            title="Select Lead / Customer"
            description="Pick existing or create new"
            required
            icon={<Users className="size-3.5" />}
          >
            <div className="flex flex-col gap-3">
              <form.Field name="leadId">
                {(field) => (
                  <LeadPicker
                    value={field.state.value ?? 0}
                    onChange={(lead) => field.handleChange(lead.id)}
                    excludeBlacklisted
                    invalid={false}
                  />
                )}
              </form.Field>
              {!leadId ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setShowNewLead(true)}
                  >
                    <Plus className="size-3.5" />
                    Create new lead
                  </Button>
                </div>
              ) : null}
              {effectiveLead ? (
                <div className="rounded-none bg-gradient-to-r from-cyan-400 via-sky-500 to-cyan-600 p-[1.5px] shadow-sm animate-gradient bg-[length:200%_200%]">
                  <div className="flex items-center gap-3 rounded-none bg-white px-3 py-2.5 text-left">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {effectiveLead.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{effectiveLead.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {displayPhone(effectiveLead.phone)}{' '}
                        {effectiveLead.email ? `· ${effectiveLead.email}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => form.setFieldValue('leadId', null)}
                      aria-label="Remove lead selection"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  No member selected — search or create one above
                </p>
              )}
              {effectiveLead ? (
                <span className="text-xs text-muted-foreground">
                  Stage:{' '}
                  <Badge variant="outline" className="ml-1 text-[11px]">
                    {effectiveLead.stage}
                  </Badge>
                </span>
              ) : null}
            </div>
          </SaleSectionCard>

          <div className="grid gap-4 sm:grid-cols-2">
            <SaleSectionCard
              id="plan"
              step={2}
              title="Select Plan"
              description="Sets price & duration"
              required
              icon={<Package className="size-3.5" />}
            >
              <div className="flex flex-col gap-3">
                <form.Field name="planId">
                  {(field) => (
                    <PlanPicker
                      value={field.state.value}
                      onChange={(p) => {
                        field.handleChange(p ? p.id : null)
                        // sync base price without useEffect
                        form.setFieldValue(
                          'baseInput',
                          p ? minorToMajor(p.basePriceMinor, currency) : ''
                        )
                        // auto-update end date if linked
                        if (p) {
                          const newEnd = addDays(
                            form.getFieldValue('startDate'),
                            daysForDuration(p.duration) - 1
                          )
                          form.setFieldValue('endDate', newEnd)
                          setDateLinked(true)
                        }
                        // clear incompatible offer
                        const currentOfferId = form.getFieldValue('offerId')
                        if (currentOfferId !== null && p) {
                          const currentOffer = offerObj
                          if (
                            currentOffer &&
                            currentOffer.applicablePlanIds.length > 0 &&
                            !currentOffer.applicablePlanIds.includes(p.id)
                          ) {
                            form.setFieldValue('offerId', null)
                            setOfferObj(null)
                            form.setFieldValue('discountType', 'NONE')
                            form.setFieldValue('discountValue', '')
                          }
                        }
                      }}
                    />
                  )}
                </form.Field>
                {!planId ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setShowNewPlan(true)}
                    >
                      <Plus className="size-3.5" />
                      Create plan
                    </Button>
                  </div>
                ) : null}
                {selectedPlan ? (
                  <div className="rounded-none bg-gradient-to-r from-teal-400 via-emerald-500 to-teal-600 p-[1.5px] shadow-sm animate-gradient bg-[length:200%_200%]">
                    <div className="flex items-center gap-2 rounded-none bg-white px-3 py-2.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">
                            {formatMinor(selectedPlan.basePriceMinor, currency)}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span>{selectedPlan.duration}</span>
                          <span className="text-muted-foreground">·</span>
                          <span>Tax {formatRate(selectedPlan.taxRateBps)}</span>
                          {selectedPlan.registrationFeeMinor > 0 ? (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span>
                                Reg {formatMinor(selectedPlan.registrationFeeMinor, currency)}
                              </span>
                            </>
                          ) : null}
                        </div>
                        {isDirty && displayBase !== null ? (
                          <p className="mt-1 text-[11px] text-amber-600">
                            Edited — differs from plan ·{' '}
                            {formatMinor(selectedPlan.basePriceMinor, currency)} →{' '}
                            {formatMinor(displayBase, currency)}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          form.setFieldValue('planId', null)
                          form.setFieldValue('baseInput', '')
                        }}
                        aria-label="Remove plan selection"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">No plan selected</p>
                )}
                {isDirty ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs self-start"
                    onClick={() => {
                      if (selectedPlan) {
                        form.setFieldValue(
                          'baseInput',
                          minorToMajor(selectedPlan.basePriceMinor, currency)
                        )
                      }
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                    Reset to plan
                  </Button>
                ) : null}
              </div>
            </SaleSectionCard>

            <SaleSectionCard
              id="offer"
              step={3}
              title="Select Offer"
              description="Optional discount"
              icon={<BadgePercent className="size-3.5" />}
            >
              <div className="flex flex-col gap-3">
                <form.Field name="offerId">
                  {(field) => (
                    <OfferPicker
                      value={field.state.value}
                      onChange={(o) => {
                        field.handleChange(o ? o.id : null)
                        setOfferObj(o)
                        if (o) {
                          form.setFieldValue('discountType', o.discountType)
                          form.setFieldValue('discountValue', String(o.value))
                        } else {
                          form.setFieldValue('discountType', 'NONE')
                          form.setFieldValue('discountValue', '')
                        }
                      }}
                      planId={planId ?? null}
                    />
                  )}
                </form.Field>
                {!offerId ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setShowNewOffer(true)}
                    >
                      <Plus className="size-3.5" />
                      Create offer
                    </Button>
                  </div>
                ) : null}
                {offerObj ? (
                  <div className="rounded-none bg-gradient-to-r from-fuchsia-500 via-pink-500 to-fuchsia-600 p-[1.5px] shadow-sm animate-gradient bg-[length:200%_200%]">
                    <div className="flex items-center gap-2 rounded-none bg-white px-3 py-2.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{offerObj.name}</span>
                          <span className="text-muted-foreground">·</span>
                          <span>
                            {offerObj.discountType} · {offerObj.value}
                            {offerObj.discountType === 'PERCENTAGE'
                              ? '%'
                              : offerObj.discountType === 'FREE_PERIOD'
                                ? ' months'
                                : ''}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {offerObj.applicablePlanIds.length === 0
                            ? 'Applies to all plans'
                            : offerObj.applicablePlanIds.includes(planId ?? -1)
                              ? 'Applies to selected plan'
                              : 'Not applicable to selected plan'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          form.setFieldValue('offerId', null)
                          setOfferObj(null)
                          form.setFieldValue('discountType', 'NONE')
                          form.setFieldValue('discountValue', '')
                        }}
                        aria-label="Remove offer selection"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    No offer selected — optional
                  </p>
                )}
              </div>
            </SaleSectionCard>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SaleSectionCard
              id="dates"
              step={4}
              title="Membership Duration"
              description="Joining, start & end dates"
              icon={<CalendarDays className="size-3.5" />}
            >
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
                        triggerClassName="border-amber-300 bg-amber-50/60 hover:bg-amber-50 text-amber-700 hover:text-amber-800 [&_svg]:text-amber-500 data-[state=open]:bg-amber-50"
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
                            // auto-update end if linked and plan exists
                            const pid = form.getFieldValue('planId')
                            const p = plansList.find((x) => x.id === pid)
                            if (p && dateLinked) {
                              form.setFieldValue(
                                'endDate',
                                addDays(v, daysForDuration(p.duration) - 1)
                              )
                            }
                          }}
                          placeholder="Pick start date"
                          triggerClassName="border-blue-300 bg-blue-50/60 hover:bg-blue-50 text-blue-700 hover:text-blue-800 [&_svg]:text-blue-500 data-[state=open]:bg-blue-50"
                        />
                      )}
                    </form.Field>
                  </div>
                  <div className="flex h-9 shrink-0 items-center justify-center pb-1">
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </div>
                  <div className="grid flex-1 gap-1.5">
                    <Label className="text-xs">
                      End date{' '}
                      {dateLinked && planId ? (
                        <span className="font-normal text-muted-foreground">· auto</span>
                      ) : null}
                    </Label>
                    <form.Field name="endDate">
                      {(field) => (
                        <CatalogDatePicker
                          value={field.state.value}
                          onChange={(v) => {
                            field.handleChange(v)
                            setDateLinked(false)
                          }}
                          placeholder="Pick end date"
                          triggerClassName="border-purple-300 bg-purple-50/60 hover:bg-purple-50 text-purple-700 hover:text-purple-800 [&_svg]:text-purple-500 data-[state=open]:bg-purple-50"
                        />
                      )}
                    </form.Field>
                  </div>
                </div>
              </div>
              {startDate && endDate && endDate < startDate ? (
                <p className="mt-2 text-[11px] text-destructive">
                  End date cannot be before start date
                </p>
              ) : null}
              {planId && startDate && endDate
                ? (() => {
                    const p = plansList.find((x) => x.id === planId)
                    if (!p) return null
                    const days = daysForDuration(p.duration)
                    const minEnd = addDays(startDate, days - 1)
                    if (endDate < minEnd) {
                      return (
                        <p className="mt-1 text-[11px] text-amber-600">
                          End violates {p.duration} — should be at least {minEnd} ({days} days)
                        </p>
                      )
                    }
                    return null
                  })()
                : null}
            </SaleSectionCard>

            <SaleSectionCard
              id="pricing"
              step={5}
              title="Pricing"
              description="Rupees, 2 decimals"
              icon={<IndianRupee className="size-3.5" />}
            >
              <div className="flex flex-col gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="sale-base" className="text-xs">
                    Base Price <span className="text-destructive">*</span>
                  </Label>
                  <form.Field name="baseInput">
                    {(field) => {
                      return (
                        <InputGroup>
                          <InputGroupAddon align="start" className="pointer-events-none">
                            <IndianRupee className="size-3.5" />
                          </InputGroupAddon>
                          <Input
                            id="sale-base"
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 5000"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(sanitizeMoneyInput(e.target.value))}
                            className="pl-9 font-mono tabular-nums"
                          />
                        </InputGroup>
                      )
                    }}
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
                            <SelectItem value="FREE_PERIOD">Free period</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>
                  </div>
                  <div className="grid flex-1 gap-1.5">
                    <Label className="text-xs">Discount value</Label>
                    <form.Field name="discountValue">
                      {(field) => {
                        const DiscountIcon =
                          discountType === 'PERCENTAGE'
                            ? Percent
                            : discountType === 'FIXED_AMOUNT' || discountType === 'OVERRIDE_PRICE'
                              ? IndianRupee
                              : BadgePercent
                        return (
                          <InputGroup>
                            <InputGroupAddon align="start" className="pointer-events-none">
                              <DiscountIcon className="size-3.5" />
                            </InputGroupAddon>
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder={
                                discountType === 'PERCENTAGE'
                                  ? 'e.g. 20'
                                  : discountType === 'FREE_PERIOD'
                                    ? 'e.g. 1'
                                    : 'e.g. 500'
                              }
                              value={field.state.value}
                              onChange={(e) =>
                                field.handleChange(sanitizeMoneyInput(e.target.value))
                              }
                              className="pl-9 font-mono tabular-nums"
                            />
                          </InputGroup>
                        )
                      }}
                    </form.Field>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Final Price</Label>
                  <div className="flex h-9 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-mono font-bold tabular-nums text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/30 dark:text-emerald-300">
                    {finalPrice !== null ? formatMinor(finalPrice, currency) : '—'}
                  </div>
                  {discountAmount > 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Discount amount: -{formatMinor(discountAmount, currency)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">No discount applied</p>
                  )}
                </div>
                {selectedPlan && selectedPlan.registrationFeeMinor > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    + Registration {formatMinor(selectedPlan.registrationFeeMinor, currency)}{' '}
                    {selectedPlan.taxRateBps ? `· Tax ${formatRate(selectedPlan.taxRateBps)}` : ''}
                  </p>
                ) : selectedPlan && selectedPlan.taxRateBps ? (
                  <p className="text-[11px] text-muted-foreground">
                    Tax {formatRate(selectedPlan.taxRateBps)} on base
                  </p>
                ) : null}
                {discountAmount > 0 && displayBase !== null && discountAmount > displayBase ? (
                  <p className="text-[11px] text-destructive">Discount exceeds base price</p>
                ) : null}
                {finalPrice === 0 && displayBase !== null ? (
                  <p className="text-[11px] text-amber-600">
                    Free trial — final price is 0. You’ll be asked to confirm trial days on sell.
                  </p>
                ) : null}
              </div>
            </SaleSectionCard>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-col gap-4 lg:sticky lg:top-[72px]">
            <OrderSummary
              plan={selectedPlan}
              basePrice={displayBase}
              discountType={discountType}
              discountValue={discountValue}
              discountAmount={discountAmount}
              finalPrice={finalPrice}
              maxPayment={maxPayment}
              paidInput={paidInput}
              paidAmount={paidAmount}
              paymentMethod={paymentMethod || ''}
              onPaidChange={(v) => form.setFieldValue('paidInput', v)}
              onPaymentMethodChange={(v) => form.setFieldValue('paymentMethod', v)}
              chequeNumber={chequeNumber}
              onChequeNumberChange={(v) => form.setFieldValue('chequeNumber', v)}
              billingDate={billingDate}
              todayIso={todayISO()}
              onBillingDateChange={(v) => form.setFieldValue('billingDate', v)}
              isDirty={isDirty}
              leadName={effectiveLead?.name ?? null}
            />
            <form.Subscribe
              selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button
                  type="button"
                  disabled={
                    !canSubmit ||
                    !leadId ||
                    !planId ||
                    !paymentMethod ||
                    !paidValid ||
                    paidOverMax ||
                    !billingValid ||
                    paidInput === '' ||
                    isSubmitting
                  }
                  onClick={() => form.handleSubmit()}
                  size="sm"
                  className="w-full gap-1.5"
                >
                  <Sparkles className="size-4" />
                  Sell &amp; invoice
                </Button>
              )}
            </form.Subscribe>
            <p className="px-1 text-center text-[11px] leading-relaxed text-muted-foreground">
              {leadId && planId
                ? 'Ready to sell — validation arrives in phase 07'
                : 'Pick a member and plan to enable the sale'}
            </p>
          </div>
        </div>
      </div>

      {showNewLead ? (
        <NewLeadDialog
          open={showNewLead}
          onOpenChange={setShowNewLead}
          onCreated={(created) => {
            form.setFieldValue('leadId', created.leadId)
          }}
        />
      ) : null}
      {showNewPlan ? (
        <PlanFormDialog
          key="sale-new-plan"
          plan={null}
          open={showNewPlan}
          onOpenChange={setShowNewPlan}
          onCreated={(created) => {
            form.setFieldValue('planId', created.id)
            form.setFieldValue('baseInput', minorToMajor(created.basePriceMinor, currency))
            form.setFieldValue(
              'endDate',
              addDays(form.getFieldValue('startDate'), daysForDuration(created.duration) - 1)
            )
            setDateLinked(true)
          }}
        />
      ) : null}
      {showNewOffer ? (
        <OfferFormDialog
          key="sale-new-offer"
          offer={null}
          plans={plansList}
          open={showNewOffer}
          onOpenChange={setShowNewOffer}
          onCreated={(created) => {
            form.setFieldValue('offerId', created.id)
            setOfferObj(created)
            form.setFieldValue('discountType', created.discountType)
            form.setFieldValue('discountValue', String(created.value))
          }}
        />
      ) : null}
    </div>
  )
}
