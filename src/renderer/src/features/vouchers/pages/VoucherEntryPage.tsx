import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatMinor, minorToMajor, parseToMinor } from '@/lib/money'
import type { ItemRow } from '../../../../../shared/contracts/masters'
import type { PostVoucherInput } from '../../../../../shared/contracts/vouchers'
import { ItemPicker } from '../components/item-picker'
import { PartyPicker } from '../components/party-picker'

type LineType = 'SALES' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE'

interface EntryLine {
  key: string
  itemId: number | null
  description: string
  hsn: string
  qty: string
  uom: string
  rate: string
  disc: string
  gst: string
}

interface LinePreview {
  taxable: number
  cgst: number
  sgst: number
  igst: number
  total: number
}

const META: Record<
  LineType,
  { title: string; series: string; back: string; post: string; accent: Accent }
> = {
  SALES: {
    title: 'Sales invoice',
    series: 'INV',
    back: '/sales',
    post: 'Post invoice',
    accent: 'primary'
  },
  PURCHASE: {
    title: 'Purchase bill',
    series: 'PUR',
    back: '/purchases',
    post: 'Post bill',
    accent: 'stamp'
  },
  CREDIT_NOTE: {
    title: 'Credit note',
    series: 'CN',
    back: '/sales',
    post: 'Post credit note',
    accent: 'warning'
  },
  DEBIT_NOTE: {
    title: 'Debit note',
    series: 'DN',
    back: '/purchases',
    post: 'Post debit note',
    accent: 'warning'
  }
}

type Accent = 'primary' | 'stamp' | 'warning'

const ACCENT: Record<
  Accent,
  { bar: string; text: string; chip: string; soft: string; border: string }
> = {
  primary: {
    bar: 'bg-primary',
    text: 'text-primary',
    chip: 'bg-primary text-primary-foreground',
    soft: 'bg-accent-soft/60',
    border: 'border-t-primary'
  },
  stamp: {
    bar: 'bg-stamp',
    text: 'text-stamp',
    chip: 'bg-stamp text-paper',
    soft: 'bg-stamp-soft/60',
    border: 'border-t-stamp'
  },
  warning: {
    bar: 'bg-warning',
    text: 'text-warning',
    chip: 'bg-warning text-paper',
    soft: 'bg-warning-soft/60',
    border: 'border-t-warning'
  }
}
const HEADERS = [
  '#',
  'Item',
  'Description',
  'HSN',
  'Qty',
  'Unit',
  'Rate',
  'Disc %',
  'GST %',
  'Amount',
  ''
]
const CELL =
  'h-9 w-full border-0 bg-transparent px-2 text-[0.875rem] text-foreground outline-none placeholder:text-muted-foreground/60'
const FIELD_KEYS = [
  { key: 'description', label: 'Description', placeholder: 'Item or service' },
  { key: 'hsn', label: 'HSN', mono: true },
  { key: 'qty', label: 'Qty', right: true, mono: true },
  { key: 'uom', label: 'Unit' },
  { key: 'rate', label: 'Rate', right: true, mono: true },
  { key: 'disc', label: 'Disc %', right: true, mono: true },
  { key: 'gst', label: 'GST %', right: true, mono: true }
] as const

const todayIso = (date = new Date()): string =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return todayIso(date)
}

function blankLine(): EntryLine {
  return {
    key: crypto.randomUUID(),
    itemId: null,
    description: '',
    hsn: '',
    qty: '1',
    uom: '',
    rate: '',
    disc: '0',
    gst: '0'
  }
}

function roundHalfUpDiv(numerator: number, denominator: number): number {
  return (
    Math.sign(numerator) * Math.floor((Math.abs(numerator) * 2 + denominator) / (2 * denominator))
  )
}

const applyBps = (amount: number, bps: number): number => roundHalfUpDiv(amount * bps, 10_000)

function toQtyE4(value: string): number {
  const qty = Number(value)
  return Number.isFinite(qty) && qty > 0 ? Math.round(qty * 10_000) : 0
}

