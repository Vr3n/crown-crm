import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Plus, RotateCcw, Ruler, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
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
import { Field, FormLegend } from '@/components/ui/field'
import { focusFirstError, FormTextField, type FormFieldApi } from '@/components/ui/form-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { StatusPill } from '@/components/ui/status-pill'
import { can, useSession } from '@/context/session-context'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type { CreateUnitInput, UnitRow } from '../../../../../shared/contracts/masters'

const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-9 border-b border-border px-3 align-middle'
const TAG = 'rounded-none px-1.5 py-0 text-[0.6875rem] uppercase tracking-[0.08em]'

const DECIMALS = [
  { value: '0', label: '0 — whole units (Nos, Box)' },
  { value: '1', label: '1 — one decimal (0.1)' },
  { value: '2', label: '2 — two decimals (0.01)' },
  { value: '3', label: '3 — three decimals (0.001)' },
  { value: '4', label: '4 — four decimals (0.0001)' }
]

const unitFormSchema = z.object({
  name: z.string().trim().min(1, 'Unit name is required').max(40, 'Keep it under 40 characters'),
  symbol: z
    .string()
    .trim()
    .min(1, 'Symbol is required')
    .max(10, 'Keep the symbol under 10 characters'),
  decimals: z.string().regex(/^[0-4]$/, 'Choose a precision')
})

type UnitForm = z.infer<typeof unitFormSchema>

function blankForm(): UnitForm {
  return { name: '', symbol: '', decimals: '0' }
}

function formFor(unit: UnitRow): UnitForm {
  return { name: unit.name, symbol: unit.symbol, decimals: String(unit.decimals) }
}

