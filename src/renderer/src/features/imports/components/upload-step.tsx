import { useRef } from 'react'
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  ShoppingCart,
  Upload
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ImportTarget } from '@shared/excel-import/types'

export function UploadStep({
  target,
  error,
  onTargetChange,
  onFile,
  onSample,
  onTemplate,
  onDismissError
}: {
  target: ImportTarget
  error: string | null
  onTargetChange: (target: ImportTarget) => void
  onFile: (file: File) => void
  onSample: () => void
  onTemplate: () => void
  onDismissError: () => void
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  function choose(file: File | undefined): void {
    if (!file) return
    onFile(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[0.9375rem] font-semibold">What are you importing?</h2>
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
            The choice changes the fields we ask for and how the bills post.
          </p>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          {[
            {
              value: 'PURCHASE' as const,
              title: 'Purchase bills',
              body: 'Bills your suppliers sent you. Creates payables and input tax.',
              icon: ShoppingCart,
              tone: 'text-stamp bg-stamp-soft'
            },
            {
              value: 'SALES' as const,
              title: 'Sales invoices',
              body: 'Invoices you raised on customers. Creates receivables and output tax.',
              icon: FileText,
              tone: 'text-primary bg-accent-soft'
            }
          ].map((choice) => {
            const active = target === choice.value
            const Icon = choice.icon
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => onTargetChange(choice.value)}
                aria-pressed={active}
                className={cn(
                  'flex items-start gap-3 border px-3 py-3 text-left transition-colors',
                  active
                    ? 'border-primary bg-accent-soft/50'
                    : 'border-border hover:border-rule-strong hover:bg-muted/40'
                )}
              >
                <span
                  className={cn('flex size-8 shrink-0 items-center justify-center', choice.tone)}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[0.875rem] font-semibold">{choice.title}</span>
                    {active ? (
                      <span className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-primary">
                        Selected
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-[0.75rem] leading-snug text-muted-foreground">
                    {choice.body}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[0.9375rem] font-semibold">Choose the file</h2>
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
            A workbook with one sheet or several. Your file stays on this computer.
          </p>
        </div>

        <div className="p-4">
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              choose(event.dataTransfer.files[0])
            }}
            className="flex flex-col items-center justify-center border border-dashed border-rule-strong bg-muted/20 px-4 py-8 text-center"
          >
            <span className="flex size-10 items-center justify-center bg-accent-soft text-primary">
              <FileSpreadsheet className="size-5" strokeWidth={1.6} />
            </span>
            <p className="mt-3 text-[0.9375rem] font-medium">Drop your Excel file here</p>
            <p className="mt-1 text-[0.8125rem] text-muted-foreground">
              .xlsx, .xls or .csv. A workbook with several sheets is fine.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-3.5" strokeWidth={1.75} />
              Choose a file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(event) => choose(event.target.files?.[0])}
              aria-label="Choose an Excel file"
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 border border-destructive/40 bg-destructive-soft/40 px-3 py-2"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-destructive"
                strokeWidth={1.9}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] text-destructive">{error}</p>
                <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                  Check that the file is a real Excel workbook, or try the sample.
                </p>
              </div>
              <button
                type="button"
                onClick={onDismissError}
                className="text-[0.75rem] text-muted-foreground underline-offset-4 hover:underline"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div>
              <p className="text-[0.875rem] font-medium">No file ready?</p>
              <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                Try the sample, or start from a template.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onSample}>
                Try the sample
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onTemplate}>
                <Download className="size-3.5" strokeWidth={1.75} />
                Template
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[0.9375rem] font-semibold">What the file needs</h2>
        </div>
        <ul className="divide-y divide-border">
          {[
            {
              title: 'One row per item line',
              body: 'A bill with three items has three rows with the same bill number.'
            },
            {
              title: 'A column for the bill number',
              body: 'This is how rows are grouped into one bill. Without it, each row becomes its own bill.'
            },
            {
              title: 'Columns in any order',
              body: 'Titles above the table and totals below it are fine. You will select just the table.'
            }
          ].map((item) => (
            <li key={item.title} className="px-4 py-2.5">
              <p className="text-[0.875rem] font-medium">{item.title}</p>
              <p className="mt-0.5 text-[0.75rem] leading-snug text-muted-foreground">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
