import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgePercent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  formatMinor,
  minorToMajor,
  parseToMinor,
  sanitizeMoneyInput,
  type CurrencyCode
} from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { DISCOUNT_TYPES, discountTypeLabel, FREE_PERIOD_MONTHS } from '../constants'
import { computeDiscountLine, validateOfferInput } from '../pricing'
import { codeFromName } from '../mappers'
import { useCreateOffer, useUpdateOffer } from '../queries'
import type { DiscountType, Offer, Plan } from '../types'
import { CatalogDatePicker } from './catalog-date-picker'

const VALUE_LABEL: Record<DiscountType, string> = {
  PERCENTAGE: 'Discount %',
  FIXED_AMOUNT: 'Discount amount',
  OVERRIDE_PRICE: 'Flat price',
  FREE_PERIOD: 'Free months'
}

const VALUE_PLACEHOLDER: Record<DiscountType, string> = {
  PERCENTAGE: 'e.g. 20',
  FIXED_AMOUNT: 'e.g. 500',
  OVERRIDE_PRICE: 'e.g. 17500',
  FREE_PERIOD: 'e.g. 1'
}

/** Render an offer's stored `value` as an editable major-unit string. */
function valueFromMinor(discountType: DiscountType, value: number, currency: CurrencyCode): string {
  if (discountType === 'PERCENTAGE' || discountType === 'FREE_PERIOD') return String(value)
  return minorToMajor(value, currency)
}

/** Parse the editable value into minor (or whole for percent/months). */
function valueToMinor(discountType: DiscountType, value: string, currency: CurrencyCode): number {
  const n = Number(value)
  if (Number.isNaN(n)) return 0
  if (discountType === 'PERCENTAGE' || discountType === 'FREE_PERIOD') return Math.round(n)
  return parseToMinor(value, currency) ?? 0
}

/**
 * Offer editor — create or edit a discount rule. The live preview computes the
 * discount math against each applicable plan (or every plan when none is
 * selected), so staff see the exact sale-time price before saving.
 */
