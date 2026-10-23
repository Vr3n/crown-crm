import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Boxes, CircleSlash, Package, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { KpiCard } from '@/components/ui/kpi-card'
import { StatusPill } from '@/components/ui/status-pill'
import { ChartCard } from '@/components/ui/chart-card'
import { RankedBarsChart } from '@/components/charts/list-charts'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FormLegend } from '@/components/ui/field'
import type { FieldHelpContent } from '@/components/ui/field-help'
import { focusFirstError, FormTextField, type FormFieldApi } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { FIELD_HELP } from '@/lib/form-help'
import { formatMinor, formatRate, minorToMajor } from '@/lib/money'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type { CreateItemInput, ItemRow } from '../../../../../shared/contracts/masters'

const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-9 border-b border-border px-3 align-middle'
const TAG = 'rounded-none px-1.5 py-0 text-[0.6875rem] uppercase tracking-[0.08em]'
const GST_RATES = [0, 5, 12, 18, 28]

interface ItemPayload extends Omit<CreateItemInput, 'reorderLevelE4'> {
  reorderLevelE4?: number
}

interface ItemSave {
  id?: number
  payload: ItemPayload
  reorderLevelE4?: number
}

interface ItemForm {
  name: string
  sku: string
  hsnSac: string
  uomId: string
  gstRateBps: string
  salePrice: string
  purchasePrice: string
  openingQty: string
  openingRate: string
  reorderLevel: string
  isService: boolean
}

type ItemTextKey = Exclude<keyof ItemForm, 'isService' | 'uomId' | 'gstRateBps'>

const blankForm = (): ItemForm => ({
  name: '',
  sku: '',
  hsnSac: '',
  uomId: '0',
  gstRateBps: '0',
  salePrice: '0',
  purchasePrice: '0',
  openingQty: '0',
  openingRate: '0',
  reorderLevel: '0',
  isService: false
})

const toForm = (item: ItemRow): ItemForm => ({
  name: item.name,
  sku: item.sku ?? '',
  hsnSac: item.hsnSac ?? '',
  uomId: String(item.uomId ?? 0),
  gstRateBps: String(item.gstRateBps),
  salePrice: minorToMajor(item.salePriceMinor, 'INR'),
  purchasePrice: minorToMajor(item.purchasePriceMinor, 'INR'),
  openingQty: qtyText(item.openingQtyE4),
  openingRate: minorToMajor(item.openingRateMinor, 'INR'),
  // The list row does not expose the reorder level; blank means keep it.
  reorderLevel: '',
  isService: item.isService
})

/** Rupees typed by the user to integer paise. Blank or invalid counts as zero. */
function toMinor(value: string): number {
  const cleaned = value.replace(/[₹,\s]/g, '')
  if (!cleaned || cleaned === '.' || cleaned === '-') return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

/** Up to four decimal places to the stored quantity scale (1 qty = 10,000). */
function toE4(value: string): number {
  const cleaned = value.replace(/[,\s]/g, '')
  if (!cleaned || cleaned === '.') return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Math.round(parsed * 10000) : 0
}

function quantity(e4: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(e4 / 10000)
}

/** Stored quantity to a compact decimal string, at most four places. */
function qtyText(e4: number): string {
  return (e4 / 10000).toFixed(4).replace(/\.?0+$/, '') || '0'
}

function StockLevel({ item }: { item: ItemRow }): React.JSX.Element {
  if (item.isService) {
    return <StatusPill tone="info">Service</StatusPill>
  }
  if (item.stockQtyE4 <= 0) {
    return <StatusPill tone="destructive">Out of stock</StatusPill>
  }
  if (item.reorderLevelE4 > 0 && item.stockQtyE4 <= item.reorderLevelE4) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="font-mono text-[0.875rem] tabular-nums">{quantity(item.stockQtyE4)}</span>
        <StatusPill tone="warning">Low</StatusPill>
      </span>
    )
  }
  return <span className="font-mono text-[0.875rem] tabular-nums">{quantity(item.stockQtyE4)}</span>
}

function Margin({ sale, purchase }: { sale: number; purchase: number }): React.JSX.Element {
  if (purchase <= 0) return <span className="text-muted-foreground">—</span>
  const percent = Math.round(((sale - purchase) / purchase) * 100)
  return (
    <span className={percent < 0 ? 'text-destructive' : 'text-success'}>
      {percent > 0 ? '+' : ''}
      {percent}%
    </span>
  )
}

