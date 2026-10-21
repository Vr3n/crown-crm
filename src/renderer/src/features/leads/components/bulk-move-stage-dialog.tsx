import { useMemo, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { ArrowRight } from 'lucide-react'
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
import { StageBadge } from './stage-badge'
import { useBulkMoveStage } from '../queries'
import { getLeadMaps, stageIdOf, useReferenceData } from '../reference-data'
import type { StageKey } from '../types'

/**
 * Bulk stage move for the selection toolbar. Selecting a target in the toolbar
 * opens this verification dialog instead of moving silently: the strict-move
 * rule from the single-lead flow applies here too, so the user confirms the
 * target and can record a reason that is saved as each lead's NOTE activity.
 */
export function BulkMoveStageDialog({
  open,
  onOpenChange,
  count,
  leadIds,
  to,
  onSuccess
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  count: number
  leadIds: number[]
  to: StageKey
  onSuccess: () => void
}): React.JSX.Element {
  const move = useBulkMoveStage()
  const { data: ref } = useReferenceData()
  const maps = useMemo(() => (ref ? getLeadMaps(ref) : null), [ref])
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const form = useForm({
    defaultValues: { note: '' },
    onSubmit: async ({ value }) => {
      if (!maps) return
      const targetStageId = stageIdOf(maps, to)
      if (targetStageId === undefined) return
      try {
        await move.mutateAsync({
          leadIds,
          targetStageId,
          note: value.note.trim()
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
            <ArrowRight className="size-4 text-secondary" />
            Move {count} {count === 1 ? 'lead' : 'leads'}?
          </DialogTitle>
          <DialogDescription>
            Every selected lead moves to <StageBadge stage={to} />. A note is recorded for each as
            the reason for the change.
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
            <form.Field name="note">
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label="What happened?"
                  hint="Optional — defaults to a bulk-move note on each lead"
                  validate={() => undefined}
                  completeWhen={(v) => v.trim().length > 0}
                >
                  {({ id, value, invalid, valid, describedBy, onBlur, onChange }) => (
                    <Textarea
                      id={id}
                      value={value}
                      onBlur={onBlur}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="e.g. Moving the batch back to follow up"
                      rows={3}
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
            <LoadingButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </LoadingButton>
            <LoadingButton
              type="submit"
              loading={isSubmitting}
              success={submitSuccess}
              disabled={!canSubmit || !maps}
              loadingLabel="Moving…"
              successLabel="Moved!"
            >
              Move leads
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
