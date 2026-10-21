import { startOfMonth, startOfYear } from 'date-fns'
import type { DateRange } from 'react-day-picker'
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
import { DateRangePicker } from '@/features/dashboard/components/date-range-picker'
import { DISCOUNT_TYPES, OFFER_LIFECYCLES } from '../constants'
import type { DiscountType, OfferLifecycle } from '../types'

const now = new Date()
const DATE_PRESETS = [
  { label: 'This month', from: startOfMonth(now), to: now },
  { label: 'This year', from: startOfYear(now), to: now },
  { label: 'All time', from: undefined, to: undefined }
]

export interface OfferFiltersState {
  search: string
  lifecycle: 'ALL' | OfferLifecycle
  discountType: 'ALL' | DiscountType
  dateRange: DateRange | undefined
}

/**
 * Filter bar for the offers list: free-text search plus lifecycle, discount type
 * and date-range selects so the list can be narrowed precisely.
 */
export function OfferFilters({
  filters,
  onChange
}: {
  filters: OfferFiltersState
  onChange: (f: OfferFiltersState) => void
}): React.JSX.Element {
  const hasActive =
    !!filters.search ||
    filters.lifecycle !== 'ALL' ||
    filters.discountType !== 'ALL' ||
    !!filters.dateRange?.from ||
    !!filters.dateRange?.to

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search offers or codes…"
          className="pl-8"
        />
      </div>

      <Select
        value={filters.lifecycle}
        onValueChange={(v) =>
          onChange({ ...filters, lifecycle: v as OfferFiltersState['lifecycle'] })
        }
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Lifecycle" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All offers</SelectItem>
          {OFFER_LIFECYCLES.map((l) => (
            <SelectItem key={l.value} value={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.discountType}
        onValueChange={(v) =>
          onChange({ ...filters, discountType: v as OfferFiltersState['discountType'] })
        }
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Discount type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All types</SelectItem>
          {DISCOUNT_TYPES.map((d) => (
            <SelectItem key={d.value} value={d.value}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DateRangePicker
        presets={DATE_PRESETS}
        value={filters.dateRange}
        onValueChange={(range) => onChange({ ...filters, dateRange: range })}
        placeholder="Date range"
      />

      {hasActive ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          onClick={() =>
            onChange({ search: '', lifecycle: 'ALL', discountType: 'ALL', dateRange: undefined })
          }
        >
          Clear
        </Button>
      ) : null}
    </div>
  )
}
