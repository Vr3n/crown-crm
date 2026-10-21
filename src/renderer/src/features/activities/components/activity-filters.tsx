import { CalendarDays, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ACTIVITY_LABELS } from '@/features/leads/constants'
import type { ActivityTypeKey } from '@/features/leads/types'
import type { ActivityFilters, ActivityRow } from '../types'

const RANGES: { key: ActivityFilters['range']; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' }
]

const TYPES = Object.keys(ACTIVITY_LABELS) as ActivityTypeKey[]

/**
 * Audit controls: search, activity type, staff member and date range. The
 * timeline below recomputes from these. The staff options are the distinct
 * "by" names present in the audit itself.
 */
export function ActivityFilters({
  rows,
  filters,
  onChange
}: {
  rows: ActivityRow[]
  filters: ActivityFilters
  onChange: (f: ActivityFilters) => void
}): React.JSX.Element {
  const staffNames = useMemo(() => {
    const seen = new Set<string>()
    rows.forEach((r) => {
      if (r.by) seen.add(r.by)
    })
    return [...seen].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const rangeLabel = RANGES.find((r) => r.key === filters.range)?.label ?? 'All time'
  const hasActive =
    !!filters.search ||
    filters.type !== 'ALL' ||
    filters.ownerId !== 'ALL' ||
    filters.range !== 'all'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search lead or note…"
          className="pl-8"
        />
      </div>

      <Select
        value={filters.type}
        onValueChange={(v) => onChange({ ...filters, type: v as ActivityTypeKey | 'ALL' })}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All types</SelectItem>
          {TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {ACTIVITY_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.ownerId} onValueChange={(v) => onChange({ ...filters, ownerId: v })}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Staff" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All staff</SelectItem>
          {staffNames.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <CalendarDays className="size-4" />
            {rangeLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            <SlidersHorizontal className="size-3" /> Date range
          </p>
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => onChange({ ...filters, range: r.key })}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                filters.range === r.key ? 'bg-accent font-medium' : ''
              }`}
            >
              {r.label}
              {filters.range === r.key ? (
                <span className="size-1.5 rounded-full bg-primary" />
              ) : null}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {hasActive ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          onClick={() => onChange({ type: 'ALL', ownerId: 'ALL', range: 'all', search: '' })}
        >
          Clear
        </Button>
      ) : null}
    </div>
  )
}