const toRateMinor = (value: string): number => parseToMinor(value, 'INR') ?? 0

function toBps(value: string, max: number): number {
  const percent = Number(value)
  return Number.isFinite(percent) && percent > 0 ? Math.min(max, Math.round(percent * 100)) : 0
}

function previewLine(line: EntryLine, intraState: boolean): LinePreview {
  const gross = roundHalfUpDiv(toQtyE4(line.qty) * toRateMinor(line.rate), 10_000)
  const taxable = gross - applyBps(gross, toBps(line.disc, 10_000))
  const gstRate = toBps(line.gst, 5_000)
  if (!intraState) {
    const igst = applyBps(taxable, gstRate)
    return { taxable, cgst: 0, sgst: 0, igst, total: taxable + igst }
  }
  const half = Math.floor(gstRate / 2)
  const cgst = applyBps(taxable, half)
  const sgst = applyBps(taxable, gstRate - half)
  return { taxable, cgst, sgst, igst: 0, total: taxable + cgst + sgst }
}

function previewTotals(rows: LinePreview[]): LinePreview & { roundOff: number } {
  const taxable = rows.reduce((sum, row) => sum + row.taxable, 0)
  const cgst = rows.reduce((sum, row) => sum + row.cgst, 0)
  const sgst = rows.reduce((sum, row) => sum + row.sgst, 0)
  const igst = rows.reduce((sum, row) => sum + row.igst, 0)
  const preRound = taxable + cgst + sgst + igst
  const total = roundHalfUpDiv(preRound, 100) * 100
  return { taxable, cgst, sgst, igst, total, roundOff: total - preRound }
}

