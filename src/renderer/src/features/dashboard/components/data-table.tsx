import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Inbox, X } from 'lucide-react'
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  rowPaginationFeature,
  globalFilteringFeature,
  columnFilteringFeature,
  rowSelectionFeature,
  createSortedRowModel,
  createPaginatedRowModel,
  createFilteredRowModel,
  createColumnHelper,
  sortFns,
  filterFns,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
  type SortingState
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/utils'
import type { DataTablePaginationState } from './data-table-shared'
import { SearchInput } from './search-input'
import { useDebouncedValue } from './use-debounced-value'
import { DataTablePagination } from './data-table-pagination'
import { type DataTableColumnMeta, DataTableContext } from './data-table-shared'

export type { DataTableColumnMeta } from './data-table-shared'

/**
 * TanStack Table v9 (feature-based) data table wired for the dashboard cards:
 * sortable headers, a debounced global search, client-side pagination and a
 * skeleton loading state. The date-range filter is applied upstream in the
 * card (the data passed in is already range-filtered), so this component stays
 * generic and reusable.
 *
 * Column definitions must be created with `createColumnHelper<DashboardFeatures, T>()`
 * so they share the same feature type as this table instance.
 */
const tableFeaturesInstance = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  globalFilteringFeature,
  columnFilteringFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns,
  filterFns
})

/** The exact feature set this table uses — bind column helpers to it. */
export type DashboardFeatures = typeof tableFeaturesInstance

export interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DashboardFeatures, TData, unknown>[]
  data: TData[]
  getRowId: (row: TData) => string
  isLoading?: boolean
  skeletonRows?: number
  initialSorting?: SortingState
  initialPageSize?: number
  pageSizeOptions?: number[]
  toolbar?: React.ReactNode
  searchPlaceholder?: string
  /** Hide the built-in search input (e.g. when search lives in the page toolbar). */
  showSearch?: boolean
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyDescription?: string
  /** Fired when a data row is clicked (navigation from list rows). */
  onRowClick?: (row: TData) => void
  /** Optional class name function applied to each data row (e.g. red tint for blacklisted). */
  getRowClassName?: (row: TData) => string
  /** Wrap the table in the standard card chrome (`rounded-lg border bg-card`). */
  card?: boolean
  /** Header tint: `muted` (dashboard cards) or `primary` (operational workbench tables). */
  headerTone?: 'muted' | 'primary'
  /** When present, shows "Mark all as done" beside the selection count. */
  onMarkSelectedDone?: (selectedIds: string[]) => void | Promise<void>
  isMarkingSelected?: boolean
  /** Hide the built-in pagination (e.g. when rendering it in a CardFooter via useDataTablePagination). */
  showPagination?: boolean
  /** Rendered after the table, inside the DataTableContext provider. Use for CardFooter-wrapped pagination. */
  footer?: React.ReactNode
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  isLoading = false,
  skeletonRows = 5,
  initialSorting,
  initialPageSize = 6,
  pageSizeOptions = [6, 12, 24],
  toolbar,
  searchPlaceholder = 'Search…',
  showSearch = true,
  emptyIcon = Inbox,
  emptyTitle = 'No results',
  emptyDescription,
  onRowClick,
  getRowClassName,
  card = false,
  headerTone = 'muted',
  onMarkSelectedDone,
  isMarkingSelected,
  showPagination = true,
  footer
}: DataTableProps<TData>): React.JSX.Element {
  const [search, setSearch] = useState('')
  const globalFilter = useDebouncedValue(search, 300)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const rowsData = useMemo(() => data, [data])

  const columnDefs = useMemo<ColumnDef<DashboardFeatures, TData, unknown>[]>(() => {
    const helper = createColumnHelper<DashboardFeatures, TData>()
    const selectColumn = helper.display({
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
            disabled={!row.getCanSelect()}
            aria-label="Select row"
            className="group-hover:border-muted-foreground/60"
          />
        </div>
      )
    })
    return [selectColumn, ...columns]
  }, [columns])

  const table = useTable({
    features: tableFeaturesInstance,
    columns: columnDefs,
    data: rowsData,
    getRowId,
    globalFilterFn: 'includesString',
    initialState: {
      // An omitted initialSorting must still seed an empty array: the sorting
      // toggle updater reads the current state with `.findIndex`, which throws
      // on `undefined` on the first header click.
      sorting: initialSorting ?? [],
      pagination: { pageIndex: 0, pageSize: initialPageSize }
    },
    state: { globalFilter, rowSelection },
    onGlobalFilterChange: () => {
      // global filter is derived from the debounced search value
    },
    onRowSelectionChange: setRowSelection
  })

  const rows = table.getRowModel().rows
  const total = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize } = table.state.pagination
  const selectedCount = table.getSelectedRowIds().length

  const paginationState = useMemo<DataTablePaginationState>(
    () => ({
      pageIndex,
      pageCount: table.getPageCount(),
      pageSize,
      rowCount: total,
      pageSizeOptions,
      onPageSizeChange: table.setPageSize,
      onPageIndexChange: table.setPageIndex,
      canPrevious: table.getCanPreviousPage(),
      canNext: table.getCanNextPage()
    }),
    [pageIndex, pageSize, total, pageSizeOptions, table]
  )

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-2">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    )
  }

  return (
    <DataTableContext.Provider value={paginationState}>
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {selectedCount > 0 ? (
            <>
              <button
                type="button"
                onClick={() => table.resetRowSelection(true)}
                aria-label={`Clear selection of ${selectedCount} rows`}
                className="flex h-8 animate-in items-center gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-2.5 text-xs font-medium text-primary fade-in-0 transition-colors hover:bg-primary/10"
              >
                <span className="tabular-nums">{selectedCount} selected</span>
                <X className="size-3" />
              </button>
              {onMarkSelectedDone ? (
                <Button
                  size="sm"
                  className="h-8"
                  disabled={isMarkingSelected}
                  onClick={async () => {
                    const ids = table.getSelectedRowIds()
                    await onMarkSelectedDone(ids)
                    table.resetRowSelection(true)
                  }}
                >
                  {isMarkingSelected ? 'Marking…' : 'Mark all as done'}
                </Button>
              ) : null}
            </>
          ) : null}
          <div className="ml-auto min-w-0 flex-1 sm:max-w-56">
            {showSearch ? (
              <SearchInput value={search} onChange={setSearch} placeholder={searchPlaceholder} />
            ) : null}
          </div>
        </div>

        <div className={cn(card && 'rounded-lg border bg-card')}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className={cn(
                    headerTone === 'primary' ? 'bg-primary/5' : 'bg-muted',
                    'border-b border-border hover:bg-transparent'
                  )}
                >
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta as DataTableColumnMeta | undefined
                    const headPad = meta?.align === 'right' ? 'pl-2 pr-4' : 'pl-4 pr-2'
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          'align-middle whitespace-nowrap',
                          headPad,
                          headerTone === 'primary' ? 'text-primary' : 'text-muted-foreground',
                          header.id === 'select' && (card ? 'w-10' : 'w-10 pr-3')
                        )}
                      >
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={cn(
                      'group cursor-pointer even:bg-muted/40 hover:bg-muted/60 transition-colors data-[state=selected]:!bg-primary/5',
                      getRowClassName?.(row.original)
                    )}
                    onClick={() => onRowClick?.(row.original)}
                  >
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as DataTableColumnMeta | undefined
                      const cellPad = meta?.align === 'right' ? 'pl-2 pr-4' : 'pl-4 pr-2'
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            'align-middle whitespace-nowrap py-2.5',
                            cellPad,
                            cell.column.id === 'select' && !card && 'pr-3'
                          )}
                          onClick={(e) => {
                            if (cell.column.id === 'select' || cell.column.id === 'actions')
                              e.stopPropagation()
                          }}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent even:bg-transparent">
                  <TableCell colSpan={columnDefs.length} className="px-0 py-6">
                    <EmptyState
                      icon={emptyIcon}
                      title={emptyTitle}
                      description={emptyDescription}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {showPagination && !footer ? (
          <DataTablePagination
            pageIndex={pageIndex}
            pageCount={table.getPageCount()}
            pageSize={pageSize}
            rowCount={total}
            pageSizeOptions={pageSizeOptions}
            onPageSizeChange={table.setPageSize}
            onPageIndexChange={table.setPageIndex}
            canPrevious={table.getCanPreviousPage()}
            canNext={table.getCanNextPage()}
          />
        ) : null}
      </div>
      {footer}
    </DataTableContext.Provider>
  )
}
