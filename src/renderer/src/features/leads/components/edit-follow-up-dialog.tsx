import React, { useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { CalendarClock } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { isTerminal, stageConfig } from '../constants'
import { useUpdateFollowUp } from '../queries'
import type { FollowUpRow } from '@/features/followups/types'

/**
 * Edit a follow-up by extending its due date with an optional extension reason.
 */
export function EditFollowUpDialog({
  open,
  onOpenChange,
  followUp
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  followUp: FollowUpRow
}): React.JSX.Element {
  const update = useUpdateFollowUp()
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const confirmedRef = useRef(false)
  const followUpTerminal = isTerminal(followUp.stage)

  const form = useForm({
    defaultValues: {
      due: followUp.dueAt,
      extensionReason: followUp.extensionReason ?? ''
    },
    onSubmit: async ({ value }) => {
      // Soft gate: extending a terminal-stage lead's follow-up asks first.
      if (followUpTerminal && !confirmedRef.current) {
        setConfirmOpen(true)
        return
      }
      try {
        await update.mutateAsync({
          followupId: followUp.id,
          dueAt: new Date(value.due).toISOString(),
          extensionReason: value.extensionReason.trim() || undefined
        })
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
            <CalendarClock className="size-4 text-primary" />
            Extend follow-up
          </DialogTitle>
          <DialogDescription>
            Move the due date for &ldquo;{followUp.title}&rdquo; to a later time.
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
              name="due"
              validators={{
                onChange: ({ value }) => (value ? undefined : 'Pick a new due date and time')
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
                      New due date <span className="text-destructive">*</span>
                    </>
                  }
                  validate={(v) => (v ? undefined : 'Pick a new due date and time')}
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

            <form.Field name="extensionReason">
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label="Extension reason"
                  validate={() => undefined}
                >
                  {({ id, value, invalid, describedBy, onChange }) => (
                    <Textarea
                      id={id}
                      value={value}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="Why is this being extended?"
                      rows={3}
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
              disabled={!canSubmit}
              loadingLabel="Extending…"
              successLabel="Extended!"
            >
              Extend follow-up
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>

      {followUpTerminal ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Extend for a ${stageConfig(followUp.stage).label} lead?`}
          description={`This follow-up belongs to a lead on the ${stageConfig(followUp.stage).label} stage. Your team can still win them back — extend it anyway?`}
          confirmLabel="Extend anyway"
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
