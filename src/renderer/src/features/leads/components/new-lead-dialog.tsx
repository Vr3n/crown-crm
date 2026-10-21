import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useStore } from '@tanstack/react-store'
import { CalendarClock, ChevronDown, Mail, Phone, PhoneCall, User, UserPlus } from 'lucide-react'
import { AutocorrectCombobox, type AutocorrectOption } from '@/components/autocorrect-combobox'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { FieldGroup } from '@/components/ui/field'
import { FormField } from '@/components/ui/form-field'
import { LoadingButton } from '@/components/ui/loading-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PersonAvatar } from '@/components/person/person-avatar'
import type { PendingPhoto } from '@/components/person/photo-constants'
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
import { useCreateLead, useLeadPersonAvailability } from '../queries'
import { useUpdatePersonPhoto } from '@/features/people/person-photo'
import { referenceKeys, useReferenceData } from '../reference-data'

const PHONE_MAX = 10

/** Default due date for auto-created followup: now + 2 days. */
function defaultFollowupDueAt(): string {
  const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  return d.toISOString()
}

/**
 * Fast "New lead" capture (staff aren't tech-savvy): a single modal with only
 * the fields a front-desk person actually has at that moment. Name and phone
 * are required — the backend enforces an Indian mobile or landline format and
 * dedupes by phone, so an existing person never becomes a second lead. Fields
 * react live (red on error, green once complete) exactly like the auth forms;
 * the phone shows a live digit counter and flags a wrong starting digit the
 * moment it is typed.
 */
