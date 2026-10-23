import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldHelp, type FieldHelpContent } from '@/components/ui/field-help'
import { Input } from '@/components/ui/input'
import { errorMessage } from '../../../../../shared/contracts/errors'
import { formatVoucherNumber, nextSequenceValue } from '../../../../../shared/numbering'
import type { NumberingRow } from '../../../../../shared/contracts/numbering'
import type { VoucherType } from '../../../../../shared/contracts/vouchers'

interface Draft {
  series: string
  prefix: string
  suffix: string
  padding: string
  startNumber: string
  restartYearly: boolean
  manualOverride: boolean
}

const HELP: Record<string, FieldHelpContent> = {
  series: {
    summary: 'The short code stored on the voucher.',
    points: ['2 to 8 letters or digits.', 'Changing it starts a new series.']
  },
  prefix: {
    summary: 'Text printed before the number.',
    points: ['Example: PUR/ or 2026-27/.']
  },
  suffix: {
    summary: 'Text printed after the number.',
    points: ['Example: /A for a branch.']
  },
  width: {
    summary: 'How many digits the number uses.',
    points: ['1 to 8.', 'Values wider than the width are never truncated.']
  },
  start: {
    summary: 'The first number in a new series or financial year.',
    points: ['Existing numbers are never reused.']
  },
  restart: {
    summary: 'Restart at the starting number each financial year.',
    points: ['Turn it off for one continuous series.']
  },
  manual: {
    summary: 'Allow typing a voucher number when posting.',
    points: ['The number must still be higher than the last one used.']
  }
}

const LABEL = 'text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const CELL_INPUT = 'h-8 rounded-none font-mono text-[0.8125rem]'

function toDrafts(rows: NumberingRow[]): Record<string, Draft> {
  return Object.fromEntries(
    rows.map((row) => [
      row.voucherType,
      {
        series: row.series,
        prefix: row.prefix,
        suffix: row.suffix,
        padding: String(row.padding),
        startNumber: String(row.startNumber),
        restartYearly: row.restartYearly,
        manualOverride: row.manualOverride
      }
    ])
  )
}

function preface(draft: Draft): { padding: number; start: number; error?: string } {
  const padding = Number(draft.padding)
  const start = Number(draft.startNumber)
  if (!Number.isInteger(padding) || padding < 1 || padding > 8) {
    return { padding: 4, start: 1, error: 'Width must be 1 to 8' }
  }
  if (!Number.isInteger(start) || start < 1) {
    return { padding, start: 1, error: 'Start at 1 or more' }
  }
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(draft.series.trim().toUpperCase())) {
    return { padding, start, error: 'Series must be 2 to 8 characters' }
  }
  return { padding, start }
}

function preview(row: NumberingRow, draft: Draft): { number: string; error?: string } {
  const parsed = preface(draft)
  if (parsed.error) return { number: '—', error: parsed.error }
  const lastUsed = draft.series === row.series ? row.lastUsed : 0
  const next = nextSequenceValue(lastUsed, parsed.start)
  return {
    number: formatVoucherNumber(draft.prefix.trim(), next, parsed.padding, draft.suffix.trim())
  }
}

/**
 * Company voucher numbering. One row per voucher type with a live preview, so
 * the owner can see exactly what the next posted number will look like.
 */
