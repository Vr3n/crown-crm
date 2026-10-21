import { useState, useMemo } from 'react'
import { ChevronsUpDown, BadgePercent } from 'lucide-react'
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
import { useOffers } from '@/features/catalog/queries'
import type { Offer } from '@/features/catalog/types'

export function OfferPicker({
  value,
  onChange,
  planId,
  invalid
}: {
  value: number | null
  onChange: (offer: Offer | null) => void
  planId?: number | null
  invalid?: boolean
}): React.JSX.Element {
  const { data: offers = [] } = useOffers()
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const sellable = offers.filter(
      (o) => o.isActive && o.startDate <= today && (o.endDate === null || o.endDate >= today)
    )
    if (!planId) return sellable
    return sellable.filter(
      (o) => o.applicablePlanIds.length === 0 || o.applicablePlanIds.includes(planId)
    )
  }, [offers, planId])

  const selected =
    filtered.find((o) => o.id === value) ?? offers.find((o) => o.id === value) ?? null

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
            <span className="text-muted-foreground">Search an offer…</span>
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
            const o = filtered.find((x) => String(x.id) === val)
            if (!o) return 0
            return o.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder="Search by offer name…" />
          <CommandList>
            <CommandEmpty>No offers found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((offer) => (
                <CommandItem
                  key={offer.id}
                  value={String(offer.id)}
                  onSelect={() => {
                    onChange(offer)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{offer.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {offer.discountType} · {offer.value}
                      {offer.discountType === 'PERCENTAGE'
                        ? '%'
                        : offer.discountType === 'FREE_PERIOD'
                          ? ' months'
                          : ''}
                    </span>
                  </span>
                  {selected?.id === offer.id ? <BadgePercent className="ml-auto size-3.5" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
