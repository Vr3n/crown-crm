import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { formatMinor } from '@/lib/money'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type { PartyRole, PartyRow } from '../../../../../shared/contracts/masters'
import { PartyDialog } from '../components/party-dialog'

const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-9 border-b border-border px-3 align-middle'
const TAG = 'rounded-none px-1.5 py-0 text-[0.6875rem] uppercase tracking-[0.08em]'
const ROLES: { value: PartyRole; label: string }[] = [
  { value: 'BOTH', label: 'All' },
  { value: 'CUSTOMER', label: 'Customers' },
  { value: 'SUPPLIER', label: 'Suppliers' }
]

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

export function PartiesPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search, 250)
  const [role, setRole] = useState<PartyRole>('BOTH')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PartyRow | null>(null)
  const [target, setTarget] = useState<PartyRow | null>(null)

  const list = useQuery({
    queryKey: ['parties', query, role, includeInactive],
    queryFn: () =>
      window.api.parties.list({ query: query.trim() || undefined, role, includeInactive })
  })
  const rows = list.data ?? []
  const filtered = query.trim().length > 0 || role !== 'BOTH'

  const deactivate = useMutation({
    mutationFn: (id: number) => window.api.parties.deactivate(id),
    onSuccess: () => {
      toast.success('Party deactivated')
      void queryClient.invalidateQueries({ queryKey: ['parties'] })
      setTarget(null)
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not deactivate the party'))
  })

  function show(next: PartyRow | null): void {
    setEditing(next)
    setOpen(true)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-6">
      <PageHeader
        title="Parties"
        description={`${rows.length} ${rows.length === 1 ? 'party' : 'parties'}${filtered ? ' in this view' : ' on file'}`}
        actions={
          <Button size="sm" onClick={() => show(null)}>
            <Plus className="size-3.5" strokeWidth={2} />
            New party
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="party-search"
            aria-label="Search parties"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone or GSTIN"
            className="h-8 border-0 bg-transparent pl-8 text-[0.9375rem] focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <div className="flex items-center" role="group" aria-label="Filter by role">
          {ROLES.map((option, index) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={role === option.value}
              onClick={() => setRole(option.value)}
              className={`h-8 border border-border px-2.5 text-[0.875rem] transition-colors ${index > 0 ? '-ml-px' : ''} ${
                role === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label
          htmlFor="party-inactive"
          className="flex cursor-pointer items-center gap-1.5 pl-1 text-[0.875rem] text-muted-foreground"
        >
          <Checkbox
            id="party-inactive"
            checked={includeInactive}
            onCheckedChange={(checked) => setIncludeInactive(checked === true)}
          />
          Show inactive
        </label>
      </div>

      {list.isError ? (
        <div className="border border-border bg-card px-4 py-8 text-center">
          <p className="text-[0.9375rem] font-medium">Could not load parties</p>
          <p className="mt-1 text-[0.875rem] text-muted-foreground">
            {errorMessage(list.error, 'Try again in a moment.')}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 && !list.isPending ? (
        <EmptyState
          icon={Users}
          title={filtered ? 'No parties match' : 'No parties yet'}
          description={
            filtered
              ? 'Clear the search or switch the role filter to see more.'
              : 'Add the customers and suppliers you trade with, with their credit terms.'
          }
          action={
            filtered ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setRole('BOTH')
                  setIncludeInactive(false)
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={() => show(null)}>
                <Plus className="size-3.5" strokeWidth={2} />
                New party
              </Button>
            )
          }
        />
      ) : (
        <div className="max-h-[calc(100vh-15.5rem)] overflow-auto border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Name', 'Phone', 'Type', 'Credit days', 'Balance', 'Status'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className={`${TH} ${['Credit days', 'Balance'].includes(heading) ? 'text-right' : ''}`}
                  >
                    {heading}
                  </th>
                ))}
                <th scope="col" className={`${TH} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.isPending ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-[0.875rem] text-muted-foreground"
                  >
                    Loading parties...
                  </td>
                </tr>
              ) : (
                rows.map((party) => (
                  <tr key={party.id} className="hover:bg-muted/40">
                    <td className={TD}>
                      <div className="text-[0.9375rem] font-medium">{party.name}</div>
                      {party.gstin ? (
                        <div className="font-mono text-[0.6875rem] text-muted-foreground">
                          {party.gstin}
                        </div>
                      ) : null}
                    </td>
                    <td className={`${TD} font-mono text-[0.875rem] text-muted-foreground`}>
                      {party.phone ?? '--'}
                    </td>
                    <td className={TD}>
                      <div className="flex gap-1">
                        {party.isCustomer ? (
                          <Badge variant="outline" className={TAG}>
                            Customer
                          </Badge>
                        ) : null}
                        {party.isSupplier ? (
                          <Badge variant="outline" className={TAG}>
                            Supplier
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${TD} text-right font-mono text-[0.875rem] tabular-nums`}>
                      {party.creditDays}
                    </td>
                    <td className={`${TD} text-right`}>
                      <Balance minor={party.balanceMinor} />
                    </td>
                    <td className={TD}>
                      <Badge variant={party.isActive ? 'success' : 'outline'} className={TAG}>
                        {party.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="xs" onClick={() => show(party)}>
                          Edit
                        </Button>
                        {party.isActive ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setTarget(party)}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <PartyDialog
          open={open}
          onOpenChange={setOpen}
          party={editing}
          onSaved={() => setOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(next) => {
          if (!next && !deactivate.isPending) setTarget(null)
        }}
        title="Deactivate this party?"
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
