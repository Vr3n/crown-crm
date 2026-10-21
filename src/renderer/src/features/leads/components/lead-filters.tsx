import { Search, SlidersHorizontal, CalendarDays } from 'lucide-react'
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
import { useMemo } from 'react'
import { STAGES } from '../constants'
import { useReferenceData } from '../reference-data'
import { PERSON_STATUS_OPTIONS } from '@/features/people/person-status'
import type { Lead, LeadFilters, StageKey } from '../types'

const RANGES: { key: LeadFilters['range']; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' }
]

const STAGE_KEYS = STAGES.map((s) => s.key)

/**
 * Filter bar for the pipeline: free-text search plus stage / source / owner
 * selects and a date-range preset. All metrics below respect these filters.
 * Source options come from the org's reference data (the same vocabulary the
 * forms use), so admin-added sources show up here too. Owner options are
 * derived from the leads themselves (there is no staff list on this page).
 */
export function LeadFilters({
  leads,
  filters,
  onChange
}: {
  leads: Lead[]
  filters: LeadFilters
  onChange: (f: LeadFilters) => void
}): React.JSX.Element {
  const { data: ref } = useReferenceData()
  const sources = useMemo(() => (ref?.sources ?? []).filter((s) => s.active), [ref])

  const owners = useMemo(() => {
    const seen = new Map<number, string>()
    leads.forEach((l) => {
      if (l.owner) seen.set(l.owner.id, l.owner.name)
    })
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [leads])

  const rangeLabel = RANGES.find((r) => r.key === filters.range)?.label ?? 'All time'
  const hasActive =
    !!filters.search ||
    filters.stage !== 'ALL' ||
    filters.sourceId !== 'ALL' ||
    filters.ownerId !== 'ALL' ||
    filters.personStatus !== 'ALL'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search name, phone, email, plan…"
          className="pl-8"
        />
      </div>

      <Select
        value={filters.stage}
        onValueChange={(v) => onChange({ ...filters, stage: v as StageKey | 'ALL' })}
      >
        <SelectTrigger className="w-40" aria-label="Stage">
          <SelectValue placeholder="Stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All stages</SelectItem>
          {STAGE_KEYS.map((s) => (
            <SelectItem key={s} value={s}>
              {STAGES.find((x) => x.key === s)!.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.sourceId === 'ALL' ? 'ALL' : String(filters.sourceId)}
        onValueChange={(v) => onChange({ ...filters, sourceId: v === 'ALL' ? 'ALL' : Number(v) })}
      >
        <SelectTrigger className="w-44" aria-label="Source">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All sources</SelectItem>
          {sources.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.ownerId === 'ALL' ? 'ALL' : String(filters.ownerId)}
        onValueChange={(v) => onChange({ ...filters, ownerId: v === 'ALL' ? 'ALL' : Number(v) })}
      >
        <SelectTrigger className="w-40" aria-label="Owner">
          <SelectValue placeholder="Owner" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All owners</SelectItem>
          {owners.map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.personStatus ?? 'ALL'}
        onValueChange={(v) => onChange({ ...filters, personStatus: v as LeadFilters['personStatus'] })}
      >
        <SelectTrigger className="w-40" aria-label="Person state">
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
                <span className="size-1.5 rounded-full bg-cyan-500" />
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
          onClick={() =>
            onChange({
              search: '',
              stage: 'ALL',
              sourceId: 'ALL',
              ownerId: 'ALL',
              personStatus: 'ALL',
              range: 'all'
            })
          }
        >
          Clear
        </Button>
      ) : null}
    </div>
  )
}
