import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { Ban, ShieldCheck } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useBlacklistToggle } from '../blacklist'

/**
 * Shared Blacklist dialog (issue #104) — used from both the Leads and Customers
 * surfaces since blacklist is a *Person*-level attribute. In "blacklist" mode an
 * optional reason is captured (visible to front desk); in "unblacklist" mode it
 * is a plain confirmation that lifts the flag.
 *
 * Dialogs are lazy-loaded and remounted per open (fresh state every time).
 */
export function BlacklistDialog({
  open,
  onOpenChange,
  personId,
  personName,
  isBlacklisted
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  personId: number
  personName: string
  isBlacklisted: boolean
}): React.JSX.Element {
  const toggle = useBlacklistToggle()

  const form = useForm({
    defaultValues: { reason: '' },
    onSubmit: async ({ value }) => {
      try {
        await toggle.mutateAsync({
          personId,
          action: isBlacklisted ? 'unblacklist' : 'blacklist',
          reason: value.reason.trim() || null
        })
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
          <DialogTitle
            className={
              isBlacklisted ? 'flex items-center gap-2' : 'flex items-center gap-2 text-destructive'
            }
          >
            {isBlacklisted ? (
              <ShieldCheck className="size-4 text-primary" />
            ) : (
              <Ban className="size-4 text-destructive" />
            )}
            {isBlacklisted ? `Lift blacklist for ${personName}` : `Blacklist ${personName}`}
          </DialogTitle>
          <DialogDescription>
            {isBlacklisted
              ? 'This person can use every module again once the flag is lifted.'
              : 'Blacklisted people are blocked from every module except refunds. The reason is visible to front desk.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          {!isBlacklisted ? (
            <form.Field name="reason">
              {(field) => (
                <FormField
                  name={field.name}
                  state={{ value: field.state.value, meta: field.state.meta }}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label="Reason"
                  hint="Optional — e.g. bounced cheque, abusive behaviour, no-show pattern."
                  validate={() => undefined}
                  completeWhen={(v) => v.length > 0}
                >
                  {({ id, invalid, valid, describedBy, onBlur, onChange }) => (
                    <Textarea
                      id={id}
                      value={field.state.value}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                      aria-invalid={invalid}
                      data-valid={valid}
                      aria-describedby={describedBy}
                      maxLength={500}
                      placeholder="Why is this person being blacklisted?"
                    />
                  )}
                </FormField>
              )}
            </form.Field>
          ) : null}

          <DialogFooter className="mt-6">
            <LoadingButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </LoadingButton>
            <LoadingButton
              type="submit"
              variant={isBlacklisted ? 'outline' : 'destructive'}
              loading={isSubmitting}
              loadingLabel="Saving…"
              disabled={!canSubmit}
            >
              {isBlacklisted ? 'Lift blacklist' : 'Blacklist person'}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
