import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Contact,
  FileText,
  History,
  Landmark,
  Package,
  SearchX
} from 'lucide-react'
import { can, useSession } from '@/context/session-context'
import { NAV_GROUPS } from '@/lib/navigation'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import type { SearchKind, SearchResult } from '../../../../../shared/contracts/search'
import {
  clearRecents,
  readRecents,
  rememberRecent,
  type RecentKind,
  type RecentSearch
} from '../recent-searches'

interface PageCommand {
  path: string
  label: string
  group: string
  icon: LucideIcon
}

const KIND_ICON: Record<RecentKind, LucideIcon> = {
  PARTY: Contact,
  ITEM: Package,
  VOUCHER: FileText,
  ACCOUNT: Landmark,
  PAGE: ArrowUpRight
}

const KIND_CLASS: Record<RecentKind, string> = {
  PARTY: 'text-primary',
  ITEM: 'text-success',
  VOUCHER: 'text-stamp',
  ACCOUNT: 'text-warning',
  PAGE: 'text-muted-foreground'
}

function pathFor(kind: SearchKind, id: number): string {
  if (kind === 'PARTY') return `/parties/${id}`
  if (kind === 'ITEM') return `/items/${id}`
  if (kind === 'VOUCHER') return `/vouchers/${id}`
  return `/masters/accounts?account=${id}`
}

function toRecent(result: SearchResult): RecentSearch {
  return {
    key: `${result.kind}-${result.id}`,
    kind: result.kind,
    title: result.title,
    subtitle: result.subtitle,
    path: pathFor(result.kind, result.id)
  }
}

function ResultIcon({ kind }: { kind: RecentKind }): React.JSX.Element {
  const Icon = KIND_ICON[kind]
  return <Icon className={cn('size-3.5', KIND_CLASS[kind])} strokeWidth={1.75} />
}

/**
 * The keyboard-first search surface. Results come from the main process, so
 * company scope and role permissions are enforced before a row reaches the UI.
 */
export function GlobalSearch({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const session = useSession()
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), 160)
  const [recents, setRecents] = useState<RecentSearch[]>(() => readRecents(window.localStorage))

  const results = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => window.api.search.query({ query: debounced }),
    enabled: open && debounced.length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData
  })

  const pages: PageCommand[] = NAV_GROUPS.flatMap((group) =>
    group.items
      .filter((item) => can(session.permissions, session.isSuper, item.requires))
      .map((item) => ({
        path: item.to,
        label: item.label,
        group: group.label ?? 'Home',
        icon: item.icon
      }))
  )

  const pageMatches = query.trim()
    ? pages
        .filter((page) => page.label.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 4)
    : pages.filter((page) => page.path !== '/').slice(0, 6)

  const groups = results.data?.groups ?? []
  const hasResults = groups.length > 0 || pageMatches.length > 0
  const searching = debounced.length > 0 && results.isFetching && !results.data

  function go(entry: RecentSearch): void {
    setRecents(rememberRecent(window.localStorage, entry))
    onOpenChange(false)
    navigate(entry.path)
  }

  function goPage(page: PageCommand): void {
    go({
      key: `page-${page.path}`,
      kind: 'PAGE',
      title: page.label,
      subtitle: page.group,
      path: page.path
    })
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search Crown Books"
      description="Find a party, item, voucher, account or screen."
      shouldFilter={false}
      className="sm:max-w-[620px]"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search parties, items, vouchers and accounts"
        aria-label="Search parties, items, vouchers and accounts"
        autoFocus
      />

      <CommandList>
        {searching ? (
          <CommandGroup heading="Searching">
            <CommandItem disabled value="searching">
              Looking through the books...
            </CommandItem>
          </CommandGroup>
        ) : null}

        {!query.trim() && recents.length > 0 ? (
          <>
            <CommandGroup heading="Recent">
              {recents.map((entry) => (
                <CommandItem
                  key={`recent-${entry.key}`}
                  value={`recent-${entry.key}`}
                  onSelect={() => go(entry)}
                >
                  <History className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  <span className="max-w-40 truncate text-[0.75rem] text-muted-foreground">
                    {entry.subtitle}
                  </span>
                </CommandItem>
              ))}
              <CommandItem
                value="clear-recent-searches"
                onSelect={() => {
                  clearRecents(window.localStorage)
                  setRecents([])
                }}
                className="text-muted-foreground"
              >
                Clear recent searches
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        {groups.map((group) => (
          <CommandGroup key={group.kind} heading={group.label}>
            {group.items.map((result) => (
              <CommandItem
                key={`${group.kind}-${result.id}`}
                value={`${group.kind}-${result.id}`}
                onSelect={() => go(toRecent(result))}
              >
                <ResultIcon kind={result.kind} />
                <span className="min-w-0 flex-1 truncate">{result.title}</span>
                <span className="max-w-48 truncate text-[0.75rem] text-muted-foreground">
                  {result.subtitle}
                </span>
                <span className="ml-2 shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                  {result.meta}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {pageMatches.length > 0 ? (
          <>
            {groups.length > 0 ? <CommandSeparator /> : null}
            <CommandGroup heading={query.trim() ? 'Screens' : 'Go to'}>
              {pageMatches.map((page) => {
                const Icon = page.icon
                return (
                  <CommandItem
                    key={`page-${page.path}`}
                    value={`page-${page.path}`}
                    onSelect={() => goPage(page)}
                  >
                    <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 truncate">{page.label}</span>
                    <span className="text-[0.75rem] text-muted-foreground">{page.group}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        ) : null}

        {!searching && !hasResults ? (
          <CommandEmpty>
            <SearchX className="mx-auto mb-2 size-5 text-muted-foreground" strokeWidth={1.5} />
            <span className="block text-[0.875rem] font-medium">No matches</span>
            <span className="mt-0.5 block text-[0.75rem] text-muted-foreground">
              Try a name, phone number, SKU, HSN or voucher number.
            </span>
          </CommandEmpty>
        ) : null}

        {results.isError ? (
          <CommandGroup heading="Search unavailable">
            <CommandItem disabled value="search-error">
              Could not search the books. Try again.
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>

      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[0.6875rem] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span>
            <kbd className="border border-border bg-muted px-1 font-mono">↑</kbd>{' '}
            <kbd className="border border-border bg-muted px-1 font-mono">↓</kbd> move
          </span>
          <span>
            <kbd className="border border-border bg-muted px-1 font-mono">Enter</kbd> open
          </span>
        </span>
        <span>
          <kbd className="border border-border bg-muted px-1 font-mono">Esc</kbd> close
        </span>
      </div>
    </CommandDialog>
  )
}