const itemFormSchema = z.object({
  name: z.string().trim().min(2, 'Item name is required'),
  sku: z.string(),
  hsnSac: z.string(),
  uomId: z.string(),
  gstRateBps: z.string(),
  salePrice: z.string().refine((value) => toMinor(value) >= 0, 'Cannot be negative'),
  purchasePrice: z.string().refine((value) => toMinor(value) >= 0, 'Cannot be negative'),
  openingQty: z.string().refine((value) => toE4(value) >= 0, 'Cannot be negative'),
  openingRate: z.string().refine((value) => toMinor(value) >= 0, 'Cannot be negative'),
  reorderLevel: z.string().refine((value) => toE4(value) >= 0, 'Cannot be negative'),
  isService: z.boolean()
})

/** Field-level rule reused for live blur/change validation. */
function itemFieldError(name: keyof ItemForm, value: string | boolean): string | undefined {
  const result = itemFormSchema.shape[name].safeParse(value)
  if (result.success) return undefined
  return result.error.issues[0]?.message
}

const TEXT_FIELDS: Record<
  ItemTextKey,
  {
    label: string
    help: FieldHelpContent
    required?: boolean
    inputMode?: 'numeric' | 'decimal'
    mono?: boolean
    autoFocus?: boolean
    lockOnEdit?: boolean
    hint?: (editing: boolean) => string | undefined
  }
> = {
  name: {
    label: 'Name',
    required: true,
    autoFocus: true,
    help: FIELD_HELP.item.name
  },
  sku: { label: 'SKU', mono: true, help: FIELD_HELP.item.sku },
  hsnSac: { label: 'HSN / SAC', mono: true, help: FIELD_HELP.item.hsnSac },
  salePrice: {
    label: 'Sale price (INR)',
    inputMode: 'decimal',
    mono: true,
    help: FIELD_HELP.item.salePrice
  },
  purchasePrice: {
    label: 'Purchase price (INR)',
    inputMode: 'decimal',
    mono: true,
    help: FIELD_HELP.item.purchasePrice
  },
  openingQty: {
    label: 'Opening qty',
    inputMode: 'decimal',
    mono: true,
    lockOnEdit: true,
    help: FIELD_HELP.item.openingQty,
    hint: (editing) => (editing ? 'Fixed after the item is created.' : 'Up to 4 decimal places')
  },
  openingRate: {
    label: 'Opening rate (INR)',
    inputMode: 'decimal',
    mono: true,
    lockOnEdit: true,
    help: FIELD_HELP.item.openingRate,
    hint: (editing) => (editing ? 'Fixed after the item is created.' : undefined)
  },
  reorderLevel: {
    label: 'Reorder level',
    inputMode: 'decimal',
    mono: true,
    help: FIELD_HELP.item.reorderLevel,
    hint: (editing) => (editing ? 'Leave blank to keep the current level.' : undefined)
  }
}

