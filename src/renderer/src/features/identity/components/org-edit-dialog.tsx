import { useForm } from '@tanstack/react-form'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { emailError, mobileError } from '@/lib/validation'
import { CURRENCIES, TIMEZONES } from '../constants'
import { useUpdateOrganization } from '../queries'
import type { OrganizationProfile } from '../types'
import { ORG_TERMS_MAX_LENGTH, termsError } from '../validation'
import { OrgLogoPicker } from './org-logo-picker'

/**
 * Edit the organization profile (Module 14 § 2). Legal identity, billing
 * contact, and the timezone/currency that every date and money figure derives
 * from — the mobile number is validated exactly like the setup flow.
 */
export function OrgEditDialog({
  org,
  open,
  onOpenChange
}: {
  org: OrganizationProfile
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const updateOrg = useUpdateOrganization()

  const form = useForm({
    defaultValues: {
      legalName: org.legalName ?? '',
      billingEmail: org.billingEmail ?? '',
      mobileNumber: org.mobileNumber,
      timezone: org.timezone ?? TIMEZONES[0],
      currency: org.currency,
      invoiceTerms: org.invoiceTerms ?? '',
      receiptTerms: org.receiptTerms ?? '',
      refundTerms: org.refundTerms ?? ''
    },
    onSubmit: async ({ value }) => {
      try {
        await updateOrg.mutateAsync({
          legalName: value.legalName,
          billingEmail: value.billingEmail,
          mobileNumber: value.mobileNumber,
          timezone: value.timezone,
          currency: value.currency,
          invoiceTerms: value.invoiceTerms,
          receiptTerms: value.receiptTerms,
          refundTerms: value.refundTerms
        })
        onOpenChange(false)
      } catch {
        // error toast handled by the mutation hook
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            Edit organization
          </DialogTitle>
          <DialogDescription>
            How your gym identifies itself, computes dates and money, and what it
            promises on its printed invoices and receipts.
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
            <OrgLogoPicker />
            <form.Field
              name="legalName"
              validators={{
                onChange: ({ value }) => {
                  const t = value.trim()
                  if (t.length > 0 && t.length < 2) return 'Enter the legal name'
                  return undefined
                }
              }}
            >
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`org-${field.name}`}>Legal name</Label>
                  <Input
                    id={`org-${field.name}`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. Example Fitness LLP"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field
              name="billingEmail"
              validators={{
                onChange: ({ value }) =>
                  value.trim() ? emailError(value, 'Email is required') : undefined
              }}
            >
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`org-${field.name}`}>Billing email</Label>
                  <Input
                    id={`org-${field.name}`}
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="billing@example.in"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field
              name="mobileNumber"
              validators={{
                onChange: ({ value }) => {
                  const e = mobileError(value)
                  return e === 'Mobile number is required' ? undefined : e
                }
              }}
            >
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`org-${field.name}`}>Mobile number</Label>
                  <Input
                    id={`org-${field.name}`}
                    type="tel"
                    inputMode="tel"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) =>
                      field.handleChange(e.target.value.replace(/\D/g, '').slice(0, 10))
                    }
                    placeholder="90000 00000"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <div className="grid grid-cols-2 gap-3">
              <form.Field name="timezone">
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`org-${field.name}`}>Timezone</Label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger
                        id={`org-${field.name}`}
                        size="default"
                        className="h-9 rounded-md text-sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>

              <form.Field name="currency">
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`org-${field.name}`}>Currency</Label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger
                        id={`org-${field.name}`}
                        size="default"
                        className="h-9 rounded-md text-sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
            </div>

            {(['invoiceTerms', 'receiptTerms', 'refundTerms'] as const).map((name) => (
              <form.Field
                key={name}
                name={name}
                validators={{
                  onChange: ({ value }) => termsError(value)
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <Label htmlFor={`org-${field.name}`}>
                        {name === 'invoiceTerms'
                          ? 'Invoice terms'
                          : name === 'receiptTerms'
                            ? 'Receipt terms'
                            : 'Refund terms'}
                      </Label>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {field.state.value.length}/{ORG_TERMS_MAX_LENGTH}
                      </span>
                    </div>
                    <Textarea
                      id={`org-${field.name}`}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Printed on the footer of the document. Empty leaves the document clean."
                      className="max-h-40 min-h-16"
                    />
                    <p className="text-xs text-muted-foreground">
                      Appears on new printed documents the moment you save.
                    </p>
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" disabled={!canSubmit}>
                  {isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
