import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListTree, Plus, Search, Landmark, TrendingUp, Wallet, ArrowDownLeft } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
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
import { Field, FormLegend } from '@/components/ui/field'
import { focusFirstError, FormTextField, type FormFieldApi } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { FIELD_HELP } from '@/lib/form-help'
import { KpiCard } from '@/components/ui/kpi-card'
import { ChartCard } from '@/components/ui/chart-card'
import { RankedBarsChart } from '@/components/charts/list-charts'
import { formatMinor } from '@/lib/money'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type {
  AccountGroupRow,
  AccountRow,
  CreateAccountInput
} from '../../../../../shared/contracts/masters'

const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-9 border-b border-border px-3 align-middle'
const TAG = 'rounded-none px-1.5 py-0 text-[0.6875rem] uppercase tracking-[0.08em]'

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const
type AccountType = (typeof ACCOUNT_TYPES)[number]
type AccountSide = 'DEBIT' | 'CREDIT'

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
  side: AccountSide
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

const accountFormSchema = z.object({
  name: z.string().trim().min(1, 'Account name is required'),
  groupId: z.string().min(1, 'Choose an account group'),
  type: z.enum(ACCOUNT_TYPES),
  amount: z.string().refine((value) => toMinor(value) >= 0, 'Cannot be negative'),
  side: z.enum(['DEBIT', 'CREDIT'])
})

/** Field-level rule reused for live blur/change validation. */
function accountFieldError(name: keyof AccountForm, value: string): string | undefined {
  const result = accountFormSchema.shape[name].safeParse(value)
  if (result.success) return undefined
  return result.error.issues[0]?.message
}

function AccountOverview({ rows }: { rows: AccountRow[] }): React.JSX.Element {
  const total = (type: string): number =>
    rows
      .filter((row) => row.type === type)
      .reduce((sum, row) => sum + Math.abs(row.balanceMinor), 0)

  const groups = new Map<string, number>()
  for (const row of rows) {
    groups.set(row.groupName, (groups.get(row.groupName) ?? 0) + Math.abs(row.balanceMinor))
  }
  const topGroups = [...groups.entries()]
    .map(([label, valueMinor]) => ({ label, valueMinor }))
    .filter((row) => row.valueMinor > 0)
    .sort((a, b) => b.valueMinor - a.valueMinor)
    .slice(0, 6)

  return (
    <>
      <section className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-4">
        <KpiCard
          label="Assets"
          value={formatMinor(total('ASSET'), 'INR')}
          context="What the business owns"
          icon={Landmark}
          tone="primary"
        />
        <KpiCard
          label="Liabilities"
          value={formatMinor(total('LIABILITY'), 'INR')}
          context="What the business owes"
          icon={ArrowDownLeft}
          tone="stamp"
        />
        <KpiCard
          label="Income"
          value={formatMinor(total('INCOME'), 'INR')}
          context="Earned so far"
          icon={TrendingUp}
          tone="success"
        />
        <KpiCard
          label="Expenses"
          value={formatMinor(total('EXPENSE'), 'INR')}
          context="Spent so far"
          icon={Wallet}
          tone="warning"
        />
      </section>

      {topGroups.length > 0 ? (
        <ChartCard title="Balance by group" subtitle="Where the ledger's value sits">
          <RankedBarsChart rows={topGroups} ariaLabel="Account balance by group" />
        </ChartCard>
      ) : null}
    </>
  )
}

function Balance({ minor }: { minor: number }): React.JSX.Element {
  if (minor === 0)
    return (
      <span className="font-mono text-[0.875rem] tabular-nums text-muted-foreground">
        {formatMinor(0, 'INR')}
      </span>
    )
  return (
    <span
      className={`font-mono text-[0.875rem] tabular-nums ${minor > 0 ? 'text-success' : 'text-destructive'}`}
    >
      {formatMinor(Math.abs(minor), 'INR')}{' '}
      <span className="text-[0.6875rem]">{minor > 0 ? 'Dr' : 'Cr'}</span>
    </span>
  )
}

