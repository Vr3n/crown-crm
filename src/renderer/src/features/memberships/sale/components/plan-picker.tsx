import { useState } from 'react'
import { ChevronsUpDown, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useAvailablePlans } from '@/features/catalog/queries'
import { formatMinor, formatRate } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { Plan } from '@/features/catalog/types'

export function PlanPicker({
  value,
  onChange,
  invalid
}: {
  value: number | null
  onChange: (plan: Plan | null) => void
  invalid?: boolean
}): React.JSX.Element {
  const { data: plans = [] } = useAvailablePlans()
  const [open, setOpen] = useState(false)
  const currency = useCurrency()

  const selected = plans.find((p) => p.id === value) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            'h-9 w-full justify-between gap-2 rounded-md px-3 text-sm font-normal',
            invalid &&
              'border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40'
          )}
        >
          {selected ? (
            <span className="truncate">{selected.name}</span>
          ) : (
            <span className="text-muted-foreground">Search a plan…</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] rounded-lg p-0"
        align="start"
      >
        <Command
          filter={(val, search) => {
            const p = plans.find((x) => String(x.id) === val)
            if (!p) return 0
            return p.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder="Search by plan name…" />
          <CommandList>
            <CommandEmpty>No plans found.</CommandEmpty>
            <CommandGroup>
              {plans.map((plan) => (
                <CommandItem
                  key={plan.id}
                  value={String(plan.id)}
                  onSelect={() => {
                    onChange(plan)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{plan.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatMinor(plan.basePriceMinor, currency)} · {plan.duration} ·{' '}
                      {formatRate(plan.taxRateBps)} tax
                    </span>
                  </span>
                  {selected?.id === plan.id ? <Package className="ml-auto size-3.5" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
