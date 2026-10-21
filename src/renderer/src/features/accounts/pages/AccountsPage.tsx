import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListTree, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { formatMinor } from '@/lib/money'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type { AccountRow, CreateAccountInput } from '../../../../../shared/contracts/masters'

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-9 border-b border-border px-3 align-middle'
const TAG = 'rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.08em]'

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'
const TYPES: { value: AccountType; label: string }[] = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'INCOME', label: 'Income' },
  { value: 'EXPENSE', label: 'Expense' }
]

interface AccountForm {
  name: string
  groupId: string
  type: AccountType
  amount: string
  side: 'DEBIT' | 'CREDIT'
}

const blankForm = (): AccountForm => ({
  name: '',
  groupId: '',
  type: 'ASSET',
  amount: '0',
  side: 'DEBIT'
})

/** Rupees typed by the user to integer paise. Blank or invalid counts as zero. */
function toMinor(value: string): number {
  const cleaned = value.replace(/[₹,\s]/g, '')
  if (!cleaned || cleaned === '.') return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

function Balance({ minor }: { minor: number }): React.JSX.Element {
  if (minor === 0)
    return (
      <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
        {formatMinor(0, 'INR')}
      </span>
    )
  return (
    <span
      className={`font-mono text-[12px] tabular-nums ${minor > 0 ? 'text-success' : 'text-destructive'}`}
    >
      {formatMinor(Math.abs(minor), 'INR')}{' '}
      <span className="text-[10px]">{minor > 0 ? 'Dr' : 'Cr'}</span>
    </span>
  )
}

export function AccountsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('ALL')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<AccountForm>(blankForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [target, setTarget] = useState<AccountRow | null>(null)

  const list = useQuery({
    queryKey: ['accounts', includeInactive],
    queryFn: () => window.api.accounts.list(includeInactive)
  })
  const groups = useQuery({
    queryKey: ['accounts', 'groups'],
    queryFn: () => window.api.accounts.groups()
  })
  const rows = list.data ?? []

  const needle = search.trim().toLowerCase()
  const filtered = rows.filter(
    (row) =>
      (group === 'ALL' || row.groupName === group) &&
      (!needle ||
        row.name.toLowerCase().includes(needle) ||
        row.groupName.toLowerCase().includes(needle) ||
        (row.systemKey ?? '').toLowerCase().includes(needle))
  )
  const sections = filtered.reduce<{ name: string; rows: AccountRow[] }[]>((acc, row) => {
    const last = acc[acc.length - 1]
    if (last && last.name === row.groupName) last.rows.push(row)
    else acc.push({ name: row.groupName, rows: [row] })
    return acc
  }, [])

  const save = useMutation({
    mutationFn: (input: CreateAccountInput) => window.api.accounts.create(input),
    onSuccess: () => {
      toast.success('Account added')
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setOpen(false)
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not add the account'))
  })

  const deactivate = useMutation({
    mutationFn: (id: number) => window.api.accounts.deactivate(id),
    onSuccess: () => {
      toast.success('Account deactivated')
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setTarget(null)
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not deactivate the account'))
  })

  function chooseGroup(value: string): void {
    const nature = groups.data?.find((entry) => String(entry.id) === value)?.nature as
      AccountType | undefined
    setForm((prev) => ({ ...prev, groupId: value, type: nature ?? prev.type }))
    setErrors((prev) => ({ ...prev, groupId: '' }))
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!form.name.trim()) found.name = 'Account name is required'
    if (!form.groupId) found.groupId = 'Choose an account group'
    if (toMinor(form.amount) < 0) found.amount = 'Cannot be negative'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    save.mutate({
      name: form.name.trim(),
      groupId: Number(form.groupId),
      type: form.type,
      openingBalanceMinor: toMinor(form.amount),
      openingBalanceSide: form.side
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-6">
      <PageHeader
        title="Chart of Accounts"
        description={`${rows.length} accounts in ${groups.data?.length ?? 0} groups`}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setForm(blankForm())
              setErrors({})
              save.reset()
              setOpen(true)
            }}
          >
            <Plus className="size-3.5" strokeWidth={2} />
            New account
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="account-search"
            aria-label="Search accounts"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search account, group or system key"
            className="h-8 border-0 bg-transparent pl-8 text-[12.5px] focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <div className="w-52">
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger
              id="account-group-filter"
              aria-label="Filter by account group"
              className="h-8 text-[11.5px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All groups</SelectItem>
              {(groups.data ?? []).map((entry) => (
                <SelectItem key={entry.id} value={entry.name}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label
          htmlFor="account-inactive"
          className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted-foreground"
        >
          <Checkbox
            id="account-inactive"
            checked={includeInactive}
            onCheckedChange={(checked) => setIncludeInactive(checked === true)}
          />
          Show inactive
        </label>
      </div>

      {list.isError ? (
        <div className="border border-border bg-card px-4 py-8 text-center">
          <p className="text-[12.5px] font-medium">Could not load accounts</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {errorMessage(list.error, 'Try again in a moment.')}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : filtered.length === 0 && !list.isPending ? (
        <EmptyState
          icon={ListTree}
          title={needle || group !== 'ALL' ? 'No accounts match' : 'No accounts yet'}
          description={
            needle || group !== 'ALL'
              ? 'Clear the search or choose another group.'
              : 'Add a ledger under an existing group to start recording balances.'
          }
          action={
            needle || group !== 'ALL' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setGroup('ALL')
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="size-3.5" strokeWidth={2} />
                New account
              </Button>
            )
          }
        />
      ) : (
        <div className="max-h-[calc(100vh-15.5rem)] overflow-auto border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Account
                </th>
                <th scope="col" className={TH}>
                  Type
                </th>
                <th scope="col" className={TH}>
                  System key
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Balance
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            {list.isPending ? (
              <tbody>
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-[12px] text-muted-foreground"
                  >
                    Loading accounts...
                  </td>
                </tr>
              </tbody>
            ) : (
              sections.map((section) => (
                <tbody key={section.name}>
                  <tr>
                    <th
                      colSpan={5}
                      scope="colgroup"
                      className="h-8 border-y border-border bg-muted/50 px-3 text-left"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
                        {section.name}
                      </span>
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {section.rows.length}
                      </span>
                    </th>
                  </tr>
                  {section.rows.map((account) => (
                    <tr key={account.id} className="hover:bg-muted/40">
                      <td className={TD}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px]">{account.name}</span>
                          {!account.isActive ? (
                            <Badge variant="outline" className={TAG}>
                              Inactive
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`${TD} text-[11px] uppercase tracking-[0.08em] text-muted-foreground`}
                      >
                        {account.type}
                      </td>
                      <td className={TD}>
                        {account.systemKey ? (
                          <Badge variant="secondary" className={TAG}>
                            {account.systemKey}
                          </Badge>
                        ) : null}
                      </td>
                      <td className={`${TD} text-right`}>
                        <Balance minor={account.balanceMinor} />
                      </td>
                      <td className={`${TD} text-right`}>
                        {account.isSystem ? (
                          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            Reserved
                          </span>
                        ) : account.isActive ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setTarget(account)}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))
            )}
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>New account</DialogTitle>
            <DialogDescription>
              Choose the group first. The type follows the group nature and can be adjusted.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-name" className={LABEL}>
                Name
              </Label>
              <Input
                id="account-name"
                value={form.name}
                autoFocus
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                  setErrors((prev) => ({ ...prev, name: '' }))
                }}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'account-name-error' : undefined}
              />
              {errors.name ? (
                <p id="account-name-error" role="alert" className="text-[11px] text-destructive">
                  {errors.name}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-group" className={LABEL}>
                  Group
                </Label>
                <Select value={form.groupId} onValueChange={chooseGroup}>
                  <SelectTrigger
                    id="account-group"
                    className="w-full"
                    aria-invalid={Boolean(errors.groupId)}
                    aria-describedby={errors.groupId ? 'account-group-error' : undefined}
                  >
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {(groups.data ?? []).map((entry) => (
                      <SelectItem key={entry.id} value={String(entry.id)}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.groupId ? (
                  <p id="account-group-error" role="alert" className="text-[11px] text-destructive">
                    {errors.groupId}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-type" className={LABEL}>
                  Type
                </Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, type: value as AccountType }))
                  }
                >
                  <SelectTrigger id="account-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-opening" className={LABEL}>
                  Opening balance (INR)
                </Label>
                <Input
                  id="account-opening"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  className="text-right font-mono tabular-nums"
                />
                {errors.amount ? (
                  <p role="alert" className="text-[11px] text-destructive">
                    {errors.amount}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-side" className={LABEL}>
                  Side
                </Label>
                <Select
                  value={form.side}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, side: value as 'DEBIT' | 'CREDIT' }))
                  }
                >
                  <SelectTrigger id="account-side" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">Dr</SelectItem>
                    <SelectItem value="CREDIT">Cr</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {save.isError ? (
              <p
                role="alert"
                className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11.5px] text-destructive"
              >
                {errorMessage(save.error, 'Could not add the account.')}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending ? 'Saving...' : 'Add account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(next) => {
          if (!next && !deactivate.isPending) setTarget(null)
        }}
        title="Deactivate this account?"
        description={
          target ? `${target.name} stays on past vouchers but is hidden from new entries.` : ''
        }
        confirmLabel="Deactivate"
        destructive
        isPending={deactivate.isPending}
        onConfirm={() => {
          if (target) deactivate.mutate(target.id)
        }}
      />
    </div>
  )
}
