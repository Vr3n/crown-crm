import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldsFor } from '@shared/excel-import/fields'
import type { ImportTarget, RowIssue } from '@shared/excel-import/types'

function fieldLabel(target: ImportTarget, field: RowIssue['field']): string {
  if (field === 'row') return 'Row'
  return fieldsFor(target).find((row) => row.key === field)?.label ?? field
}

export function IssueList({
  issues,
  target,
  emptyLabel = 'No problems in these rows.'
}: {
  issues: RowIssue[]
  target: ImportTarget
  emptyLabel?: string
}): React.JSX.Element {
  if (issues.length === 0) {
    return <p className="px-3 py-4 text-[0.875rem] text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <ul className="divide-y divide-border">
      {issues.map((issue, index) => {
        const error = issue.severity === 'error'
        return (
          <li
            key={`${issue.rowNumber}-${issue.field}-${issue.code}-${index}`}
            className={cn(
              'flex gap-3 px-3 py-2.5',
              error ? 'bg-destructive-soft/30' : 'bg-warning-soft/20'
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center',
                error ? 'text-destructive' : 'text-warning'
              )}
              aria-hidden
            >
              {error ? (
                <AlertTriangle className="size-4" strokeWidth={1.9} />
              ) : (
                <Info className="size-4" strokeWidth={1.9} />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[0.8125rem] leading-snug">
                <span className="font-mono text-[0.75rem] text-muted-foreground">
                  {issue.rowNumber === 0 ? 'All rows' : `Row ${issue.rowNumber}`}
                  {' · '}
                  {fieldLabel(target, issue.field)}
                </span>
                <span className="mx-1.5 text-muted-foreground">/</span>
                <span className={error ? 'text-destructive' : 'text-warning'}>
                  {error ? 'Error' : 'Warning'}
                </span>
              </p>
              <p className="mt-0.5 text-[0.875rem] leading-snug">{issue.message}</p>
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">
                {issue.fix}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