export function VoucherEntryPage({ type }: { type: LineType }): React.JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const partyRef = useRef<HTMLButtonElement>(null)
  const role = type === 'SALES' || type === 'CREDIT_NOTE' ? 'CUSTOMER' : 'SUPPLIER'
  const [partyId, setPartyId] = useState<number | null>(null)
  const [partyOpen, setPartyOpen] = useState(false)
  const [date, setDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState('')
  const [reference, setReference] = useState('')
  const [placeOfSupply, setPlaceOfSupply] = useState('')
  const [narration, setNarration] = useState('')
  const [lines, setLines] = useState<EntryLine[]>(() => [blankLine()])

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: () => window.api.identity.company()
  })
  const { data: parties = [] } = useQuery({
    queryKey: ['parties', role],
    queryFn: () => window.api.parties.list({ role, includeInactive: false })
  })
  const { data: items = [] } = useQuery({
    queryKey: ['items'],
    queryFn: () => window.api.items.list()
  })

  const party = parties.find((row) => row.id === partyId) ?? null
  const meta = META[type]
  const effectivePlace = placeOfSupply || party?.stateCode || company?.stateCode || '27'
  const intraState = effectivePlace === (company?.stateCode ?? '27')
  const previews = lines.map((line) => previewLine(line, intraState))
  const totals = previewTotals(previews)
  const usable = lines.filter((line) => line.description.trim().length > 0)
  const badQty = usable.some((line) => toQtyE4(line.qty) <= 0)
  const reason = !party
    ? `Select a ${role === 'CUSTOMER' ? 'customer' : 'supplier'} to post.`
    : usable.length === 0
      ? 'Add at least one line with a description.'
      : badQty
        ? 'Each line needs a quantity greater than zero.'
        : totals.total <= 0
          ? 'The voucher total must be greater than zero.'
          : ''

  const post = useMutation({
    mutationFn: (input: PostVoucherInput) => window.api.vouchers.post(input),
    onSuccess: (result) => {
      toast.success(`Posted ${result.number}`)
      void queryClient.invalidateQueries({ queryKey: ['vouchers'] })
      navigate(`/vouchers/${result.id}`)
    }
  })

  useEffect(() => partyRef.current?.focus(), [])

  const addLine = useCallback((): void => {
    setLines((current) => [...current, blankLine()])
  }, [])

  function submit(): void {
    if (reason || post.isPending) return
    post.mutate({
      requestId: crypto.randomUUID(),
      type,
      date,
      dueDate: dueDate || null,
      partyId: party?.id ?? null,
      placeOfSupplyStateCode: effectivePlace,
      referenceNo: reference.trim() || null,
      narration: narration.trim() || null,
      lines: usable.map((line) => ({
        itemId: line.itemId,
        description: line.description.trim(),
        hsn: line.hsn.trim() || null,
        uom: line.uom.trim() || null,
        qtyE4: toQtyE4(line.qty),
        rateMinor: toRateMinor(line.rate),
        rateIncludesTax: false,
        discountBps: toBps(line.disc, 10_000),
        gstRateBps: toBps(line.gst, 5_000)
      })),
      journalLines: [],
      allocations: []
    })
  }

  const submitRef = useRef<() => void>(() => {})
  useEffect(() => {
    submitRef.current = submit
  })

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        addLine()
      } else if (event.key === 'F4') {
        event.preventDefault()
        setPartyOpen(true)
      } else if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault()
        submitRef.current()
      } else if (event.key === 'Escape') {
        navigate(meta.back)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addLine, navigate, meta.back])

  function chooseParty(value: string): void {
    const next = value ? Number(value) : null
    setPartyId(next)
    setPlaceOfSupply('')
    const selected = parties.find((row) => row.id === next) ?? null
    if (selected && (type === 'SALES' || type === 'PURCHASE')) {
      setDueDate(addDays(date, selected.creditDays > 0 ? selected.creditDays : 30))
    }
  }

  function changeDate(value: string): void {
    setDate(value)
    if (party && (type === 'SALES' || type === 'PURCHASE')) {
      setDueDate(addDays(value, party.creditDays > 0 ? party.creditDays : 30))
    }
  }

  function updateLine(key: string, patch: Partial<EntryLine>): void {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function chooseItem(key: string, item: ItemRow | null): void {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line
        if (!item) return { ...line, itemId: null }
        const sale = type === 'SALES' || type === 'CREDIT_NOTE'
        const priceMinor = sale ? item.salePriceMinor : item.purchasePriceMinor
        return {
          ...line,
          itemId: item.id,
          description: item.name,
          hsn: item.hsnSac ?? '',
          uom: item.uom ?? '',
          rate: minorToMajor(priceMinor, 'INR'),
          gst: String(item.gstRateBps / 100),
          qty: line.qty || '1'
        }
      })
    )
  }

  function removeLine(key: string): void {
    setLines((current) => current.filter((line) => line.key !== key))
  }

  const postError = post.error instanceof Error ? post.error.message : 'Could not post the voucher.'

  const accent = ACCENT[meta.accent]

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-6 pb-24">
      <header className={cn('border border-border border-t-4 bg-card px-5 py-4', accent.border)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 flex size-9 shrink-0 items-center justify-center',
                accent.soft,
                accent.text
              )}
            >
              <Receipt className="size-4" strokeWidth={1.75} />
            </span>
            <div>
              <p
                className={cn(
                  'font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.2em]',
                  accent.text
                )}
              >
                {meta.series} · {meta.title}
              </p>
              <h1 className="mt-1 font-heading text-[1.5rem] font-semibold leading-none tracking-tight">
                New {meta.title.toLowerCase()}
              </h1>
              <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">
                Party and dates, then lines, then review and post.
              </p>
            </div>
          </div>
          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground">
            Original for recipient
          </span>
        </div>
      </header>

      <Section
        step={1}
        title="Party and dates"
        hint={party ? `Credit ${party.creditDays} days` : 'Choose who this bill is from'}
        accent={accent}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {role === 'CUSTOMER' ? 'Customer' : 'Supplier'}
              <span aria-hidden className="ml-0.5 text-stamp">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </span>
            <PartyPicker
              parties={parties}
              value={partyId}
              onChange={(id) => chooseParty(id ? String(id) : '')}
              roleLabel={role === 'CUSTOMER' ? 'customer' : 'supplier'}
              open={partyOpen}
              onOpenChange={setPartyOpen}
              triggerRef={partyRef}
            />
            {!party ? (
              <p className="text-[0.75rem] text-muted-foreground">
                The bill cannot be posted until a {role === 'CUSTOMER' ? 'customer' : 'supplier'} is
                chosen. Press F4 from anywhere on the page.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <HeaderField label="Date" required>
              <input
                type="date"
                value={date}
                onChange={(e) => changeDate(e.target.value)}
                aria-label="Voucher date"
                className={INPUT}
              />
            </HeaderField>
            <HeaderField label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date"
                className={INPUT}
              />
            </HeaderField>
            <HeaderField label="Reference">
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Order or bill reference"
                aria-label="Reference"
                className={cn(INPUT, 'placeholder:text-muted-foreground/60')}
              />
            </HeaderField>
            <HeaderField label="Place of supply">
              <div className="flex items-center gap-2">
                <input
                  value={effectivePlace}
                  onChange={(e) => setPlaceOfSupply(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder={company?.stateCode ?? '27'}
                  inputMode="numeric"
                  maxLength={2}
                  aria-label="Place of supply state code"
                  className={cn(INPUT, 'w-14 font-mono')}
                />
                <span className="text-[0.6875rem] leading-tight text-muted-foreground">
                  {intraState ? 'CGST + SGST' : 'IGST'}
                </span>
              </div>
            </HeaderField>
          </div>
        </div>
      </Section>

      <Section
        step={2}
        title="Lines"
        hint={`${lines.length} row${lines.length === 1 ? '' : 's'} · Alt+A adds a line`}
        accent={accent}
        actions={
          <Button type="button" variant="outline" size="xs" onClick={addLine}>
            <Plus className="size-3" />
            Add line
          </Button>
        }
      >
        <table className="w-full table-fixed border-collapse text-[0.875rem]">
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[16%]" />
            <col className="w-[22%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[11%]" />
            <col className="w-[2%]" />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-rule-strong bg-muted">
              {HEADERS.map((label, index) => {
                const right =
                  label === 'Amount' || label === 'Qty' || label === 'Disc %' || label === 'GST %'
                return (
                  <th
                    key={`${label}-${index}`}
                    className={`h-8 px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground ${right ? 'text-right' : 'text-left'}`}
                  >
                    {label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr className="h-9 border-b border-border">
                <td colSpan={11} className="px-3 text-[0.875rem] text-muted-foreground">
                  No lines yet. Add a line or press Alt+A.
                </td>
              </tr>
            ) : null}
            {lines.map((line, index) => (
              <tr
                key={line.key}
                className="h-9 border-b border-border last:border-b-0 focus-within:bg-accent-soft/30"
              >
                <td className="px-2 font-mono text-[0.75rem] text-muted-foreground">{index + 1}</td>
                <td className="p-0">
                  <ItemPicker
                    items={items}
                    value={line.itemId}
                    sale={type === 'SALES' || type === 'CREDIT_NOTE'}
                    onSelect={(item) => chooseItem(line.key, item)}
                  />
                </td>
                {FIELD_KEYS.map((field) => (
                  <td key={field.key} className="p-0">
                    <CellInput
                      value={line[field.key]}
                      onChange={(value) => updateLine(line.key, { [field.key]: value })}
                      label={`${field.label} for line ${index + 1}`}
                      placeholder={'placeholder' in field ? field.placeholder : undefined}
                      right={'right' in field && field.right}
                      mono={'mono' in field && field.mono}
                    />
                  </td>
                ))}
                <td className="px-2 text-right font-mono text-[0.875rem] tabular-nums">
                  {formatMinor(previews[index].total, 'INR')}
                </td>
                <td className="p-0">
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    aria-label={`Remove line ${index + 1}`}
                    className="flex h-9 w-8 items-center justify-center text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.6} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border border-border bg-card px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="narration"
              className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Narration
            </label>
            <span className="text-[0.6875rem] text-muted-foreground">Printed on the voucher</span>
          </div>
          <textarea
            id="narration"
            rows={3}
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="Notes printed on the voucher"
            className="mt-1.5 w-full resize-none border border-input bg-background px-2 py-1.5 text-[0.875rem] outline-none placeholder:text-muted-foreground/60 focus:border-primary"
          />
        </div>
        <div
          className={cn(
            'self-start border border-border border-t-4 bg-card px-4 py-3 lg:sticky lg:top-4',
            accent.border
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em]">
              Summary
            </span>
            <span
              className={cn('font-mono text-[0.6875rem] uppercase tracking-[0.1em]', accent.text)}
            >
              {intraState ? 'CGST + SGST' : 'IGST'}
            </span>
          </div>
          <TotalRow label="Taxable value" value={totals.taxable} />
          <TotalRow label="CGST" value={totals.cgst} />
          <TotalRow label="SGST" value={totals.sgst} />
          <TotalRow label="IGST" value={totals.igst} />
          <TotalRow label="Round off" value={totals.roundOff} />
          <div className="mt-2 flex items-baseline justify-between border-t border-rule-strong pt-2">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em]">
              Total
            </span>
            <span
              className="font-mono text-[1.25rem] tabular-nums"
              aria-live="polite"
              aria-atomic="true"
            >
              {formatMinor(totals.total, 'INR')}
            </span>
          </div>
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
            Local preview. The posted voucher is computed by the server.
          </p>
        </div>
      </div>

      {post.isError ? (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-[0.875rem] text-destructive"
        >
          {postError}
        </p>
      ) : null}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-rule-strong bg-background py-3">
        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(meta.back)}>
            Cancel
          </Button>
          <p className="font-mono text-[0.6875rem] text-muted-foreground">
            Alt+A add line · Ctrl+Enter post · F4 party · Esc back
          </p>
        </div>
        <div className="flex items-center gap-3">
          {reason ? <span className="text-[0.75rem] text-muted-foreground">{reason}</span> : null}
          <Button
            type="button"
            size="sm"
            className={cn(meta.accent === 'stamp' && 'bg-stamp text-paper hover:bg-stamp/90')}
            onClick={submit}
            disabled={Boolean(reason) || post.isPending}
          >
            {post.isPending ? 'Posting…' : meta.post}
          </Button>
        </div>
      </div>
    </div>
  )
}

const INPUT =
  'h-9 w-full border border-input bg-background px-2 text-[0.875rem] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary'

function Section({
  step,
  title,
  hint,
  accent,
  actions,
  children
}: {
  step: number
  title: string
  hint?: string
  accent: (typeof ACCENT)[Accent]
  actions?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="border border-border bg-card">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5',
          accent.soft
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex size-5 shrink-0 items-center justify-center font-mono text-[0.6875rem] font-semibold',
              accent.chip
            )}
            aria-hidden
          >
            {step}
          </span>
          <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
          {hint ? (
            <span className="truncate text-[0.75rem] text-muted-foreground">{hint}</span>
          ) : null}
        </div>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function HeaderField({
  label,
  required,
  children
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
        {required ? (
          <>
            <span aria-hidden className="ml-0.5 text-stamp">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </span>
      {children}
    </label>
  )
}

function CellInput({
  value,
  onChange,
  label,
  placeholder,
  right,
  mono
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  right?: boolean
  mono?: boolean
}): React.JSX.Element {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      placeholder={placeholder}
      inputMode={right ? 'decimal' : undefined}
      className={`${CELL} ${right ? 'text-right' : ''} ${mono ? 'font-mono' : ''}`}
    />
  )
}

function TotalRow({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-[0.875rem]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{formatMinor(value, 'INR')}</span>
    </div>
  )
}
