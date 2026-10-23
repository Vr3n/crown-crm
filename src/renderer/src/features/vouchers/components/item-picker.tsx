import { Check, ChevronsUpDown } from 'lucide-react'
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
import { formatMinor } from '@/lib/money'
import type { ItemRow } from '../../../../../shared/contracts/masters'

/**
 * Per-line item picker. Selecting an item fills description, HSN, unit, rate
 * and GST. Leaving the line empty keeps it as free text.
 */
export function ItemPicker({
  items,
  value,
  sale,
  onSelect
}: {
  items: ItemRow[]
  value: number | null
  sale: boolean
  onSelect: (item: ItemRow | null) => void
}): React.JSX.Element {
  const selected = items.find((item) => item.id === value) ?? null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          className={cn(
            'flex h-9 w-full items-center gap-1 border-0 bg-transparent px-2 text-left text-[0.875rem] outline-none',
            'hover:bg-accent-soft/50 focus-visible:bg-accent-soft/60'
          )}
          aria-label={selected ? `Item ${selected.name}` : 'Choose item or use free text'}
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              selected ? 'text-foreground' : 'text-muted-foreground/70'
            )}
          >
            {selected ? selected.name : 'Choose item'}
          </span>
          <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <Command>
          <CommandInput autoFocus placeholder="Search item name, SKU or HSN" className="h-9" />
          <CommandList>
            <CommandEmpty>
              <div className="px-3 py-4 text-center text-[0.875rem] text-muted-foreground">
                No item matches. Type the description instead.
              </div>
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="free text none"
                onSelect={() => onSelect(null)}
                className="flex items-center gap-2"
              >
                <Check className={cn('size-3.5', value === null ? 'opacity-100' : 'opacity-0')} />
                <span className="text-[0.875rem]">Free text line</span>
              </CommandItem>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.sku ?? ''} ${item.hsnSac ?? ''}`}
                  onSelect={() => onSelect(item)}
                  className="flex items-start gap-2 py-2"
                >
                  <Check
                    className={cn(
                      'mt-0.5 size-3.5 shrink-0',
                      item.id === value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-medium">{item.name}</span>
                    <span className="block truncate font-mono text-[0.6875rem] text-muted-foreground">
                      {(sale ? item.salePriceMinor : item.purchasePriceMinor) === 0
                        ? 'No default price'
                        : formatMinor(sale ? item.salePriceMinor : item.purchasePriceMinor, 'INR')}
                      {item.uom ? ` · ${item.uom}` : ''}
                      {item.hsnSac ? ` · ${item.hsnSac}` : ''}
                      {` · GST ${item.gstRateBps / 100}%`}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
