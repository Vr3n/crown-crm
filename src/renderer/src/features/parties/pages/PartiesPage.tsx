import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users } from 'lucide-react'
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
import { formatMinor, minorToMajor } from '@/lib/money'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type { CreatePartyInput, PartyRole, PartyRow } from '../../../../../shared/contracts/masters'

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-9 border-b border-border px-3 align-middle'
const TAG = 'rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.08em]'
const ROLES: { value: PartyRole; label: string }[] = [
  { value: 'BOTH', label: 'All' },
  { value: 'CUSTOMER', label: 'Customers' },
  { value: 'SUPPLIER', label: 'Suppliers' }
]

interface PartyForm {
  name: string
  phone: string
  email: string
  gstin: string
  stateCode: string
  billingAddress: string
  isCustomer: boolean
  isSupplier: boolean
  creditDays: string
  creditLimit: string
  openingBalance: string
  openingDate: string
}

type TextKey = Exclude<keyof PartyForm, 'isCustomer' | 'isSupplier'>

const today = (): string => new Date().toISOString().slice(0, 10)

const blankForm = (): PartyForm => ({
  name: '',
  phone: '',
  email: '',
  gstin: '',
  stateCode: '',
  billingAddress: '',
  isCustomer: true,
  isSupplier: false,
  creditDays: '0',
  creditLimit: '0',
  openingBalance: '0',
  openingDate: today()
})

const toForm = (party: PartyRow): PartyForm => ({
  name: party.name,
  phone: party.phone ?? '',
  email: party.email ?? '',
  gstin: party.gstin ?? '',
  stateCode: party.stateCode ?? '',
  billingAddress: '',
  isCustomer: party.isCustomer,
  isSupplier: party.isSupplier,
  creditDays: String(party.creditDays),
  creditLimit: minorToMajor(party.creditLimitMinor, 'INR'),
  openingBalance: minorToMajor(party.openingBalanceMinor, 'INR'),
  openingDate: ''
})

