import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type { CompanyProfile, UpdateCompanyInput } from '../../../../../shared/contracts/identity'

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

interface CompanyForm {
  name: string
  legalName: string
  gstin: string
  pan: string
  stateCode: string
  phone: string
  email: string
  address: string
  city: string
  pincode: string
  fyStartMonth: string
  booksBeginDate: string
  costingMethod: 'WEIGHTED_AVERAGE' | 'FIFO'
  roundOffMode: 'INVOICE' | 'LINE' | 'NONE'
  invoiceTerms: string
  allowNegativeStock: boolean
}

type TextKey = Exclude<keyof CompanyForm, 'allowNegativeStock' | 'costingMethod' | 'roundOffMode'>

const IDENTITY_FIELDS: {
  id: string
  label: string
  name: TextKey
  type?: string
  inputMode?: 'tel' | 'email' | 'numeric'
  maxLength?: number
  filter?: 'digits' | 'upper'
  className?: string
}[] = [
  { id: 'company-name', label: 'Registered name', name: 'name' },
  { id: 'company-legal', label: 'Legal name', name: 'legalName' },
  { id: 'company-gstin', label: 'GSTIN', name: 'gstin', filter: 'upper', maxLength: 15 },
  { id: 'company-pan', label: 'PAN', name: 'pan', filter: 'upper', maxLength: 10 },
  {
    id: 'company-state',
    label: 'State code',
    name: 'stateCode',
    filter: 'digits',
    inputMode: 'numeric',
    maxLength: 2
  },
  { id: 'company-phone', label: 'Phone', name: 'phone', inputMode: 'tel' },
  { id: 'company-email', label: 'Email', name: 'email', type: 'email', className: 'sm:col-span-2' },
  { id: 'company-address', label: 'Address', name: 'address', className: 'sm:col-span-2' },
  { id: 'company-city', label: 'City', name: 'city' },
  {
    id: 'company-pincode',
    label: 'Pincode',
    name: 'pincode',
    filter: 'digits',
    inputMode: 'numeric',
    maxLength: 6
  }
]

const toForm = (profile: CompanyProfile): CompanyForm => ({
  name: profile.name,
  legalName: profile.legalName ?? '',
  gstin: profile.gstin ?? '',
  pan: profile.pan ?? '',
  stateCode: profile.stateCode,
  phone: profile.phone ?? '',
  email: profile.email ?? '',
  address: profile.address ?? '',
  city: profile.city ?? '',
  pincode: profile.pincode ?? '',
  fyStartMonth: String(profile.fyStartMonth),
  booksBeginDate: profile.booksBeginDate,
  costingMethod: profile.costingMethod === 'FIFO' ? 'FIFO' : 'WEIGHTED_AVERAGE',
  roundOffMode:
    profile.roundOffMode === 'LINE' ? 'LINE' : profile.roundOffMode === 'NONE' ? 'NONE' : 'INVOICE',
  invoiceTerms: profile.invoiceTerms ?? '',
  allowNegativeStock: profile.allowNegativeStock
})

function validate(form: CompanyForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) errors.name = 'Company name is required'
  if (!/^\d{2}$/.test(form.stateCode)) errors.stateCode = 'Two digits, e.g. 27'
  if (form.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(form.pan)) errors.pan = 'Format: AAAAA9999A'
  if (form.gstin && form.gstin.length !== 15) errors.gstin = 'GSTIN is 15 characters'
  if (form.pincode && !/^\d{6}$/.test(form.pincode)) errors.pincode = 'Six digits'
  if (!form.booksBeginDate) errors.booksBeginDate = 'Books begin date is required'
  const month = Number(form.fyStartMonth)
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.fyStartMonth = 'Choose a month'
  return errors
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <h2 className="text-[12px] font-semibold">{title}</h2>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

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
  className
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  type?: string
  inputMode?: 'tel' | 'email' | 'numeric'
  maxLength?: number
  filter?: 'digits' | 'upper'
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
        className={filter === 'upper' || inputMode === 'numeric' ? 'font-mono' : undefined}
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

