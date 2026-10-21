import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface DateRangePreset {
  label: string
  from?: Date
  to?: Date
}

/**
 * shadcn date-range picker (Popover + Calendar `mode="range"`) with quick
 * preset buttons. Used to filter the dashboard tables by their primary date.
 * The trigger shows the selected range (abbreviated months) or a placeholder.
 */
export function DateRangePicker({
  presets,
  value,
  onValueChange,
  placeholder = 'Date range'
}: {
  presets: DateRangePreset[]
  value: DateRange | undefined
  onValueChange: (range: DateRange | undefined) => void
  placeholder?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

  const activePreset = presets.find(
    (p) => p.from?.getTime() === value?.from?.getTime() && p.to?.getTime() === value?.to?.getTime()
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-48 justify-start gap-2 rounded-md px-3 text-xs shadow-sm"
          data-empty={!value?.from}
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          {value?.from && value.to ? (
            <span className="tabular-nums">
              {format(value.from, 'd MMM')} – {format(value.to, 'd MMM')}
            </span>
          ) : value?.from ? (
            <span className="tabular-nums">
              {format(value.from, 'd MMM')} – {format(new Date(), 'd MMM')}
            </span>
          ) : value?.to ? (
            <span className="tabular-nums">Until {format(value.to, 'd MMM')}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-lg p-0" align="start" sideOffset={6}>
        <Calendar
          mode="range"
          selected={value}
          onSelect={(range) => onValueChange(range)}
          numberOfMonths={1}
          className="w-72"
        />
        <div className="flex flex-wrap gap-1 border-t p-2">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="xs"
              className={cn(
                'rounded-md px-2',
                activePreset?.label === preset.label && 'bg-accent text-accent-foreground'
              )}
              onClick={() => {
                onValueChange(
                  preset.from || preset.to ? { from: preset.from, to: preset.to } : undefined
                )
                setOpen(false)
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
