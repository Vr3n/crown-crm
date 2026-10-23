import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeftRight, BookOpen, IndianRupee, NotebookPen } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/ui/kpi-card'
import { StatusPill } from '@/components/ui/status-pill'
import { Field, FieldError, FormLegend } from '@/components/ui/field'
import type { FieldHelpContent } from '@/components/ui/field-help'
import { formatMinor } from '@/lib/money'
import { FIELD_HELP } from '@/lib/form-help'

interface Row {
  accountId: string
  debit: string
  credit: string
}

interface RowIssue {
  account?: string
  amount?: string
}

interface JournalIssues {
  date?: string
  rows: RowIssue[]
  lines?: string
  balance?: string
}

interface ContraIssues {
  date?: string
  from?: string
  to?: string
  amount?: string
  sameAccount?: string
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Contra reuses the journal help entries so no copy is duplicated here. The
 * amount is the value debited to the destination ledger, so the debit summary
 * applies; its one-sided rule only describes manual journal lines.
 */
const CONTRA_HELP = {
  from: FIELD_HELP.journal.account,
  to: FIELD_HELP.journal.account,
  amount: { summary: FIELD_HELP.journal.debit.summary }
} as const

const emptyRow = (): Row => ({ accountId: '', debit: '', credit: '' })

function amountMinor(value: string): number {
  return Math.round((Number(value) || 0) * 100)
}

function isPositiveAmount(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0
}

function journalIssues(date: string, rows: Row[]): JournalIssues {
  const issues: JournalIssues = { rows: rows.map(() => ({})) }

  if (!date) issues.date = 'Choose the date of the entry'
  else if (!DATE_PATTERN.test(date)) issues.date = 'Enter the date as YYYY-MM-DD'

  const used = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.accountId || row.debit.trim() || row.credit.trim())

  if (used.length < 2) {
    issues.lines = 'Add at least two lines, each with an account and one amount'
  }

  let amountsValid = true
  for (const { row, index } of used) {
    if (!row.accountId) issues.rows[index].account = 'Choose the account for this line'

    const hasDebit = isPositiveAmount(row.debit)
    const hasCredit = isPositiveAmount(row.credit)
    if (hasDebit && hasCredit) {
      issues.rows[index].amount = 'Use debit or credit, not both'
      amountsValid = false
    } else if (!hasDebit && !hasCredit) {
      issues.rows[index].amount =
        row.debit.trim() || row.credit.trim()
          ? 'Amount must be greater than zero'
          : 'Enter a debit or a credit amount'
      amountsValid = false
    }
  }

  if (used.length > 0 && amountsValid) {
    const debit = rows.reduce((sum, row) => sum + amountMinor(row.debit), 0)
    const credit = rows.reduce((sum, row) => sum + amountMinor(row.credit), 0)
    if (debit === 0 && credit === 0) issues.balance = 'Enter an amount greater than zero'
    else if (debit !== credit) issues.balance = 'Debits and credits must match before posting'
  }

  return issues
}

function contraIssues(date: string, from: string, to: string, amount: string): ContraIssues {
  const issues: ContraIssues = {}

  if (!date) issues.date = 'Choose the date of the entry'
  else if (!DATE_PATTERN.test(date)) issues.date = 'Enter the date as YYYY-MM-DD'
  if (!from) issues.from = 'Choose the account the money leaves'
  if (!to) issues.to = 'Choose the account the money goes to'
  if (from && to && from === to) issues.sameAccount = 'From and to must be different accounts'
  if (!amount.trim()) issues.amount = 'Enter the transfer amount'
  else if (!isPositiveAmount(amount)) issues.amount = 'Amount must be greater than zero'

  return issues
}

