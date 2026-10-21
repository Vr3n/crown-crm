import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useStore } from '@tanstack/react-store'
import { Mail, Pencil, Phone, User } from 'lucide-react'
import { AutocorrectCombobox, type AutocorrectOption } from '@/components/autocorrect-combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { FormField } from '@/components/ui/form-field'
import { LoadingButton } from '@/components/ui/loading-button'
import { Textarea } from '@/components/ui/textarea'
import { PersonAvatar } from '@/components/person/person-avatar'
import { can, useSession } from '@/context/session-context'
import { logger } from '@/lib/logger'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import {
  emailError,
  isValidEmail,
  isValidIndianMobile,
  leadNameError,
  mobileError
} from '@/lib/validation'
import { cn } from '@/lib/utils'
import { errorMessage } from '../../../../../shared/contracts/errors'
import { api } from '../api'
import { SOURCES } from '../constants'
import { useEditLead, useLeadPersonAvailability } from '../queries'
import { referenceKeys } from '../reference-data'
import type { Lead } from '../types'

const PHONE_MAX = 10

/**
 * "Edit lead" capture. The same single-modal shape as the New lead dialog, but
 * prefilled from the row and gated to the lead's owner or an admin (the backend
 * enforces that too — hiding the button is UX only). The source and the
 * free-text plan/goal fields prefill through the combobox's `selectedOption`
 * prop, so the current values are visible before the live search starts.
 */