export function ItemsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search, 250)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [filter, setFilter] = useState<'ALL' | 'LOW' | 'OUT' | 'SERVICE'>('ALL')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ItemRow | null>(null)
  const [target, setTarget] = useState<ItemRow | null>(null)

  const list = useQuery({
    queryKey: ['items', query, includeInactive],
    queryFn: () => window.api.items.list(query.trim() || undefined, includeInactive)
  })
  const units = useQuery({ queryKey: ['units'], queryFn: () => window.api.units.list() })
  const summary = useQuery({
    queryKey: ['items', 'summary'],
    queryFn: () => window.api.summaries.items()
  })
  const baseRows = list.data ?? []

  const rows = baseRows.filter((item) => {
    if (filter === 'SERVICE') return item.isService
    if (item.isService) return false
    if (filter === 'LOW')
      return (
        item.reorderLevelE4 > 0 && item.stockQtyE4 <= item.reorderLevelE4 && item.stockQtyE4 > 0
      )
    if (filter === 'OUT') return item.stockQtyE4 <= 0
    return true
  })

  const s = summary.data

  const deactivate = useMutation({
    mutationFn: (id: number) => window.api.items.deactivate(id),
    onSuccess: () => {
      toast.success('Item deactivated')
      void queryClient.invalidateQueries({ queryKey: ['items'] })
      setTarget(null)
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not deactivate the item'))
  })

  function show(next: ItemRow | null): void {
    setEditing(next)
    setOpen(true)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-6">
      <PageHeader
        title="Items"
        description={`${baseRows.length} ${baseRows.length === 1 ? 'item' : 'items'} on file`}
        actions={
          <Button size="sm" onClick={() => show(null)}>
            <Plus className="size-3.5" strokeWidth={2} />
            New item
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-4">
        <KpiCard
          label="Inventory value"
          value={formatMinor(s?.inventoryValueMinor ?? 0, 'INR')}
          context="Stock held at cost"
          icon={Boxes}
          tone="success"
        />
        <KpiCard
          label="Items"
          value={String(s?.itemCount ?? 0)}
          context={`${s?.serviceCount ?? 0} services`}
          icon={Package}
        />
        <KpiCard
          label="Low stock"
          value={String(s?.lowStockCount ?? 0)}
          context="At or below reorder level"
          icon={AlertTriangle}
          tone="warning"
        />
        <KpiCard
          label="Out of stock"
          value={String(s?.outOfStockCount ?? 0)}
          context="Nothing on hand"
          icon={CircleSlash}
          tone="stamp"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Stock value by item" subtitle="Largest inventory balances">
          {s && s.topItems.length > 0 ? (
            <RankedBarsChart
              rows={s.topItems.map((item) => ({ label: item.name, valueMinor: item.valueMinor }))}
              ariaLabel="Stock value by item"
            />
          ) : (
            <p className="py-10 text-center text-[0.8125rem] text-muted-foreground">
              Post a purchase to value your stock.
            </p>
          )}
        </ChartCard>
        <ChartCard title="Quick filters" subtitle="Jump to the items that need a decision">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['ALL', 'All items', s?.itemCount ?? 0],
                ['LOW', 'Low stock', s?.lowStockCount ?? 0],
                ['OUT', 'Out of stock', s?.outOfStockCount ?? 0],
                ['SERVICE', 'Services', s?.serviceCount ?? 0]
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`flex items-center justify-between border px-3 py-2.5 text-left text-[0.875rem] transition-colors ${
                  filter === value
                    ? 'border-primary bg-accent-soft/50 font-medium text-primary'
                    : 'border-border bg-card hover:border-rule-strong'
                }`}
              >
                <span>{label}</span>
                <span className="font-mono text-[0.75rem] tabular-nums text-muted-foreground">
                  {count}
                </span>
              </button>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="item-search"
            aria-label="Search items"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, SKU or HSN"
            className="h-8 border-0 bg-transparent pl-8 text-[0.9375rem] focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <label
          htmlFor="item-inactive"
          className="flex cursor-pointer items-center gap-1.5 text-[0.875rem] text-muted-foreground"
        >
          <Checkbox
            id="item-inactive"
            checked={includeInactive}
            onCheckedChange={(checked) => setIncludeInactive(checked === true)}
          />
          Show inactive
        </label>
      </div>

      {list.isError ? (
        <div className="border border-border bg-card px-4 py-8 text-center">
          <p className="text-[0.9375rem] font-medium">Could not load items</p>
          <p className="mt-1 text-[0.875rem] text-muted-foreground">
            {errorMessage(list.error, 'Try again in a moment.')}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 && !list.isPending ? (
        <EmptyState
          icon={Package}
          title={search ? 'No items match' : 'No items yet'}
          description={
            search
              ? 'Try a different name, SKU or HSN code.'
              : 'Add the goods and services you sell, with HSN, unit, GST rate and prices.'
          }
          action={
            search ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setIncludeInactive(false)
                }}
              >
                Clear search
              </Button>
            ) : (
              <Button size="sm" onClick={() => show(null)}>
                <Plus className="size-3.5" strokeWidth={2} />
                New item
              </Button>
            )
          }
        />
      ) : (
        <div className="max-h-[calc(100vh-15.5rem)] overflow-auto border border-border bg-card">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/95">
                {[
                  'Name',
                  'HSN',
                  'Unit',
                  'GST',
                  'Stock',
                  'Sale price',
                  'Purchase price',
                  'Margin',
                  'Status'
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className={`${TH} ${['GST', 'Stock', 'Sale price', 'Purchase price', 'Margin'].includes(heading) ? 'text-right' : ''}`}
                  >
                    {heading}
                  </th>
                ))}
                <th scope="col" className={`${TH} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.isPending ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-8 text-center text-[0.875rem] text-muted-foreground"
                  >
                    Loading items...
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/40">
                    <td className={TD}>
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/items/${item.id}`}
                          className="text-[0.9375rem] font-medium hover:text-primary hover:underline"
                        >
                          {item.name}
                        </Link>
                        {item.isService ? (
                          <Badge variant="outline" className={TAG}>
                            Service
                          </Badge>
                        ) : null}
                      </div>
                      {item.sku ? (
                        <div className="font-mono text-[0.6875rem] text-muted-foreground">
                          {item.sku}
                        </div>
                      ) : null}
                    </td>
                    <td className={`${TD} font-mono text-[0.875rem] text-muted-foreground`}>
                      {item.hsnSac ?? '--'}
                    </td>
                    <td className={`${TD} text-[0.875rem] text-muted-foreground`}>
                      {item.uom ?? '--'}
                    </td>
                    <td className={`${TD} text-right font-mono text-[0.875rem] tabular-nums`}>
                      {formatRate(item.gstRateBps)}
                    </td>
                    <td className={`${TD} text-right`}>
                      <StockLevel item={item} />
                    </td>
                    <td className={`${TD} text-right font-mono text-[0.875rem] tabular-nums`}>
                      {formatMinor(item.salePriceMinor, 'INR')}
                    </td>
                    <td className={`${TD} text-right font-mono text-[0.875rem] tabular-nums`}>
                      {formatMinor(item.purchasePriceMinor, 'INR')}
                    </td>
                    <td className={`${TD} text-right font-mono text-[0.875rem] tabular-nums`}>
                      <Margin sale={item.salePriceMinor} purchase={item.purchasePriceMinor} />
                    </td>
                    <td className={TD}>
                      <StatusPill tone={item.isActive ? 'neutral' : 'destructive'}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </StatusPill>
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="xs" onClick={() => show(item)}>
                          Edit
                        </Button>
                        {item.isActive ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setTarget(item)}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <ItemDialog
          open={open}
          onOpenChange={setOpen}
          item={editing}
          units={units.data ?? []}
          onSaved={() => setOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(next) => {
          if (!next && !deactivate.isPending) setTarget(null)
        }}
        title="Deactivate this item?"
        description={
          target ? `${target.name} stays on past vouchers but is hidden from new entries.` : ''
        }
        confirmLabel="Deactivate"
        destructive
        isPending={deactivate.isPending}
        onConfirm={() => {
          if (target) deactivate.mutate(target.id)
        }}
      />
    </div>
  )
}