function issueMessages(journal: JournalIssues | null, contra: ContraIssues | null): string[] {
  const messages = new Set<string>()
  if (journal) {
    if (journal.date) messages.add(journal.date)
    for (const row of journal.rows) {
      if (row.account) messages.add(row.account)
      if (row.amount) messages.add(row.amount)
    }
    if (journal.lines) messages.add(journal.lines)
    if (journal.balance) messages.add(journal.balance)
  }
  if (contra) {
    if (contra.date) messages.add(contra.date)
    if (contra.from) messages.add(contra.from)
    if (contra.to) messages.add(contra.to)
    if (contra.amount) messages.add(contra.amount)
    if (contra.sameAccount) messages.add(contra.sameAccount)
  }
  return [...messages]
}

function firstJournalInvalid(issues: JournalIssues, rows: Row[]): string | undefined {
  if (issues.date) return 'journal-date'
  const rowIndex = issues.rows.findIndex((row) => row.account || row.amount)
  if (rowIndex >= 0) {
    return issues.rows[rowIndex].account
      ? `journal-account-${rowIndex}`
      : `journal-debit-${rowIndex}`
  }
  if (issues.lines) return rows.length > 0 ? 'journal-account-0' : 'journal-add-line'
  if (issues.balance) {
    const usedIndex = rows.findIndex((row) => row.accountId)
    return usedIndex >= 0 ? `journal-debit-${usedIndex}` : 'journal-account-0'
  }
  return undefined
}

function firstContraInvalid(issues: ContraIssues): string | undefined {
  if (issues.date) return 'journal-date'
  if (issues.from) return 'contra-from'
  if (issues.to) return 'contra-to'
  if (issues.amount) return 'contra-amount'
  if (issues.sameAccount) return 'contra-to'
  return undefined
}

/**
 * Manual journals and cash-to-bank transfers. Journals are the only screen that
 * exposes debits and credits directly; the balance guard still refuses an
 * unbalanced post.
 */