/** Rupees typed by the user to integer paise. Blank or invalid counts as zero. */
function toMinor(value: string): number {
  const cleaned = value.replace(/[₹,\s]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

function validate(form: PartyForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) errors.name = 'Party name is required'
  if (!form.isCustomer && !form.isSupplier) errors.role = 'Choose customer, supplier, or both'
  if (form.stateCode && !/^\d{2}$/.test(form.stateCode)) errors.stateCode = 'Two digits, e.g. 27'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Invalid email'
  const days = Number(form.creditDays)
  if (!Number.isInteger(days) || days < 0 || days > 365) errors.creditDays = '0 to 365'
  if (toMinor(form.creditLimit) < 0) errors.creditLimit = 'Cannot be negative'
  return errors
}

const FIELDS: {
  id: string
  label: string
  name: TextKey
  className?: string
  hint?: string
  type?: string
  inputMode?: 'tel' | 'email' | 'numeric' | 'decimal'
  maxLength?: number
  filter?: 'digits' | 'upper'
  autoFocus?: boolean
  mono?: boolean
}[] = [
  { id: 'party-name', label: 'Name', name: 'name', className: 'sm:col-span-2', autoFocus: true },
  { id: 'party-phone', label: 'Phone', name: 'phone', inputMode: 'tel' },
  { id: 'party-email', label: 'Email', name: 'email', type: 'email' },
  { id: 'party-gstin', label: 'GSTIN', name: 'gstin', filter: 'upper', maxLength: 15, mono: true },
  {
    id: 'party-state',
    label: 'State code',
    name: 'stateCode',
    filter: 'digits',
    inputMode: 'numeric',
    maxLength: 2,
    mono: true
  },
  {
    id: 'party-address',
    label: 'Billing address',
    name: 'billingAddress',
    className: 'sm:col-span-2'
  },
  {
    id: 'party-credit-days',
    label: 'Credit days',
    name: 'creditDays',
    filter: 'digits',
    inputMode: 'numeric',
    mono: true
  },
  {
    id: 'party-credit-limit',
    label: 'Credit limit (INR)',
    name: 'creditLimit',
    inputMode: 'decimal',
    mono: true
  },
  {
    id: 'party-opening',
    label: 'Opening balance (INR)',
    name: 'openingBalance',
    inputMode: 'decimal',
    hint: 'Positive is Dr (they owe you), negative is Cr.',
    mono: true
  },
  { id: 'party-opening-date', label: 'Opening date', name: 'openingDate', type: 'date', mono: true }
]

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  inputMode,
  maxLength,
  filter,
  autoFocus,
  mono,
  disabled,
  className
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  type?: string
  inputMode?: 'tel' | 'email' | 'numeric' | 'decimal'
  maxLength?: number
  filter?: 'digits' | 'upper'
  autoFocus?: boolean
  mono?: boolean
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
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const raw = event.target.value
          onChange(
            filter === 'digits'
              ? raw.replace(/\D/g, '')
              : filter === 'upper'
                ? raw.toUpperCase()
                : raw
          )
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${mono ? 'font-mono tabular-nums' : ''} ${inputMode === 'decimal' ? 'text-right' : ''}`}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[10.5px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function Balance({ minor }: { minor: number }): React.JSX.Element {
  if (minor === 0)
    return (
      <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
        {formatMinor(0, 'INR')}
      </span>
    )
  return (
    <span
      className={`font-mono text-[12px] tabular-nums ${minor > 0 ? 'text-success' : 'text-destructive'}`}
    >
      {formatMinor(Math.abs(minor), 'INR')}{' '}
      <span className="text-[10px]">{minor > 0 ? 'Dr' : 'Cr'}</span>
    </span>
  )
}

export function PartiesPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search, 250)
  const [role, setRole] = useState<PartyRole>('BOTH')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PartyRow | null>(null)
  const [form, setForm] = useState<PartyForm>(blankForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [target, setTarget] = useState<PartyRow | null>(null)

  const list = useQuery({
    queryKey: ['parties', query, role, includeInactive],
    queryFn: () =>
      window.api.parties.list({ query: query.trim() || undefined, role, includeInactive })
  })
  const rows = list.data ?? []
  const filtered = query.trim().length > 0 || role !== 'BOTH'

  const save = useMutation({
    mutationFn: (input: CreatePartyInput & { id?: number }) =>
      input.id
        ? window.api.parties.update({ ...input, id: input.id })
        : window.api.parties.create(input),
    onSuccess: () => {
      toast.success(editing ? 'Party updated' : 'Party added')
      void queryClient.invalidateQueries({ queryKey: ['parties'] })
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setOpen(false)
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save the party'))
  })

  const deactivate = useMutation({
    mutationFn: (id: number) => window.api.parties.deactivate(id),
    onSuccess: () => {
      toast.success('Party deactivated')
      void queryClient.invalidateQueries({ queryKey: ['parties'] })
      setTarget(null)
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not deactivate the party'))
  })

  function show(next: PartyRow | null): void {
    setEditing(next)
    setForm(next ? toForm(next) : blankForm())
    setErrors({})
    save.reset()
    setOpen(true)
  }

  function set<K extends TextKey>(key: K, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: '', role: '' }))
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const input: CreatePartyInput & { id?: number } = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      gstin: form.gstin.trim().toUpperCase() || null,
      stateCode: form.stateCode.trim() || null,
      isCustomer: form.isCustomer,
      isSupplier: form.isSupplier,
      creditDays: Number(form.creditDays),
      creditLimitMinor: toMinor(form.creditLimit),
      openingBalanceMinor: toMinor(form.openingBalance),
      openingBalanceDate: form.openingDate || null
    }
    // The list row has no address, so keep a stored one unless a new one is typed.
    if (!editing || form.billingAddress.trim())
      input.billingAddress = form.billingAddress.trim() || null
    if (editing) input.id = editing.id
    save.mutate(input)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-6">
      <PageHeader
        title="Parties"
        description={`${rows.length} ${rows.length === 1 ? 'party' : 'parties'}${filtered ? ' in this view' : ' on file'}`}
        actions={
          <Button size="sm" onClick={() => show(null)}>
            <Plus className="size-3.5" strokeWidth={2} />
            New party
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="party-search"
            aria-label="Search parties"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone or GSTIN"
            className="h-8 border-0 bg-transparent pl-8 text-[12.5px] focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <div className="flex items-center" role="group" aria-label="Filter by role">
          {ROLES.map((option, index) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={role === option.value}
              onClick={() => setRole(option.value)}
              className={`h-8 border border-border px-2.5 text-[11.5px] transition-colors ${index > 0 ? '-ml-px' : ''} ${
                role === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label
          htmlFor="party-inactive"
          className="flex cursor-pointer items-center gap-1.5 pl-1 text-[11.5px] text-muted-foreground"
        >
          <Checkbox
            id="party-inactive"
            checked={includeInactive}
            onCheckedChange={(checked) => setIncludeInactive(checked === true)}
          />
          Show inactive
        </label>
      </div>

      {list.isError ? (
        <div className="border border-border bg-card px-4 py-8 text-center">
          <p className="text-[12.5px] font-medium">Could not load parties</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {errorMessage(list.error, 'Try again in a moment.')}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 && !list.isPending ? (
        <EmptyState
          icon={Users}
          title={filtered ? 'No parties match' : 'No parties yet'}
          description={
            filtered
              ? 'Clear the search or switch the role filter to see more.'
              : 'Add the customers and suppliers you trade with, with their credit terms.'
          }
          action={
            filtered ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setRole('BOTH')
                  setIncludeInactive(false)
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={() => show(null)}>
                <Plus className="size-3.5" strokeWidth={2} />
                New party
              </Button>
            )
          }
        />
      ) : (
        <div className="max-h-[calc(100vh-15.5rem)] overflow-auto border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Name', 'Phone', 'Type', 'Credit days', 'Balance', 'Status'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className={`${TH} ${['Credit days', 'Balance'].includes(heading) ? 'text-right' : ''}`}
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
                    colSpan={7}
                    className="px-3 py-8 text-center text-[12px] text-muted-foreground"
                  >
                    Loading parties...
                  </td>
                </tr>
              ) : (
                rows.map((party) => (
                  <tr key={party.id} className="hover:bg-muted/40">
                    <td className={TD}>
                      <div className="text-[12.5px] font-medium">{party.name}</div>
                      {party.gstin ? (
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {party.gstin}
                        </div>
                      ) : null}
                    </td>
                    <td className={`${TD} font-mono text-[11.5px] text-muted-foreground`}>
                      {party.phone ?? '--'}
                    </td>
                    <td className={TD}>
                      <div className="flex gap-1">
                        {party.isCustomer ? (
                          <Badge variant="outline" className={TAG}>
                            Customer
                          </Badge>
                        ) : null}
                        {party.isSupplier ? (
                          <Badge variant="outline" className={TAG}>
                            Supplier
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${TD} text-right font-mono text-[12px] tabular-nums`}>
                      {party.creditDays}
                    </td>
                    <td className={`${TD} text-right`}>
                      <Balance minor={party.balanceMinor} />
                    </td>
                    <td className={TD}>
                      <Badge variant={party.isActive ? 'success' : 'outline'} className={TAG}>
                        {party.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="xs" onClick={() => show(party)}>
                          Edit
                        </Button>
                        {party.isActive ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setTarget(party)}
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
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit party' : 'New party'}</DialogTitle>
            <DialogDescription>
              One record per business. Opening balances post once, before the first voucher.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELDS.map((field) => {
                const locked =
                  editing !== null && ['openingBalance', 'openingDate'].includes(field.name)
                return (
                  <TextField
                    key={field.id}
                    {...field}
                    value={form[field.name]}
                    onChange={(value) => set(field.name, value)}
                    error={errors[field.name]}
                    disabled={locked}
                    hint={
                      field.name === 'billingAddress' && editing
                        ? 'A saved address is kept unless you type a replacement.'
                        : locked
                          ? 'Opening balances are fixed when the party is created.'
                          : field.hint
                    }
                  />
                )
              })}
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className={LABEL}>Role</legend>
              <div className="flex items-center gap-5">
                <label htmlFor="party-customer" className="flex items-center gap-1.5 text-[12.5px]">
                  <Checkbox
                    id="party-customer"
                    checked={form.isCustomer}
                    disabled={editing !== null}
                    onCheckedChange={(checked) =>
                      setForm((p) => ({ ...p, isCustomer: checked === true }))
                    }
                  />
                  Customer
                </label>
                <label htmlFor="party-supplier" className="flex items-center gap-1.5 text-[12.5px]">
                  <Checkbox
                    id="party-supplier"
                    checked={form.isSupplier}
                    disabled={editing !== null}
                    onCheckedChange={(checked) =>
                      setForm((p) => ({ ...p, isSupplier: checked === true }))
                    }
                  />
                  Supplier
                </label>
              </div>
              {editing ? (
                <p className="text-[10.5px] text-muted-foreground">
                  Roles and ledger accounts are set when the party is created.
                </p>
              ) : null}
              {errors.role ? (
                <p role="alert" className="text-[11px] text-destructive">
                  {errors.role}
                </p>
              ) : null}
            </fieldset>

            {save.isError ? (
              <p
                role="alert"
                className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11.5px] text-destructive"
              >
                {errorMessage(save.error, 'Could not save the party.')}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending ? 'Saving...' : editing ? 'Save changes' : 'Add party'}
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
        title="Deactivate this party?"
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
