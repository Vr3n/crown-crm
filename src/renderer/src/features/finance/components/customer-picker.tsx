import { useState } from 'react'
import { ChevronsUpDown, UserRound } from 'lucide-react'
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
import { displayPhone } from '@/features/leads/format'
import { useCustomers } from '../queries'
import type { PersonRef } from '@/features/dashboard/types'

/**
 * Searchable customer combobox (Command + Popover). Used by the finance dialogs
 * to pick *who* money is recorded against before the form takes over. Shows the
 * name and phone per customer, mirroring the leads picker.
 *
 * Custom `filter` matches against name + phone so typing "Rahul" or "9876"
 * finds the right row — cmdk's default filter only matches the `value` prop
 * (which is the customer ID string).
 */
export function CustomerPicker({
  value,
  onChange,
  placeholder = 'Search a customer…'
}: {
  value: string
  onChange: (customer: PersonRef) => void
  placeholder?: string
}): React.JSX.Element {
  const { data } = useCustomers()
  const [open, setOpen] = useState(false)

  const customers = data ?? []
  const selected = customers.find((c) => c.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between gap-2 rounded-md px-3 text-sm font-normal"
        >
          {selected ? (
            <span className="truncate">{selected.name}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
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
            const c = customers.find((x) => String(x.id) === val)
            if (!c) return 0
            const haystack = `${c.name} ${c.phone ?? ''}`.toLowerCase()
            return haystack.includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder="Search by name or phone…" />
          <CommandList>
            <CommandEmpty>No customers found.</CommandEmpty>
            <CommandGroup>
              {customers.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={String(customer.id)}
                  onSelect={() => {
                    onChange(customer)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{customer.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {displayPhone(customer.phone)}
                    </span>
                  </span>
                  {selected?.id === customer.id ? (
                    <UserRound className="ml-auto size-3.5 shrink-0" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
