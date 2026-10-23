import type { Ref } from 'react'
import { Check, ChevronsUpDown, Search, UserRound } from 'lucide-react'
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
import type { PartyRow } from '../../../../../shared/contracts/masters'

/**
 * Visible party picker for a voucher header. The previous native select was
 * borderless and read as plain text, so users never discovered it. This control
 * looks tappable, opens on click or F4, and searches name, phone and GSTIN.
 */
export function PartyPicker({
  parties,
  value,
  onChange,
  roleLabel,
  open,
  onOpenChange,
  triggerRef
}: {
  parties: PartyRow[]
  value: number | null
  onChange: (id: number | null) => void
  roleLabel: 'customer' | 'supplier'
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerRef?: Ref<HTMLButtonElement>
}): React.JSX.Element {
  const selected = parties.find((party) => party.id === value) ?? null

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={`Select ${roleLabel}`}
          className={cn(
            'flex min-h-11 w-full items-center gap-2.5 border px-3 py-2 text-left transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            selected
              ? 'border-rule-strong bg-card'
              : 'border-dashed border-rule-strong bg-muted/40 hover:border-primary hover:bg-accent-soft/40'
          )}
        >
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center',
              selected ? 'bg-accent-soft text-primary' : 'bg-card text-muted-foreground'
            )}
          >
            <UserRound className="size-3.5" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            {selected ? (
              <>
                <span className="block truncate text-[0.9375rem] font-medium">{selected.name}</span>
                <span className="block truncate font-mono text-[0.6875rem] text-muted-foreground">
                  Balance {formatMinor(selected.balanceMinor, 'INR')} · {selected.creditDays} days
                  {selected.gstin ? ` · ${selected.gstin}` : ''}
                </span>
              </>
            ) : (
              <>
                <span className="block text-[0.9375rem] font-medium text-foreground">
                  Select {roleLabel}
                </span>
                <span className="block text-[0.75rem] text-muted-foreground">
                  Search by name, phone or GSTIN
                </span>
              </>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-[320px] p-0">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <div className="flex items-center border-b border-border px-2">
            <Search className="size-3.5 text-muted-foreground" />
            <CommandInput
              autoFocus
              placeholder={`Search ${roleLabel}s`}
              className="h-9 border-0 focus:ring-0"
            />
          </div>
          <CommandList>
            <CommandEmpty>
              <div className="px-3 py-4 text-center text-[0.875rem] text-muted-foreground">
                No {roleLabel} matches. Add one from Parties first.
              </div>
            </CommandEmpty>
            <CommandGroup>
              {parties.map((party) => (
                <CommandItem
                  key={party.id}
                  value={`${party.name} ${party.phone ?? ''} ${party.gstin ?? ''}`}
                  onSelect={() => {
                    onChange(party.id)
                    onOpenChange(false)
                  }}
                  className="flex items-start gap-2 py-2"
                >
                  <Check
                    className={cn(
                      'mt-0.5 size-3.5 shrink-0',
                      party.id === value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-medium">{party.name}</span>
                    <span className="block truncate font-mono text-[0.6875rem] text-muted-foreground">
                      {formatMinor(party.balanceMinor, 'INR')} · {party.creditDays}d
                      {party.gstin ? ` · ${party.gstin}` : ''}
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
