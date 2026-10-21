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
import { useBulkMoveStage, useBulkScheduleFollowUp } from '../queries'
import { getLeadMaps, stageIdOf, useReferenceData } from '../reference-data'
import { StageBadge } from './stage-badge'
import type { StageConfig, StageKey } from '../types'

/**
 * Bulk follow-up for the selection toolbar: one follow-up per selected lead,
 * with the same title and due time. "Follow-up = future work" — the due time
 * is always set and the backend rejects past dates.
 */
export function BulkFollowUpDialog({
  open,
  onOpenChange,
  count,
  leadIds,
  moveOptions,
  terminalCount,
  onSuccess
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  count: number
  leadIds: number[]
  moveOptions: StageConfig[]
  /** How many selected leads sit on a terminal stage — asks for confirmation. */
  terminalCount: number
  onSuccess: () => void
}): React.JSX.Element {
  const schedule = useBulkScheduleFollowUp()
  const bulkMove = useBulkMoveStage()
  const { data: ref } = useReferenceData()
  const maps = useMemo(() => (ref ? getLeadMaps(ref) : null), [ref])
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const confirmedRef = useRef(false)

  const form = useForm({
    defaultValues: { title: '', due: '', targetStage: '' },
    onSubmit: async ({ value }) => {
      // Soft gate: scheduling for terminal-stage leads asks for confirmation.
      if (terminalCount > 0 && !confirmedRef.current) {
        setConfirmOpen(true)
        return
      }
      try {
        await schedule.mutateAsync({
          leadIds,
          title: value.title.trim(),
          dueAt: new Date(value.due).toISOString()
        })
        if (value.targetStage && maps) {
          const targetStageId = stageIdOf(maps, value.targetStage as StageKey)
          if (targetStageId !== undefined) {
            await bulkMove.mutateAsync({ leadIds, targetStageId })
          }
        }
        onSuccess()
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
            Schedule follow-ups · {count} {count === 1 ? 'lead' : 'leads'}
          </DialogTitle>
          <DialogDescription>
            One follow-up is created for each selected lead, with the same title and due time.
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
                onChange: ({ value }) => (value ? undefined : 'Pick a due date and time')
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

            {moveOptions.length > 0 && (
              <form.Field name="targetStage">
                {(field) => (
                  <FormField
                    name={field.name}
                    state={field.state}
                    handleChange={field.handleChange}
                    handleBlur={field.handleBlur}
                    submitted={submitted}
                    label="Change Status?"
                    hint="Optional — change the pipeline stage for all selected leads"
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
                          {moveOptions.map((s) => (
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
              disabled={!canSubmit}
              loadingLabel="Scheduling…"
              successLabel="Done!"
            >
              Schedule
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>

      {terminalCount > 0 ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Schedule for terminal-stage leads?"
          description={`${terminalCount} of ${count} selected ${count === 1 ? 'lead is' : 'leads are'} on a terminal stage (Lost/Won). Your team can still win them back — schedule these follow-ups anyway?`}
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
