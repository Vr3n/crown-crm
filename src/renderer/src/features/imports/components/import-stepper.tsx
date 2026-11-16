import { AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ImportState, ImportStep } from '@shared/excel-import/machine'
import { stepIndex } from '@shared/excel-import/machine'

const STEPS: { id: ImportStep; label: string; hint: string }[] = [
  { id: 'file', label: 'File', hint: 'Choose a workbook' },
  { id: 'range', label: 'Sheet and range', hint: 'Select the table' },
  { id: 'map', label: 'Map columns', hint: 'Match your headers' },
  { id: 'review', label: 'Check rows', hint: 'Review before writing' },
  { id: 'importing', label: 'Import', hint: 'Post and recover' }
]

function visualIndex(step: ImportStep): number {
  return step === 'done' ? STEPS.length - 1 : stepIndex(step)
}

export function ImportStepper({
  state,
  onBackTo
}: {
  state: ImportState
  onBackTo: (step: ImportStep) => void
}): React.JSX.Element {
  const current = visualIndex(state.step)
  const hasErrors = (state.plan?.stats.errors ?? 0) > 0
  const posted = state.posting?.bills.filter((bill) => bill.status === 'posted').length ?? 0
  const total = state.posting?.bills.length ?? 0

  return (
    <nav aria-label="Import steps" className="border border-border bg-card">
      <ol className="flex divide-x divide-border overflow-x-auto xl:block xl:divide-x-0 xl:divide-y">
        {STEPS.map((step, index) => {
          const done = index < current || state.step === 'done'
          const active = index === current && state.step !== 'done'
          const reachable = index < current && state.step !== 'importing' && state.step !== 'done'
          const attention = step.id === 'review' && hasErrors && active
          const content = (
            <>
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center border font-mono text-[0.6875rem] font-semibold',
                  done && 'border-success bg-success text-white',
                  active && 'border-primary bg-primary text-primary-foreground',
                  !done && !active && 'border-border bg-muted text-muted-foreground'
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" strokeWidth={2.25} /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-[0.875rem] leading-tight',
                    active ? 'font-semibold text-foreground' : 'font-medium text-foreground/85'
                  )}
                >
                  {step.label}
                </span>
                <span className="mt-0.5 hidden text-[0.75rem] leading-tight text-muted-foreground xl:block">
                  {step.id === 'importing' && total > 0
                    ? `${posted} of ${total} posted`
                    : step.hint}
                </span>
              </span>
              {attention ? (
                <AlertTriangle className="size-4 shrink-0 text-destructive" strokeWidth={1.75} />
              ) : null}
            </>
          )

          return (
            <li key={step.id} className="min-w-[132px] flex-1 xl:min-w-0">
              {reachable ? (
                <button
                  type="button"
                  onClick={() => onBackTo(step.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent-soft/50"
                >
                  {content}
                </button>
              ) : (
                <div
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5',
                    active && 'bg-accent-soft/50'
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {content}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <div className="border-t border-border px-3 py-2.5">
        <p className="text-[0.75rem] leading-relaxed text-muted-foreground">
          {state.file ? state.file.fileName : 'No file chosen yet.'}
        </p>
        {state.selection ? (
          <p className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">
            {state.sheetName} · rows {state.selection.startRow + 1} to {state.selection.endRow + 1}
          </p>
        ) : null}
      </div>
    </nav>
  )
}
