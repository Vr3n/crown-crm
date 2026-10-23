import { BookOpen, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = ['Number your vouchers', 'Take the tour'] as const

/**
 * First run shell. Two short steps, no navigation rail, so a new owner finishes
 * numbering and sees the main flow before landing on the dashboard.
 */
export function SetupShell({
  step,
  title,
  description,
  children
}: {
  step: 1 | 2
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center bg-stamp text-paper">
              <BookOpen className="size-4" strokeWidth={1.75} />
            </span>
            <div>
              <div className="text-[0.9375rem] font-semibold tracking-tight">Crown Books</div>
              <div className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground">
                First run
              </div>
            </div>
          </div>
          <ol className="flex items-center gap-4" aria-label="Setup progress">
            {STEPS.map((label, index) => {
              const number = index + 1
              const done = number < step
              const current = number === step
              return (
                <li key={label} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center font-mono text-[0.6875rem]',
                      done
                        ? 'bg-success text-white'
                        : current
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-border text-muted-foreground'
                    )}
                    aria-hidden
                  >
                    {done ? <Check className="size-3" /> : number}
                  </span>
                  <span
                    className={cn(
                      'text-[0.8125rem]',
                      current ? 'font-medium text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-6 py-8">
        <div className="mb-5 max-w-[70ch]">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Step {step} of {STEPS.length}
          </p>
          <h1 className="mt-1 text-[1.75rem] font-semibold leading-tight tracking-tight">{title}</h1>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
      </main>
    </div>
  )
}
