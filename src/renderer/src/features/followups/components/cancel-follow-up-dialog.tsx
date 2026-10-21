import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { XCircle } from 'lucide-react'
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
import { useCancelFollowUp } from '@/features/leads/queries'
import type { FollowUpRow } from '../types'

/**
 * Cancel a follow-up with an optional reason. The lead name is shown for
 * context but not editable — the caller already knows which follow-up is
 * being cancelled.
 */
export function CancelFollowUpDialog({
  open,
  onOpenChange,
  followUp
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  followUp: FollowUpRow
}): React.JSX.Element {
  const cancel = useCancelFollowUp()
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const form = useForm({
    defaultValues: { reason: '' },
    onSubmit: async ({ value }) => {
      try {
        await cancel.mutateAsync({
          followupId: followUp.id,
          reason: value.reason.trim() || undefined
        })
        setSubmitSuccess(true)
        window.setTimeout(() => onOpenChange(false), 700)
      } catch {
        setSubmitSuccess(false)
      }
    }
  })

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="size-4 text-destructive" />
            Cancel follow-up
          </DialogTitle>
          <DialogDescription>
            Cancel &ldquo;{followUp.title}&rdquo; for {followUp.leadName}. Optionally add a reason
            (visible in the timeline).
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
            <form.Field name="reason">
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={false}
                  label="Reason"
                  hint="Why is this follow-up being cancelled?"
                  validate={() => undefined}
                >
                  {({ id, value, invalid, describedBy, onChange }) => (
                    <Textarea
                      id={id}
                      value={value}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="e.g. Lead is no longer interested"
                      rows={3}
                    />
                  )}
                </FormField>
              )}
            </form.Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <LoadingButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Keep follow-up
            </LoadingButton>
            <LoadingButton
              type="submit"
              variant="destructive"
              loading={isSubmitting}
              success={submitSuccess}
              loadingLabel="Cancelling…"
              successLabel="Cancelled!"
            >
              Cancel follow-up
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
