import { CardFooter } from '@/components/ui/card'
import { useDataTablePagination } from './data-table-shared'
import { DataTablePagination } from './data-table-pagination'

/** Reads pagination state from the DataTable context and renders it in a CardFooter. */
export function CardPaginationFooter(): React.JSX.Element | null {
  const p = useDataTablePagination()
  if (!p) return null
  return (
    <CardFooter>
      <DataTablePagination {...p} />
    </CardFooter>
  )
}
