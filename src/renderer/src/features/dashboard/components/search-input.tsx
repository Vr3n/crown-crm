import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Search input with a leading icon, sized to sit inside a table toolbar.
 * The value is intentionally immediate; the debounce that feeds it into the
 * table's global filter lives in the DataTable so filtering stays snappy.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 border-border bg-muted/50 pl-8 text-sm focus-visible:ring-primary/40"
      />
    </div>
  )
}
