import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { NotebookPen } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { formatMinor } from '@/lib/money'

interface Row {
  accountId: string
  debit: string
  credit: string
}

const emptyRow = (): Row => ({ accountId: '', debit: '', credit: '' })

/**
 * Manual journals and cash-to-bank transfers. Journals are the only screen that
 * exposes debits and credits directly; the balance guard still refuses an
 * unbalanced post.
 */
export function JournalsPage(): React.JSX.Element {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'JOURNAL' | 'CONTRA' | null>(null)
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

  const post = useMutation({
    mutationFn: async () => {
      if (mode === 'JOURNAL') {
        const journalLines = rows
          .filter((row) => row.accountId)
          .map((row) => ({
            accountId: Number(row.accountId),
            debitMinor: Math.round((Number(row.debit) || 0) * 100),
            creditMinor: Math.round((Number(row.credit) || 0) * 100)
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
        amountMinor: Math.round((Number(amount) || 0) * 100),
        contraFromAccountId: Number(fromAccount),
        contraToAccountId: Number(toAccount)
      })
    },
    onSuccess: (posted) => {
      toast.success(`Posted ${posted.number}`)
      setMode(null)
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

  const debit = rows.reduce((sum, row) => sum + Math.round((Number(row.debit) || 0) * 100), 0)
  const credit = rows.reduce((sum, row) => sum + Math.round((Number(row.credit) || 0) * 100), 0)
  const balanced = debit === credit && debit > 0

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 p-6">
      <PageHeader
        title="Journals"
        description="Manual adjustments and cash to bank transfers."
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setMode('CONTRA')}
              className="h-8 border border-border bg-card px-3 text-[12px] font-medium"
            >
              New contra
            </button>
            <button
              onClick={() => setMode('JOURNAL')}
              className="h-8 bg-primary px-3 text-[12px] font-medium text-primary-foreground"
            >
              New journal
            </button>
          </div>
        }
      />

      {journals.data?.length === 0 && contras.data?.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No journals yet"
          description="Use a journal for adjustments, and a contra to move cash into the bank."
        />
      ) : (
        <div className="border border-border bg-card">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {['Date', 'Type', 'Number', 'Narration', 'Amount'].map((head, index) => (
                  <th
                    key={head}
                    className={
                      index === 4
                        ? 'border-b border-border px-3 py-2 text-right text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
                        : 'border-b border-border px-3 py-2 text-left text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
                    }
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...(journals.data ?? []), ...(contras.data ?? [])]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((row) => (
                  <tr
                    key={`${row.type}-${row.id}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.type}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{row.number}</td>
                    <td className="px-3 py-2">{row.partyName ?? '-'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatMinor(row.totalMinor, 'INR')}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {mode ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-[8vh]">
          <div className="w-full max-w-[760px] border border-ink bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-[13px] font-semibold">
                {mode === 'JOURNAL' ? 'New journal' : 'New contra'}
              </h2>
              <button
                onClick={() => setMode(null)}
                className="text-[12px] text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Date
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="h-8 border border-input bg-card px-2 text-[12px]"
                  />
                </label>
                {mode === 'CONTRA' ? (
                  <>
                    <AccountSelect
                      label="From"
                      value={fromAccount}
                      onChange={setFromAccount}
                      accounts={accounts.data ?? []}
                    />
                    <AccountSelect
                      label="To"
                      value={toAccount}
                      onChange={setToAccount}
                      accounts={accounts.data ?? []}
                    />
                  </>
                ) : null}
              </div>

              {mode === 'JOURNAL' ? (
                <div className="space-y-2">
                  {rows.map((row, index) => (
                    <div key={index} className="grid grid-cols-[1fr_120px_120px_32px] gap-2">
                      <AccountSelect
                        label={index === 0 ? 'Account' : ''}
                        value={row.accountId}
                        onChange={(value) =>
                          setRows((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, accountId: value } : item
                            )
                          )
                        }
                        accounts={accounts.data ?? []}
                      />
                      <input
                        placeholder="Debit"
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
                        className="h-8 border border-input bg-card px-2 text-right font-mono text-[12px]"
                      />
                      <input
                        placeholder="Credit"
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
                        className="h-8 border border-input bg-card px-2 text-right font-mono text-[12px]"
                      />
                      <button
                        onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                        className="text-[16px] text-muted-foreground"
                        aria-label="Remove line"
                      >
                        x
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setRows((current) => [...current, emptyRow()])}
                    className="h-7 border border-border px-2 text-[11px]"
                  >
                    Add line
                  </button>
                </div>
              ) : (
                <label className="block max-w-[220px]">
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Amount
                  </span>
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="h-8 w-full border border-input bg-card px-2 text-right font-mono text-[12px]"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Narration
                </span>
                <input
                  value={narration}
                  onChange={(event) => setNarration(event.target.value)}
                  className="h-8 w-full border border-input bg-card px-2 text-[12px]"
                />
              </label>

              {mode === 'JOURNAL' ? (
                <div className="flex justify-end gap-6 border-t border-border pt-2 text-[11.5px]">
                  <span>Debit {formatMinor(debit, 'INR')}</span>
                  <span>Credit {formatMinor(credit, 'INR')}</span>
                  <span className={balanced ? 'text-success' : 'text-destructive'}>
                    {balanced ? 'Balanced' : 'Not balanced'}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={() => setMode(null)}
                className="h-8 border border-border px-3 text-[12px]"
              >
                Cancel
              </button>
              <button
                onClick={() => post.mutate()}
                disabled={
                  post.isPending ||
                  (mode === 'JOURNAL' ? !balanced : !amount || !fromAccount || !toAccount)
                }
                className="h-8 bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
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
  label,
  value,
  onChange,
  accounts
}: {
  label: string
  value: string
  onChange: (value: string) => void
  accounts: { id: number; name: string }[]
}): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      {label ? (
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
      ) : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full border border-input bg-card px-2 text-[12px]"
      >
        <option value="">Select account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </label>
  )
}
