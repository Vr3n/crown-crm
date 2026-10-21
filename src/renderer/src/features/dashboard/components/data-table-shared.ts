import { createContext, useContext } from 'react'

/** Column meta: optional alignment hint so the DataTable can flip padding. */
export interface DataTableColumnMeta {
  align?: 'left' | 'right'
}

export interface DataTablePaginationState {
  pageIndex: number
  pageCount: number
  pageSize: number
  rowCount: number
  pageSizeOptions: number[]
  onPageSizeChange: (size: number) => void
  onPageIndexChange: (index: number) => void
  canPrevious: boolean
  canNext: boolean
}

export const DataTableContext = createContext<DataTablePaginationState | null>(null)

/**
 * Access the DataTable's pagination state from a sibling component (e.g.
 * rendering `<DataTablePagination />` inside a `<CardFooter>` outside the
 * DataTable's own render tree). Returns `null` when used outside a provider.
 */
export function useDataTablePagination(): DataTablePaginationState | null {
  return useContext(DataTableContext)
}
