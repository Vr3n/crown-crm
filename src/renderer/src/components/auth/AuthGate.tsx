import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { BookOpen, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Field } from '@/components/ui/field'
import { focusFirstError, FormTextField, type FormFieldApi } from '@/components/ui/form-field'
import { FIELD_HELP } from '@/lib/form-help'
import {
  companyNameError,
  emailError,
  fullNameError,
  loginPasswordError,
  mobileError,
  passwordError
} from '@/lib/validation'

type SessionContext = Awaited<ReturnType<typeof window.api.identity.session>>
type Phase = 'setup' | 'login'

const STATES: { code: string; name: string }[] = [
  { code: '27', name: 'Maharashtra' },
  { code: '07', name: 'Delhi' },
  { code: '29', name: 'Karnataka' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '24', name: 'Gujarat' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '08', name: 'Rajasthan' },
  { code: '19', name: 'West Bengal' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '32', name: 'Kerala' },
  { code: '06', name: 'Haryana' },
  { code: '03', name: 'Punjab' },
  { code: '10', name: 'Bihar' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '18', name: 'Assam' },
  { code: '20', name: 'Jharkhand' },
  { code: '30', name: 'Goa' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '34', name: 'Puducherry' },
  { code: '38', name: 'Ladakh' }
]

const GSTIN_ERROR = 'GSTIN must be 15 characters'
const BOOKS_BEGIN_ERROR = 'Books begin date is required'

/** A blank GSTIN is allowed; a partial one is not. */
function gstinError(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length === 15 ? undefined : GSTIN_ERROR
}

/** A blank mobile is allowed; a partial one is not. */
function optionalMobileError(value: string): string | undefined {
  return value.trim() ? mobileError(value) : undefined
}

interface AuthGateProps {
  status: 'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED' | undefined
  /** True while the boot status or the remembered session is still resolving. */
  bootPending: boolean
  onAuthenticated: (session: SessionContext) => void
}

/**
 * First run creates the company and the owner in one step. After that the screen
 * is a local login. Both surfaces use the shared TanStack Form field, so a field
 * turns green once it is valid and shows its own error, styled and focused, on
 * submit. The application layer repeats the rules that matter for the books
 * (state code, GSTIN, password length).
 */
