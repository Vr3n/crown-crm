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
import type { PlanAvailabilityFilter } from '../constants'

export interface PlanFiltersState {
  search: string
  availability: PlanAvailabilityFilter
}

/**
 * Filter bar for the plans list: free-text search plus an availability status toggle.
 */
export function PlanFilters({
  filters,
  onChange
}: {
  filters: PlanFiltersState
  onChange: (f: PlanFiltersState) => void
}): React.JSX.Element {
  const hasActive = !!filters.search || filters.availability !== 'ALL'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search plans…"
          className="pl-8"
        />
      </div>

      <Select
        value={filters.availability}
        onValueChange={(v) => onChange({ ...filters, availability: v as PlanAvailabilityFilter })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Availability" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All plans</SelectItem>
          <SelectItem value="ACTIVE">Available</SelectItem>
          <SelectItem value="UPCOMING">Upcoming</SelectItem>
          <SelectItem value="EXPIRED">Expired</SelectItem>
          <SelectItem value="INACTIVE">Inactive</SelectItem>
        </SelectContent>
      </Select>

      {hasActive ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          onClick={() => onChange({ search: '', availability: 'ALL' })}
        >
          Clear
        </Button>
      ) : null}
    </div>
  )
}
