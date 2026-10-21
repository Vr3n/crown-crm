import * as React from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Field } from '@/components/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { cn } from '@/lib/utils'

export type AutocorrectOption<TId extends string | number = string> = {
  id: TId
  label: string
  description?: string
}

export type SearchOptions<TId extends string | number = string> = (
  query: string,
  signal?: AbortSignal
) => Promise<AutocorrectOption<TId>[]>

export type CreateOption<TId extends string | number = string> = (
  label: string,
  signal?: AbortSignal
) => Promise<AutocorrectOption<TId>>

/**
 * Structural slice of the TanStack Form `FieldApi` that this component consumes.
 * Kept as a plain interface so the combobox stays a field *adapter*: it reads
 * `state.value` (the backend ID), writes through `handleChange`, and signals
 * interaction through `handleBlur`, without owning any form state itself.
 */
export interface AutocorrectFieldAdapter<TId extends string | number = string> {
  /** Field name, used to derive the hint/error element ids for `aria-describedby`. */
  name?: string
  state: {
    value: TId | null | undefined
    meta: {
      isTouched: boolean
      isValid: boolean
      errors: unknown[]
    }
  }
  handleChange: (value: TId | null) => void
  handleBlur: () => void
}

export interface AutocorrectComboboxProps<TId extends string | number = string> {
  field: AutocorrectFieldAdapter<TId>

  search: SearchOptions<TId>
  /**
   * Creates a new backend-backed option. Optional — fields that only pick from
   * an existing vocabulary (e.g. a catalog plan FK) omit it and set
   * `canCreate={false}`; the "+ Add" item is never offered then.
   */
  create?: CreateOption<TId>

  label?: React.ReactNode
  description?: string
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  minSearchLength?: number
  debounceMs?: number
  disabled?: boolean
  className?: string
  /**
   * Label for edit forms: the currently selected option loaded from the backend.
   * When omitted, the component keeps the most recently selected option in state.
   */
  selectedOption?: AutocorrectOption<TId> | null
  /**
   * Whether the caller may create a new option. When false the "+ Add" item is
   * hidden and unmatched queries fall back to the empty message (e.g. a viewer
   * who can search sources but not manage settings).
   */
  canCreate?: boolean
  /** Called with the newly created option, after the field is set and popover closed. */
  onCreated?: (option: AutocorrectOption<TId>) => void
}

const QUERY_KEY = 'autocorrect-options'
const DEFAULT_MIN_SEARCH_LENGTH = 2
const DEFAULT_DEBOUNCE_MS = 300
const SEARCH_STALE_TIME = 30_000
const SEARCH_ERROR = 'Could not search. Please try again.'
const CREATE_ERROR = 'Could not create it. Please try again.'

/**
 * Reusable autocomplete combobox for selecting or creating a backend-backed value.
 *
 * Ownership split (the doc `docs/components/shadcn-autocomplete-create.md`):
 * TanStack Form owns the selected backend ID; TanStack Query owns asynchronous
 * searching and creation. This component only manages transient UI state — the
 * open popover, the search text, and a cached display label.
 */
