import { useMemo } from 'react'
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
import { FormField } from '@/components/ui/form-field'
import { LoadingButton } from '@/components/ui/loading-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useMarkLost } from '../queries'
import { useReferenceData } from '../reference-data'
import type { Lead } from '../types'

/**
 * Lost leads must record *why* they were lost (Module 01 §26) — a bare
 * `stage = LOST` with no reason would silently poison sales analysis. This
 * dialog forces the reason; the backend records it against the stage history.
 */
export function MarkLostDialog({
  open,
  onOpenChange,
  lead
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead: Lead
}): React.JSX.Element {
  const mark = useMarkLost()
  const { data: ref } = useReferenceData()
  const reasons = useMemo(() => ref?.lostReasons.filter((r) => r.active) ?? [], [ref])

  const form = useForm({
    defaultValues: { reasonId: 0 },
    onSubmit: async ({ value }) => {
      try {
        await mark.mutateAsync({ leadId: lead.id, lostReasonId: value.reasonId })
        onOpenChange(false)
      } catch {
        // error toast handled by the mutation hook
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
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="size-4" />
            Mark {lead.name} as lost
          </DialogTitle>
          <DialogDescription>
            Record why this lead did not convert — it feeds your sales analysis.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <form.Field
            name="reasonId"
            validators={{
              onChange: ({ value }) => (value > 0 ? undefined : 'Choose a reason')
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
                    Reason <span className="text-destructive">*</span>
                  </>
                }
                validate={(v) => (v ? undefined : 'Choose a reason')}
                completeWhen={(v) => Boolean(v)}
              >
                {({ id, value, invalid, valid, describedBy }) => (
                  <Select
                    value={value}
                    onValueChange={(v) => {
                      if (v !== '') field.handleChange(Number(v))
                    }}
                  >
                    <SelectTrigger
                      id={id}
                      aria-invalid={invalid}
                      data-valid={valid}
                      aria-describedby={describedBy}
                    >
                      <SelectValue placeholder="Why was it lost?" />
                    </SelectTrigger>
                    <SelectContent>
                      {reasons.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            )}
          </form.Field>

          <DialogFooter className="mt-6">
            <LoadingButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </LoadingButton>
            <LoadingButton
              type="submit"
              variant="destructive"
              loading={isSubmitting}
              loadingLabel="Saving…"
              disabled={!canSubmit}
            >
              Mark as lost
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
