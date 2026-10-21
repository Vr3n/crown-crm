import { useMemo, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { PhoneCall } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldGroup } from '@/components/ui/field'
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
import { isTerminal, moveableStages, stageConfig } from '../constants'
import { useLogActivity, useMoveStage } from '../queries'
import { getLeadMaps, stageIdOf, useReferenceData } from '../reference-data'
import { LeadPicker } from './lead-picker'
import { StageBadge } from './stage-badge'
import type { Lead, StageKey } from '../types'

/**
 * Log an activity (Module 01 §24). Activities are history — immutable,
 * timestamped records of what happened. Types come from the org's reference
 * vocabulary (ownership changes are recorded by the assign flow, not here).
 * From the global Activities page the lead is picked first; from the lead
 * detail it is already known.
 */
export function LogActivityDialog({
  open,
  onOpenChange,
  lead
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead?: Lead
}): React.JSX.Element {
  const log = useLogActivity()
  const move = useMoveStage()
  const { data: ref } = useReferenceData()
  const maps = useMemo(() => (ref ? getLeadMaps(ref) : null), [ref])
  const types = useMemo(
    () => ref?.activityTypes.filter((t) => t.active && t.name !== 'OWNER_CHANGE') ?? [],
    [ref]
  )
  const [picked, setPicked] = useState<Lead | null>(lead ?? null)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const confirmedRef = useRef(false)
  const target = picked ?? lead ?? null
  const targetTerminal = target !== null && isTerminal(target.stage)

  const stageOptions = useMemo(
    () => (target ? moveableStages(target.stage) : []),
    [target]
  )

  const form = useForm({
    defaultValues: { typeId: types[0]?.id ?? 0, note: '', targetStage: '' },
    onSubmit: async ({ value }) => {
      if (!target || !maps) return
      // Soft gate: terminal-stage leads can be won back, but logging for one
      // asks for an explicit confirmation first.
      if (targetTerminal && !confirmedRef.current) {
        setConfirmOpen(true)
        return
      }
      try {
        const { activityId } = await log.mutateAsync({
          leadId: target.id,
          typeId: value.typeId,
          note: value.note.trim(),
          occurredAt: new Date().toISOString()
        })
        if (value.targetStage && value.targetStage !== target.stage) {
          const targetStageId = stageIdOf(maps, value.targetStage as StageKey)
          if (targetStageId !== undefined) {
            await move.mutateAsync({
              leadId: target.id,
              targetStageId,
              expectedStageId: target.stageId,
              activityId
            })
          }
        }
        setSubmitSuccess(true)
        window.setTimeout(() => onOpenChange(false), 700)
      } catch {
        setSubmitSuccess(false)
      }
    }
  })

  const submitted = useStore(form.store, (s) => s.isSubmitted)
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="size-4 text-primary" />
            {lead ? `Log an activity · ${lead.name}` : 'Log an activity'}
          </DialogTitle>
          <DialogDescription>
            {lead
              ? 'Record what happened. Activities are history — they are never edited.'
              : 'Pick who it happened with, then record the touchpoint. History is never edited.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <FieldGroup className="gap-4">
            {!lead ? (
              <Field label="For whom">
                <LeadPicker
                  value={target?.id ?? 0}
                  onChange={setPicked}
                  invalid={!target}
                  excludeBlacklisted
                />
              </Field>
            ) : null}

            <form.Field
              name="typeId"
              validators={{
                onChange: ({ value }) => (value > 0 ? undefined : 'Choose a type')
              }}
            >
              {(field) => (
                <FormField
                  name={field.name}
                  state={{
                    value: field.state.value > 0 ? String(field.state.value) : '',
                    meta: field.state.meta
                  }}
                  handleChange={(v) => field.handleChange(Number(v))}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label={
                    <>
                      Type <span className="text-destructive">*</span>
                    </>
                  }
                  validate={(v) => (v ? undefined : 'Choose a type')}
                  completeWhen={(v) => Boolean(v)}
                >
                  {({ id, value, invalid, valid, describedBy }) => (
                    <Select
                      value={value}
                      onValueChange={(v) => {
                        if (v !== '') field.handleChange(Number(v))
                      }}
                      disabled={types.length === 0}
                    >
                      <SelectTrigger
                        id={id}
                        aria-invalid={invalid}
                        data-valid={valid}
                        aria-describedby={describedBy}
                      >
                        <SelectValue
                          placeholder={
                            types.length === 0 ? 'No activity types configured' : 'Choose a type'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {types.map((t) => (
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

            <form.Field name="note">
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

            {target && stageOptions.length > 0 && (
              <form.Field name="targetStage">
                {(field) => (
                  <FormField
                    name={field.name}
                    state={field.state}
                    handleChange={field.handleChange}
                    handleBlur={field.handleBlur}
                    submitted={submitted}
                    label="Change Status?"
                    hint="Optional — change the pipeline stage at the same time"
                    validate={() => undefined}
                    completeWhen={() => false}
                  >
                    {({ id, describedBy }) => (
                      <Select
                        value={field.state.value}
                        onValueChange={(v) => field.handleChange(v)}
                      >
                        <SelectTrigger id={id} aria-describedby={describedBy}>
                          <SelectValue placeholder="No change" />
                        </SelectTrigger>
                        <SelectContent>
                          {stageOptions.map((s) => (
                            <SelectItem key={s.key} value={s.key}>
                              <span className="flex items-center gap-2">
                                <StageBadge stage={s.key} />
                                {s.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                )}
              </form.Field>
            )}
          </FieldGroup>

          <DialogFooter className="mt-6">
            <LoadingButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </LoadingButton>
            <LoadingButton
              type="submit"
              loading={isSubmitting}
              success={submitSuccess}
              disabled={!canSubmit || !target}
              loadingLabel="Saving…"
              successLabel="Done!"
            >
              Log activity
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>

      {targetTerminal && target ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Log for a ${stageConfig(target.stage).label} lead?`}
          description={`${target.name} is on the ${stageConfig(target.stage).label} stage. Your team can still win them back — log this activity anyway?`}
          confirmLabel="Log anyway"
          onConfirm={() => {
            confirmedRef.current = true
            setConfirmOpen(false)
            form.handleSubmit()
          }}
        />
      ) : null}
    </Dialog>
  )
}
