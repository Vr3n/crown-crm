import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CalendarRange, CheckCircle2, History, Pencil, Percent, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
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
import { FormLegend } from '@/components/ui/field'
import { focusFirstError, FormTextField, type FormFieldApi } from '@/components/ui/form-field'
import { StatusPill } from '@/components/ui/status-pill'
import { can, useSession } from '@/context/session-context'
import { formatDate } from '@/lib/format'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type { CreateTaxRateInput, TaxRateRow } from '../../../../../shared/contracts/masters'

const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-9 border-b border-border px-3 align-middle'

function todayIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDaysIso(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0)).toISOString().slice(0, 10)
}

function previousDayLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'the day before the start date'
  return formatDate(addDaysIso(value, -1))
}

function percentText(bps: number): string {
  return String(Math.round(bps) / 100)
}

function percentToBps(raw: string): number | null {
  const cleaned = raw.replace(/[%,\s]/g, '')
  if (!cleaned || cleaned === '.') return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null
  return Math.round(parsed * 100)
}

const rateFormSchema = z.object({
  gstPercent: z.string().refine((value) => percentToBps(value) !== null, 'Enter 0 to 100'),
  cessPercent: z.string().refine((value) => percentToBps(value) !== null, 'Enter 0 to 100'),
  description: z.string().max(120, 'Keep the label under 120 characters'),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an effective date')
})

type RateForm = z.infer<typeof rateFormSchema>

interface RatePayload extends CreateTaxRateInput {
  id?: number
}

function statusOf(row: TaxRateRow): {
  label: string
  tone: 'success' | 'info' | 'neutral'
} {
  const today = todayIso()
  if (row.effectiveFrom > today) return { label: 'Upcoming', tone: 'info' }
  if (row.effectiveTo && row.effectiveTo < today) return { label: 'Ended', tone: 'neutral' }
  return { label: 'Current', tone: 'success' }
}