/**
 * Item capture dialog. Validation runs on blur, then live on change, so an
 * error clears the moment the value is fixed. Required markers and field help
 * come from the shared form primitives.
 */
function ItemDialog({
  open,
  onOpenChange,
  item,
  units,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ItemRow | null
  units: { id: number; name: string; symbol: string }[]
  onSaved: () => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const editing = item !== null

  const save = useMutation({
    mutationFn: (input: ItemSave) =>
      input.id
        ? window.api.items.update({
            ...input.payload,
            id: input.id,
            reorderLevelE4: input.reorderLevelE4
          })
        : window.api.items.create({ ...input.payload, reorderLevelE4: input.reorderLevelE4 ?? 0 }),
    onSuccess: () => {
      toast.success(editing ? 'Item updated' : 'Item added')
      void queryClient.invalidateQueries({ queryKey: ['items'] })
      onSaved()
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save the item'))
  })

  const form = useForm({
    defaultValues: item ? toForm(item) : blankForm(),
    // The dialog reveals every error and focuses the first one instead of
    // disabling submit, so invalid attempts must reach validation.
    canSubmitWhenInvalid: true,
    validators: { onSubmit: itemFormSchema },
    onSubmitInvalid: ({ formApi }) => focusFirstError(formApi),
    onSubmit: ({ value }) => {
      const payload: ItemPayload = {
        name: value.name.trim(),
        sku: value.sku.trim() || null,
        hsnSac: value.hsnSac.trim() || null,
        uomId: Number(value.uomId) || null,
        gstRateBps: Number(value.gstRateBps),
        isService: value.isService,
        salePriceMinor: toMinor(value.salePrice),
        purchasePriceMinor: toMinor(value.purchasePrice),
        openingQtyE4: toE4(value.openingQty),
        openingRateMinor: toMinor(value.openingRate)
      }
      save.mutate({
        id: item?.id,
        payload,
        // The list row has no reorder level, so a blank field keeps the stored one.
        reorderLevelE4: value.reorderLevel.trim()
          ? toE4(value.reorderLevel)
          : editing
            ? undefined
            : 0
      })
    }
  })

  function textField(name: ItemTextKey): React.JSX.Element {
    const meta = TEXT_FIELDS[name]
    return (
      <form.Field
        name={name}
        validators={{
          onBlur: ({ value }) => itemFieldError(name, value),
          onChange: ({ value }) => itemFieldError(name, value),
          onSubmit: ({ value }) => itemFieldError(name, value)
        }}
      >
        {(field) => (
          <FormTextField
            field={field as unknown as FormFieldApi}
            submitted={form.state.isSubmitted}
            label={meta.label}
            required={meta.required}
            help={meta.help}
            inputMode={meta.inputMode}
            mono={meta.mono}
            autoFocus={meta.autoFocus}
            disabled={meta.lockOnEdit === true && editing}
            hint={meta.hint?.(editing)}
            afterChange={() => {
              // TanStack Form keeps a blur error until the next blur; editing clears it.
              field.setErrorMap({ onBlur: undefined })
            }}
          />
        )}
      </form.Field>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit item' : 'New item'}</DialogTitle>
          <DialogDescription>
            Prices are stored in rupees; stock keeps four decimal places.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormLegend />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {textField('name')}
            {textField('sku')}
            {textField('hsnSac')}

            <form.Field
              name="uomId"
              validators={{
                onBlur: ({ value }) => itemFieldError('uomId', value),
                onChange: ({ value }) => itemFieldError('uomId', value),
                onSubmit: ({ value }) => itemFieldError('uomId', value)
              }}
            >
              {(field) => (
                <Field id="item-unit" label="Unit" help={FIELD_HELP.item.uom}>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      field.handleChange(value)
                      field.setErrorMap({ onBlur: undefined })
                      void field.validate('change')
                    }}
                  >
                    <SelectTrigger
                      id="item-unit"
                      className="w-full"
                      onBlur={() => {
                        field.handleBlur()
                        void field.validate('blur')
                      }}
                    >
                      <SelectValue placeholder="Choose a unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No unit</SelectItem>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={String(unit.id)}>
                          {unit.name} ({unit.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>

            <form.Field
              name="gstRateBps"
              validators={{
                onBlur: ({ value }) => itemFieldError('gstRateBps', value),
                onChange: ({ value }) => itemFieldError('gstRateBps', value),
                onSubmit: ({ value }) => itemFieldError('gstRateBps', value)
              }}
            >
              {(field) => (
                <Field id="item-gst" label="GST rate" help={FIELD_HELP.item.gstRate}>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      field.handleChange(value)
                      field.setErrorMap({ onBlur: undefined })
                      void field.validate('change')
                    }}
                  >
                    <SelectTrigger
                      id="item-gst"
                      className="w-full"
                      onBlur={() => {
                        field.handleBlur()
                        void field.validate('blur')
                      }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GST_RATES.map((rate) => (
                        <SelectItem key={rate} value={String(rate * 100)}>
                          {rate}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>

            <form.Field name="isService">
              {(field) => (
                <Field label="Item type" help={FIELD_HELP.item.service}>
                  <label
                    htmlFor="isService"
                    className="flex items-center gap-1.5 pt-0.5 text-[0.9375rem]"
                  >
                    <Checkbox
                      id="isService"
                      checked={field.state.value}
                      onCheckedChange={(checked) => field.handleChange(checked === true)}
                    />
                    Service item (no stock)
                  </label>
                </Field>
              )}
            </form.Field>

            {textField('salePrice')}
            {textField('purchasePrice')}
            {textField('openingQty')}
            {textField('openingRate')}
            {textField('reorderLevel')}
          </div>

          {save.isError ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
            >
              {errorMessage(save.error, 'Could not save the item.')}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? 'Saving...' : editing ? 'Save changes' : 'Add item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
