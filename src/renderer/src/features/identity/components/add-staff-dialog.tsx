import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
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
import { PasswordStrength } from '@/components/ui/password-strength'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { emailError, fullNameError, passwordError } from '@/lib/validation'
import { useCreateStaff } from '../queries'
import type { Role } from '../types'

/**
 * Add a staff member (Module 15 § 2.2). Mirrors the main-process guard: email
 * must be unique within the organization and the password at least 8 chars —
 * the same rules `identity:createStaff` enforces in the application layer.
 * Super roles are excluded from the picker: Owner/Admin are created through
 * setup, not the staff screen.
 */
export function AddStaffDialog({
  open,
  onOpenChange,
  roles
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: Role[]
}): React.JSX.Element {
  const createStaff = useCreateStaff()
  const [showPassword, setShowPassword] = useState(false)

  const assignableRoles = roles.filter((r) => !r.isSuper)

  const form = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      roleName: assignableRoles[0]?.name ?? ''
    },
    onSubmit: async ({ value }) => {
      try {
        await createStaff.mutateAsync(value)
        onOpenChange(false)
        form.reset()
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
            <UserPlus className="size-4 text-primary" />
            Add a staff member
          </DialogTitle>
          <DialogDescription>
            They&apos;ll be able to sign in to this organization with the password you set.
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
            <form.Field
              name="fullName"
              validators={{ onChange: ({ value }) => fullNameError(value) }}
            >
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`staff-${field.name}`}>
                    Full name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`staff-${field.name}`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. Neha Sharma"
                    autoComplete="name"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field
              name="email"
              validators={{
                onChange: ({ value }) => emailError(value, 'Email is required')
              }}
            >
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`staff-${field.name}`}>
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`staff-${field.name}`}
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="neha@example.in"
                    autoComplete="email"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="password"
                validators={{ onChange: ({ value }) => passwordError(value) }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`staff-${field.name}`}>
                      Password <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id={`staff-${field.name}`}
                        type={showPassword ? 'text' : 'password'}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Min. 8 characters"
                        autoComplete="new-password"
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {field.state.value ? <PasswordStrength value={field.state.value} /> : null}
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>

              <form.Field
                name="roleName"
                validators={{
                  onChange: ({ value }) => (value ? undefined : 'Pick a role')
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`staff-${field.name}`}>
                      Role <span className="text-destructive">*</span>
                    </Label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger size="default" className="h-9 rounded-md text-sm">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableRoles.map((r) => (
                          <SelectItem key={r.id} value={r.name}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" disabled={!canSubmit || assignableRoles.length === 0}>
                  {isSubmitting ? 'Adding…' : 'Add staff member'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
