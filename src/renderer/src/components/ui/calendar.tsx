'use client'

import { DayPicker } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

/**
 * Calendar (react-day-picker v10) adapted to the blocky 0-radius design
 * system: square day cells and sharp range edges instead of shadcn's default
 * `rounded-full` pills. Everything else follows the standard shadcn Calendar.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col gap-2 sm:flex-row',
        month: 'flex flex-col gap-3',
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'outline', size: 'icon-sm' }),
          'absolute left-1 top-1 size-7 rounded-none p-0 [&_svg]:opacity-50 hover:[&_svg]:opacity-100'
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline', size: 'icon-sm' }),
          'absolute right-1 top-1 size-7 rounded-none p-0 [&_svg]:opacity-50 hover:[&_svg]:opacity-100'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'flex size-9 items-center justify-center rounded-none p-0 text-xs font-medium text-muted-foreground',
        week: 'flex w-full',
        day: 'flex size-9 flex-1 items-center justify-center rounded-none p-0 text-center text-sm focus-within:relative focus:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-none [&:has([aria-selected].day-range-start)]:rounded-l-none',
        day_button: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'size-8 rounded-none p-0 font-normal aria-selected:opacity-100'
        ),
        range_start: 'day-range-start',
        range_end: 'day-range-end',
        selected:
          'bg-primary text-primary-foreground focus:bg-primary focus:text-primary-foreground aria-selected:bg-primary aria-selected:text-primary-foreground',
        today: 'bg-accent text-accent-foreground',
        outside: 'day-outside text-muted-foreground aria-selected:text-muted-foreground',
        disabled:
          'text-muted-foreground opacity-50 aria-selected:bg-muted aria-selected:text-muted-foreground',
        range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames
      }}
      {...props}
    />
  )
}

export { Calendar }