export function JournalsPage(): React.JSX.Element {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'JOURNAL' | 'CONTRA' | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [narration, setNarration] = useState('')
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()])
  const [amount, setAmount] = useState('')
  const [fromAccount, setFromAccount] = useState('')
  const [toAccount, setToAccount] = useState('')

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => window.api.accounts.list() })
  const journals = useQuery({
    queryKey: ['vouchers', 'JOURNAL'],
    queryFn: () => window.api.vouchers.list({ type: 'JOURNAL', limit: 50, offset: 0 })
  })
  const contras = useQuery({
    queryKey: ['vouchers', 'CONTRA'],
    queryFn: () => window.api.vouchers.list({ type: 'CONTRA', limit: 50, offset: 0 })
  })

  const journalRows = journals.data ?? []
  const contraRows = contras.data ?? []
  const history = [...journalRows, ...contraRows].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id - a.id
  )
  const postedJournals = journalRows.filter((row) => row.status === 'POSTED').length
  const postedContras = contraRows.filter((row) => row.status === 'POSTED').length
  const adjustedMinor = history
    .filter((row) => row.status === 'POSTED')
    .reduce((sum, row) => sum + row.totalMinor, 0)

  const post = useMutation({
    mutationFn: async () => {
      if (mode === 'JOURNAL') {
        const journalLines = rows
          .filter((row) => row.accountId)
          .map((row) => ({
            accountId: Number(row.accountId),
            debitMinor: amountMinor(row.debit),
            creditMinor: amountMinor(row.credit)
          }))
        return window.api.vouchers.post({
          requestId: crypto.randomUUID(),
          type: 'JOURNAL',
          date,
          narration: narration || null,
          lines: [],
          journalLines,
          allocations: []
        })
      }
      return window.api.vouchers.post({
        requestId: crypto.randomUUID(),
        type: 'CONTRA',
        date,
        narration: narration || null,
        lines: [],
        journalLines: [],
        allocations: [],
        amountMinor: amountMinor(amount),
        contraFromAccountId: Number(fromAccount),
        contraToAccountId: Number(toAccount)
      })
    },
    onSuccess: (posted) => {
      toast.success(`Posted ${posted.number}`)
      setMode(null)
      setRevealed(false)
      setRows([emptyRow(), emptyRow()])
      setAmount('')
      setNarration('')
      void qc.invalidateQueries({ queryKey: ['vouchers'] })
      void qc.invalidateQueries({ queryKey: ['report'] })
    },
    onError: (error) =>
      toast.error('Could not post', {
        description: error instanceof Error ? error.message : undefined
      })
  })

  const debit = rows.reduce((sum, row) => sum + amountMinor(row.debit), 0)
  const credit = rows.reduce((sum, row) => sum + amountMinor(row.credit), 0)
  const balanced = debit === credit && debit > 0

  const journal = mode === 'JOURNAL' ? journalIssues(date, rows) : null
  const contra = mode === 'CONTRA' ? contraIssues(date, fromAccount, toAccount, amount) : null
  const summary = revealed ? issueMessages(journal, contra) : []

  const dateError = revealed ? (journal?.date ?? contra?.date) : undefined
  const fromError = revealed ? contra?.from : undefined
  const toError = revealed ? contra?.to : undefined
  const contraAmountError = revealed ? contra?.amount : undefined

  function open(next: 'JOURNAL' | 'CONTRA'): void {
    setMode(next)
    setRevealed(false)
  }

  function close(): void {
    setMode(null)
    setRevealed(false)
  }

  function postEntry(): void {
    if (!mode || post.isPending) return
    const firstInvalid =
      mode === 'JOURNAL'
        ? firstJournalInvalid(journalIssues(date, rows), rows)
        : firstContraInvalid(contraIssues(date, fromAccount, toAccount, amount))
    if (firstInvalid) {
      setRevealed(true)
      const element = document.getElementById(firstInvalid)
      element?.focus()
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    post.mutate()
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 p-6">
      <PageHeader
        title="Journals"
        description="Manual adjustments and cash to bank transfers."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => open('CONTRA')}>
              <ArrowLeftRight className="size-3.5" />
              New contra
            </Button>
            <Button size="sm" onClick={() => open('JOURNAL')}>
              <BookOpen className="size-3.5" />
              New journal
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-3">
        <KpiCard
          label="Journals"
          value={journalRows.length}
          context={`${postedJournals} posted adjustments`}
          icon={BookOpen}
        />
        <KpiCard
          label="Contras"
          value={contraRows.length}
          context={`${postedContras} posted transfers`}
          icon={ArrowLeftRight}
          tone="stamp"
        />
        <KpiCard
          label="Value adjusted"
          value={formatMinor(adjustedMinor, 'INR')}
          context="Posted entries in this view"
          icon={IndianRupee}
          tone="success"
        />
      </section>

      {history.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No journals yet"
          description="Use a journal for adjustments, and a contra to move cash into the bank."
        />
      ) : (
        <div className="overflow-hidden border border-border bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
            <h2 className="text-[0.875rem] font-semibold">Recent entries</h2>
            <span className="text-[0.75rem] text-muted-foreground">
              {history.length} {history.length === 1 ? 'entry' : 'entries'} · newest first
            </span>
          </div>
          <div className="max-h-[620px] overflow-auto">
            <table className="w-full border-collapse text-[0.875rem]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/95">
                  {['Date', 'Entry', 'Narration', 'Status', 'Amount'].map((head, index) => (
                    <th
                      key={head}
                      className={`h-8 whitespace-nowrap border-b border-border px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground ${
                        index === 4 ? 'text-right' : 'text-left'
                      }`}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr
                    key={`${row.type}-${row.id}`}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="h-10 whitespace-nowrap px-3 font-mono text-[0.8125rem] text-muted-foreground">
                      {row.date}
                    </td>
                    <td className="h-10 px-3">
                      <Link
                        to={`/vouchers/${row.id}`}
                        className="font-mono text-[0.8125rem] font-medium hover:text-primary hover:underline"
                      >
                        {row.number}
                      </Link>
                      <StatusPill tone="neutral" className="ml-2">
                        {row.type === 'JOURNAL' ? 'Journal' : 'Contra'}
                      </StatusPill>
                    </td>
                    <td className="h-10 max-w-[360px] truncate px-3 text-muted-foreground">
                      {row.narration ?? '—'}
                    </td>
                    <td className="h-10 px-3">
                      <StatusPill
                        tone={
                          row.status === 'POSTED'
                            ? 'success'
                            : row.status === 'CANCELLED'
                              ? 'destructive'
                              : 'neutral'
                        }
                      >
                        {row.status}
                      </StatusPill>
                    </td>
                    <td className="h-10 whitespace-nowrap px-3 text-right font-mono font-semibold tabular-nums">
                      {formatMinor(row.totalMinor, 'INR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mode ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-[8vh]">
          <div className="max-h-[84vh] w-full max-w-[760px] overflow-y-auto border border-ink bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-[0.9375rem] font-semibold">
                {mode === 'JOURNAL' ? 'New journal' : 'New contra'}
              </h2>
              <button
                type="button"
                onClick={close}
                className="text-[0.875rem] text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 p-4">
              <FormLegend />

              <div className="grid grid-cols-3 gap-3">
                <Field
                  id="journal-date"
                  label="Date"
                  required
                  help={FIELD_HELP.journal.date}
                  error={dateError}
                >
                  <input
                    id="journal-date"
                    type="date"
                    autoFocus
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    aria-invalid={Boolean(dateError)}
                    aria-required
                    aria-describedby={dateError ? 'journal-date-error' : undefined}
                    className="h-8 w-full border border-input bg-card px-2 font-mono text-[0.875rem] aria-invalid:border-destructive"
                  />
                </Field>
                {mode === 'CONTRA' ? (
                  <>
                    <AccountSelect
                      id="contra-from"
                      label="From"
                      required
                      help={CONTRA_HELP.from}
                      value={fromAccount}
                      onChange={setFromAccount}
                      accounts={accounts.data ?? []}
                      error={fromError}
                    />
                    <AccountSelect
                      id="contra-to"
                      label="To"
                      required
                      help={CONTRA_HELP.to}
                      value={toAccount}
                      onChange={setToAccount}
                      accounts={accounts.data ?? []}
                      error={toError}
                    />
                  </>
                ) : null}
              </div>

              {mode === 'JOURNAL' ? (
                <div className="space-y-2">
                  {rows.map((row, index) => {
                    const issue = journal?.rows[index] ?? {}
                    const accountError = revealed ? issue.account : undefined
                    const amountError = revealed ? issue.amount : undefined
                    const amountErrorId = `journal-line-${index}-error`
                    return (
                      <div key={index} className="space-y-1">
                        <div className="grid grid-cols-[1fr_120px_120px_32px] gap-2">
                          <AccountSelect
                            id={`journal-account-${index}`}
                            label={`Account ${index + 1}`}
                            required
                            help={FIELD_HELP.journal.account}
                            value={row.accountId}
                            onChange={(value) =>
                              setRows((current) =>
                                current.map((item, i) =>
                                  i === index ? { ...item, accountId: value } : item
                                )
                              )
                            }
                            accounts={accounts.data ?? []}
                            error={accountError}
                          />
                          <Field
                            id={`journal-debit-${index}`}
                            label={`Debit ${index + 1}`}
                            required
                            help={FIELD_HELP.journal.debit}
                          >
                            <input
                              id={`journal-debit-${index}`}
                              inputMode="decimal"
                              placeholder="0.00"
                              value={row.debit}
                              onChange={(event) =>
                                setRows((current) =>
                                  current.map((item, i) =>
                                    i === index
                                      ? { ...item, debit: event.target.value, credit: '' }
                                      : item
                                  )
                                )
                              }
                              aria-invalid={Boolean(amountError)}
                              aria-required
                              aria-describedby={amountError ? amountErrorId : undefined}
                              className="h-8 w-full border border-input bg-card px-2 text-right font-mono text-[0.875rem] aria-invalid:border-destructive"
                            />
                          </Field>
                          <Field
                            id={`journal-credit-${index}`}
                            label={`Credit ${index + 1}`}
                            required
                            help={FIELD_HELP.journal.credit}
                          >
                            <input
                              id={`journal-credit-${index}`}
                              inputMode="decimal"
                              placeholder="0.00"
                              value={row.credit}
                              onChange={(event) =>
                                setRows((current) =>
                                  current.map((item, i) =>
                                    i === index
                                      ? { ...item, credit: event.target.value, debit: '' }
                                      : item
                                  )
                                )
                              }
                              aria-invalid={Boolean(amountError)}
                              aria-required
                              aria-describedby={amountError ? amountErrorId : undefined}
                              className="h-8 w-full border border-input bg-card px-2 text-right font-mono text-[0.875rem] aria-invalid:border-destructive"
                            />
                          </Field>
                          <div className="flex flex-col gap-1.5">
                            <span aria-hidden className="h-5" />
                            <button
                              type="button"
                              onClick={() =>
                                setRows((current) => current.filter((_, i) => i !== index))
                              }
                              className="h-8 text-[1rem] text-muted-foreground hover:text-destructive"
                              aria-label={`Remove line ${index + 1}`}
                            >
                              x
                            </button>
                          </div>
                        </div>
                        {amountError ? (
                          <FieldError id={amountErrorId}>{amountError}</FieldError>
                        ) : null}
                      </div>
                    )
                  })}
                  <button
                    id="journal-add-line"
                    type="button"
                    onClick={() => setRows((current) => [...current, emptyRow()])}
                    className="h-7 border border-border px-2 text-[0.75rem]"
                  >
                    Add line
                  </button>
                </div>
              ) : (
                <Field
                  id="contra-amount"
                  label="Amount"
                  required
                  help={CONTRA_HELP.amount}
                  error={contraAmountError}
                  className="max-w-[220px]"
                >
                  <input
                    id="contra-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    aria-invalid={Boolean(contraAmountError)}
                    aria-required
                    aria-describedby={contraAmountError ? 'contra-amount-error' : undefined}
                    className="h-8 w-full border border-input bg-card px-2 text-right font-mono text-[0.875rem] aria-invalid:border-destructive"
                  />
                </Field>
              )}

              <Field id="journal-narration" label="Narration" help={FIELD_HELP.journal.narration}>
                <input
                  id="journal-narration"
                  value={narration}
                  onChange={(event) => setNarration(event.target.value)}
                  className="h-8 w-full border border-input bg-card px-2 text-[0.875rem]"
                />
              </Field>

              {mode === 'JOURNAL' ? (
                <div className="flex justify-end gap-6 border-t border-border pt-2 text-[0.875rem]">
                  <span>Debit {formatMinor(debit, 'INR')}</span>
                  <span>Credit {formatMinor(credit, 'INR')}</span>
                  <span className={balanced ? 'text-success' : 'text-destructive'}>
                    {balanced ? 'Balanced' : 'Not balanced'}
                  </span>
                </div>
              ) : null}

              {revealed && summary.length > 0 ? (
                <div
                  role="alert"
                  className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
                >
                  <p className="font-medium">This entry cannot be posted yet</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {summary.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={close}
                className="h-8 border border-border px-3 text-[0.875rem]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={postEntry}
                disabled={post.isPending}
                className="h-8 bg-primary px-3 text-[0.875rem] font-medium text-primary-foreground disabled:opacity-50"
              >
                {post.isPending ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AccountSelect({
  id,
  label,
  value,
  onChange,
  accounts,
  required,
  help,
  error
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  accounts: { id: number; name: string }[]
  required?: boolean
  help: FieldHelpContent
  error?: string
}): React.JSX.Element {
  return (
    <Field id={id} label={label} required={required} help={help} error={error}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-required={required}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-8 w-full border border-input bg-card px-2 text-[0.875rem] aria-invalid:border-destructive"
      >
        <option value="">Select account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </Field>
  )
}
