import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '@/components/ui/command'
import { can, useSession } from '@/context/session-context'
import { visibleGroups, type NavItem } from '@/lib/navigation'

/**
 * Global command palette (Ctrl/Cmd+K). Surfaces every nav destination the user
 * is allowed to see, plus a stub for the people-search (Module 09 §69) that will
 * index name / phone / email / membership id / invoice number when the read model
 * exists.
 */
export function CommandMenu({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const session = useSession()

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open, onOpenChange])

  const groups = visibleGroups(session.permissions, session.isSuper, can)

  const run = (item: NavItem): void => {
    onOpenChange(false)
    navigate(item.to)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Quick navigation">
      <CommandInput placeholder="Jump to a module, or search by name / phone…" />
      <CommandList>
        <CommandEmpty>No matching module.</CommandEmpty>

        {groups.map((group, gi) => (
          <div key={group.id}>
            <CommandGroup heading={group.label}>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.to}
                    value={`${group.label ?? ''} ${item.label}`}
                    onSelect={() => run(item)}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {gi < groups.length - 1 ? <CommandSeparator /> : null}
          </div>
        ))}

        <CommandSeparator />
        <CommandGroup heading="People">
          <CommandItem disabled>
            <Search className="size-4" />
            <span>Search customers, leads, invoices…</span>
            <CommandShortcut>coming soon</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CornerDownLeft className="size-3" /> Enter to open
        </span>
        <span>Esc to close</span>
      </div>
    </CommandDialog>
  )
}