export function NumberingPage({
  embedded = false,
  onSaved
}: {
  embedded?: boolean
  onSaved?: () => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['numbering'],
    queryFn: () => window.api.numbering.list()
  })
  const [edits, setEdits] = useState<Record<string, Partial<Draft>>>({})

  const drafts = useMemo(() => {
    if (!query.data) return null
    const base = toDrafts(query.data)
    for (const [type, patch] of Object.entries(edits)) {
      if (base[type]) base[type] = { ...base[type], ...patch }
    }
    return base
  }, [query.data, edits])

  const save = useMutation({
    mutationFn: () => {
      if (!drafts || !query.data) throw new Error('Numbering is not loaded')
      return window.api.numbering.update({
        requestId: crypto.randomUUID(),
        items: query.data.map((row) => {
          const draft = drafts[row.voucherType]
          const parsed = preface(draft)
          return {
            voucherType: row.voucherType,
            series: draft.series.trim().toUpperCase(),
            prefix: draft.prefix.trim(),
            suffix: draft.suffix.trim(),
            padding: parsed.padding,
            startNumber: parsed.start,
            restartYearly: draft.restartYearly,
            manualOverride: draft.manualOverride
          }
        })
      })
    },
    onSuccess: () => {
      setEdits({})
      toast.success('Voucher numbering saved')
      void queryClient.invalidateQueries({ queryKey: ['numbering'] })
      void queryClient.invalidateQueries({ queryKey: ['company', 'profile'] })
      onSaved?.()
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save the numbering'))
  })

  const errorCount = useMemo(() => {
    if (!drafts || !query.data) return 0
    return query.data.filter((row) => preview(row, drafts[row.voucherType]).error).length
  }, [drafts, query.data])

  function set<K extends keyof Draft>(type: VoucherType, key: K, value: Draft[K]): void {
    setEdits((current) => ({ ...current, [type]: { ...current[type], [key]: value } }))
  }

  if (query.isError) {
    return (
      <div className="border border-border bg-card px-4 py-8 text-center">
        <p className="text-[0.9375rem] font-medium">Could not load voucher numbering</p>
        <p className="mt-1 text-[0.875rem] text-muted-foreground">
          {errorMessage(query.error, 'Try again in a moment.')}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-6">
      {!embedded ? (
        <PageHeader
          title="Voucher numbering"
          description="The series, prefix and width used on every document. Posted vouchers keep their numbers."
          actions={
            <Link
              to="/settings/company"
              className="flex h-8 items-center gap-1.5 border border-border bg-card px-3 text-[0.875rem] font-medium hover:border-rule-strong"
            >
              <ArrowLeft className="size-3.5" />
              Company
            </Link>
          }
        />
      ) : null}

      <div className="border border-border bg-accent-soft/50 px-4 py-3 text-[0.875rem] leading-relaxed">
        <p className="font-medium">Numbers are assigned when a voucher is posted.</p>
        <p className="mt-1 text-muted-foreground">
          Changing a prefix or width affects the next number only. Changing the series starts a new
          series; older vouchers keep the series they were posted with.
        </p>
      </div>

      {query.isPending || !drafts ? (
        <div className="border border-border bg-card px-4 py-8 text-center text-[0.875rem] text-muted-foreground">
          Loading numbering...
        </div>
      ) : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[980px] border-collapse text-[0.875rem]">
            <thead>
              <tr className="border-b border-rule-strong bg-muted/60">
                <th className={`${LABEL} px-3 py-2 text-left`}>Voucher</th>
                <th className={`${LABEL} px-2 py-2 text-left`}>
                  <span className="inline-flex items-center gap-1">
                    Series <FieldHelp label="Series" content={HELP.series} />
                  </span>
                </th>
                <th className={`${LABEL} px-2 py-2 text-left`}>
                  <span className="inline-flex items-center gap-1">
                    Prefix <FieldHelp label="Prefix" content={HELP.prefix} />
                  </span>
                </th>
                <th className={`${LABEL} px-2 py-2 text-left`}>
                  <span className="inline-flex items-center gap-1">
                    Suffix <FieldHelp label="Suffix" content={HELP.suffix} />
                  </span>
                </th>
                <th className={`${LABEL} px-2 py-2 text-right`}>
                  <span className="inline-flex items-center gap-1">
                    Width <FieldHelp label="Width" content={HELP.width} />
                  </span>
                </th>
                <th className={`${LABEL} px-2 py-2 text-right`}>
                  <span className="inline-flex items-center gap-1">
                    Start <FieldHelp label="Start" content={HELP.start} />
                  </span>
                </th>
                <th className={`${LABEL} px-2 py-2 text-center`}>
                  <span className="inline-flex items-center gap-1">
                    Yearly <FieldHelp label="Restart each year" content={HELP.restart} />
                  </span>
                </th>
                <th className={`${LABEL} px-2 py-2 text-center`}>
                  <span className="inline-flex items-center gap-1">
                    Manual <FieldHelp label="Manual number" content={HELP.manual} />
                  </span>
                </th>
                <th className={`${LABEL} px-3 py-2 text-right`}>Next</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((row) => {
                const draft = drafts[row.voucherType]
                const next = preview(row, draft)
                return (
                  <tr key={row.voucherType} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.label}</div>
                      <div className="font-mono text-[0.6875rem] text-muted-foreground">
                        {row.usedCount} posted
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        aria-label={`${row.label} series`}
                        value={draft.series}
                        onChange={(event) => set(row.voucherType, 'series', event.target.value)}
                        className={`${CELL_INPUT} w-20`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        aria-label={`${row.label} prefix`}
                        value={draft.prefix}
                        onChange={(event) => set(row.voucherType, 'prefix', event.target.value)}
                        className={`${CELL_INPUT} w-24`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        aria-label={`${row.label} suffix`}
                        value={draft.suffix}
                        onChange={(event) => set(row.voucherType, 'suffix', event.target.value)}
                        className={`${CELL_INPUT} w-20`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        aria-label={`${row.label} width`}
                        value={draft.padding}
                        inputMode="numeric"
                        onChange={(event) =>
                          set(row.voucherType, 'padding', event.target.value.replace(/\D/g, ''))
                        }
                        className={`${CELL_INPUT} ml-auto w-12 text-right`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        aria-label={`${row.label} starting number`}
                        value={draft.startNumber}
                        inputMode="numeric"
                        onChange={(event) =>
                          set(row.voucherType, 'startNumber', event.target.value.replace(/\D/g, ''))
                        }
                        className={`${CELL_INPUT} ml-auto w-16 text-right`}
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Checkbox
                        aria-label={`${row.label} restarts each year`}
                        checked={draft.restartYearly}
                        onCheckedChange={(checked) =>
                          set(row.voucherType, 'restartYearly', checked === true)
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Checkbox
                        aria-label={`${row.label} allows manual numbers`}
                        checked={draft.manualOverride}
                        onCheckedChange={(checked) =>
                          set(row.voucherType, 'manualOverride', checked === true)
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={
                          next.error
                            ? 'font-mono text-[0.75rem] text-destructive'
                            : 'font-mono text-[0.8125rem] tabular-nums'
                        }
                      >
                        {next.error ?? next.number}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.75rem] text-muted-foreground">
          {errorCount > 0
            ? `${errorCount} row${errorCount === 1 ? '' : 's'} need attention before saving.`
            : 'The preview uses the same formatter as the posting engine.'}
        </p>
        <div className="flex items-center gap-2">
          {query.data ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEdits({})}
              disabled={save.isPending}
            >
              Reset
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || errorCount > 0}
          >
            <Save className="size-3.5" />
            {save.isPending ? 'Saving...' : 'Save numbering'}
          </Button>
        </div>
      </div>
    </div>
  )
}
