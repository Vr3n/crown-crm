import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Day-level date picker for offer windows, emitting `yyyy-MM-dd`. A Calendar
 * popover in the blocky 0-radius language — day-scoped unlike DateTimePicker.
 */
export function CatalogDatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  clearable = false,
  triggerClassName,
  testId
}: {
  value: string
  onChange: (date: string) => void
  placeholder?: string
  clearable?: boolean
  triggerClassName?: string
  /** Optional data-testid for the trigger (E2E only, no visual effect). */
  testId?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

  const parsed = value ? new Date(`${value}T00:00:00`) : null
  const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid={testId}
          className={cn(
            'h-9 w-full justify-start gap-2 rounded-md px-3 text-sm font-normal',
            !valid && 'text-muted-foreground',
            triggerClassName
          )}
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          {valid ? (
            <span className="tabular-nums">{format(valid, 'EEE, d MMM yyyy')}</span>
          ) : (
            placeholder
          )}
          {clearable && valid ? (
            <span
              role="button"
              tabIndex={0}
              className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
              }}
            >
              ✕
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-lg p-0" align="start" sideOffset={6}>
        <Calendar
          mode="single"
          selected={valid ?? undefined}
          defaultMonth={valid ?? undefined}
          onSelect={(day) => {
            if (day) {
              onChange(format(day, 'yyyy-MM-dd'))
              setOpen(false)
            }
          }}
          className="w-72"
        />
      </PopoverContent>
    </Popover>
  )
}
