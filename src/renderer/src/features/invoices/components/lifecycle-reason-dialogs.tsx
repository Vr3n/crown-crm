import { useEffect } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import type { ReactFormExtendedApi } from '@tanstack/react-form'
import { Ban, CircleOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { Textarea } from '@/components/ui/textarea'
import { useMarkUncollectible, useVoidInvoice } from '../queries'

/**
 * Lifecycle reason dialogs (Module 04 §13). Void and mark-uncollectible are
 * explicit operations on OPEN / PARTIALLY_PAID invoices — never a raw status
 * write. Both require a reason (1–500 chars), which is stored with who/when.
 * Financial values are kept; voided numbers keep their place in the sequence.
 */

interface ReasonDialogProps {
  invoiceId: number | undefined
  invoiceNo?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ReasonFormApi = ReactFormExtendedApi<
  { reason: string },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  Record<string, never>
>

function useReasonForm(
  onSubmit: (reason: string) => Promise<unknown>,
  onDone: () => void
): ReasonFormApi {
  return useForm({
    defaultValues: { reason: '' },
    onSubmit: async ({ value }) => {
      try {
        await onSubmit(value.reason.trim())
        onDone()
      } catch {
        // toast handled by the mutation layer
      }
    }
  })
}

function ReasonField({
  form,
  submitted,
  label,
  placeholder
}: {
  form: ReasonFormApi
  submitted: boolean
  label: string
  placeholder: string
}): React.JSX.Element {
  return (
    <form.Field
      name="reason"
      validators={{
        onChange: ({ value }) => {
          if (value.trim().length === 0) return `${label} is required`
          if (value.length > 500) return 'Max 500 characters'
          return undefined
        }
      }}
    >
      {(field) => (
        <div className="grid gap-1.5">
          <Label htmlFor="reason">
            {label} <span className="text-destructive">*</span>
            <span className="ml-2 font-normal text-muted-foreground">
              {500 - field.state.value.length} left
            </span>
          </Label>
          <Textarea
            id="reason"
            rows={3}
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            placeholder={placeholder}
            aria-invalid={
              (field.state.meta.isTouched || submitted) && field.state.meta.errors.length > 0
            }
            aria-describedby="reason-error"
          />
          {(field.state.meta.isTouched || submitted) && field.state.meta.errors.length > 0 ? (
            <p id="reason-error" role="alert" className="text-xs text-destructive">
              {field.state.meta.errors[0]}
            </p>
          ) : null}
        </div>
      )}
    </form.Field>
  )
}

/** Base layout shared by both lifecycle dialogs — owns the <form> so its
 * submit button actually submits (the footer lives inside the form element). */
function ReasonDialogLayout({
  icon: Icon,
  title,
  description,
  confirmLabel,
  loading,
  canSubmit,
  onOpenChange,
  onSubmit,
  children
}: {
  icon: typeof Ban
  title: string
  description: string
  confirmLabel: string
  loading: boolean
  canSubmit: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-4 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onSubmit()
          }}
        >
          {children}
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              disabled={!canSubmit}
              loading={loading}
              loadingLabel="Working…"
            >
              {confirmLabel}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function VoidInvoiceDialog({
  invoiceId,
  invoiceNo,
  open,
  onOpenChange
}: ReasonDialogProps): React.JSX.Element | null {
  const voidInvoice = useVoidInvoice()
  const form = useReasonForm(
    (reason) => voidInvoice.mutateAsync({ invoiceId: invoiceId!, reason }),
    () => onOpenChange(false)
  )
  // Reactive subscriptions — non-reactive `form.state` reads would leave the
  // submit gate stale.
  const reason = useStore(form.store, (s) => s.values.reason.trim())
  const submitting = useStore(form.store, (s) => s.isSubmitting)

  // Fresh state per mount (dialogs remount per open).
  useEffect(() => {
    if (!open) form.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || invoiceId === undefined) return null

  return (
    <ReasonDialogLayout
      icon={Ban}
      title={`Void ${invoiceNo ?? 'invoice'}`}
      description="The number keeps its place in the sequence and all amounts stay readable — but nothing can be paid against it anymore."
      confirmLabel="Void invoice"
      loading={voidInvoice.isPending}
      canSubmit={reason.length > 0 && reason.length <= 500 && !submitting}
      onSubmit={() => void form.handleSubmit()}
      onOpenChange={onOpenChange}
    >
      <ReasonField
        form={form}
        submitted={form.state.isSubmitted}
        label="Reason"
        placeholder="Duplicate invoice, pricing error…"
      />
    </ReasonDialogLayout>
  )
}

export function MarkUncollectibleDialog({
  invoiceId,
  invoiceNo,
  open,
  onOpenChange
}: ReasonDialogProps): React.JSX.Element | null {
  const mark = useMarkUncollectible()
  const form = useReasonForm(
    (reason) => mark.mutateAsync({ invoiceId: invoiceId!, reason }),
    () => onOpenChange(false)
  )
  const reason = useStore(form.store, (s) => s.values.reason.trim())
  const submitting = useStore(form.store, (s) => s.isSubmitting)

  useEffect(() => {
    if (!open) form.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || invoiceId === undefined) return null

  return (
    <ReasonDialogLayout
      icon={CircleOff}
      title={`Mark ${invoiceNo ?? 'invoice'} uncollectible`}
      description="A write-off: the debt is acknowledged as uncollectable for reporting. Amounts stay frozen and auditable."
      confirmLabel="Mark uncollectible"
      loading={mark.isPending}
      canSubmit={reason.length > 0 && reason.length <= 500 && !submitting}
      onSubmit={() => void form.handleSubmit()}
      onOpenChange={onOpenChange}
    >
      <ReasonField
        form={form}
        submitted={form.state.isSubmitted}
        label="Reason"
        placeholder="Customer left the city, written off after 180 days…"
      />
    </ReasonDialogLayout>
  )
}
