import { Building2 } from 'lucide-react'
import type { PartyRow } from '@shared/contracts/masters'
import { partyKey } from '@shared/excel-import/plan'
import type {
  ImportPlan,
  ImportTarget,
  PartyResolution,
  PartyResolutionMap
} from '@shared/excel-import/types'

interface PartyGroup {
  key: string
  name: string
  gstin: string | null
  billCount: number
  rowNumbers: number[]
  action: 'matched' | 'create' | 'unresolved'
  partyId: number | null
}

function groupsFor(plan: ImportPlan): PartyGroup[] {
  const groups = new Map<string, PartyGroup>()
  for (const bill of plan.bills) {
    const key = partyKey(bill.partyName, bill.partyGstin)
    const existing = groups.get(key)
    const rows = bill.lines.map((line) => line.rowNumber)
    if (existing) {
      existing.billCount += 1
      existing.rowNumbers.push(...rows)
      if (bill.partyAction === 'unresolved') existing.action = 'unresolved'
      if (bill.partyAction === 'matched') {
        existing.action = 'matched'
        existing.partyId = bill.partyId
      }
      continue
    }
    groups.set(key, {
      key,
      name: bill.partyName,
      gstin: bill.partyGstin,
      billCount: 1,
      rowNumbers: rows,
      action: bill.partyAction,
      partyId: bill.partyId
    })
  }
  return [...groups.values()]
}

export function PartyResolutionPanel({
  plan,
  parties,
  target,
  resolutions,
  onChange
}: {
  plan: ImportPlan
  parties: PartyRow[]
  target: ImportTarget
  resolutions: PartyResolutionMap
  onChange: (key: string, resolution: PartyResolution) => void
}): React.JSX.Element | null {
  const groups = groupsFor(plan)
  if (groups.length === 0) return null
  const role = target === 'PURCHASE' ? 'supplier' : 'customer'
  const eligible = parties.filter((party) =>
    target === 'PURCHASE' ? party.isSupplier : party.isCustomer
  )
  const unresolved = groups.filter((group) => group.action === 'unresolved').length

  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent-soft/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" strokeWidth={1.75} />
          <h2 className="text-[0.9375rem] font-semibold">Parties</h2>
          <span className="text-[0.75rem] text-muted-foreground">
            {groups.length} name{groups.length === 1 ? '' : 's'}
          </span>
        </div>
        {unresolved > 0 ? (
          <span className="text-[0.75rem] font-medium text-destructive">
            {unresolved} need{unresolved === 1 ? 's' : ''} a choice
          </span>
        ) : (
          <span className="text-[0.75rem] text-success">All parties resolved</span>
        )}
      </div>

      <div className="divide-y divide-border">
        {groups.map((group) => {
          const matched = parties.find((party) => party.id === group.partyId)
          const value =
            group.action === 'matched' && group.partyId
              ? String(group.partyId)
              : group.action === 'create'
                ? 'create'
                : ''
          const rows = [...new Set(group.rowNumbers)].sort((a, b) => a - b)
          return (
            <div
              key={group.key}
              className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] md:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] font-medium">{group.name || 'No name'}</p>
                <p className="mt-0.5 font-mono text-[0.75rem] text-muted-foreground">
                  {group.gstin ? `${group.gstin} · ` : ''}
                  {group.billCount} bill{group.billCount === 1 ? '' : 's'} · row
                  {rows.length === 1 ? '' : 's'} {rows.slice(0, 6).join(', ')}
                  {rows.length > 6 ? ` +${rows.length - 6}` : ''}
                </p>
                <p className="mt-1 text-[0.75rem] text-muted-foreground">
                  {group.action === 'matched' && matched
                    ? `Matched to ${matched.name}`
                    : group.action === 'create'
                      ? `Will be created as a new ${role}`
                      : `Choose an existing ${role}, or create one`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={value}
                  onChange={(event) => {
                    const next = event.target.value
                    if (!next) return
                    if (next === 'create') {
                      onChange(group.key, { kind: 'create' })
                      return
                    }
                    onChange(group.key, { kind: 'existing', partyId: Number(next) })
                  }}
                  aria-label={`Match ${group.name} to a ${role}`}
                  className="h-9 w-full border border-input bg-background px-2 text-[0.875rem] outline-none focus:border-primary"
                >
                  <option value="">Choose a {role}</option>
                  <option value="create">Create a new {role}</option>
                  {eligible.map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.name}
                      {party.gstin ? ` · ${party.gstin}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
      </div>

      {resolutions && Object.keys(resolutions).length > 0 ? (
        <p className="border-t border-border px-4 py-2 text-[0.75rem] text-muted-foreground">
          Your choices apply to every row with the same name.
        </p>
      ) : null}
    </section>
  )
}
