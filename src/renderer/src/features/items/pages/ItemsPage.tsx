import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
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
import { formatMinor, formatRate, minorToMajor } from '@/lib/money'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type { CreateItemInput, ItemRow } from '../../../../../shared/contracts/masters'

const LABEL = 'text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
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

type TextKey = Exclude<keyof ItemForm, 'isService'>

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

function validate(form: ItemForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (form.name.trim().length < 2) errors.name = 'Item name is required'
  if (toMinor(form.salePrice) < 0) errors.salePrice = 'Cannot be negative'
  if (toMinor(form.purchasePrice) < 0) errors.purchasePrice = 'Cannot be negative'
  if (toE4(form.openingQty) < 0) errors.openingQty = 'Cannot be negative'
  if (toMinor(form.openingRate) < 0) errors.openingRate = 'Cannot be negative'
  if (toE4(form.reorderLevel) < 0) errors.reorderLevel = 'Cannot be negative'
  return errors
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  inputMode,
  disabled,
  className
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  inputMode?: 'numeric' | 'decimal'
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={id} className={LABEL}>
        {label}
      </Label>
      <Input
        id={id}
        inputMode={inputMode}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="font-mono tabular-nums"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[0.75rem] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[0.75rem] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function ItemsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search, 250)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ItemRow | null>(null)
  const [form, setForm] = useState<ItemForm>(blankForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [target, setTarget] = useState<ItemRow | null>(null)

  const list = useQuery({
    queryKey: ['items', query, includeInactive],
    queryFn: () => window.api.items.list(query.trim() || undefined, includeInactive)
  })
  const units = useQuery({ queryKey: ['units'], queryFn: () => window.api.units.list() })
  const rows = list.data ?? []

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
      setOpen(false)
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save the item'))
  })

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
    setForm(next ? toForm(next) : blankForm())
    setErrors({})
    save.reset()
    setOpen(true)
  }

  function set<K extends TextKey>(key: K, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const payload: ItemPayload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      hsnSac: form.hsnSac.trim() || null,
      uomId: Number(form.uomId) || null,
      gstRateBps: Number(form.gstRateBps),
      isService: form.isService,
      salePriceMinor: toMinor(form.salePrice),
      purchasePriceMinor: toMinor(form.purchasePrice),
      openingQtyE4: toE4(form.openingQty),
      openingRateMinor: toMinor(form.openingRate)
    }
    save.mutate({
      id: editing?.id,
      payload,
      // The list row has no reorder level, so a blank field keeps the stored one.
      reorderLevelE4: form.reorderLevel.trim() ? toE4(form.reorderLevel) : editing ? undefined : 0
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-6">
      <PageHeader
        title="Items"
        description={`${rows.length} ${rows.length === 1 ? 'item' : 'items'} on file`}
        actions={
          <Button size="sm" onClick={() => show(null)}>
            <Plus className="size-3.5" strokeWidth={2} />
            New item
          </Button>
        }
      />

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
            <thead>
              <tr>
                {[
                  'Name',
                  'HSN',
                  'Unit',
                  'GST',
                  'Stock',
                  'Sale price',
                  'Purchase price',
                  'Status'
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className={`${TH} ${['GST', 'Stock', 'Sale price', 'Purchase price'].includes(heading) ? 'text-right' : ''}`}
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
                    colSpan={9}
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
                        <span className="text-[0.9375rem] font-medium">{item.name}</span>
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
                    <td className={`${TD} text-right font-mono text-[0.875rem] tabular-nums`}>
                      {quantity(item.stockQtyE4)}
                    </td>
                    <td className={`${TD} text-right font-mono text-[0.875rem] tabular-nums`}>
                      {formatMinor(item.salePriceMinor, 'INR')}
                    </td>
                    <td className={`${TD} text-right font-mono text-[0.875rem] tabular-nums`}>
                      {formatMinor(item.purchasePriceMinor, 'INR')}
                    </td>
                    <td className={TD}>
                      <Badge variant={item.isActive ? 'success' : 'outline'} className={TAG}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </Badge>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit item' : 'New item'}</DialogTitle>
            <DialogDescription>
              Prices are stored in rupees; stock keeps four decimal places.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-name" className={LABEL}>
                  Name
                </Label>
                <Input
                  id="item-name"
                  value={form.name}
                  autoFocus
                  onChange={(event) => set('name', event.target.value)}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'item-name-error' : undefined}
                />
                {errors.name ? (
                  <p id="item-name-error" role="alert" className="text-[0.75rem] text-destructive">
                    {errors.name}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-sku" className={LABEL}>
                  SKU
                </Label>
                <Input
                  id="item-sku"
                  value={form.sku}
                  onChange={(event) => set('sku', event.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-hsn" className={LABEL}>
                  HSN / SAC
                </Label>
                <Input
                  id="item-hsn"
                  value={form.hsnSac}
                  onChange={(event) => set('hsnSac', event.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-unit" className={LABEL}>
                  Unit
                </Label>
                <Select value={form.uomId} onValueChange={(value) => set('uomId', value)}>
                  <SelectTrigger id="item-unit" className="w-full">
                    <SelectValue placeholder="Choose a unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No unit</SelectItem>
                    {(units.data ?? []).map((unit) => (
                      <SelectItem key={unit.id} value={String(unit.id)}>
                        {unit.name} ({unit.symbol})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-gst" className={LABEL}>
                  GST rate
                </Label>
                <Select value={form.gstRateBps} onValueChange={(value) => set('gstRateBps', value)}>
                  <SelectTrigger id="item-gst" className="w-full">
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
              </div>
              <label
                htmlFor="item-service"
                className="flex items-center gap-1.5 self-end pb-2 text-[0.875rem]"
              >
                <Checkbox
                  id="item-service"
                  checked={form.isService}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isService: checked === true }))
                  }
                />
                Service item (no stock)
              </label>
              <TextField
                id="item-sale"
                label="Sale price (INR)"
                value={form.salePrice}
                onChange={(value) => set('salePrice', value)}
                error={errors.salePrice}
                inputMode="decimal"
              />
              <TextField
                id="item-purchase"
                label="Purchase price (INR)"
                value={form.purchasePrice}
                onChange={(value) => set('purchasePrice', value)}
                error={errors.purchasePrice}
                inputMode="decimal"
              />
              <TextField
                id="item-qty"
                label="Opening qty"
                value={form.openingQty}
                onChange={(value) => set('openingQty', value)}
                error={errors.openingQty}
                inputMode="decimal"
                disabled={editing !== null}
                hint={editing ? 'Fixed after the item is created.' : 'Up to 4 decimal places'}
              />
              <TextField
                id="item-rate"
                label="Opening rate (INR)"
                value={form.openingRate}
                onChange={(value) => set('openingRate', value)}
                error={errors.openingRate}
                inputMode="decimal"
                disabled={editing !== null}
                hint={editing ? 'Fixed after the item is created.' : undefined}
              />
              <TextField
                id="item-reorder"
                label="Reorder level"
                value={form.reorderLevel}
                onChange={(value) => set('reorderLevel', value)}
                error={errors.reorderLevel}
                inputMode="decimal"
                hint={editing ? 'Leave blank to keep the current level.' : undefined}
              />
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
