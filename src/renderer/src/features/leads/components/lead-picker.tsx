import { useMemo, useState } from 'react'
import { ChevronsUpDown, Check } from 'lucide-react'
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
import { PersonAvatar } from '@/components/person/person-avatar'
import { cn } from '@/lib/utils'
import { useLeads } from '../queries'
import { displayPhone } from '../format'
import type { Lead, StageKey } from '../types'

/**
 * Searchable lead combobox (Command + Popover). Used by the membership sale
 * form and global Schedule follow-up / Log activity dialogs to pick *who* a
 * future action belongs to before the form takes over.
 *
 * Each row shows an avatar, name, and mobile number.
 */
export function LeadPicker({
  value,
  onChange,
  excludeStage,
  excludeBlacklisted = false,
  placeholder = 'Search a lead…',
  invalid
}: {
  value: number
  onChange: (lead: Lead) => void
  excludeStage?: StageKey[]
  excludeBlacklisted?: boolean
  placeholder?: string
  invalid?: boolean
}): React.JSX.Element {
  const { data } = useLeads()
  const [open, setOpen] = useState(false)

  const leads = useMemo(() => {
    const all = data ?? []
    return all.filter((l) => {
      if (excludeBlacklisted && l.isBlacklisted) return false
      if (excludeStage?.length && excludeStage.includes(l.stage)) return false
      return true
    })
  }, [data, excludeStage, excludeBlacklisted])

  const selected = leads.find((l) => l.id === value)

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
            const l = leads.find((x) => String(x.id) === val)
            if (!l) return 0
            const haystack = `${l.name} ${l.phone ?? ''}`.toLowerCase()
            return haystack.includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder="Search by name or phone…" />
          <CommandList>
            <CommandEmpty>No leads found.</CommandEmpty>
            <CommandGroup>
              {leads.map((lead) => (
                <CommandItem
                  key={lead.id}
                  value={String(lead.id)}
                  onSelect={() => {
                    onChange(lead)
                    setOpen(false)
                  }}
                >
                  <PersonAvatar
                    personId={lead.personId}
                    name={lead.name}
                    size="sm"
                    editable={false}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{lead.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {displayPhone(lead.phone)}
                    </span>
                  </span>
                  {selected?.id === lead.id ? (
                    <Check className="ml-auto size-4 shrink-0 text-muted-foreground" />
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
