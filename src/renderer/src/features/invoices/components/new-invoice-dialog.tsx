import { useEffect, useMemo, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { CheckCircle2, ChevronsUpDown, Loader2, Plus, ReceiptText, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { can, useSession } from '@/context/session-context'
import {
  formatMinor,
  parseToMinor,
  formatRate,
  percentToBps,
  minorToMajor,
  type CurrencyCode
} from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { cn } from '@/lib/utils'
import { billingDateCautions } from '@/lib/billing-warnings'
import { usePlans } from '@/features/catalog/queries'
import type { Plan } from '@/features/catalog/types'
import { CatalogDatePicker } from '@/features/catalog/components/catalog-date-picker'
import { CustomerPicker } from '@/features/finance/components/customer-picker'
import type { PersonRef } from '@/features/dashboard/types'
import { INVOICE_STATUS_META } from '../constants'
import {
  useAddInvoiceLine,
  useCreateInvoice,
  useDraftInvoice,
  useFinalizeInvoice,
  useNextInvoiceNumber,
  useRemoveInvoiceLine,
  useUpdateBillingSnapshot
} from '../queries'

/**
 * New-invoice flow (Module 04). Creation is two-phase and explicit:
 * pick a customer → a DRAFT invoice is created via IPC → the billing snapshot
 * and lines are edited against the saved draft → an explicit Finalize assigns
 * the invoice number (display-only preview) and freezes everything. Abandoned
 * drafts stay as filterable DRAFT rows in the register — they are never deleted.
 *
 * `seedPlanId` lets a caller (e.g. a lead-conversion entry point) prefill the
 * first line from the customer's interested plan; the line is only ever added
 * by an explicit "Add line" press.
 */
interface NewInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seedPlanId?: number
}

const MAX_500 = (value: string): string | undefined =>
  value.length > 500 ? 'Keep it under 500 characters' : undefined

/** Judges the first keystroke instantly so bad formats never get typed twice. */
function moneyValidator(required: boolean, currency: CurrencyCode) {
  return ({ value }: { value: string }): string | undefined => {
    if (!value) return required ? 'Enter an amount' : undefined
    if (!/^[0-9]/.test(value)) return 'Numbers only'
    return parseToMinor(value, currency) !== undefined ? undefined : 'Amount, up to 2 decimals'
  }
}

function percentValidator({ value }: { value: string }): string | undefined {
  if (!value) return undefined
  if (!/^[0-9]/.test(value)) return 'Numbers only'
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100 || !/^\d{1,3}(\.\d{1,2})?$/.test(value)) {
    return '0–100, up to 2 decimals'
  }
  return undefined
}

/* -------------------------------------------------------------------------- */
/* Billing snapshot section                                                    */
/* -------------------------------------------------------------------------- */

