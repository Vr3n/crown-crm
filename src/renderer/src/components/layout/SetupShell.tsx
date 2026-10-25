import { BookOpen } from 'lucide-react'

/**
 * First run shell. Numbering is the only screen before the dashboard: the
 * dashboard checklist then guides the rest of setup, so there is no tour step.
 */
export function SetupShell({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-2.5 px-6 py-4">
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
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-6 py-8">
        <div className="mb-5 max-w-[70ch]">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{title}</h1>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
      </main>
    </div>
  )
}
