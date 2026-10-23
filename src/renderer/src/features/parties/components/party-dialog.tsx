import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { toast } from 'sonner'
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
import { focusFirstError, FormTextField } from '@/components/ui/form-field'
import { FIELD_HELP } from '@/lib/form-help'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type { CreatePartyInput, PartyRow } from '../../../../../shared/contracts/masters'
import {
  blankPartyForm,
  partyFieldError,
  partyFormSchema,
  partyFormToInput,
  partyToForm,
  type PartyForm
} from '../party-form'

const FIELDS: {
  name: keyof PartyForm
  label: string
  type?: string
  inputMode?: 'tel' | 'email' | 'numeric' | 'decimal'
  maxLength?: number
  filter?: 'digits' | 'upper'
  className?: string
  mono?: boolean
  required?: boolean
  hint?: string
  help: (typeof FIELD_HELP)['party'][keyof (typeof FIELD_HELP)['party']]
}[] = [
  {
    name: 'name',
    label: 'Name',
    className: 'sm:col-span-2',
    required: true,
    help: FIELD_HELP.party.name
  },
  { name: 'phone', label: 'Phone', inputMode: 'tel', help: FIELD_HELP.party.phone },
  { name: 'email', label: 'Email', type: 'email', help: FIELD_HELP.party.email },
  {
    name: 'gstin',
    label: 'GSTIN',
    filter: 'upper',
    maxLength: 15,
    mono: true,
    help: FIELD_HELP.party.gstin
  },
  {
    name: 'stateCode',
    label: 'State code',
    filter: 'digits',
    inputMode: 'numeric',
    maxLength: 2,
    mono: true,
    help: FIELD_HELP.party.stateCode
  },
  {
    name: 'billingAddress',
    label: 'Billing address',
    className: 'sm:col-span-2',
    help: FIELD_HELP.party.billingAddress
  },
  {
    name: 'creditDays',
    label: 'Credit days',
    filter: 'digits',
    inputMode: 'numeric',
    mono: true,
    help: FIELD_HELP.party.creditDays
  },
  {
    name: 'creditLimit',
    label: 'Credit limit (INR)',
    inputMode: 'decimal',
    mono: true,
    help: FIELD_HELP.party.creditLimit
  },
  {
    name: 'openingBalance',
    label: 'Opening balance (INR)',
    inputMode: 'decimal',
    hint: 'Positive is Dr, negative is Cr.',
    mono: true,
    help: FIELD_HELP.party.openingBalance
  },
  {
    name: 'openingDate',
    label: 'Opening date',
    type: 'date',
    mono: true,
    help: FIELD_HELP.party.openingDate
  }
]

/**
 * Party capture dialog. Validation runs on blur, then live on change, so an
 * error clears the moment the value is fixed. Required markers and field help
 * come from the shared form primitives.
 */
export function PartyDialog({
  open,
  onOpenChange,
  party,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  party: PartyRow | null
  onSaved: () => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const editing = party !== null

  const save = useMutation({
    mutationFn: (input: CreatePartyInput & { id?: number }) =>
      input.id
        ? window.api.parties.update({ ...input, id: input.id })
        : window.api.parties.create(input),
    onSuccess: () => {
      toast.success(editing ? 'Party updated' : 'Party added')
      void queryClient.invalidateQueries({ queryKey: ['parties'] })
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      onSaved()
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save the party'))
  })

  const form = useForm({
    defaultValues: party ? partyToForm(party) : blankPartyForm(),
    canSubmitWhenInvalid: true,
    validators: { onSubmit: partyFormSchema },
    onSubmitInvalid: ({ formApi }) => focusFirstError(formApi),
    onSubmit: ({ value }) => {
      const input: CreatePartyInput & { id?: number } = partyFormToInput(value)
      // The list row has no address, so keep a stored one unless a new one is typed.
      if (!editing || value.billingAddress.trim())
        input.billingAddress = value.billingAddress.trim() || null
      if (party) input.id = party.id
      save.mutate(input)
    }
  })

  const values = form.state.values
  const roleError = form.state.isSubmitted && !values.isCustomer && !values.isSupplier

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit party' : 'New party'}</DialogTitle>
          <DialogDescription>
            One record per business. Opening balances post once, before the first voucher.
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
            {FIELDS.map((meta) => {
              const locked =
                editing && ['openingBalance', 'openingDate'].includes(meta.name as string)
              return (
                <form.Field
                  key={meta.name}
                  name={meta.name}
                  validators={{
                    onBlur: ({ value }) => partyFieldError(meta.name, value),
                    onChange: ({ value }) => partyFieldError(meta.name, value)
                  }}
                >
                  {(field) => (
                    <FormTextField
                      field={field as unknown as import('@/components/ui/form-field').FormFieldApi}
                      submitted={form.state.isSubmitted}
                      label={meta.label}
                      required={meta.required}
                      help={meta.help}
                      type={meta.type}
                      inputMode={meta.inputMode}
                      maxLength={meta.maxLength}
                      filter={meta.filter}
                      mono={meta.mono}
                      className={meta.className}
                      disabled={locked}
                      hint={
                        meta.name === 'billingAddress' && editing
                          ? 'A saved address is kept unless you type a replacement.'
                          : locked
                            ? 'Opening balances are fixed when the party is created.'
                            : meta.hint
                      }
                      afterChange={
                        meta.name === 'gstin'
                          ? (value) => {
                              if (value.length >= 2)
                                form.setFieldValue('stateCode', value.slice(0, 2))
                            }
                          : undefined
                      }
                    />
                  )}
                </form.Field>
              )
            })}
          </div>

          <Field
            label="Role"
            required
            help={FIELD_HELP.party.role}
            error={roleError ? 'Choose customer, supplier, or both' : undefined}
            hint={
              editing ? 'Roles and ledger accounts are set when the party is created.' : undefined
            }
          >
            <div className="flex items-center gap-5 pt-0.5">
              <form.Field name="isCustomer">
                {(field) => (
                  <label
                    htmlFor="isCustomer"
                    className="flex items-center gap-1.5 text-[0.9375rem]"
                  >
                    <Checkbox
                      id="isCustomer"
                      checked={field.state.value}
                      disabled={editing}
                      onCheckedChange={(checked) => field.handleChange(checked === true)}
                      aria-required
                    />
                    Customer
                  </label>
                )}
              </form.Field>
              <form.Field name="isSupplier">
                {(field) => (
                  <label
                    htmlFor="isSupplier"
                    className="flex items-center gap-1.5 text-[0.9375rem]"
                  >
                    <Checkbox
                      id="isSupplier"
                      checked={field.state.value}
                      disabled={editing}
                      onCheckedChange={(checked) => field.handleChange(checked === true)}
                      aria-required
                    />
                    Supplier
                  </label>
                )}
              </form.Field>
            </div>
          </Field>

          {save.isError ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
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
  )
}