export function OfferFormDialog({
  offer,
  plans,
  open,
  onOpenChange,
  onCreated
}: {
  offer: Offer | null
  plans: Plan[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (offer: Offer) => void
}): React.JSX.Element {
  const isEdit = offer !== null
  const create = useCreateOffer()
  const update = useUpdateOffer()
  const currency = useCurrency()

  const [name, setName] = useState(offer?.name ?? '')
  const [description, setDescription] = useState(offer?.description ?? '')
  const [discountType, setDiscountType] = useState<DiscountType>(
    offer?.discountType ?? 'PERCENTAGE'
  )
  const [value, setValue] = useState(
    offer ? valueFromMinor(offer.discountType, offer.value, currency) : ''
  )
  const [minPurchase, setMinPurchase] = useState(
    offer ? minorToMajor(offer.minPurchaseMinor, currency) : '0'
  )
  const [maxUses, setMaxUses] = useState(offer ? String(offer.maxUses || '') : '100')
  const [applicablePlanIds, setApplicablePlanIds] = useState<number[]>(
    offer?.applicablePlanIds ?? []
  )
  const [startDate, setStartDate] = useState(offer?.startDate ?? '')
  const [endDate, setEndDate] = useState(offer?.endDate ?? '')
  const [eligibility, setEligibility] = useState(offer?.eligibility ?? '')
  const [isActive, setIsActive] = useState(offer?.isActive ?? true)

  const error = useMemo(
    () =>
      validateOfferInput({
        name,
        discountType,
        value: valueToMinor(discountType, value, currency),
        minPurchase: parseToMinor(minPurchase, currency) ?? 0,
        maxUses: Number(maxUses || 0),
        startDate,
        endDate: endDate || null
      }),
    [name, discountType, value, minPurchase, maxUses, startDate, endDate, currency]
  )

  const canSubmit = error === null

  const minPurchaseMinor = parseToMinor(minPurchase, currency) ?? 0

  const qualifyingPlans = useMemo(
    () => plans.filter((p) => p.basePriceMinor >= minPurchaseMinor),
    [plans, minPurchaseMinor]
  )

  // Auto-deselect plans that fall below the minimum purchase threshold.
  const prevMinPurchaseRef = useRef(minPurchaseMinor)
  useEffect(() => {
    if (minPurchaseMinor > prevMinPurchaseRef.current) {
      setApplicablePlanIds((current) =>
        current.filter((id) => {
          const plan = plans.find((p) => p.id === id)
          return plan && plan.basePriceMinor >= minPurchaseMinor
        })
      )
    }
    prevMinPurchaseRef.current = minPurchaseMinor
  }, [minPurchaseMinor, plans])

  function togglePlan(planId: number): void {
    setApplicablePlanIds((current) =>
      current.includes(planId) ? current.filter((id) => id !== planId) : [...current, planId]
    )
  }

  const previewPlans = useMemo(() => {
    const pool = applicablePlanIds.length
      ? qualifyingPlans.filter((p) => applicablePlanIds.includes(p.id))
      : qualifyingPlans
    return pool.slice(0, 4)
  }, [applicablePlanIds, qualifyingPlans])

  const previewCount = applicablePlanIds.length
    ? qualifyingPlans.filter((p) => applicablePlanIds.includes(p.id)).length
    : qualifyingPlans.length
  const freePeriod = discountType === 'FREE_PERIOD' && Number(value) >= 1

  function submit(): void {
    const input = {
      name: name.trim(),
      description: description.trim(),
      discountType,
      value: valueToMinor(discountType, value, currency),
      applicablePlanIds,
      minPurchaseMinor: parseToMinor(minPurchase, currency) ?? 0,
      maxUses: Number(maxUses || 0),
      startDate,
      endDate: endDate || null,
      isActive,
      eligibility: eligibility.trim()
    }
    if (isEdit && offer) {
      update.mutate({ id: offer.id, input }, { onSuccess: () => onOpenChange(false) })
    } else {
      create.mutate(input, {
        onSuccess: (created) => {
          onCreated?.(created)
          onOpenChange(false)
        }
      })
    }
  }

  const isPending = isEdit ? update.isPending : create.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgePercent className="size-4 text-primary" />
            {isEdit ? 'Edit offer' : 'New offer'}
          </DialogTitle>
          <DialogDescription>
            The discount is computed here and snapshotted onto the invoice at sale time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="of-name">
                Offer name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="of-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. New Year Offer"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="of-code">Code</Label>
              <Input
                id="of-code"
                value={codeFromName(name)}
                readOnly
                className="font-mono tabular-nums text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">Auto-generated from the name.</p>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="of-description">Description</Label>
            <Textarea
              id="of-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="When should staff apply this offer?"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="of-type">Discount type</Label>
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as DiscountType)}
              >
                <SelectTrigger id="of-type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TYPES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="of-value">
                {VALUE_LABEL[discountType]} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="of-value"
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(sanitizeMoneyInput(e.target.value))}
                placeholder={VALUE_PLACEHOLDER[discountType]}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          {discountType === 'FREE_PERIOD' ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Quick:</span>
              {FREE_PERIOD_MONTHS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setValue(String(m))}
                >
                  {m} month{m === 1 ? '' : 's'}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="of-min">Minimum purchase</Label>
              <Input
                id="of-min"
                type="text"
                inputMode="decimal"
                value={minPurchase}
                onChange={(e) => setMinPurchase(sanitizeMoneyInput(e.target.value))}
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Only applies to plans costing at least this amount. Set to 0 for no minimum.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="of-max">Usage limit</Label>
              <Input
                id="of-max"
                type="number"
                min={0}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-muted-foreground">Leave blank for unlimited uses.</p>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Applies to</Label>
            <div className="max-h-36 overflow-y-auto rounded-lg border bg-muted/30 p-2">
              {qualifyingPlans.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  {plans.length === 0
                    ? 'No plans in the catalog yet.'
                    : 'No plans meet the minimum purchase amount.'}
                </p>
              ) : (
                <div className="grid gap-1">
                  {qualifyingPlans.map((plan) => {
                    const checked = applicablePlanIds.includes(plan.id)
                    return (
                      <label
                        key={plan.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        <Checkbox checked={checked} onCheckedChange={() => togglePlan(plan.id)} />
                        <span className="min-w-0 flex-1 truncate text-sm">{plan.name}</span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {formatMinor(plan.basePriceMinor, currency)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              No plans selected means the offer applies to every qualifying plan.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="of-start">Starts</Label>
              <CatalogDatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="Pick start date"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="of-end">Ends</Label>
              <CatalogDatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder="Open-ended"
                clearable
              />
              <p className="text-xs text-muted-foreground">Leave empty for an open-ended offer.</p>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="of-eligibility">Eligibility</Label>
            <Input
              id="of-eligibility"
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
              placeholder="e.g. New joiners and renewals"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Pause to hide it from sale time without deleting.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Pricing preview · {discountTypeLabel(discountType)}
            </p>
            {Number.isFinite(Number(value)) && Number(value) > 0 ? (
              <div className="grid gap-1.5">
                {previewPlans.map((plan) => {
                  const line = computeDiscountLine(
                    {
                      id: 0,
                      name,
                      code: codeFromName(name),
                      description,
                      discountType,
                      value: valueToMinor(discountType, value, currency),
                      applicablePlanIds,
                      minPurchaseMinor: parseToMinor(minPurchase, currency) ?? 0,
                      maxUses: Number(maxUses || 0),
                      usedCount: 0,
                      startDate,
                      endDate: endDate || null,
                      isActive,
                      eligibility,
                      createdAt: ''
                    },
                    plan.basePriceMinor,
                    currency
                  )
                  return (
                    <div key={plan.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-muted-foreground">{plan.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums">
                        {!freePeriod ? (
                          <span className="text-muted-foreground line-through">
                            {formatMinor(line.original, currency)}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'font-semibold',
                            freePeriod ? 'text-foreground' : 'text-success'
                          )}
                        >
                          {formatMinor(line.final, currency)}
                        </span>
                      </span>
                    </div>
                  )
                })}
                {previewCount > previewPlans.length ? (
                  <p className="text-xs text-muted-foreground">
                    +{previewCount - previewPlans.length} more plan
                    {previewCount - previewPlans.length === 1 ? '' : 's'}
                  </p>
                ) : null}
                {freePeriod ? (
                  <p className="text-xs text-muted-foreground">
                    The {Number(value)} month{Number(value) === 1 ? '' : 's'} of free time is
                    credited on the next billing cycle — this period is priced at base.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Enter a value to see the math.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          {error ? <p className="mr-auto self-center text-xs text-destructive">{error}</p> : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create offer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