export function TaxRatesPage(): React.JSX.Element {
  const session = useSession()
  const mayManage = can(session.permissions, session.isSuper, 'settings.manage')
  const [includeHistory, setIncludeHistory] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revising, setRevising] = useState<TaxRateRow | null>(null)
  const [retiring, setRetiring] = useState<TaxRateRow | null>(null)

  const list = useQuery({
    queryKey: ['tax-rates', { includeHistory }],
    queryFn: () => window.api.taxRates.list({ includeHistory })
  })

  const rows = list.data ?? []
  const currentCount = rows.filter((row) => statusOf(row).label === 'Current').length

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-6">
      <PageHeader
        title="Tax Rates"
        description={`${currentCount} current rate${currentCount === 1 ? '' : 's'} · GST and cess, effective-dated`}
        actions={
          mayManage ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" strokeWidth={2} />
              New rate
            </Button>
          ) : undefined
        }
      />

      <div className="border border-border bg-card px-4 py-3">
        <div className="flex items-start gap-2.5">
          <CalendarRange className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-[0.875rem] font-medium">Changing a rate never rewrites history.</p>
            <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
              A revision closes the old row the day before the new rate starts. Posted invoices keep
              the rate stored on their lines, and item prices keep the rate they were saved with.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-card px-3 py-2">
        <label
          htmlFor="tax-rate-history"
          className="flex cursor-pointer items-center gap-1.5 text-[0.875rem] text-muted-foreground"
        >
          <Checkbox
            id="tax-rate-history"
            checked={includeHistory}
            onCheckedChange={(checked) => setIncludeHistory(checked === true)}
          />
          <History className="size-3.5" strokeWidth={2} />
          Show ended and upcoming rates
        </label>
        <p className="text-[0.75rem] text-muted-foreground">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </p>
      </div>

      {list.isError ? (
        <div className="border border-border bg-card px-4 py-8 text-center">
          <p className="text-[0.9375rem] font-medium">Could not load tax rates</p>
          <p className="mt-1 text-[0.875rem] text-muted-foreground">
            {errorMessage(list.error, 'Try again in a moment.')}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 && !list.isPending ? (
        <EmptyState
          icon={Percent}
          title="No tax rates yet"
          description="Add the GST slabs your business uses before creating taxable items."
          action={
            mayManage ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-3.5" strokeWidth={2} />
                New rate
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-auto border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={`${TH} text-right`}>
                  GST
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Cess
                </th>
                <th scope="col" className={TH}>
                  Label
                </th>
                <th scope="col" className={TH}>
                  Effective
                </th>
                <th scope="col" className={TH}>
                  Status
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.isPending ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-[0.875rem] text-muted-foreground"
                  >
                    Loading tax rates...
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const status = statusOf(row)
                  const open = row.effectiveTo === null
                  return (
                    <tr key={row.id} className="hover:bg-muted/40">
                      <td className={`${TD} text-right font-mono text-[0.9375rem] tabular-nums`}>
                        {percentText(row.gstRateBps)}%
                      </td>
                      <td
                        className={`${TD} text-right font-mono text-[0.875rem] tabular-nums text-muted-foreground`}
                      >
                        {row.cessRateBps > 0 ? `${percentText(row.cessRateBps)}%` : '—'}
                      </td>
                      <td className={`${TD} text-[0.9375rem]`}>{row.description ?? '—'}</td>
                      <td className={TD}>
                        <div className="flex flex-wrap items-center gap-1 font-mono text-[0.75rem] tabular-nums">
                          <span>{formatDate(row.effectiveFrom)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className={row.effectiveTo ? '' : 'text-muted-foreground'}>
                            {row.effectiveTo ? formatDate(row.effectiveTo) : 'Open'}
                          </span>
                        </div>
                      </td>
                      <td className={TD}>
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      </td>
                      <td className={`${TD} text-right`}>
                        {mayManage ? (
                          open ? (
                            <div className="flex justify-end gap-0.5">
                              <Button variant="ghost" size="xs" onClick={() => setRevising(row)}>
                                <Pencil className="size-3.5" strokeWidth={2} />
                                Change
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => setRetiring(row)}
                              >
                                <Ban className="size-3.5" strokeWidth={2} />
                                Retire
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[0.75rem] text-muted-foreground">Ended</span>
                          )
                        ) : (
                          <span className="text-[0.75rem] text-muted-foreground">Read only</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <RateDialog
          open={creating}
          onOpenChange={setCreating}
          mode="create"
          row={null}
          onSaved={() => setCreating(false)}
        />
      ) : null}

      {revising ? (
        <RateDialog
          open
          onOpenChange={(next) => {
            if (!next) setRevising(null)
          }}
          mode="revise"
          row={revising}
          onSaved={() => setRevising(null)}
        />
      ) : null}

      {retiring ? (
        <RetireDialog
          open
          onOpenChange={(next) => {
            if (!next) setRetiring(null)
          }}
          row={retiring}
          onSaved={() => setRetiring(null)}
        />
      ) : null}
    </div>
  )
}

function RateDialog({
  open,
  onOpenChange,
  mode,
  row,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'revise'
  row: TaxRateRow | null
  onSaved: () => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const revising = mode === 'revise' && row !== null
  const today = todayIso()
  const nextDay = row ? addDaysIso(row.effectiveFrom > today ? row.effectiveFrom : today, 1) : today

  const defaults: RateForm = revising
    ? {
        gstPercent: percentText(row.gstRateBps),
        cessPercent: percentText(row.cessRateBps),
        description: row.description ?? '',
        effectiveFrom: nextDay
      }
    : {
        gstPercent: '',
        cessPercent: '0',
        description: '',
        effectiveFrom: today
      }

  const save = useMutation({
    mutationFn: (input: RatePayload) =>
      input.id
        ? window.api.taxRates.revise({
            id: input.id,
            gstRateBps: input.gstRateBps,
            cessRateBps: input.cessRateBps,
            description: input.description,
            effectiveFrom: input.effectiveFrom
          })
        : window.api.taxRates.create(input),
    onSuccess: () => {
      toast.success(revising ? 'New rate scheduled' : 'Tax rate added')
      void queryClient.invalidateQueries({ queryKey: ['tax-rates'] })
      onSaved()
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save the tax rate'))
  })

  const form = useForm({
    defaultValues: defaults,
    canSubmitWhenInvalid: true,
    validators: { onSubmit: rateFormSchema },
    onSubmitInvalid: ({ formApi }) => focusFirstError(formApi),
    onSubmit: ({ value }) => {
      const gstRateBps = percentToBps(value.gstPercent)
      const cessRateBps = percentToBps(value.cessPercent)
      if (gstRateBps === null || cessRateBps === null) return
      save.mutate({
        id: revising ? row.id : undefined,
        gstRateBps,
        cessRateBps,
        description: value.description.trim() || null,
        effectiveFrom: value.effectiveFrom
      })
    }
  })

  function textField(name: 'gstPercent' | 'cessPercent' | 'description'): React.JSX.Element {
    const isPercent = name !== 'description'
    return (
      <form.Field
        name={name}
        validators={{
          onBlur: ({ value }) => rateFieldError(name, value),
          onChange: ({ value }) => rateFieldError(name, value),
          onSubmit: ({ value }) => rateFieldError(name, value)
        }}
      >
        {(field) => (
          <FormTextField
            field={field as unknown as FormFieldApi}
            submitted={form.state.isSubmitted}
            label={name === 'gstPercent' ? 'GST %' : name === 'cessPercent' ? 'Cess %' : 'Label'}
            required={isPercent}
            autoFocus={name === 'gstPercent'}
            inputMode={isPercent ? 'decimal' : undefined}
            mono={isPercent}
            hint={
              name === 'gstPercent'
                ? 'The GST component of the rate'
                : name === 'cessPercent'
                  ? 'Compensation cess, if any'
                  : 'Shown in the item picker; generated if left blank'
            }
            afterChange={() => field.setErrorMap({ onBlur: undefined })}
          />
        )}
      </form.Field>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{revising ? 'Change this tax rate' : 'New tax rate'}</DialogTitle>
          <DialogDescription>
            {revising
              ? 'The old rate closes the day before the new one starts. Existing documents keep their stored rate.'
              : 'Add a GST and cess combination. A rate can be revised later without changing history.'}
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
            {textField('gstPercent')}
            {textField('cessPercent')}
            <div className="sm:col-span-2">{textField('description')}</div>

            <form.Field
              name="effectiveFrom"
              validators={{
                onBlur: ({ value }) => rateFieldError('effectiveFrom', value),
                onChange: ({ value }) => rateFieldError('effectiveFrom', value),
                onSubmit: ({ value }) => rateFieldError('effectiveFrom', value)
              }}
            >
              {(field) => (
                <FormTextField
                  field={field as unknown as FormFieldApi}
                  submitted={form.state.isSubmitted}
                  label={revising ? 'First day of the new rate' : 'Effective from'}
                  required
                  type="date"
                  mono
                  hint={
                    revising
                      ? `The old rate stays active through ${previousDayLabel(field.state.value)}`
                      : 'Rates start on this business date'
                  }
                  className="sm:col-span-2"
                  afterChange={() => field.setErrorMap({ onBlur: undefined })}
                />
              )}
            </form.Field>
          </div>

          {save.isError ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
            >
              {errorMessage(save.error, 'Could not save the tax rate.')}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={save.isPending}>
              <CheckCircle2 className="size-3.5" strokeWidth={2} />
              {save.isPending ? 'Saving...' : revising ? 'Schedule change' : 'Add rate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RetireDialog({
  open,
  onOpenChange,
  row,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: TaxRateRow
  onSaved: () => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const today = todayIso()
  const firstAvailable = addDaysIso(row.effectiveFrom > today ? row.effectiveFrom : today, 1)

  const retire = useMutation({
    mutationFn: (effectiveFrom: string) => window.api.taxRates.retire({ id: row.id, effectiveFrom }),
    onSuccess: () => {
      toast.success('Tax rate retired')
      void queryClient.invalidateQueries({ queryKey: ['tax-rates'] })
      onSaved()
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not retire the tax rate'))
  })

  const form = useForm({
    defaultValues: { effectiveFrom: firstAvailable },
    canSubmitWhenInvalid: true,
    validators: {
      onSubmit: z.object({
        effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')
      })
    },
    onSubmitInvalid: ({ formApi }) => focusFirstError(formApi),
    onSubmit: ({ value }) => retire.mutate(value.effectiveFrom)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Retire this tax rate?</DialogTitle>
          <DialogDescription>
            {row.description ?? 'This rate'} stays in history. From the chosen date it is no longer
            offered on new items.
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
          <form.Field name="effectiveFrom">
            {(field) => (
              <FormTextField
                field={field as unknown as FormFieldApi}
                submitted={form.state.isSubmitted}
                label="First day without this rate"
                required
                type="date"
                mono
                hint={`The rate stays active through ${previousDayLabel(field.state.value)}`}
                afterChange={() => field.setErrorMap({ onBlur: undefined })}
              />
            )}
          </form.Field>

          {retire.isError ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
            >
              {errorMessage(retire.error, 'Could not retire the tax rate.')}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Keep rate
              </Button>
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={retire.isPending}
            >
              {retire.isPending ? 'Retiring...' : 'Retire rate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function rateFieldError(name: keyof RateForm, value: string): string | undefined {
  const result = rateFormSchema.shape[name].safeParse(value)
  if (result.success) return undefined
  return result.error.issues[0]?.message
}