export function AutocorrectCombobox<TId extends string | number = string>({
  field,
  search,
  create,
  label,
  description,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to search…',
  emptyMessage = 'No results found.',
  minSearchLength = DEFAULT_MIN_SEARCH_LENGTH,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  disabled = false,
  className,
  selectedOption,
  canCreate = true,
  onCreated
}: AutocorrectComboboxProps<TId>): React.JSX.Element {
  const queryClient = useQueryClient()
  const generatedId = React.useId()
  const name = field.name ?? `autocorrect-${generatedId}`
  const commandId = `autocorrect-combobox-${generatedId}`

  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [activeValue, setActiveValue] = React.useState<string | null>(null)
  const [cachedSelected, setCachedSelected] = React.useState<AutocorrectOption<TId> | null>(null)
  const [createError, setCreateError] = React.useState<string | null>(null)
  const [navigatedQuery, setNavigatedQuery] = React.useState<string | null>(null)

  const selectedId = field.state.value
  // String-backed fields (react-form) represent "no value" as '', so empty is
  // not a selection even though it is a legal `TId`.
  const hasValue = selectedId != null && selectedId !== ''
  const displayOption = hasValue
    ? selectedOption !== undefined
      ? selectedOption
      : cachedSelected
    : null

  const trimmedQuery = query.trim()
  const debouncedQuery = useDebouncedValue(trimmedQuery, debounceMs)
  const searchable = debouncedQuery.length >= minSearchLength
  const canSearch = open && !disabled && searchable

  const searchQuery = useQuery({
    // Keyed by field name too: several comboboxes on one form must not share
    // each other's cached results for the same query string.
    queryKey: [QUERY_KEY, name, debouncedQuery] as const,
    queryFn: ({ signal }) => search(debouncedQuery, signal),
    enabled: canSearch,
    staleTime: SEARCH_STALE_TIME,
    placeholderData: keepPreviousData
  })

  const results = searchQuery.data
  const loading = searchable && searchQuery.isPending && results === undefined
  const searchError = searchQuery.isError ? SEARCH_ERROR : null

  // Only build the create path when a factory was supplied; a pick-only field
  // never renders the "+ Add" item (see `canAdd`), so the mutation stays idle.
  const createOption = create ?? (() => Promise.reject(new Error('create is not available')))
  const createMutation = useMutation({
    mutationFn: ({ label: newLabel, signal }: { label: string; signal?: AbortSignal }) =>
      createOption(newLabel, signal),
    onSuccess: (createdOption) => {
      setCachedSelected(createdOption)
      field.handleChange(createdOption.id)
      setCreateError(null)
      closePopover()
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, name] })
      onCreated?.(createdOption)
    },
    onError: () => {
      setCreateError(CREATE_ERROR)
    }
  })

  const normalizedQuery = trimmedQuery.toLocaleLowerCase()
  const hasExactMatch =
    results?.some((option) => option.label.trim().toLocaleLowerCase() === normalizedQuery) ?? false

  const querySettled = debouncedQuery === trimmedQuery
  const canAdd =
    canCreate &&
    create !== undefined &&
    open &&
    !disabled &&
    searchable &&
    trimmedQuery.length > 0 &&
    querySettled &&
    !searchQuery.isPending &&
    !searchQuery.isError &&
    !createMutation.isPending &&
    !hasExactMatch

  // cmdk only auto-highlights the first item through a multi-item registration
  // race, so a single-result search would never be highlighted (Enter would do
  // nothing). Highlight the first result of the current query by default. The
  // "+ Add" option is excluded so Enter can't create accidentally. User arrow
  // navigation overrides the default, but only for the query it happened in —
  // once the query changes the highlight falls back to the new first result.
  const autoHighlight =
    querySettled && !searchQuery.isPlaceholderData && results && results.length > 0
      ? String(results[0].id)
      : ''
  const effectiveValue =
    activeValue !== null && navigatedQuery === debouncedQuery ? activeValue : autoHighlight

  function closePopover(): void {
    setQuery('')
    setOpen(false)
    field.handleBlur()
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (nextOpen) {
      setActiveValue(null)
      setNavigatedQuery(null)
    }
    setOpen(nextOpen)
    if (!nextOpen) closePopover()
  }

  function selectOption(option: AutocorrectOption<TId>): void {
    setCachedSelected(option)
    field.handleChange(option.id)
    closePopover()
  }

  function handleCreate(): void {
    const labelToCreate = trimmedQuery
    if (!labelToCreate || createMutation.isPending) return
    setCreateError(null)
    createMutation.mutate({ label: labelToCreate })
  }

  function clearSelection(): void {
    field.handleChange(null)
    setCachedSelected(null)
    setQuery('')
    setCreateError(null)
  }

  const hasError = field.state.meta.errors.length > 0
  const describedBy = hasError ? `${name}-error` : description ? `${name}-hint` : undefined
  const commandLabel = typeof label === 'string' ? label : 'Search options'

  const statusMessage = createMutation.isPending
    ? `Adding ${trimmedQuery}`
    : loading
      ? `Searching for ${debouncedQuery}`
      : undefined

  return (
    <Field
      id={name}
      label={label}
      hint={description}
      errors={field.state.meta.errors as React.ComponentProps<typeof Field>['errors']}
      className={className}
    >
      <div className="relative">
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              id={name}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-controls={commandId}
              aria-invalid={hasError || undefined}
              aria-describedby={describedBy}
              disabled={disabled}
              className={cn(
                'w-full justify-between font-normal',
                displayOption ? '' : 'text-muted-foreground',
                hasValue && 'pr-9'
              )}
            >
              <span className="truncate">{displayOption ? displayOption.label : placeholder}</span>
              {hasValue ? null : (
                <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] max-w-[min(28rem,calc(100vw-2rem))] gap-0 p-0"
          >
            <Command
              id={commandId}
              value={effectiveValue}
              onValueChange={(value) => {
                setActiveValue(value)
                setNavigatedQuery(value ? debouncedQuery : null)
              }}
              shouldFilter={false}
              label={commandLabel}
            >
              <CommandInput
                value={query}
                onValueChange={(value) => {
                  setQuery(value)
                  setActiveValue(null)
                  setNavigatedQuery(null)
                }}
                placeholder={searchPlaceholder}
                autoFocus
                aria-invalid={hasError || undefined}
                aria-describedby={describedBy}
                disabled={disabled}
              />
              <CommandList>
                {searchError ? (
                  <div
                    role="alert"
                    className="flex items-center justify-between gap-2 px-2 py-4 text-sm text-destructive"
                  >
                    <span className="flex items-center gap-2">
                      <AlertCircle className="size-4 shrink-0" aria-hidden />
                      {searchError}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void searchQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </div>
                ) : null}

                {loading ? (
                  <div
                    role="status"
                    className="flex items-center justify-center gap-2 px-2 py-6 text-sm text-muted-foreground"
                  >
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Searching…
                  </div>
                ) : null}

                {!loading && trimmedQuery.length < minSearchLength ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    Type at least {minSearchLength} characters to search
                  </div>
                ) : null}

                {results && results.length > 0 ? (
                  <CommandGroup className={cn(searchQuery.isPlaceholderData && 'opacity-60')}>
                    {results.map((option) => (
                      <CommandItem
                        key={String(option.id)}
                        value={String(option.id)}
                        onSelect={() => selectOption(option)}
                      >
                        <Check
                          className={cn(
                            'size-4 shrink-0',
                            selectedId === option.id ? 'opacity-100' : 'opacity-0'
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{option.label}</span>
                        {option.description ? (
                          <span className="ml-auto truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}

                {canAdd ? (
                  <CommandItem
                    value={`add:${trimmedQuery}`}
                    onSelect={handleCreate}
                    disabled={createMutation.isPending}
                  >
                    <Plus className="size-4 shrink-0" aria-hidden />
                    <span>
                      Add <span className="font-medium">{trimmedQuery}</span>
                    </span>
                  </CommandItem>
                ) : null}

                {createError ? (
                  <div role="alert" className="px-2 pb-2 text-xs font-medium text-destructive">
                    {createError}
                  </div>
                ) : null}

                {!searchError &&
                !loading &&
                trimmedQuery.length >= minSearchLength &&
                !(results && results.length > 0) &&
                !canAdd ? (
                  <CommandEmpty>{emptyMessage}</CommandEmpty>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {hasValue && !disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Clear selection"
            onClick={clearSelection}
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {statusMessage}
      </p>
    </Field>
  )
}
