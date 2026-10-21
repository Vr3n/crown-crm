import { useMemo, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { BellPlus } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateTimePicker } from '@/components/ui/date-time-picker'
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
import { isTerminal, moveableStages, stageConfig } from '../constants'
import { useLogActivity, useMoveStage, useScheduleFollowUp } from '../queries'
import { getLeadMaps, stageIdOf, useReferenceData } from '../reference-data'
import { LeadPicker } from './lead-picker'
import { StageBadge } from './stage-badge'
import type { Lead, StageKey } from '../types'

/**
 * Schedule a follow-up (Module 01 §25). From the lead detail screen the lead is
 * already known; from the global Follow-ups page it is chosen first via the
 * searchable LeadPicker. "Follow-up = future work" — always has a due time and
 * the backend rejects past dates.
 */
export function FollowUpDialog({
  open,
  onOpenChange,
  lead
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead?: Lead
}): React.JSX.Element {
  const schedule = useScheduleFollowUp()
  const logActivity = useLogActivity()
  const move = useMoveStage()
  const { data: ref } = useReferenceData()
  const maps = useMemo(() => (ref ? getLeadMaps(ref) : null), [ref])
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
    defaultValues: { title: '', due: '', targetStage: '' },
    onSubmit: async ({ value }) => {
      if (!target) return
      // Soft gate: terminal-stage leads can be won back, but scheduling for
      // one asks for an explicit confirmation first.
      if (targetTerminal && !confirmedRef.current) {
        setConfirmOpen(true)
        return
      }
      try {
        await schedule.mutateAsync({
          leadId: target.id,
          title: value.title.trim(),
          dueAt: new Date(value.due).toISOString()
        })
        if (value.targetStage && value.targetStage !== target.stage && maps) {
          const typeId = maps.activityTypeIdByName.get('note')
          const targetStageId = stageIdOf(maps, value.targetStage as StageKey)
          if (typeId !== undefined && targetStageId !== undefined) {
            const { activityId } = await logActivity.mutateAsync({
              leadId: target.id,
              typeId,
              note: `Stage changed to ${value.targetStage}`,
              occurredAt: new Date().toISOString()
            })
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
            <BellPlus className="size-4 text-primary" />
            {lead ? `Schedule a follow-up · ${lead.name}` : 'Schedule a follow-up'}
          </DialogTitle>
          <DialogDescription>
            {lead
              ? 'A future action you intend to take with this lead.'
              : 'Pick who it is for, then set the action and when it should happen.'}
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
              name="title"
              validators={{
                onChange: ({ value }) =>
                  value.trim().length > 0 ? undefined : 'Give this follow-up a name'
              }}
            >
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label={
                    <>
                      What to do <span className="text-destructive">*</span>
                    </>
                  }
                  validate={(v) => (v.trim().length > 0 ? undefined : 'Give this follow-up a name')}
                  completeWhen={(v) => v.trim().length > 0}
                  placeholder="e.g. Call to confirm trial"
                />
              )}
            </form.Field>

            <form.Field
              name="due"
              validators={{
                onChange: ({ value }) => {
                  if (!value) return 'Pick a due date and time'
                  const d = new Date(value)
                  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
                    return 'Follow-up date must be in the future'
                  }
                  return undefined
                }
              }}
            >
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label={
                    <>
                      Due <span className="text-destructive">*</span>
                    </>
                  }
                  validate={(v) => {
                    if (!v) return 'Pick a due date and time'
                    const d = new Date(v)
                    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
                      return 'Follow-up date must be in the future'
                    }
                    return undefined
                  }}
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
              loadingLabel="Scheduling…"
              successLabel="Done!"
            >
              Schedule
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>

      {targetTerminal && target ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Schedule for a ${stageConfig(target.stage).label} lead?`}
          description={`${target.name} is on the ${stageConfig(target.stage).label} stage. Your team can still win them back — schedule this follow-up anyway?`}
          confirmLabel="Schedule anyway"
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