export function UnitsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const session = useSession()
  const mayManage = can(session.permissions, session.isSuper, 'settings.manage')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<UnitRow | null>(null)

  const list = useQuery({
    queryKey: ['units', { includeInactive }],
    queryFn: () => window.api.units.list({ includeInactive })
  })

  const deactivate = useMutation({
    mutationFn: (id: number) => window.api.units.deactivate(id),
    onSuccess: () => {
      toast.success('Unit deactivated')
      void queryClient.invalidateQueries({ queryKey: ['units'] })
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not deactivate the unit'))
  })

  const activate = useMutation({
    mutationFn: (id: number) => window.api.units.update({ id, isActive: true }),
    onSuccess: () => {
      toast.success('Unit reactivated')
      void queryClient.invalidateQueries({ queryKey: ['units'] })
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not reactivate the unit'))
  })

  const rows = list.data ?? []
  const activeCount = rows.filter((unit) => unit.isActive).length
  const inUseCount = rows.filter((unit) => unit.usageCount > 0).length

  function show(unit: UnitRow | null): void {
    setEditing(unit)
    setOpen(true)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-6">
      <PageHeader
        title="Units"
        description={`${activeCount} active unit${activeCount === 1 ? '' : 's'}${
          inUseCount > 0 ? ` · ${inUseCount} used by items` : ''
        }`}
        actions={
          mayManage ? (
            <Button size="sm" onClick={() => show(null)}>
              <Plus className="size-3.5" strokeWidth={2} />
              New unit
            </Button>
          ) : undefined
        }
      />

      <div className="border border-border bg-card px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Ruler className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-[0.875rem] font-medium">Units describe how quantities are shown.</p>
            <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
              Stock always keeps four decimal places. The precision here only controls the display
              of quantities for items that use the unit. A unit used by an item cannot be retired.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-card px-3 py-2">
        <label
          htmlFor="unit-inactive"
          className="flex cursor-pointer items-center gap-1.5 text-[0.875rem] text-muted-foreground"
        >
          <Checkbox
            id="unit-inactive"
            checked={includeInactive}
            onCheckedChange={(checked) => setIncludeInactive(checked === true)}
          />
          Show inactive units
        </label>
        <p className="text-[0.75rem] text-muted-foreground">
          {rows.length} unit{rows.length === 1 ? '' : 's'}
        </p>
      </div>

      {list.isError ? (
        <div className="border border-border bg-card px-4 py-8 text-center">
          <p className="text-[0.9375rem] font-medium">Could not load units</p>
          <p className="mt-1 text-[0.875rem] text-muted-foreground">
            {errorMessage(list.error, 'Try again in a moment.')}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 && !list.isPending ? (
        <EmptyState
          icon={Ruler}
          title="No units yet"
          description="Add a unit such as Nos, Kg or Box before creating items."
          action={
            mayManage ? (
              <Button size="sm" onClick={() => show(null)}>
                <Plus className="size-3.5" strokeWidth={2} />
                New unit
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-auto border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Unit
                </th>
                <th scope="col" className={TH}>
                  Symbol
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Decimals
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Used by
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
                    Loading units...
                  </td>
                </tr>
              ) : (
                rows.map((unit) => (
                  <tr key={unit.id} className={unit.isActive ? 'hover:bg-muted/40' : 'opacity-60'}>
                    <td className={TD}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[0.9375rem] font-medium">{unit.name}</span>
                        {unit.isSystem ? (
                          <Badge variant="secondary" className={TAG}>
                            Seeded
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${TD} font-mono text-[0.875rem] text-muted-foreground`}>
                      {unit.symbol}
                    </td>
                    <td className={`${TD} text-right font-mono text-[0.875rem] tabular-nums`}>
                      {unit.decimals}
                    </td>
                    <td className={`${TD} text-right text-[0.875rem]`}>
                      {unit.usageCount > 0 ? (
                        <span className="font-mono tabular-nums">{unit.usageCount}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={TD}>
                      <StatusPill tone={unit.isActive ? 'success' : 'neutral'}>
                        {unit.isActive ? 'Active' : 'Inactive'}
                      </StatusPill>
                    </td>
                    <td className={`${TD} text-right`}>
                      {mayManage ? (
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="xs" onClick={() => show(unit)}>
                            Edit
                          </Button>
                          {unit.isActive ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={unit.usageCount > 0 || deactivate.isPending}
                              title={
                                unit.usageCount > 0
                                  ? 'Change the unit on those items first'
                                  : undefined
                              }
                              onClick={() => deactivate.mutate(unit.id)}
                            >
                              <XCircle className="size-3.5" strokeWidth={2} />
                              Retire
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={activate.isPending}
                              onClick={() => activate.mutate(unit.id)}
                            >
                              <RotateCcw className="size-3.5" strokeWidth={2} />
                              Reactivate
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[0.75rem] text-muted-foreground">Read only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <UnitDialog
          open={open}
          onOpenChange={setOpen}
          unit={editing}
          onSaved={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}

function UnitDialog({
  open,
  onOpenChange,
  unit,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  unit: UnitRow | null
  onSaved: () => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const editing = unit !== null

  const save = useMutation({
    mutationFn: (input: CreateUnitInput & { id?: number }) =>
      input.id
        ? window.api.units.update({
            id: input.id,
            name: input.name,
            symbol: input.symbol,
            decimals: input.decimals
          })
        : window.api.units.create(input),
    onSuccess: () => {
      toast.success(editing ? 'Unit updated' : 'Unit added')
      void queryClient.invalidateQueries({ queryKey: ['units'] })
      onSaved()
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save the unit'))
  })

  const form = useForm({
    defaultValues: unit ? formFor(unit) : blankForm(),
    canSubmitWhenInvalid: true,
    validators: { onSubmit: unitFormSchema },
    onSubmitInvalid: ({ formApi }) => focusFirstError(formApi),
    onSubmit: ({ value }) => {
      save.mutate({
        id: unit?.id,
        name: value.name.trim(),
        symbol: value.symbol.trim(),
        decimals: Number(value.decimals)
      })
    }
  })

  function textField(name: 'name' | 'symbol'): React.JSX.Element {
    return (
      <form.Field
        name={name}
        validators={{
          onBlur: ({ value }) => unitFieldError(name, value),
          onChange: ({ value }) => unitFieldError(name, value),
          onSubmit: ({ value }) => unitFieldError(name, value)
        }}
      >
        {(field) => (
          <FormTextField
            field={field as unknown as FormFieldApi}
            submitted={form.state.isSubmitted}
            label={name === 'name' ? 'Unit name' : 'Symbol'}
            required
            autoFocus={name === 'name'}
            mono={name === 'symbol'}
            hint={name === 'name' ? 'For example Nos, Kilogram or Box' : 'Shown next to quantities'}
            afterChange={() => field.setErrorMap({ onBlur: undefined })}
          />
        )}
      </form.Field>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit unit' : 'New unit'}</DialogTitle>
          <DialogDescription>
            Choose a name people recognise and the number of decimals quantities should show.
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
            {textField('symbol')}

            <form.Field
              name="decimals"
              validators={{
                onBlur: ({ value }) => unitFieldError('decimals', value),
                onChange: ({ value }) => unitFieldError('decimals', value),
                onSubmit: ({ value }) => unitFieldError('decimals', value)
              }}
            >
              {(field) => (
                <Field
                  id="unit-decimals"
                  label="Quantity precision"
                  required
                  errors={field.state.meta.errors}
                  hint="Display only; stock still keeps four places."
                  className="sm:col-span-2"
                >
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      field.handleChange(value)
                      field.setErrorMap({ onBlur: undefined })
                      void field.validate('change')
                    }}
                  >
                    <SelectTrigger id="unit-decimals" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DECIMALS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>
          </div>

          {save.isError ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
            >
              {errorMessage(save.error, 'Could not save the unit.')}
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
              {save.isPending ? 'Saving...' : editing ? 'Save changes' : 'Add unit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function unitFieldError(name: keyof UnitForm, value: string): string | undefined {
  const result = unitFormSchema.shape[name].safeParse(value)
  if (result.success) return undefined
  return result.error.issues[0]?.message
}