export function EditLeadDialog({
  lead,
  open,
  onOpenChange
}: {
  lead: Lead
  open: boolean
  onOpenChange: (o: boolean) => void
}): React.JSX.Element {
  const edit = useEditLead()
  const session = useSession()
  const queryClient = useQueryClient()

  const [submitSuccess, setSubmitSuccess] = useState(false)
  const successTimer = useRef<number | null>(null)

  const form = useForm({
    defaultValues: {
      name: lead.name,
      phone: lead.phone ?? '',
      email: lead.email ?? '',
      source: lead.sourceId ? String(lead.sourceId) : '',
      plan: lead.planId ? String(lead.planId) : '',
      goal: lead.goal ?? '',
      notes: lead.notes ?? ''
    },
    onSubmit: async ({ value }) => {
      const sourceId = value.source ? Number(value.source) : undefined
      if (sourceId === undefined) return
      try {
        await edit.mutateAsync({
          leadId: lead.id,
          fullName: value.name.trim(),
          phone: value.phone.trim(),
          email: value.email.trim() || undefined,
          sourceId,
          planId: value.plan ? Number(value.plan) : undefined,
          goal: value.goal.trim() || undefined,
          notes: value.notes.trim() || undefined
        })
        setSubmitSuccess(true)
        successTimer.current = window.setTimeout(() => onOpenChange(false), 700)
      } catch {
        setSubmitSuccess(false)
      }
    }
  })

  const submitted = useStore(form.store, (s) => s.isSubmitted)
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const sourceValue = useStore(form.store, (s) => s.values.source)

  // Reactive duplicate check (docs/107), mirroring the create form. The lead's
  // own person is excluded, so a match here means the phone belongs to ANOTHER
  // person — a hard conflict the edit backend also enforces. Email stays
  // advisory (amber). (Selecting field primitives — never the whole `values`
  // object — keeps the store subscription stable.)
  const debouncedName = useDebouncedValue(useStore(form.store, (s) => s.values.name), 400)
  const debouncedPhone = useDebouncedValue(useStore(form.store, (s) => s.values.phone), 400)
  const debouncedEmail = useDebouncedValue(useStore(form.store, (s) => s.values.email), 400)
  const availabilityInput =
    isValidIndianMobile(debouncedPhone) && debouncedName.trim().length > 0
      ? {
          fullName: debouncedName.trim(),
          phone: debouncedPhone.trim(),
          email: isValidEmail(debouncedEmail) ? debouncedEmail.trim() : undefined,
          excludePersonId: lead.personId
        }
      : undefined
  const { data: availability, isFetching: availabilityChecking } =
    useLeadPersonAvailability(availabilityInput)
  const personConflict = Boolean(availability?.phoneTaken)

  const formError = edit.error ? errorMessage(edit.error, 'Could not update lead') : null

  // Same as the create form: creating a source is a settings action.
  const canCreateSource = can(session.permissions, session.isSuper, 'settings.manage')

  const searchSources = useCallback(async (query: string): Promise<AutocorrectOption<string>[]> => {
    const rows = await api.searchSources(query)
    return rows.map((row) => ({ id: String(row.id), label: row.name }))
  }, [])

  const createSource = useCallback(async (label: string): Promise<AutocorrectOption<string>> => {
    const row = await api.createSource({ name: label })
    return { id: String(row.id), label: row.name }
  }, [])

  const searchPlans = useCallback(async (query: string): Promise<AutocorrectOption<string>[]> => {
    try {
      const rows = await api.searchPlanInterests(query)
      return rows.map((row) => ({ id: String(row.id), label: row.name }))
    } catch (error) {
      logger.warn('searchPlans failed', { query, error })
      throw error
    }
  }, [])

  const searchGoals = useCallback(async (query: string): Promise<AutocorrectOption<string>[]> => {
    try {
      const rows = await api.searchGoals(query)
      return rows.map((row) => ({ id: row.id, label: row.label }))
    } catch (error) {
      logger.warn('searchGoals failed', { query, error })
      throw error
    }
  }, [])

  const createFreeTextOption = useCallback(
    async (label: string): Promise<AutocorrectOption<string>> => ({ id: label, label }),
    []
  )

  useEffect(() => {
    return () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current)
    }
  }, [])

  // The combobox needs the current value's label to prefill. Sources and the
  // free-text goal field display as their own text; the plan field shows the
  // hydrated catalog name for the lead's plan id.
  const sourceOption: AutocorrectOption<string> | null = lead.sourceId
    ? { id: String(lead.sourceId), label: SOURCES[lead.source] }
    : null
  const planOption: AutocorrectOption<string> | null =
    lead.planId && lead.planName ? { id: String(lead.planId), label: lead.planName } : null
  const goalOption: AutocorrectOption<string> | null = lead.goal
    ? { id: lead.goal, label: lead.goal }
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4 text-primary" />
            Edit lead
          </DialogTitle>
          <DialogDescription>Update contact details or notes for {lead.name}.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          {formError ? (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-2 duration-200"
            >
              <span className="mt-0.5">•</span>
              <span>{formError}</span>
            </div>
          ) : null}

          <FieldGroup className="gap-3">
            <PersonAvatar
              personId={lead.personId}
              name={lead.name}
              size="lg"
              editable
            />

            <form.Field name="name" validators={{ onChange: ({ value }) => leadNameError(value) }}>
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label={
                    <>
                      Name <span className="text-destructive">*</span>
                    </>
                  }
                  validate={leadNameError}
                  completeWhen={(v) => v.trim().length > 0}
                  leading={<User className="pointer-events-none size-4" aria-hidden />}
                  placeholder="Full name"
                  autoComplete="name"
                />
              )}
            </form.Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <form.Field name="phone" validators={{ onChange: ({ value }) => mobileError(value) }}>
                {(field) => {
                  const remaining = PHONE_MAX - field.state.value.length
                  return (
                    <FormField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label={
                        <>
                          Phone <span className="text-destructive">*</span>
                        </>
                      }
                      labelEnd={
                        <span
                          className={cn(
                            'text-xs tabular-nums',
                            remaining === 0
                              ? 'font-medium text-green-600 dark:text-green-400'
                              : remaining <= 3
                                ? 'font-medium text-primary'
                                : 'text-muted-foreground'
                          )}
                        >
                          {remaining === 0 ? 'Complete' : `${remaining} digits remaining`}
                        </span>
                      }
                      hint="10-digit mobile or landline"
                      validate={mobileError}
                      extraError={
                        availability?.phoneTaken
                          ? availability.sameNamedPerson
                            ? `This number is already used by ${availability.matchedPerson?.fullName} — a different person already owns it`
                            : `This phone number belongs to another person — someone else already uses it`
                          : undefined
                      }
                      completeWhen={(v) => {
                        const digits = v.replace(/\D/g, '')
                        return (
                          digits.length > 0 &&
                          (!/^[026-9]/.test(digits) || digits.length === PHONE_MAX)
                        )
                      }}
                      leading={<Phone className="pointer-events-none size-4" aria-hidden />}
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="90000 00000"
                      onChange={(value) =>
                        field.handleChange(value.replace(/\D/g, '').slice(0, PHONE_MAX))
                      }
                    />
                  )
                }}
              </form.Field>

              <form.Field
                name="email"
                validators={{
                  onChange: ({ value }) =>
                    value.trim() ? emailError(value, 'Enter a valid email') : undefined
                }}
              >
                {(field) => (
                  <FormField
                    name={field.name}
                    state={field.state}
                    handleChange={field.handleChange}
                    handleBlur={field.handleBlur}
                    submitted={submitted}
                    label="Email"
                    validate={(v) => (v.trim() ? emailError(v, 'Enter a valid email') : undefined)}
                    completeWhen={isValidEmail}
                    warning={
                      availability?.emailTaken && availability.emailOwnerName
                        ? `This email already belongs to ${availability.emailOwnerName} — you can still use it`
                        : undefined
                    }
                    leading={<Mail className="pointer-events-none size-4" aria-hidden />}
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                  />
                )}
              </form.Field>
            </div>

            <form.Field
              name="source"
              validators={{ onChange: ({ value }) => (value ? undefined : 'Choose a source') }}
            >
              {(field) => (
                <AutocorrectCombobox
                  field={{
                    name: field.name,
                    state: field.state,
                    handleChange: (value: string | null) => field.handleChange(value ?? ''),
                    handleBlur: field.handleBlur
                  }}
                  search={searchSources}
                  create={createSource}
                  label={
                    <>
                      Source <span className="text-destructive">*</span>
                    </>
                  }
                  description="Search an existing source or add a new one"
                  placeholder="Where did they come from?"
                  searchPlaceholder="Search or add a source…"
                  minSearchLength={0}
                  canCreate={canCreateSource}
                  selectedOption={sourceOption}
                  onCreated={() =>
                    void queryClient.invalidateQueries({ queryKey: referenceKeys.all })
                  }
                />
              )}
            </form.Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <form.Field name="plan">
                {(field) => (
                  <AutocorrectCombobox
                    field={{
                      name: field.name,
                      state: field.state,
                      handleChange: (value: string | null) => field.handleChange(value ?? ''),
                      handleBlur: field.handleBlur
                    }}
                    search={searchPlans}
                    label="Plan interest"
                    description="Pick a plan from the catalog"
                    placeholder="e.g. Annual Premium"
                    searchPlaceholder="Search plans…"
                    minSearchLength={0}
                    selectedOption={planOption}
                  />
                )}
              </form.Field>

              <form.Field name="goal">
                {(field) => (
                  <AutocorrectCombobox
                    field={{
                      name: field.name,
                      state: field.state,
                      handleChange: (value: string | null) => field.handleChange(value ?? ''),
                      handleBlur: field.handleBlur
                    }}
                    search={searchGoals}
                    create={createFreeTextOption}
                    label="Goal"
                    description="Pick an existing goal or add a new one"
                    placeholder="e.g. Weight loss"
                    searchPlaceholder="Search or add a goal…"
                    minSearchLength={0}
                    selectedOption={goalOption}
                  />
                )}
              </form.Field>
            </div>

            <form.Field name="notes">
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label="Notes"
                  hint="Anything worth remembering"
                  validate={() => undefined}
                  completeWhen={(v) => v.trim().length > 0}
                >
                  {({ id, value, invalid, valid, describedBy, onBlur, onChange }) => (
                    <Textarea
                      id={id}
                      value={value}
                      onBlur={onBlur}
                      onChange={(e) => onChange(e.target.value)}
                      rows={2}
                      aria-invalid={invalid}
                      data-valid={valid}
                      aria-describedby={describedBy}
                    />
                  )}
                </FormField>
              )}
            </form.Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={isSubmitting}
              success={submitSuccess}
              disabled={!canSubmit || sourceValue === '' || personConflict || availabilityChecking}
              loadingLabel="Saving…"
              successLabel="Saved!"
            >
              Save changes
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