function CompanyEditor({ profile }: { profile: CompanyProfile }): React.JSX.Element {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CompanyForm>(() => toForm(profile))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: UpdateCompanyInput) => window.api.identity.updateCompany(input),
    onSuccess: (updated) => {
      setForm(toForm(updated))
      toast.success('Company details saved')
      void queryClient.invalidateQueries({ queryKey: ['company', 'profile'] })
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save the company details'))
  })

  function set<K extends TextKey>(key: K, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    save.mutate({
      name: form.name.trim(),
      legalName: form.legalName.trim() || null,
      gstin: form.gstin.trim().toUpperCase() || null,
      pan: form.pan.trim().toUpperCase() || null,
      stateCode: form.stateCode,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      pincode: form.pincode.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      invoiceTerms: form.invoiceTerms.trim() || null,
      fyStartMonth: Number(form.fyStartMonth),
      booksBeginDate: form.booksBeginDate,
      costingMethod: form.costingMethod,
      roundOffMode: form.roundOffMode,
      allowNegativeStock: form.allowNegativeStock
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Section title="Identity" hint="Printed on every document">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {IDENTITY_FIELDS.map((field) => (
            <TextField
              key={field.id}
              {...field}
              value={form[field.name]}
              onChange={(value) => set(field.name, value)}
              error={errors[field.name]}
            />
          ))}
        </div>
      </Section>

      <Section title="Financial year" hint="Drives period and numbering">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-fy-month" className={LABEL}>
              Financial year starts
            </Label>
            <Select value={form.fyStartMonth} onValueChange={(value) => set('fyStartMonth', value)}>
              <SelectTrigger id="company-fy-month" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, index) => (
                  <SelectItem key={month} value={String(index + 1)}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TextField
            id="company-books-begin"
            label="Books begin date"
            type="date"
            value={form.booksBeginDate}
            onChange={(value) => set('booksBeginDate', value)}
            error={errors.booksBeginDate}
          />
        </div>
      </Section>

      <Section title="Stock and rounding" hint="Applies to new documents">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-costing" className={LABEL}>
              Costing method
            </Label>
            <Select
              value={form.costingMethod}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  costingMethod: value as CompanyForm['costingMethod']
                }))
              }
            >
              <SelectTrigger id="company-costing" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WEIGHTED_AVERAGE">Weighted average</SelectItem>
                <SelectItem value="FIFO">FIFO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-rounding" className={LABEL}>
              Round off
            </Label>
            <Select
              value={form.roundOffMode}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, roundOffMode: value as CompanyForm['roundOffMode'] }))
              }
            >
              <SelectTrigger id="company-rounding" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INVOICE">Invoice total</SelectItem>
                <SelectItem value="LINE">Each line</SelectItem>
                <SelectItem value="NONE">No rounding</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label
            htmlFor="company-negative-stock"
            className="flex items-center gap-1.5 text-[12px] sm:col-span-2"
          >
            <Checkbox
              id="company-negative-stock"
              checked={form.allowNegativeStock}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, allowNegativeStock: checked === true }))
              }
            />
            Allow selling below stock on hand
          </label>
        </div>
      </Section>

      <Section title="Invoice terms" hint="Shown above the signature block">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-terms" className={LABEL}>
            Default terms and conditions
          </Label>
          <Textarea
            id="company-terms"
            value={form.invoiceTerms}
            onChange={(event) => set('invoiceTerms', event.target.value)}
            rows={4}
            placeholder="Goods once sold will not be taken back."
          />
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2">
        {save.isError ? (
          <p role="alert" className="mr-auto text-[11.5px] text-destructive">
            {errorMessage(save.error, 'Could not save the company details.')}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

function OpeningBalances({ defaultDate }: { defaultDate: string }): React.JSX.Element {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(defaultDate)
  const [posted, setPosted] = useState<string | null>(null)

  const post = useMutation({
    mutationFn: (value: string) => window.api.vouchers.postOpening(value),
    onSuccess: (result) => {
      setPosted(result.number)
      toast.success(`Opening balances posted as ${result.number}`)
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      void queryClient.invalidateQueries({ queryKey: ['parties'] })
      void queryClient.invalidateQueries({ queryKey: ['items'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
    },
    onError: (err) => {
      const code = (err as { code?: string }).code
      const message = errorMessage(err, '')
      if (code === 'CONFLICT' || /already been posted/i.test(message)) {
        toast.error('Opening balances have already been posted', {
          description: 'Only one opening voucher is allowed. Use a journal entry for corrections.'
        })
      } else {
        toast.error(errorMessage(err, 'Could not post opening balances'))
      }
    }
  })

  return (
    <Section title="Opening balances" hint="Runs once, before the first voucher">
      <div className="flex flex-col gap-3">
        <p className="max-w-[70ch] text-[12px] leading-relaxed text-muted-foreground">
          Party, account and stock opening balances are posted together as one balanced opening
          voucher. If the totals differ, the difference goes to Opening Balance Difference and the
          trial balance stays in balance.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex w-48 flex-col gap-1.5">
            <Label htmlFor="opening-date" className={LABEL}>
              Opening date
            </Label>
            <Input
              id="opening-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="font-mono"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!date || post.isPending || posted !== null}
            onClick={() => post.mutate(date)}
          >
            {post.isPending ? 'Posting...' : posted ? 'Posted' : 'Post opening balances'}
          </Button>
        </div>
        {posted ? (
          <p className="text-[11.5px] text-success">Posted as {posted}</p>
        ) : post.isError ? (
          <p role="alert" className="text-[11.5px] text-destructive">
            {errorMessage(post.error, 'Could not post opening balances.')}
          </p>
        ) : null}
      </div>
    </Section>
  )
}

export function CompanyPage(): React.JSX.Element {
  const profile = useQuery({
    queryKey: ['company', 'profile'],
    queryFn: () => window.api.identity.company(),
    staleTime: 60_000
  })

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 p-6">
      <PageHeader
        title="Company"
        description="Identity, tax details, financial year and the one-time opening balances."
      />

      {profile.isPending ? (
        <div className="border border-border bg-card px-4 py-8 text-center text-[12px] text-muted-foreground">
          Loading company details...
        </div>
      ) : profile.isError ? (
        <div className="border border-border bg-card px-4 py-8 text-center">
          <p className="text-[12.5px] font-medium">Could not load the company</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {errorMessage(profile.error, 'Try again in a moment.')}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void profile.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : profile.data ? (
        <>
          <CompanyEditor key={profile.data.id} profile={profile.data} />
          <OpeningBalances defaultDate={profile.data.booksBeginDate} />
        </>
      ) : (
        <EmptyState
          icon={Building2}
          title="Company not set up"
          description="Finish setup before changing the company profile."
        />
      )}
    </div>
  )
}
