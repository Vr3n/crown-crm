import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { BadgeCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldGroup } from '@/components/ui/field'
import { FormField } from '@/components/ui/form-field'
import { LoadingButton } from '@/components/ui/loading-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { LeadPicker } from '@/features/leads/components/lead-picker'
import { usePlans } from '@/features/catalog/queries'
import type { Lead } from '@/features/leads/types'

export function MembershipSaleDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}): React.JSX.Element {
  const { data: plans = [], isLoading: plansLoading } = usePlans()
  const [picked, setPicked] = useState<Lead | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const form = useForm({
    defaultValues: { planId: '' },
    onSubmit: async ({ value }) => {
      if (!picked) return
      const plan = plans.find((p) => String(p.id) === value.planId)
      // No backend for membership sale yet - simulate success with toast
      toast.success('Membership sale recorded', {
        description: `${picked.name} · ${plan?.name ?? 'Plan'} — invoice will be created from the billing module.`
      })
      setSubmitSuccess(true)
      window.setTimeout(() => onOpenChange(false), 700)
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
            <BadgeCheck className="size-4 text-primary" />
            New Membership sale
          </DialogTitle>
          <DialogDescription>
            Pick who it is for and which plan they are buying. The membership will appear under
            Customers once created.
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
            <Field label="For whom">
              <LeadPicker
                value={picked?.id ?? 0}
                onChange={setPicked}
                excludeBlacklisted
                invalid={!picked}
              />
            </Field>

            <form.Field
              name="planId"
              validators={{
                onChange: ({ value }) => (value ? undefined : 'Choose a plan')
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
                      Plan <span className="text-destructive">*</span>
                    </>
                  }
                  validate={(v) => (v ? undefined : 'Choose a plan')}
                  completeWhen={(v) => Boolean(v)}
                >
                  {({ id, value, invalid, valid, describedBy }) => (
                    <Select
                      value={value}
                      onValueChange={(v) => {
                        if (v !== '') field.handleChange(v)
                      }}
                      disabled={plansLoading || plans.length === 0}
                    >
                      <SelectTrigger
                        id={id}
                        aria-invalid={invalid}
                        data-valid={valid}
                        aria-describedby={describedBy}
                      >
                        <SelectValue
                          placeholder={
                            plansLoading
                              ? 'Loading plans…'
                              : plans.length === 0
                                ? 'No active plans'
                                : 'Choose a plan'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name} · {p.duration}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
              disabled={!canSubmit || !picked}
              loadingLabel="Saving…"
              successLabel="Saved!"
            >
              Create sale
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
