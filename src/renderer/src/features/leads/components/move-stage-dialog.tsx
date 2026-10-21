import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { ArrowRight } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StageBadge } from './stage-badge'
import { moveableStages, nextStage } from '../constants'
import { useLogActivity, useMoveStage, useScheduleFollowUp } from '../queries'
import { getLeadMaps, stageIdOf, useReferenceData } from '../reference-data'
import type { Lead, StageKey } from '../types'

/**
 * Strict stage move (Module 01 robustness rule): a lead can never silently
 * change stage on the board/table — every move is recorded as a NOTE activity
 * first (the backend refuses a move without a real activity), then the stage
 * flips with the created activity attached. Optionally schedules the next
 * follow-up in the same breath. WON/LOST are handled by their dedicated
 * dialogs instead and never appear here.
 */
export function MoveStageDialog({
  open,
  onOpenChange,
  lead,
  initialStage
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead: Lead
  initialStage?: StageKey
}): React.JSX.Element {
  const logActivity = useLogActivity()
  const move = useMoveStage()
  const schedule = useScheduleFollowUp()
  const { data: ref } = useReferenceData()
  const maps = useMemo(() => (ref ? getLeadMaps(ref) : null), [ref])

  const options = useMemo(() => moveableStages(lead.stage), [lead.stage])

  const defaultTarget = useMemo(() => {
    if (initialStage && options.some((o) => o.key === initialStage)) return initialStage
    const next = nextStage(lead.stage)
    if (next && options.some((o) => o.key === next)) return next
    return options[0]?.key
  }, [initialStage, lead.stage, options])

  const [submitSuccess, setSubmitSuccess] = useState(false)
  const successTimer = useRef<number | null>(null)

  const form = useForm({
    defaultValues: { to: defaultTarget, note: '', scheduleOn: false, fuTitle: '', due: '' },
    validators: {
      // Cross-field rule: the follow-up fields only exist while `scheduleOn` is
      // checked, so this is the authoritative gate for `canSubmit` (per-field
      // validators can't veto until their inputs mount and change).
      onChange: ({ value }) => {
        if (!value.scheduleOn) return undefined
        if (!value.fuTitle?.trim()) return 'Name the follow-up'
        if (!value.due) return 'Pick a due date and time'
        return undefined
      }
    },
    onSubmit: async ({ value }) => {
      if (!maps) return
      const typeId = maps.activityTypeIdByName.get('note')
      const targetStageId = stageIdOf(maps, value.to)
      if (typeId === undefined || targetStageId === undefined) return

      try {
        const { activityId } = await logActivity.mutateAsync({
          leadId: lead.id,
          typeId,
          note: value.note.trim(),
          occurredAt: new Date().toISOString()
        })
        await move.mutateAsync({
          leadId: lead.id,
          targetStageId,
          expectedStageId: lead.stageId,
          activityId
        })
        if (value.scheduleOn && value.fuTitle?.trim() && value.due) {
          await schedule.mutateAsync({
            leadId: lead.id,
            title: value.fuTitle.trim(),
            dueAt: new Date(value.due).toISOString()
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

  useEffect(() => {
    return () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Move {lead.name}</DialogTitle>
          <DialogDescription>
            Log what moved this lead forward. Every stage change keeps a reason so the history stays
            true.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <div className="flex items-center gap-2 text-sm">
            <StageBadge stage={lead.stage} isBlacklisted={lead.isBlacklisted} />
            <ArrowRight className="size-4 text-muted-foreground" />
            <form.Field name="to">
              {(field) =>
                field.state.value ? (
                  <StageBadge stage={field.state.value} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              }
            </form.Field>
          </div>

          <FieldGroup className="mt-3 gap-4">
            <form.Field name="to">
              {(field) => (
                <FormField
                  name={field.name}
                  state={{
                    value: (field.state.value ?? '') as string,
                    meta: field.state.meta
                  }}
                  handleChange={(v) => field.handleChange(v as StageKey)}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label="Move to"
                  validate={(v) => (v ? undefined : 'Choose a stage')}
                  completeWhen={(v) => Boolean(v)}
                >
                  {({ id, value, invalid, valid, describedBy }) => (
                    <Select
                      value={value}
                      onValueChange={(v) => {
                        if (v !== '') field.handleChange(v as StageKey)
                      }}
                    >
                      <SelectTrigger
                        id={id}
                        aria-invalid={invalid}
                        data-valid={valid}
                        aria-describedby={describedBy}
                      >
                        <SelectValue placeholder="Choose a stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              )}
            </form.Field>

            <form.Field
              name="note"
              validators={{
                onChange: ({ value }) =>
                  value.trim() ? undefined : 'Write what happened before the move'
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
                      What happened? <span className="text-destructive">*</span>
                    </>
                  }
                  hint="Recorded as the reason for this stage change"
                  validate={(v) => (v.trim() ? undefined : 'Write what happened before the move')}
                  completeWhen={(v) => v.trim().length > 0}
                >
                  {({ id, value, invalid, valid, describedBy, onBlur, onChange }) => (
                    <Textarea
                      id={id}
                      value={value}
                      onBlur={onBlur}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="e.g. Spoke with him, he wants a family plan"
                      rows={3}
                      aria-invalid={invalid}
                      data-valid={valid}
                      aria-describedby={describedBy}
                    />
                  )}
                </FormField>
              )}
            </form.Field>

            <form.Field name="scheduleOn">
              {(field) => (
                <div className="grid gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.checked)}
                    />
                    Also schedule the next follow-up
                  </label>
                  {field.state.value && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <form.Field
                        name="fuTitle"
                        validators={{
                          onChange: ({ value }) => (value.trim() ? undefined : 'Name the follow-up')
                        }}
                      >
                        {(sub) => (
                          <FormField
                            name={sub.name}
                            state={sub.state}
                            handleChange={sub.handleChange}
                            handleBlur={sub.handleBlur}
                            submitted={submitted}
                            label="Follow-up"
                            validate={(v) => (v.trim() ? undefined : 'Name the follow-up')}
                            completeWhen={(v) => v.trim().length > 0}
                            placeholder="e.g. Call to close"
                          />
                        )}
                      </form.Field>
                      <form.Field
                        name="due"
                        validators={{
                          onChange: ({ value }) => (value ? undefined : 'Pick a due date and time')
                        }}
                      >
                        {(sub) => (
                          <FormField
                            name={sub.name}
                            state={sub.state}
                            handleChange={sub.handleChange}
                            handleBlur={sub.handleBlur}
                            submitted={submitted}
                            label="Due"
                            validate={(v) => (v ? undefined : 'Pick a due date and time')}
                            completeWhen={(v) => Boolean(v)}
                            type="datetime-local"
                          />
                        )}
                      </form.Field>
                    </div>
                  )}
                </div>
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
              disabled={!canSubmit || !maps}
              loadingLabel="Moving…"
              successLabel="Moved!"
            >
              Move stage
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