export function NewLeadDialog({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated?: (created: import('../../../../../shared/contracts/sales').CreatedLead) => void
}): React.JSX.Element {
  const create = useCreateLead()
  const session = useSession()
  const queryClient = useQueryClient()
  const { data: ref } = useReferenceData()

  const activityTypes = useMemo(
    () => ref?.activityTypes.filter((t) => t.active && t.name !== 'OWNER_CHANGE') ?? [],
    [ref]
  )

  const [submitSuccess, setSubmitSuccess] = useState(false)
  const successTimer = useRef<number | null>(null)

  // Photo state (transient — uploaded after lead is created)
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null)
  const uploadPhoto = useUpdatePersonPhoto()

  // Collapsible section states
  const [followupOpen, setFollowupOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  // The dialog remounts per open (LeadsPage mounts it conditionally). The source
  // field is empty on mount — the combobox searches the backend live, so there is
  // nothing to seed from reference data here.
  const form = useForm({
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      source: '',
      plan: '',
      goal: '',
      notes: '',
      followupTitle: 'Post enquiry followup',
      followupDue: defaultFollowupDueAt(),
      activityTypeId: String(activityTypes[0]?.id ?? ''),
      activityNote: ''
    },
    onSubmit: async ({ value }) => {
      const sourceId = value.source ? Number(value.source) : undefined
      if (sourceId === undefined) return
      try {
        const created = await create.mutateAsync({
          fullName: value.name.trim(),
          phone: value.phone.trim(),
          email: value.email.trim() || undefined,
          sourceId,
          planId: value.plan ? Number(value.plan) : undefined,
          goal: value.goal.trim() || undefined,
          notes: value.notes.trim() || undefined,
          followup: followupOpen
            ? {
                title: value.followupTitle.trim() || 'Post enquiry followup',
                dueAt: value.followupDue || defaultFollowupDueAt()
              }
            : undefined,
          activity:
            activityOpen && value.activityTypeId
              ? {
                  typeId: Number(value.activityTypeId),
                  note: value.activityNote.trim() || undefined
                }
              : undefined
        })
        onCreated?.(created)

        // Upload photo if one was captured/imported
        if (pendingPhoto) {
          uploadPhoto.mutate({
            personId: created.personId,
            filename: pendingPhoto.filename,
            data: pendingPhoto.data
          })
        }

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
  // Before the user picks a source the onChange validator has not run yet, so
  // `canSubmit` can be spuriously true — keep submit gated on an actual value.
  const sourceValue = useStore(form.store, (s) => s.values.source)

  // Reactive duplicate check (docs/107): once a complete phone and a name are
  // present, probe the backend for an existing person while the user types. A
  // same name+phone match blocks submission ("person already exists"); a phone
  // match with a different name only warns (yellow) — the lead can still attach
  // to the existing person. Email collisions are advisory only. (Selecting
  // field primitives — never the whole `values` object — keeps the store
  // subscription stable; `s.values` changes identity on every form update.)
  const debouncedName = useDebouncedValue(useStore(form.store, (s) => s.values.name), 400)
  const debouncedPhone = useDebouncedValue(useStore(form.store, (s) => s.values.phone), 400)
  const debouncedEmail = useDebouncedValue(useStore(form.store, (s) => s.values.email), 400)
  const availabilityInput =
    isValidIndianMobile(debouncedPhone) && debouncedName.trim().length > 0
      ? {
          fullName: debouncedName.trim(),
          phone: debouncedPhone.trim(),
          email: isValidEmail(debouncedEmail) ? debouncedEmail.trim() : undefined
        }
      : undefined
  const { data: availability, isFetching: availabilityChecking } =
    useLeadPersonAvailability(availabilityInput)
  const phoneTaken = availability?.phoneTaken ?? false
  const personExists = Boolean(availability?.phoneTaken && availability.sameNamedPerson)

  const formError = create.error ? errorMessage(create.error, 'Could not create lead') : null

  // Creating a source is a settings action; searching sources is visible to
  // anyone who can view leads (mirrors `requirePermission` in the backend).
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
      logger.debug('searchPlans', { query, count: rows.length, rows })
      return rows.map((row) => ({ id: String(row.id), label: row.name }))
    } catch (error) {
      logger.warn('searchPlans failed', { query, error })
      throw error
    }
  }, [])

  const searchGoals = useCallback(async (query: string): Promise<AutocorrectOption<string>[]> => {
    try {
      const rows = await api.searchGoals(query)
      logger.debug('searchGoals', { query, count: rows.length, rows })
      return rows.map((row) => ({ id: row.id, label: row.label }))
    } catch (error) {
      logger.warn('searchGoals failed', { query, error })
      throw error
    }
  }, [])

  // Goal stays free-text: the typed text is the identity, so "creating" an
  // option just commits the text. Plan interest is now a catalog FK, so the
  // plan field picks from existing plans only (canCreate=false).
  const createFreeTextOption = useCallback(
    async (label: string): Promise<AutocorrectOption<string>> => ({ id: label, label }),
    []
  )

  useEffect(() => {
    return () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4 text-primary" />
            New lead
          </DialogTitle>
          <DialogDescription>
            Capture an enquiry in under a minute. Name and phone are required.
          </DialogDescription>
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
              name={useStore(form.store, (s) => s.values.name) || ''}
              size="lg"
              editable
              onPendingChange={setPendingPhoto}
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
                        personExists
                          ? `A lead for ${availability?.matchedPerson?.fullName} already exists — open their existing record instead`
                          : undefined
                      }
                      warning={
                        phoneTaken && !personExists && availability?.matchedPerson
                          ? `This number is already on file for ${availability.matchedPerson.fullName} — you can still attach the lead to them`
                          : undefined
                      }
                      completeWhen={(v) => {
                        const digits = v.replace(/\D/g, '')
                        // Judge the field the moment the number is clearly
                        // invalid (a wrong starting digit) or once all 10
                        // digits are in — never nag about an incomplete
                        // length while typing.
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
                    // react-form's source value is a string; the combobox clears
                    // with `null`, so translate that back to the empty string.
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

            {/* Follow-up section */}
            <Collapsible open={followupOpen} onOpenChange={setFollowupOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50',
                    followupOpen && 'bg-muted/50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-primary" />
                    Schedule a follow-up
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {followupOpen ? 'Enabled' : 'Auto: 2 days'}
                    </span>
                    <ChevronDown
                      className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        followupOpen && 'rotate-180'
                      )}
                    />
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <form.Field
                  name="followupTitle"
                  validators={{
                    onChange: ({ value }) =>
                      followupOpen && !value.trim() ? 'Give this follow-up a name' : undefined
                  }}
                >
                  {(field) => (
                    <FormField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="What to do"
                      validate={(v) => (!v.trim() ? 'Give this follow-up a name' : undefined)}
                      completeWhen={(v) => v.trim().length > 0}
                      placeholder="e.g. Call to confirm trial"
                    />
                  )}
                </form.Field>

                <form.Field
                  name="followupDue"
                  validators={{
                    onChange: ({ value }) =>
                      followupOpen && !value ? 'Pick a due date and time' : undefined
                  }}
                >
                  {(field) => (
                    <FormField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Due"
                      validate={(v) => (v ? undefined : 'Pick a due date and time')}
                      completeWhen={(v) => Boolean(v)}
                    >
                      {({ id, value, invalid, describedBy, onChange }) => (
                        <DateTimePicker
                          id={id}
                          value={value}
                          invalid={invalid}
                          aria-describedby={describedBy}
                          onChange={(iso) => onChange(iso)}
                        />
                      )}
                    </FormField>
                  )}
                </form.Field>
              </CollapsibleContent>
            </Collapsible>

            {/* Activity section */}
            <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50',
                    activityOpen && 'bg-muted/50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <PhoneCall className="size-4 text-primary" />
                    Log an activity
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground transition-transform',
                      activityOpen && 'rotate-180'
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <form.Field
                  name="activityTypeId"
                  validators={{
                    onChange: ({ value }) => (activityOpen && !value ? 'Choose a type' : undefined)
                  }}
                >
                  {(field) => (
                    <FormField
                      name={field.name}
                      state={{
                        value: field.state.value,
                        meta: field.state.meta
                      }}
                      handleChange={(v) => field.handleChange(v)}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Type"
                      validate={(v) => (v ? undefined : 'Choose a type')}
                      completeWhen={(v) => Boolean(v)}
                    >
                      {({ id, value, invalid, valid, describedBy }) => (
                        <Select
                          value={value}
                          onValueChange={(v) => {
                            if (v !== '') field.handleChange(v)
                          }}
                          disabled={activityTypes.length === 0}
                        >
                          <SelectTrigger
                            id={id}
                            aria-invalid={invalid}
                            data-valid={valid}
                            aria-describedby={describedBy}
                          >
                            <SelectValue
                              placeholder={
                                activityTypes.length === 0
                                  ? 'No activity types configured'
                                  : 'Choose a type'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {activityTypes.map((t) => (
                              <SelectItem key={t.id} value={String(t.id)}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </FormField>
                  )}
                </form.Field>

                <form.Field name="activityNote">
                  {(field) => (
                    <FormField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Note"
                      hint="What happened on this touchpoint?"
                      validate={() => undefined}
                      completeWhen={(v) => v.trim().length > 0}
                    >
                      {({ id, value, invalid, valid, describedBy, onBlur, onChange }) => (
                        <Textarea
                          id={id}
                          value={value}
                          onBlur={onBlur}
                          onChange={(e) => onChange(e.target.value)}
                          placeholder="What happened on this touchpoint?"
                          rows={3}
                          aria-invalid={invalid}
                          data-valid={valid}
                          aria-describedby={describedBy}
                        />
                      )}
                    </FormField>
                  )}
                </form.Field>
              </CollapsibleContent>
            </Collapsible>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={isSubmitting}
              success={submitSuccess}
              disabled={!canSubmit || sourceValue === '' || personExists || availabilityChecking}
              loadingLabel="Creating…"
              successLabel="Created!"
            >
              Create lead
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
