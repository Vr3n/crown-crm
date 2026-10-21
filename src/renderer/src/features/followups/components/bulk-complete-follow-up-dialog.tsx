import { useMemo, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { CheckCircle2 } from 'lucide-react'
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
import { useBulkCompleteFollowUps } from '@/features/leads/queries'
import { moveableStages, STAGES } from '@/features/leads/constants'
import { getLeadMaps, stageIdOf, useReferenceData } from '@/features/leads/reference-data'
import { StageBadge } from '@/features/leads/components/stage-badge'
import type { StageKey } from '@/features/leads/types'
import type { FollowUpRow } from '../types'

/**
 * Bulk "mark done" for the follow-ups queue selection toolbar. Completes every
 * selected follow-up in a single atomic backend call. Like the Schedule
 * follow-ups dialog, an optional "Change Status?" move applies to all selected
 * leads — options are the stages every selected lead can move to (the safe
 * intersection, same rule as the leads bulk toolbar). Hidden when any selected
 * lead is terminal (it can never move and the batch is all-or-nothing).
 */
export function BulkCompleteFollowUpDialog({
  open,
  onOpenChange,
  rows,
  onSuccess
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  rows: FollowUpRow[]
  onSuccess: () => void
}): React.JSX.Element {
  const completeAll = useBulkCompleteFollowUps()
  const { data: ref } = useReferenceData()
  const maps = useMemo(() => (ref ? getLeadMaps(ref) : null), [ref])
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const count = rows.length

  /**
   * Stages every selected lead can move to — the safe intersection. LOST leads
   * are included (winning them back is a supported move); WON stays absorbing,
   * so any WON row hides the move — the batch could never apply it.
   */
  const stageOptions = useMemo(() => {
    if (rows.length === 0) return []
    if (rows.some((r) => r.stage === 'WON')) return []
    const optionSets = rows.map((r) => new Set(moveableStages(r.stage).map((s) => s.key)))
    const shared = new Set(optionSets[0])
    for (const set of optionSets.slice(1)) {
      for (const key of shared) if (!set.has(key)) shared.delete(key)
    }
    return STAGES.filter((s) => shared.has(s.key))
  }, [rows])

  const form = useForm({
    defaultValues: { targetStage: '' },
    onSubmit: async ({ value }) => {
      try {
        let stageChange: { targetStageId: number } | undefined
        if (maps && value.targetStage) {
          const targetStageId = stageIdOf(maps, value.targetStage as StageKey)
          if (targetStageId !== undefined) stageChange = { targetStageId }
        }
        await completeAll.mutateAsync({
          followUpIds: rows.map((r) => r.id),
          ...(stageChange ? { stageChange } : {})
        })
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
            <CheckCircle2 className="size-4 text-primary" />
            Mark follow-ups as done · {count} {count === 1 ? 'follow-up' : 'follow-ups'}
          </DialogTitle>
          <DialogDescription>
            The selected {count === 1 ? 'follow-up is completed' : 'follow-ups are completed'} in
            one go, with an optional pipeline move for the leads.
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
            {stageOptions.length > 0 && (
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
              disabled={!canSubmit}
              loadingLabel="Completing…"
              successLabel="Done!"
            >
              Mark done
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}