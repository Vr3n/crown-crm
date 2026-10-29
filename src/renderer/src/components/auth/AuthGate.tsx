import { useId, useState, type FormEvent } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldCounter } from '@/components/ui/field'
import { FieldHelp } from '@/components/ui/field-help'
import { FIELD_HELP } from '@/lib/form-help'
import { mobileDigitsLeft, toMobileDigits } from '@/lib/validation'

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

interface AuthGateProps {
  status: 'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED' | undefined
  /** True while the boot status or the remembered session is still resolving. */
  bootPending: boolean
  onAuthenticated: (session: SessionContext) => void
}

/**
 * First run creates the company and the owner in one step. After that the screen
 * is a local login. Validation is inline; the application layer repeats the
 * rules that matter for the books (state code, GSTIN, password length).
 */
export function AuthGate({
  status,
  bootPending,
  onAuthenticated
}: AuthGateProps): React.JSX.Element {
  const phase: Phase = status === 'SETUP_REQUIRED' ? 'setup' : 'login'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [companyName, setCompanyName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [password, setPassword] = useState('')
  const [stateCode, setStateCode] = useState('27')
  const [gstin, setGstin] = useState('')
  const [phone, setPhone] = useState('')
  const [booksBegin, setBooksBegin] = useState(today())

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  if (bootPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)

    if (phase === 'setup') {
      if (companyName.trim().length < 2) return setError('Enter the business name.')
      if (ownerName.trim().length < 2) return setError('Enter the owner name.')
      if (!isEmail(ownerEmail)) return setError('Enter a valid email address.')
      if (password.length < 8) return setError('Password must be at least 8 characters.')
      if (gstin && gstin.trim().length !== 15) return setError('GSTIN must be 15 characters.')
    } else {
      if (!isEmail(loginEmail)) return setError('Enter your email address.')
      if (!loginPassword) return setError('Enter your password.')
    }

    setBusy(true)
    try {
      const session =
        phase === 'setup'
          ? await window.api.identity.setup({
              name: companyName.trim(),
              ownerFullName: ownerName.trim(),
              ownerEmail: ownerEmail.trim(),
              ownerPassword: password,
              stateCode,
              gstin: gstin.trim() || undefined,
              phone: phone.trim() || undefined,
              booksBeginDate: booksBegin
            })
          : await window.api.identity.login({
              email: loginEmail.trim(),
              password: loginPassword
            })
      if (session) onAuthenticated(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const isSetup = phase === 'setup'

  return (
    <div className="grid h-screen grid-cols-1 bg-background lg:grid-cols-[1.05fr_1fr]">
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

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            {isSetup ? (
              <>
                <Field
                  label="Business name"
                  value={companyName}
                  onChange={setCompanyName}
                  autoFocus
                  placeholder="Acme Distributors"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Owner name"
                    value={ownerName}
                    onChange={setOwnerName}
                    placeholder="Viren Patel"
                  />
                  <Field
                    label="Mobile (optional)"
                    value={phone}
                    onChange={setPhone}
                    filter="mobile"
                    placeholder="98765 43210"
                  />
                </div>
                <Field
                  label="Owner email"
                  value={ownerEmail}
                  onChange={setOwnerEmail}
                  type="email"
                  placeholder="owner@business.in"
                />
                <Field
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  placeholder="At least 8 characters"
                  hint="At least 8 characters. Stored hashed on this machine."
                />
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[0.75rem] font-medium text-foreground">
                      State
                    </span>
                    <select
                      value={stateCode}
                      onChange={(e) => setStateCode(e.target.value)}
                      className="h-9 w-full border border-input bg-card px-2.5 text-[0.9375rem] outline-none focus:border-primary"
                    >
                      {STATES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} · {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="GSTIN (optional)"
                    value={gstin}
                    onChange={(v) => setGstin(v.toUpperCase())}
                    placeholder="27AABFU4477G1ZY"
                    maxLength={15}
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label
                      htmlFor="setup-books-begin"
                      className="text-[0.75rem] font-medium text-foreground"
                    >
                      Books begin
                      <span aria-hidden className="ml-0.5 text-stamp">
                        *
                      </span>
                      <span className="sr-only"> (required)</span>
                    </label>
                    <FieldHelp label="Books begin" content={FIELD_HELP.company.booksBegin} />
                  </div>
                  <input
                    id="setup-books-begin"
                    type="date"
                    value={booksBegin}
                    onChange={(event) => setBooksBegin(event.target.value)}
                    required
                    className="h-9 w-full border border-input bg-card px-2.5 text-[0.9375rem] outline-none transition-colors focus:border-primary"
                  />
                  <span className="mt-1 block text-[0.75rem] leading-relaxed text-muted-foreground">
                    The first day Crown Books records transactions. Opening balances are as at the
                    day before.
                  </span>
                </div>
              </>
            ) : (
              <>
                <Field
                  label="Email"
                  value={loginEmail}
                  onChange={setLoginEmail}
                  type="email"
                  autoFocus
                  placeholder="owner@business.in"
                />
                <Field
                  label="Password"
                  value={loginPassword}
                  onChange={setLoginPassword}
                  type="password"
                  placeholder="Your password"
                />
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

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  maxLength,
  filter,
  autoFocus
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  hint?: string
  maxLength?: number
  filter?: 'mobile'
  autoFocus?: boolean
}): React.JSX.Element {
  const digitsLeft = filter === 'mobile' ? mobileDigitsLeft(value) : undefined
  const id = useId()
  return (
    <div className="block">
      <div className="mb-1.5 flex items-center gap-1.5">
        <label htmlFor={id} className="text-[0.75rem] font-medium text-foreground">
          {label}
        </label>
        {digitsLeft === undefined ? null : (
          <FieldCounter complete={digitsLeft === 0} className="ml-auto">
            {digitsLeft} left
          </FieldCounter>
        )}
      </div>
      <input
        id={id}
        type={type}
        inputMode={filter === 'mobile' ? 'tel' : undefined}
        value={value}
        onChange={(e) =>
          onChange(filter === 'mobile' ? toMobileDigits(e.target.value) : e.target.value)
        }
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        className="h-9 w-full border border-input bg-card px-2.5 text-[0.9375rem] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
      />
      {hint ? (
        <span className="mt-1 block text-[0.75rem] leading-relaxed text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
