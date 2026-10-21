import { useState } from 'react'
import { Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { ACCESS_OPTIONS, BILLING_FREQUENCIES, DURATIONS } from '../constants'
import { useCreatePlan, useUpdatePlan } from '../queries'
import { minorToMajor, parseToMinor, percentToBps, sanitizeMoneyInput } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { AccessWindow, BillingFrequency, Plan, PlanDuration } from '../types'

/**
 * Plan editor — create or edit a pricing plan. Plans change freely because the
 * sale-time snapshot lives on the Membership, never here. Row-click on the table
 * opens this with the plan prefilled.
 */
export function PlanFormDialog({
  plan,
  open,
  onOpenChange,
  onCreated
}: {
  plan: Plan | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (plan: Plan) => void
}): React.JSX.Element {
  const isEdit = plan !== null
  const create = useCreatePlan()
  const update = useUpdatePlan()
  const currency = useCurrency()

  const [name, setName] = useState(plan?.name ?? '')
  const [duration, setDuration] = useState<PlanDuration>(plan?.duration ?? 'MONTHLY')
  const [billing, setBilling] = useState<BillingFrequency>(plan?.billing ?? 'ONE_TIME')
  const [price, setPrice] = useState(plan ? minorToMajor(plan.basePriceMinor, currency) : '')
  const [taxCode, setTaxCode] = useState(plan?.taxCode ?? '')
  const [taxRate, setTaxRate] = useState(plan ? String(plan.taxRateBps / 100) : '')
  const [registrationFee, setRegistrationFee] = useState(
    plan ? minorToMajor(plan.registrationFeeMinor, currency) : '0'
  )
  const [accessWindow, setAccessWindow] = useState<AccessWindow>(plan?.accessWindow ?? 'ALL_HOURS')
  const [startTime, setStartTime] = useState(plan?.startTime ?? '06:00')
  const [endTime, setEndTime] = useState(plan?.endTime ?? '23:00')
  const [isActive, setIsActive] = useState(plan?.isActive ?? true)
  const [description, setDescription] = useState(plan?.description ?? '')
  const [availableFrom, setAvailableFrom] = useState(plan?.availableFrom ?? new Date().toISOString().slice(0, 10))
  const [availableTo, setAvailableTo] = useState(plan?.availableTo ?? '')

  const priceValue = Number(price)
  const canSubmit = name.trim().length > 0 && Number.isFinite(priceValue) && priceValue > 0

  function submit(): void {
    const input = {
      name: name.trim(),
      duration,
      billing,
      basePriceMinor: parseToMinor(price, currency) ?? 0,
      taxCode: taxCode.trim().toUpperCase(),
      taxRateBps: percentToBps(Number(taxRate || 0)),
      registrationFeeMinor: parseToMinor(registrationFee, currency) ?? 0,
      accessWindow,
      startTime,
      endTime,
      isActive,
      description: description.trim(),
      availableFrom: availableFrom || null,
      availableTo: availableTo || null
    }
    if (isEdit && plan) {
      update.mutate({ id: plan.id, input }, { onSuccess: () => onOpenChange(false) })
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
            <Package className="size-4 text-primary" />
            {isEdit ? 'Edit plan' : 'New plan'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Existing memberships keep their snapshot price; this only affects future sales.'
              : 'Add a reusable commercial definition to the catalog.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pl-name">
              Plan name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Annual Premium"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pl-duration">Duration</Label>
              <Select value={duration} onValueChange={(v) => setDuration(v as PlanDuration)}>
                <SelectTrigger id="pl-duration">
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pl-billing">Billing</Label>
              <Select value={billing} onValueChange={(v) => setBilling(v as BillingFrequency)}>
                <SelectTrigger id="pl-billing">
                  <SelectValue placeholder="Billing" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_FREQUENCIES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pl-price">
                Base price <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pl-price"
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(sanitizeMoneyInput(e.target.value))}
                placeholder="0"
                className="font-mono tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pl-access">Access window</Label>
              <Select
                value={accessWindow}
                onValueChange={(v) => setAccessWindow(v as AccessWindow)}
              >
                <SelectTrigger id="pl-access">
                  <SelectValue placeholder="Access" />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_OPTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pl-tax-code">Tax code</Label>
              <Input
                id="pl-tax-code"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                placeholder="e.g. GST18"
                className="font-mono tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pl-tax-rate">Tax rate (%)</Label>
              <Input
                id="pl-tax-rate"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="0"
                className="font-mono tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pl-reg-fee">Registration fee</Label>
              <Input
                id="pl-reg-fee"
                type="text"
                inputMode="decimal"
                value={registrationFee}
                onChange={(e) => setRegistrationFee(sanitizeMoneyInput(e.target.value))}
                placeholder="0"
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          {accessWindow === 'TIMED' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pl-start">Opens at</Label>
                <Input
                  id="pl-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pl-end">Closes at</Label>
                <Input
                  id="pl-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="pl-description">Description</Label>
            <Textarea
              id="pl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What does this plan include?"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Sellable</p>
              <p className="text-xs text-muted-foreground">
                Only active plans appear at sale time.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pl-available-from">Available from</Label>
              <Input
                id="pl-available-from"
                type="date"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pl-available-to">Available until</Label>
              <Input
                id="pl-available-to"
                type="date"
                value={availableTo}
                onChange={(e) => setAvailableTo(e.target.value)}
                placeholder="Open-ended"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave empty for open-ended availability.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