export function AuthGate({
  status,
  bootPending,
  onAuthenticated
}: AuthGateProps): React.JSX.Element {
  const phase: Phase = status === 'SETUP_REQUIRED' ? 'setup' : 'login'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setupForm = useForm({
    defaultValues: {
      companyName: '',
      ownerName: '',
      phone: '',
      ownerEmail: '',
      password: '',
      stateCode: '27',
      gstin: '',
      booksBegin: today()
    },
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      setError(null)
      focusFirstError(formApi)
    },
    onSubmit: async ({ value }) => {
      setError(null)
      setBusy(true)
      try {
        const session = await window.api.identity.setup({
          name: value.companyName.trim(),
          ownerFullName: value.ownerName.trim(),
          ownerEmail: value.ownerEmail.trim(),
          ownerPassword: value.password,
          stateCode: value.stateCode,
          gstin: value.gstin.trim() || undefined,
          phone: value.phone.trim() || undefined,
          booksBeginDate: value.booksBegin
        })
        if (session) onAuthenticated(session)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      } finally {
        setBusy(false)
      }
    }
  })

  const loginForm = useForm({
    defaultValues: { loginEmail: '', loginPassword: '' },
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      setError(null)
      focusFirstError(formApi)
    },
    onSubmit: async ({ value }) => {
      setError(null)
      setBusy(true)
      try {
        const session = await window.api.identity.login({
          email: value.loginEmail.trim(),
          password: value.loginPassword
        })
        if (session) onAuthenticated(session)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      } finally {
        setBusy(false)
      }
    }
  })

  if (bootPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isSetup = phase === 'setup'
  const form = isSetup ? setupForm : loginForm

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden flex-col justify-between bg-ink p-10 text-paper lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center border border-paper/25">
            <BookOpen className="size-4" strokeWidth={1.6} />
          </div>
          <div>
            <div className="text-[0.9375rem] font-semibold tracking-tight">Crown Books</div>
            <div className="text-[0.6875rem] uppercase tracking-[0.18em] text-paper/50">
              Simple books for growing businesses
            </div>
          </div>
        </div>

        <div className="my-auto max-w-[34ch] border-l-2 border-stamp pl-5">
          <h1 className="text-[2.625rem] font-semibold leading-[1.08] tracking-[-0.03em]">
            Run the business. We&apos;ll keep the books.
          </h1>
          <p className="mt-4 font-serif text-[1.0625rem] italic leading-relaxed text-paper/65">
            Invoices, payments, GST and stock in one ledger that always proves itself.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex size-8 items-center justify-center bg-ink text-paper">
              <BookOpen className="size-4" strokeWidth={1.6} />
            </div>
            <span className="text-[0.9375rem] font-semibold">Crown Books</span>
          </div>

          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {isSetup ? 'First run setup' : 'Sign in'}
          </p>
          <h2 className="mt-2 text-[1.625rem] font-semibold leading-tight tracking-tight">
            {isSetup ? 'Set up the books' : 'Open your books'}
          </h2>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
            {isSetup
              ? 'The company profile and the owner account. You can change every field later.'
              : 'Use the owner or staff account for this machine.'}
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
            className="mt-7 space-y-3"
            noValidate
          >
            {isSetup ? (
              <>
                <setupForm.Field
                  name="companyName"
                  validators={{
                    onBlur: ({ value }) => companyNameError(value),
                    onChange: ({ value }) => companyNameError(value)
                  }}
                >
                  {(field) => (
                    <FormTextField
                      field={field as unknown as FormFieldApi}
                      submitted={setupForm.state.isSubmitted}
                      label="Business name"
                      required
                      autoFocus
                      placeholder="Acme Distributors"
                    />
                  )}
                </setupForm.Field>

                <div className="grid grid-cols-2 gap-3">
                  <setupForm.Field
                    name="ownerName"
                    validators={{
                      onBlur: ({ value }) => fullNameError(value),
                      onChange: ({ value }) => fullNameError(value)
                    }}
                  >
                    {(field) => (
                      <FormTextField
                        field={field as unknown as FormFieldApi}
                        submitted={setupForm.state.isSubmitted}
                        label="Owner Full Name"
                        required
                        placeholder="John Ant Doe"
                      />
                    )}
                  </setupForm.Field>

                  <setupForm.Field
                    name="phone"
                    validators={{
                      onBlur: ({ value }) => optionalMobileError(value),
                      onChange: ({ value }) => optionalMobileError(value)
                    }}
                  >
                    {(field) => (
                      <FormTextField
                        field={field as unknown as FormFieldApi}
                        submitted={setupForm.state.isSubmitted}
                        label="Mobile (optional)"
                        filter="mobile"
                        placeholder="98765 43210"
                      />
                    )}
                  </setupForm.Field>
                </div>

                <setupForm.Field
                  name="ownerEmail"
                  validators={{
                    onBlur: ({ value }) => emailError(value, 'Owner email is required'),
                    onChange: ({ value }) => emailError(value, 'Owner email is required')
                  }}
                >
                  {(field) => (
                    <FormTextField
                      field={field as unknown as FormFieldApi}
                      submitted={setupForm.state.isSubmitted}
                      label="Owner email"
                      required
                      type="email"
                      placeholder="owner@business.in"
                    />
                  )}
                </setupForm.Field>

                <setupForm.Field
                  name="password"
                  validators={{
                    onBlur: ({ value }) => passwordError(value),
                    onChange: ({ value }) => passwordError(value)
                  }}
                >
                  {(field) => (
                    <FormTextField
                      field={field as unknown as FormFieldApi}
                      submitted={setupForm.state.isSubmitted}
                      label="Password"
                      required
                      type="password"
                      placeholder="At least 8 characters"
                      hint="At least 8 characters. Stored hashed on this machine."
                    />
                  )}
                </setupForm.Field>

                <div className="grid grid-cols-2 gap-3">
                  <setupForm.Field name="stateCode">
                    {(field) => (
                      <Field id="stateCode" label="State">
                        <select
                          id="stateCode"
                          name="stateCode"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                          aria-invalid={false}
                          data-valid={
                            field.state.meta.isTouched || setupForm.state.isSubmitted || undefined
                          }
                          className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-valid:border-green-600 dark:bg-input/30"
                        >
                          {STATES.map((s) => (
                            <option key={s.code} value={s.code}>
                              {s.code} · {s.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </setupForm.Field>

                  <setupForm.Field
                    name="gstin"
                    validators={{
                      onBlur: ({ value }) => gstinError(value),
                      onChange: ({ value }) => gstinError(value)
                    }}
                  >
                    {(field) => (
                      <FormTextField
                        field={field as unknown as FormFieldApi}
                        submitted={setupForm.state.isSubmitted}
                        label="GSTIN (optional)"
                        filter="upper"
                        maxLength={15}
                        placeholder="27AABFU4477G1ZY"
                      />
                    )}
                  </setupForm.Field>
                </div>

                <setupForm.Field
                  name="booksBegin"
                  validators={{
                    onBlur: ({ value }) => (value ? undefined : BOOKS_BEGIN_ERROR),
                    onChange: ({ value }) => (value ? undefined : BOOKS_BEGIN_ERROR)
                  }}
                >
                  {(field) => (
                    <FormTextField
                      field={field as unknown as FormFieldApi}
                      submitted={setupForm.state.isSubmitted}
                      label="Books begin"
                      required
                      help={FIELD_HELP.company.booksBegin}
                      type="date"
                      hint="The first day Crown Books records transactions. Opening balances are as at the day before."
                    />
                  )}
                </setupForm.Field>
              </>
            ) : (
              <>
                <loginForm.Field
                  name="loginEmail"
                  validators={{
                    onBlur: ({ value }) => emailError(value, 'Enter your email address'),
                    onChange: ({ value }) => emailError(value, 'Enter your email address')
                  }}
                >
                  {(field) => (
                    <FormTextField
                      field={field as unknown as FormFieldApi}
                      submitted={loginForm.state.isSubmitted}
                      label="Email"
                      required
                      type="email"
                      autoFocus
                      placeholder="owner@business.in"
                    />
                  )}
                </loginForm.Field>

                <loginForm.Field
                  name="loginPassword"
                  validators={{
                    onBlur: ({ value }) => loginPasswordError(value),
                    onChange: ({ value }) => loginPasswordError(value)
                  }}
                >
                  {(field) => (
                    <FormTextField
                      field={field as unknown as FormFieldApi}
                      submitted={loginForm.state.isSubmitted}
                      label="Password"
                      required
                      type="password"
                      placeholder="Your password"
                    />
                  )}
                </loginForm.Field>
              </>
            )}

            {error ? (
              <div
                role="alert"
                className="border border-destructive/30 bg-destructive/5 px-3 py-2 text-[0.875rem] leading-relaxed text-destructive"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className={cn(
                'flex h-9 w-full items-center justify-center gap-2 bg-primary text-[0.9375rem] font-medium text-primary-foreground transition-opacity',
                busy ? 'opacity-70' : 'hover:opacity-90'
              )}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {isSetup ? 'Create company and sign in' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 border-t border-border pt-4 text-[0.75rem] leading-relaxed text-muted-foreground">
            Runs entirely on this machine. No account, no cloud, no telemetry.
          </p>
        </div>
      </main>
    </div>
  )
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
