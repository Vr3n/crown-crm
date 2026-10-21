import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { MEMBERSHIP_STATUS, PLAN_NAMES } from '@/features/customers/constants'
import { PERSON_STATUS_OPTIONS } from '@/features/people/person-status'
import type { MembershipStatus } from '@/features/customers/types'
import type { MembershipFilters } from '../types'

const STATUS_KEYS = Object.keys(MEMBERSHIP_STATUS) as MembershipStatus[]

/**
 * Filter bar for the memberships list: free-text search plus status and plan
 * selects. Mirrors the customer directory bar.
 */
export function MembershipFilters({
  filters,
  onChange
}: {
  filters: MembershipFilters
  onChange: (f: MembershipFilters) => void
}): React.JSX.Element {
  const hasActive =
    !!filters.search || filters.status !== 'ALL' || filters.personStatus !== 'ALL' || filters.plan !== 'ALL'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search member, ID or plan…"
          className="pl-8"
        />
      </div>

      <Select
        value={filters.status}
        onValueChange={(v) => onChange({ ...filters, status: v as MembershipStatus | 'ALL' })}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All statuses</SelectItem>
          {STATUS_KEYS.map((s) => (
            <SelectItem key={s} value={s}>
              {MEMBERSHIP_STATUS[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.personStatus}
        onValueChange={(v) =>
          onChange({ ...filters, personStatus: v as MembershipFilters['personStatus'] })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Person state" />
        </SelectTrigger>
        <SelectContent>
          {PERSON_STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.plan} onValueChange={(v) => onChange({ ...filters, plan: v })}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All plans</SelectItem>
          {PLAN_NAMES.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActive ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          onClick={() => onChange({ search: '', status: 'ALL', personStatus: 'ALL', plan: 'ALL' })}
        >
          Clear
        </Button>
      ) : null}
    </div>
  )
}
