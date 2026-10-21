import { useEffect } from 'react'
import { useForm } from '@tanstack/react-form'
import { UserRoundPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { LoadingButton } from '@/components/ui/loading-button'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateBillingSnapshot } from '../queries'

/**
 * Edit the billing snapshot on a DRAFT invoice (Module 04 §21 snapshot
 * discipline): name/phone/email/address are historical document data — edits
 * apply to this invoice only and never write back to the customer record.
 * Finalized invoices reject the command server-side; the caller only opens
 * this for drafts.
 */
interface EditBillingSnapshotDialogProps {
  invoiceId: number | undefined
  invoiceNo?: string
  initial: {
    name: string
    phone: string
    email: string
    address: string
  }
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditBillingSnapshotDialog({
  invoiceId,
  invoiceNo,
  initial,
  open,
  onOpenChange
}: EditBillingSnapshotDialogProps): React.JSX.Element | null {
  const save = useUpdateBillingSnapshot(invoiceId)

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      if (invoiceId === undefined) return
      await save.mutateAsync({
        invoiceId,
        billingName: value.name.trim(),
        billingPhone: value.phone.trim() === '' ? null : value.phone.trim(),
        billingEmail: value.email.trim() === '' ? null : value.email.trim(),
        billingAddress: value.address.trim() === '' ? null : value.address.trim()
      })
      onOpenChange(false)
    }
  })
  const submitted = form.state.isSubmitted

  // Fresh state per mount (dialogs remount per open).
  useEffect(() => {
    if (!open) form.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || invoiceId === undefined) return null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRoundPen className="size-4 text-primary" />
            Edit billing details {invoiceNo ? `· ${invoiceNo}` : ''}
          </DialogTitle>
          <DialogDescription>
            Snapshot data for this invoice only — the customer record is never modified.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <FieldGroup className="gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }) =>
                    value.trim().length === 0
                      ? 'Name is required'
                      : value.length > 200
                        ? 'Max 200 characters'
                        : undefined
                }}
              >
                {(field) => (
                  <Field
                    id="snap-name"
                    label="Name"
                    error={
                      field.state.meta.isTouched || submitted
                        ? field.state.meta.errors[0]
                        : undefined
                    }
                  >
                    <Input
                      id="snap-name"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={
                        (field.state.meta.isTouched || submitted) &&
                        field.state.meta.errors.length > 0
                      }
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field
                name="phone"
                validators={{
                  onChange: ({ value }) => (value.length > 20 ? 'Max 20 characters' : undefined)
                }}
              >
                {(field) => (
                  <Field
                    id="snap-phone"
                    label="Phone"
                    error={field.state.meta.isTouched ? field.state.meta.errors[0] : undefined}
                  >
                    <Input
                      id="snap-phone"
                      inputMode="tel"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field
                name="email"
                validators={{
                  onChange: ({ value }) =>
                    value.trim() !== '' && !/^\S+@\S+\.\S+$/.test(value.trim())
                      ? 'Enter a valid email'
                      : undefined
                }}
              >
                {(field) => (
                  <Field
                    id="snap-email"
                    label="Email"
                    error={field.state.meta.isTouched ? field.state.meta.errors[0] : undefined}
                  >
                    <Input
                      id="snap-email"
                      type="email"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field
                name="address"
                validators={{
                  onChange: ({ value }) => (value.length > 500 ? 'Max 500 characters' : undefined)
                }}
              >
                {(field) => (
                  <Field
                    id="snap-address"
                    label="Address"
                    error={field.state.meta.isTouched ? field.state.meta.errors[0] : undefined}
                  >
                    <Textarea
                      id="snap-address"
                      rows={1}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.Field>
            </div>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <form.Subscribe
            selector={(s) => ({
              canSubmit: s.canSubmit,
              isSubmitting: s.isSubmitting,
              isDirty: s.isDirty
            })}
          >
            {({ canSubmit, isSubmitting, isDirty }) => (
              <LoadingButton
                type="submit"
                disabled={!canSubmit || !isDirty}
                loading={isSubmitting}
                loadingLabel="Saving…"
              >
                Save details
              </LoadingButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