function SnapshotSection({
  draftId,
  initial,
  canEdit
}: {
  draftId: number
  initial: { name: string; phone: string; email: string; address: string }
  canEdit: boolean
}): React.JSX.Element {
  const save = useUpdateBillingSnapshot(draftId)
  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      await save.mutateAsync({
        invoiceId: draftId,
        billingName: value.name.trim(),
        billingPhone: value.phone.trim() === '' ? null : value.phone.trim(),
        billingEmail: value.email.trim() === '' ? null : value.email.trim(),
        billingAddress: value.address.trim() === '' ? null : value.address.trim()
      })
      form.reset(value)
    }
  })
  const submitted = form.state.isSubmitted

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <FieldGroup className="gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Billed to</h3>
          <span className="text-xs text-muted-foreground">
            Snapshot — edits never touch the customer record
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) =>
                value.trim().length === 0
                  ? 'Name is required'
                  : value.length > 200
                    ? 'Max 200 characters'
                    : undefined
            }}
          >
            {(field) => (
              <Field
                id="bill-name"
                label="Name"
                error={
                  field.state.meta.isTouched || submitted ? field.state.meta.errors[0] : undefined
                }
              >
                <Input
                  id="bill-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  disabled={!canEdit}
                  aria-invalid={
                    (field.state.meta.isTouched || submitted) && field.state.meta.errors.length > 0
                  }
                />
              </Field>
            )}
          </form.Field>
          <form.Field
            name="phone"
            validators={{
              onChange: ({ value }) => (value.length > 20 ? 'Max 20 characters' : undefined)
            }}
          >
            {(field) => (
              <Field
                id="bill-phone"
                label="Phone"
                error={field.state.meta.isTouched ? field.state.meta.errors[0] : undefined}
              >
                <Input
                  id="bill-phone"
                  inputMode="tel"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  disabled={!canEdit}
                />
              </Field>
            )}
          </form.Field>
          <form.Field
            name="email"
            validators={{
              onChange: ({ value }) =>
                value.trim() !== '' && !/^\S+@\S+\.\S+$/.test(value.trim())
                  ? 'Enter a valid email'
                  : undefined
            }}
          >
            {(field) => (
              <Field
                id="bill-email"
                label="Email"
                error={field.state.meta.isTouched ? field.state.meta.errors[0] : undefined}
              >
                <Input
                  id="bill-email"
                  type="email"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  disabled={!canEdit}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="address" validators={{ onChange: ({ value }) => MAX_500(value) }}>
            {(field) => (
              <Field
                id="bill-address"
                label="Address"
                hint=""
                error={field.state.meta.isTouched ? field.state.meta.errors[0] : undefined}
              >
                <Textarea
                  id="bill-address"
                  rows={1}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  disabled={!canEdit}
                />
              </Field>
            )}
          </form.Field>
        </div>
        {canEdit ? (
          <form.Subscribe
            selector={(s) => ({
              canSubmit: s.canSubmit,
              isDirty: s.isDirty,
              isSubmitting: s.isSubmitting
            })}
          >
            {({ canSubmit, isDirty, isSubmitting }) => (
              <LoadingButton
                type="submit"
                size="sm"
                variant="outline"
                className="self-start"
                loading={isSubmitting}
                loadingLabel="Saving…"
                success={!isDirty && save.isSuccess}
                successLabel="Saved"
                disabled={!canSubmit || !isDirty}
              >
                Save details
              </LoadingButton>
            )}
          </form.Subscribe>
        ) : null}
      </FieldGroup>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Line editor + list                                                          */
/* -------------------------------------------------------------------------- */

interface DraftLine {
  id: number
  description: string
  quantity: number
  unitPriceMinor: number
  discountMinor: number
  taxRateBps: number
  taxAmountMinor: number
  lineTotalMinor: number
}

function LinesSection({
  draftId,
  lines,
  seedPlanId,
  canEdit,
  currency
}: {
  draftId: number
  lines: DraftLine[]
  seedPlanId?: number
  canEdit: boolean
  currency: CurrencyCode
}): React.JSX.Element {
  const removeLine = useRemoveInvoiceLine(draftId)
  const { data: plans } = usePlans()
  const activePlans = useMemo(() => (plans ?? []).filter((p) => p.isActive), [plans])

  // User-picked plan; when absent, a caller-supplied seedPlanId (lead
  // conversion) derives the picked plan during render once the catalog
  // *query* resolves. No effect: the entry form below is keyed by the plan
  // id, so when the query data arrives it remounts pre-filled from defaults.
  const [manualPlan, setManualPlan] = useState<Plan | null>(null)
  const seededPlan =
    manualPlan === null && seedPlanId !== undefined
      ? (activePlans.find((p) => p.id === seedPlanId) ?? null)
      : null
  const pickedPlan = manualPlan ?? seededPlan

  return (
    <section className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-x-3 bg-muted/40 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <span>Item</span>
          <span className="w-10 text-right">Qty</span>
          <span className="w-24 text-right">Rate</span>
          <span className="w-20 text-right">Tax</span>
          <span className="w-28 text-right">Total</span>
        </div>
        {lines.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No lines yet — add at least one before finalizing.
          </p>
        ) : (
          lines.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-x-3 border-t border-border/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.description}</p>
                {l.discountMinor > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Discount −{formatMinor(l.discountMinor, currency)}
                  </p>
                ) : null}
              </div>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                {l.quantity}
              </span>
              <span className="w-24 text-right font-mono text-xs tabular-nums">
                {formatMinor(l.unitPriceMinor, currency)}
              </span>
              <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                {formatRate(l.taxRateBps)}
              </span>
              <div className="flex w-28 items-center justify-end gap-1">
                <span className="font-mono text-sm tabular-nums">
                  {formatMinor(l.lineTotalMinor, currency)}
                </span>
                {canEdit ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${l.description}`}
                        disabled={removeLine.isPending}
                        onClick={() => removeLine.mutate({ invoiceId: draftId, lineId: l.id })}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Remove line</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {canEdit ? (
        <LineEntryForm
          key={pickedPlan?.id ?? 'manual'}
          draftId={draftId}
          plan={pickedPlan}
          activePlans={activePlans}
          onPlanPicked={setManualPlan}
          currency={currency}
        />
      ) : null}
    </section>
  )
}

const EMPTY_LINE_VALUES: LineValues = {
  description: '',
  quantity: '1',
  unitPrice: '',
  discount: '',
  taxRate: '0'
}

function lineValuesFromPlan(plan: Plan | null, currency: CurrencyCode): LineValues {
  if (!plan) return EMPTY_LINE_VALUES
  return {
    ...EMPTY_LINE_VALUES,
    description: plan.name,
    unitPrice: minorToMajor(plan.basePriceMinor, currency),
    taxRate: String(plan.taxRateBps / 100)
  }
}

interface LineValues {
  description: string
  quantity: string
  unitPrice: string
  discount: string
  taxRate: string
}

/**
 * The entry row. Its TanStack Form is initialized from `plan` (derived from the
 * catalog query or a user pick) and remounted via `key` whenever that plan
 * changes — the "derive during render" pattern instead of a prefill effect.
 */
function LineEntryForm({
  draftId,
  plan,
  activePlans,
  onPlanPicked,
  currency
}: {
  draftId: number
  plan: Plan | null
  activePlans: Plan[]
  onPlanPicked: (plan: Plan | null) => void
  currency: CurrencyCode
}): React.JSX.Element {
  const addLine = useAddInvoiceLine(draftId)
  const [planOpen, setPlanOpen] = useState(false)

  const form = useForm({
    defaultValues: lineValuesFromPlan(plan, currency),
    onSubmit: async ({ value }) => {
      if (!plan && value.description.trim() === '') return
      const unitPriceMinor = parseToMinor(value.unitPrice, currency)
      if (unitPriceMinor === undefined) return
      await addLine.mutateAsync({
        invoiceId: draftId,
        description: plan && value.description === plan.name ? plan.name : value.description.trim(),
        quantity: Math.max(1, Math.floor(Number(value.quantity))),
        unitPriceMinor,
        discountMinor: value.discount ? (parseToMinor(value.discount, currency) ?? 0) : 0,
        taxRateBps: percentToBps(Number(value.taxRate || 0)),
        planId: plan?.id ?? null
      })
      // Keep the last tax rate for consecutive lines; clear the rest.
      form.reset({ ...EMPTY_LINE_VALUES, taxRate: value.taxRate })
    }
  })
  const submitted = form.state.isSubmitted

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="rounded-md border border-dashed border-border p-3"
    >
      <FieldGroup className="gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="line-plan">From plan (optional)</Label>
            <Popover open={planOpen} onOpenChange={setPlanOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={planOpen}
                  className="h-9 w-full justify-between px-3 text-sm font-normal"
                >
                  {plan ? plan.name : <span className="text-muted-foreground">Search plans…</span>}
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] rounded-lg p-0"
                align="start"
              >
                <Command
                  filter={(val, search) => {
                    if (val === '__clear__') return search.toLowerCase().includes('clear') ? 1 : 0
                    const p = activePlans.find((x) => x.name === val)
                    if (!p) return 0
                    return p.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                  }}
                >
                  <CommandInput placeholder="Search plans…" />
                  <CommandList>
                    <CommandEmpty>No matching plan.</CommandEmpty>
                    <CommandGroup>
                      {plan ? (
                        <CommandItem
                          value="__clear__"
                          onSelect={() => {
                            onPlanPicked(null)
                            setPlanOpen(false)
                          }}
                        >
                          <Trash2 className="mr-2 size-3.5" /> Clear selected plan (manual line)
                        </CommandItem>
                      ) : null}
                      {activePlans.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.name}
                          onSelect={() => {
                            onPlanPicked(p)
                            setPlanOpen(false)
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {formatMinor(p.basePriceMinor, currency)}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Picking a plan fills description, price and tax — everything stays editable.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <form.Field
            name="description"
            validators={{
              onChange: ({ value }) =>
                plan && value === plan.name
                  ? undefined
                  : value.trim().length === 0
                    ? 'Description is required'
                    : MAX_500(value)
            }}
          >
            {(field) => (
              <Field
                id="line-desc"
                label="Description"
                error={
                  field.state.meta.isTouched || submitted ? field.state.meta.errors[0] : undefined
                }
              >
                <Input
                  id="line-desc"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder={plan ? plan.name : 'Registration fee, locker…'}
                />
              </Field>
            )}
          </form.Field>
          <form.Field
            name="quantity"
            validators={{
              onChange: ({ value }) => {
                if (!value) return 'Quantity is required'
                if (!/^[1-9]/.test(value)) return 'Whole numbers, at least 1'
                return /^\d+$/.test(value) && Number(value) >= 1
                  ? undefined
                  : 'Whole numbers, at least 1'
              }
            }}
          >
            {(field) => (
              <Field
                id="line-qty"
                label="Quantity"
                error={
                  field.state.meta.isTouched || submitted ? field.state.meta.errors[0] : undefined
                }
              >
                <Input
                  id="line-qty"
                  inputMode="numeric"
                  value={field.state.value}
                  onChange={(e) =>
                    field.handleChange(e.target.value.replace(/[^\d]/g, '').slice(0, 4))
                  }
                  onBlur={field.handleBlur}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="unitPrice" validators={{ onChange: moneyValidator(true, currency) }}>
            {(field) => (
              <Field
                id="line-price"
                label="Unit price"
                labelEnd={
                  parseToMinor(field.state.value, currency) !== undefined ? (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatMinor(parseToMinor(field.state.value, currency)!, currency)}
                    </span>
                  ) : undefined
                }
                error={
                  field.state.meta.isTouched || submitted ? field.state.meta.errors[0] : undefined
                }
              >
                <Input
                  id="line-price"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={field.state.value}
                  onChange={(e) =>
                    field.handleChange(e.target.value.replace(/[^\d.]/g, '').slice(0, 12))
                  }
                  onBlur={field.handleBlur}
                />
              </Field>
            )}
          </form.Field>
          <div className="grid grid-cols-2 gap-3">
            <form.Field name="discount" validators={{ onChange: moneyValidator(false, currency) }}>
              {(field) => (
                <Field
                  id="line-discount"
                  label="Discount"
                  error={field.state.meta.isTouched ? field.state.meta.errors[0] : undefined}
                >
                  <Input
                    id="line-discount"
                    inputMode="decimal"
                    placeholder="0"
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value.replace(/[^\d.]/g, '').slice(0, 12))
                    }
                    onBlur={field.handleBlur}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="taxRate" validators={{ onChange: percentValidator }}>
              {(field) => (
                <Field
                  id="line-tax"
                  label="Tax %"
                  error={field.state.meta.isTouched ? field.state.meta.errors[0] : undefined}
                >
                  <Input
                    id="line-tax"
                    inputMode="decimal"
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))
                    }
                    onBlur={field.handleBlur}
                  />
                </Field>
              )}
            </form.Field>
          </div>
        </div>

        <form.Subscribe
          selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <LoadingButton
              type="submit"
              size="sm"
              variant="outline"
              className="self-start"
              loading={isSubmitting || addLine.isPending}
              loadingLabel="Adding…"
              disabled={!canSubmit}
            >
              <Plus /> Add line
            </LoadingButton>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* The dialog                                                                  */
/* -------------------------------------------------------------------------- */

export function NewInvoiceDialog({
  open,
  onOpenChange,
  seedPlanId
}: NewInvoiceDialogProps): React.JSX.Element {
  const session = useSession()
  const currency = useCurrency()
  const canCreate = can(session.permissions, session.isSuper, 'invoice.create')
  const canFinalize = can(session.permissions, session.isSuper, 'invoice.finalize')

  const create = useCreateInvoice()
  const finalize = useFinalizeInvoice()
  const [picked, setPicked] = useState<PersonRef | null>(null)
  const [draftId, setDraftId] = useState<number | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const [finalizedNo, setFinalizedNo] = useState<string | null>(null)
  // Business issue date (#110); defaults to today, drives number + finalized_at.
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Display-only preview; fetched only while the confirm dialog is open.
  // Follows the picked issue date but never reserves a number.
  const { data: preview } = useNextInvoiceNumber(
    confirming && draftId !== undefined,
    confirming ? issueDate : undefined
  )
  const { data: detail } = useDraftInvoice(draftId)

  // State resets on remount: every caller mounts this dialog only while open
  // (page Suspense gate / sheet conditional render), so a fresh open is a
  // fresh component — no reset effect needed.

  async function startDraft(): Promise<void> {
    if (!picked) return
    try {
      const row = (await create.mutateAsync(Number(picked.id))) as unknown as { id: number }
      setDraftId(row.id)
    } catch {
      // toast handled by the mutation layer
    }
  }

  async function doFinalize(): Promise<void> {
    if (draftId === undefined) return
    try {
      const row = (await finalize.mutateAsync({ invoiceId: draftId, issueDate })) as unknown as {
        number?: string
      }
      setConfirming(false)
      setFinalizedNo(row.number ?? 'the next sequential number')
    } catch {
      setConfirming(false)
    }
  }

  // Success state: show the assigned number briefly, then close.
  useEffect(() => {
    if (!finalizedNo) return
    const t = setTimeout(() => onOpenChange(false), 1800)
    return () => clearTimeout(t)
  }, [finalizedNo, onOpenChange])

  const lines: DraftLine[] = useMemo(() => {
    if (!detail) return []
    return detail.lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      discountMinor: l.discountMinor,
      taxRateBps: l.taxRateBps,
      taxAmountMinor: l.taxAmountMinor,
      lineTotalMinor: l.lineTotalMinor
    }))
  }, [detail])

  const hasLines = lines.length > 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          {finalizedNo ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
                  Invoice {finalizedNo} finalized
                </DialogTitle>
                <DialogDescription>
                  The number is permanent and the amounts are frozen. It is now open for payments.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => onOpenChange(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : draftId === undefined ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ReceiptText className="size-4 text-primary" />
                  New invoice
                </DialogTitle>
                <DialogDescription>
                  Pick who this invoice is for. A draft is created first — you add lines, then
                  finalize to assign the invoice number.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label>
                  Customer <span className="text-destructive">*</span>
                </Label>
                <CustomerPicker value={picked?.id ?? ''} onChange={setPicked} />
                <p className="text-xs text-muted-foreground">
                  Name, phone, email and address are copied onto the invoice as a snapshot — you can
                  adjust them on the draft without touching the customer record.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <LoadingButton
                  onClick={startDraft}
                  loading={create.isPending}
                  loadingLabel="Creating draft…"
                  disabled={!picked}
                >
                  Start draft
                </LoadingButton>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ReceiptText className="size-4 text-primary" />
                  Draft invoice
                  <span
                    className={cn(
                      'rounded-sm border px-1.5 py-0.5 text-[11px] font-medium',
                      'border-border bg-muted/40 text-muted-foreground'
                    )}
                  >
                    {INVOICE_STATUS_META.DRAFT.label}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Nothing is final until you press Finalize — the number below is only a preview.
                </DialogDescription>
              </DialogHeader>

              {detail === undefined ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <SnapshotSection
                    draftId={draftId}
                    canEdit={canCreate}
                    initial={{
                      name: detail.invoice.billingName ?? '',
                      phone: detail.invoice.billingPhone ?? '',
                      email: detail.invoice.billingEmail ?? '',
                      address: detail.invoice.billingAddress ?? ''
                    }}
                  />
                  <LinesSection
                    draftId={draftId}
                    lines={lines}
                    seedPlanId={seedPlanId}
                    canEdit={canCreate}
                    currency={currency}
                  />
                </div>
              )}

              <DialogFooter className="items-center gap-3 sm:justify-between">
                <div className="flex flex-col items-start text-sm">
                  <span className="text-xs text-muted-foreground">
                    Subtotal {formatMinor(detail?.invoice.subtotalMinor ?? 0, currency)} · Tax{' '}
                    {formatMinor(detail?.invoice.taxMinor ?? 0, currency)}
                  </span>
                  <span className="font-semibold">
                    Total{' '}
                    <span className="font-mono tabular-nums">
                      {formatMinor(detail?.invoice.totalMinor ?? 0, currency)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    {hasLines ? 'Finish later' : 'Cancel'}
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={hasLines && canFinalize ? -1 : 0}>
                        <Button
                          disabled={!hasLines || !canFinalize}
                          onClick={() => setConfirming(true)}
                        >
                          Finalize…
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!hasLines ? (
                      <TooltipContent>Add at least one line first</TooltipContent>
                    ) : !canFinalize ? (
                      <TooltipContent>Requires the invoice.finalize permission</TooltipContent>
                    ) : null}
                  </Tooltip>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This assigns invoice number{' '}
              <span className="font-mono font-semibold text-foreground">
                {preview?.preview ?? 'INV-…'}
              </span>{' '}
              permanently and freezes all amounts. A finalized invoice can no longer be edited —
              corrections happen through void or payment operations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label className="text-xs">
              Issue date{' '}
              <span className="font-normal text-muted-foreground">· drives invoice number</span>
            </Label>
            <CatalogDatePicker
              value={issueDate}
              onChange={(v) => setIssueDate(v)}
              placeholder="Pick issue date"
              testId="finalize-issue-date-picker"
            />
            {billingDateCautions(issueDate, new Date().toISOString().slice(0, 10)).map((c) => (
              <p key={c.code} className="text-[11px] text-amber-600">
                {c.message}
                {c.source ? (
                  <span className="block text-muted-foreground">{c.source}</span>
                ) : null}
              </p>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              disabled={finalize.isPending || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)}
              onClick={(e) => {
                e.preventDefault()
                void doFinalize()
              }}
            >
              {finalize.isPending ? 'Finalizing…' : 'Assign number & freeze'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
