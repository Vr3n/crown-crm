import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { PiggyBank } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useIssueCredit } from '../queries'
import { parseToMinor, sanitizeMoneyInput } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { CustomerPicker } from './customer-picker'
import type { PersonRef } from '@/features/dashboard/types'

/**
 * Add a credit (Module 05 §18). Credit is value kept *inside* the business as a
 * promise against a future invoice — the inverse of a refund. The credit starts
 * with no applications and is drawn down when the customer is billed.
 */
export function AddCreditDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const issue = useIssueCredit()
  const currency = useCurrency()
  const [picked, setPicked] = useState<PersonRef | null>(null)

  const form = useForm({
    defaultValues: {
      issuedAt: new Date().toISOString(),
      amount: '',
      source: '',
      reason: ''
    },
    onSubmit: async ({ value }) => {
      if (!picked) return
      try {
        await issue.mutateAsync({
          customerId: picked.id,
          amountMinor: parseToMinor(String(value.amount), currency) ?? 0,
          reason: value.reason.trim()
        })
        setPicked(null)
        form.reset()
        onOpenChange(false)
      } catch {
        // error toast handled by the mutation hook
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="size-4 text-primary" />
            Add a credit
          </DialogTitle>
          <DialogDescription>
            Value kept inside the business against a future invoice — the inverse of a refund.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>
                Customer <span className="text-destructive">*</span>
              </Label>
              <CustomerPicker value={picked?.id ?? ''} onChange={setPicked} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="issuedAt"
                validators={{
                  onChange: ({ value }) => (value ? undefined : 'Pick a date')
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`cr-${field.name}`}>
                      Date <span className="text-destructive">*</span>
                    </Label>
                    <DateTimePicker
                      value={field.state.value}
                      onChange={(iso) => field.handleChange(iso)}
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>

              <form.Field
                name="amount"
                validators={{
                  onChange: ({ value }) => {
                    const n = Number(value)
                    if (!value) return 'Enter an amount'
                    if (!Number.isFinite(n) || n <= 0) return 'Amount must be positive'
                    return undefined
                  }
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`cr-${field.name}`}>
                      Amount <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`cr-${field.name}`}
                      type="text"
                      inputMode="decimal"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(sanitizeMoneyInput(e.target.value))}
                      placeholder="0"
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>
            </div>

            <form.Field name="source">
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`cr-${field.name}`}>Source (optional)</Label>
                  <Input
                    id={`cr-${field.name}`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. Waiver, promotional gift"
                  />
                </div>
              )}
            </form.Field>

            <form.Field
              name="reason"
              validators={{
                onChange: ({ value }) =>
                  value.trim().length > 0 ? undefined : 'Why was this credit given?'
              }}
            >
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`cr-${field.name}`}>
                    Reason <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id={`cr-${field.name}`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. 3 sessions lost to a facility shutdown"
                    rows={2}
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" disabled={!canSubmit || !picked}>
                  {isSubmitting ? 'Adding…' : 'Add credit'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
