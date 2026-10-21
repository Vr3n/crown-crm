import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

/**
 * shadcn-style table pagination: rows-per-page select + "Page X of Y" +
 * first / previous / next / last controls. First/last are hidden on small
 * widths to keep the toolbar tight.
 */
export function DataTablePagination({
  pageIndex,
  pageCount,
  pageSize,
  rowCount,
  pageSizeOptions,
  onPageSizeChange,
  onPageIndexChange,
  canPrevious,
  canNext
}: {
  pageIndex: number
  pageCount: number
  pageSize: number
  rowCount: number
  pageSizeOptions: number[]
  onPageSizeChange: (size: number) => void
  onPageIndexChange: (index: number) => void
  canPrevious: boolean
  canNext: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="hidden sm:inline">Rows per page</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger size="sm" className="h-7 w-fit gap-1 rounded-md px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" className="min-w-24">
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
        <span className="hidden sm:inline">{rowCount} results</span>
        <span>
          Page {pageIndex + 1} of {Math.max(pageCount, 1)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          className="hidden size-7 rounded-md lg:inline-flex"
          aria-label="First page"
          disabled={!canPrevious}
          onClick={() => onPageIndexChange(0)}
        >
          <ChevronsLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          className="size-7 rounded-md"
          aria-label="Previous page"
          disabled={!canPrevious}
          onClick={() => onPageIndexChange(pageIndex - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          className="size-7 rounded-md"
          aria-label="Next page"
          disabled={!canNext}
          onClick={() => onPageIndexChange(pageIndex + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          className="hidden size-7 rounded-md lg:inline-flex"
          aria-label="Last page"
          disabled={!canNext}
          onClick={() => onPageIndexChange(pageCount - 1)}
        >
          <ChevronsRight />
        </Button>
      </div>
    </div>
  )
}
