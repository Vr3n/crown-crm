import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const startOfToday = (): Date => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Single-date picker for the daily collection report (Module 09 §63). The day
 * IS the report unit here, so the trigger always shows one date with the
 * weekday. Today / Yesterday are quick presets alongside the calendar.
 */
export function CollectionDatePicker({
  value,
  onValueChange
}: {
  value: Date
  onValueChange: (day: Date) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

  const today = startOfToday()
  const yesterday = new Date(today.getTime() - 86400000)
  const isToday = value.getTime() === today.getTime()
  const isYesterday = value.getTime() === yesterday.getTime()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-48 justify-start gap-2 rounded-md px-3 text-xs shadow-sm"
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="capitalize tabular-nums">
            {isToday ? 'Today' : isYesterday ? 'Yesterday' : format(value, 'EEE, d MMM yyyy')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-lg p-0" align="start" sideOffset={6}>
        <Calendar
          mode="single"
          selected={value}
          onSelect={(day) => {
            if (day) onValueChange(day)
            setOpen(false)
          }}
          defaultMonth={value}
          className="w-72"
        />
        <div className="flex gap-1 border-t p-2">
          <Button
            variant="ghost"
            size="xs"
            className={cn('rounded-md px-2', isToday && 'bg-accent text-accent-foreground')}
            onClick={() => {
              onValueChange(today)
              setOpen(false)
            }}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className={cn('rounded-md px-2', isYesterday && 'bg-accent text-accent-foreground')}
            onClick={() => {
              onValueChange(yesterday)
              setOpen(false)
            }}
          >
            Yesterday
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