export function AccountsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('ALL')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [open, setOpen] = useState(false)
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

  const deactivate = useMutation({
    mutationFn: (id: number) => window.api.accounts.deactivate(id),
    onSuccess: () => {
      toast.success('Account deactivated')
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setTarget(null)
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not deactivate the account'))
  })

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-6">
      <PageHeader
        title="Chart of Accounts"
        description={`${rows.length} accounts in ${groups.data?.length ?? 0} groups`}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" strokeWidth={2} />
            New account
          </Button>
        }
      />

      <AccountOverview rows={rows} />

      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="account-search"
            aria-label="Search accounts"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search account, group or system key"
            className="h-8 border-0 bg-transparent pl-8 text-[0.9375rem] focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <div className="w-52">
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger
              id="account-group-filter"
              aria-label="Filter by account group"
              className="h-8 text-[0.875rem]"
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
          className="flex cursor-pointer items-center gap-1.5 text-[0.875rem] text-muted-foreground"
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
          <p className="text-[0.9375rem] font-medium">Could not load accounts</p>
          <p className="mt-1 text-[0.875rem] text-muted-foreground">
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
                    className="px-3 py-8 text-center text-[0.875rem] text-muted-foreground"
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
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-foreground">
                        {section.name}
                      </span>
                      <span className="ml-2 text-[0.6875rem] text-muted-foreground">
                        {section.rows.length}
                      </span>
                    </th>
                  </tr>
                  {section.rows.map((account) => (
                    <tr key={account.id} className="hover:bg-muted/40">
                      <td className={TD}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[0.9375rem]">{account.name}</span>
                          {!account.isActive ? (
                            <Badge variant="outline" className={TAG}>
                              Inactive
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`${TD} text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground`}
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
                          <span className="text-[0.6875rem] uppercase tracking-[0.08em] text-muted-foreground">
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

      {open ? (
        <AccountDialog
          open={open}
          onOpenChange={setOpen}
          groups={groups.data ?? []}
          onSaved={() => setOpen(false)}
        />
      ) : null}

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

/**
 * Account capture dialog. Validation runs on blur, then live on change, so an
 * error clears the moment the value is fixed. Required markers and field help
 * come from the shared form primitives.
 */
function AccountDialog({
  open,
  onOpenChange,
  groups,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: AccountGroupRow[]
  onSaved: () => void
}): React.JSX.Element {
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (input: CreateAccountInput) => window.api.accounts.create(input),
    onSuccess: () => {
      toast.success('Account added')
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      onSaved()
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not add the account'))
  })

  const form = useForm({
    defaultValues: blankForm(),
    // The dialog reveals every error and focuses the first one instead of
    // disabling submit, so invalid attempts must reach validation.
    canSubmitWhenInvalid: true,
    validators: { onSubmit: accountFormSchema },
    onSubmitInvalid: ({ formApi }) => focusFirstError(formApi),
    onSubmit: ({ value }) => {
      save.mutate({
        name: value.name.trim(),
        groupId: Number(value.groupId),
        type: value.type,
        openingBalanceMinor: toMinor(value.amount),
        openingBalanceSide: value.side
      })
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            Choose the group first. The type follows the group nature and can be adjusted.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormLegend />

          <form.Field
            name="name"
            validators={{
              onBlur: ({ value }) => accountFieldError('name', value),
              onChange: ({ value }) => accountFieldError('name', value),
              onSubmit: ({ value }) => accountFieldError('name', value)
            }}
          >
            {(field) => (
              <FormTextField
                field={field as unknown as FormFieldApi}
                submitted={form.state.isSubmitted}
                label="Name"
                required
                help={FIELD_HELP.account.name}
                autoFocus
                afterChange={() => {
                  // TanStack Form keeps a blur error until the next blur; editing clears it.
                  field.setErrorMap({ onBlur: undefined })
                }}
              />
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-3">
            <form.Field
              name="groupId"
              validators={{
                onBlur: ({ value }) => accountFieldError('groupId', value),
                onChange: ({ value }) => accountFieldError('groupId', value),
                onSubmit: ({ value }) => accountFieldError('groupId', value)
              }}
            >
              {(field) => {
                const error = field.state.meta.errors.find((entry) => Boolean(entry))
                return (
                  <Field
                    id="groupId"
                    label="Group"
                    required
                    help={FIELD_HELP.account.group}
                    error={error ? String(error) : undefined}
                  >
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        const nature = groups.find((entry) => String(entry.id) === value)
                          ?.nature as AccountType | undefined
                        field.handleChange(value)
                        field.setErrorMap({ onBlur: undefined })
                        if (nature) form.setFieldValue('type', nature)
                        void field.validate('change')
                      }}
                    >
                      <SelectTrigger
                        id="groupId"
                        className="w-full"
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? 'groupId-error' : undefined}
                        onBlur={() => {
                          field.handleBlur()
                          void field.validate('blur')
                        }}
                      >
                        <SelectValue placeholder="Choose a group" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((entry) => (
                          <SelectItem key={entry.id} value={String(entry.id)}>
                            {entry.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="type">
              {(field) => (
                <Field id="type" label="Type" help={FIELD_HELP.account.type}>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value as AccountType)}
                  >
                    <SelectTrigger id="type" className="w-full">
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
                </Field>
              )}
            </form.Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <form.Field
              name="amount"
              validators={{
                onBlur: ({ value }) => accountFieldError('amount', value),
                onChange: ({ value }) => accountFieldError('amount', value),
                onSubmit: ({ value }) => accountFieldError('amount', value)
              }}
            >
              {(field) => (
                <FormTextField
                  field={field as unknown as FormFieldApi}
                  submitted={form.state.isSubmitted}
                  label="Opening balance (INR)"
                  help={FIELD_HELP.account.openingBalance}
                  inputMode="decimal"
                  inputClassName="text-right"
                  mono
                  afterChange={() => field.setErrorMap({ onBlur: undefined })}
                />
              )}
            </form.Field>

            <form.Field name="side">
              {(field) => (
                <Field id="side" label="Side" help={FIELD_HELP.account.openingBalance}>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value as AccountSide)}
                  >
                    <SelectTrigger id="side" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DEBIT">Dr</SelectItem>
                      <SelectItem value="CREDIT">Cr</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>
          </div>

          {save.isError ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
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
  )
}
