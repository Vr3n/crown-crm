import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronRight } from 'lucide-react'
import type { SetupStep } from '../../../../../shared/contracts/dashboard'

interface Setup {
  done: number
  total: number
  steps: SetupStep[]
}

/**
 * First-run checklist. It is the onboarding guide, not a dashboard ornament:
 * every open step links straight at the action it wants (a dialog, a form, a
 * section), and the whole panel disappears once the last step is ticked.
 */
export function SetupChecklist({ setup }: { setup: Setup }): React.JSX.Element | null {
  if (setup.total > 0 && setup.done >= setup.total) return null

  const nextStep = setup.steps.find((step) => !step.done)
  const progress = setup.total === 0 ? 0 : Math.round((setup.done / setup.total) * 100)

  return (
    <section className="border border-border bg-card" aria-labelledby="setup-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 id="setup-heading" className="text-[0.9375rem] font-semibold">
            Set up the books
          </h2>
          <p className="text-[0.875rem] text-muted-foreground">
            {setup.done} of {setup.total} steps done. Everything here is read from your records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.75rem] tabular-nums text-muted-foreground">
            {progress}%
          </span>
          <div
            className="h-1.5 w-24 overflow-hidden bg-muted"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Setup progress"
          >
            <div
              className="h-full bg-success transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <ol>
        {setup.steps.map((step) =>
          step.done ? (
            <li
              key={step.id}
              className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
            >
              <span
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success text-white"
                aria-hidden="true"
              >
                <Check className="size-2.5" strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[0.9375rem] text-muted-foreground line-through decoration-border">
                  {step.label}
                </span>
                <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted-foreground">
                  {step.detail}
                </p>
              </div>
            </li>
          ) : (
            <li key={step.id} className="border-b border-border last:border-b-0">
              <Link
                to={step.href}
                className="group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-accent-soft/60 focus-visible:bg-accent-soft/60 focus-visible:outline-none"
              >
                <span
                  className="mt-0.5 size-4 shrink-0 rounded-full border border-rule-strong group-hover:border-primary"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[0.9375rem] font-medium">{step.label}</span>
                  <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted-foreground">
                    {step.detail}
                  </p>
                </div>
                <span className="mt-0.5 flex shrink-0 items-center gap-1 border border-border bg-background px-2 py-1 text-[0.75rem] font-medium text-primary group-hover:border-primary">
                  {step.cta}
                  <ChevronRight className="size-3" />
                </span>
              </Link>
            </li>
          )
        )}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2.5">
        <span className="text-[0.875rem] text-muted-foreground">
          {nextStep ? `Next: ${nextStep.label}` : 'Setup is complete. The books are live.'}
        </span>
        {nextStep ? (
          <Link
            to={nextStep.href}
            className="flex items-center gap-1 text-[0.875rem] font-medium text-primary hover:underline"
          >
            Continue <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </section>
  )
}
