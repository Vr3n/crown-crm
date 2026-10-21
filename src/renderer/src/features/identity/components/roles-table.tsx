import { useMemo } from 'react'
import { UserCog } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { grantedCount } from '../build'
import { RoleBadge } from './role-badge'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'
import type { Role } from '../types'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Role', key: 'name', format: 'text' },
  { header: 'Description', key: 'description', format: 'text' },
  { header: 'Members', key: 'memberCount', format: 'number' },
  { header: 'Permissions', key: 'permissions', format: 'text' }
]

const helper = createColumnHelper<DashboardFeatures, Role>()

function buildColumns(): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.name, {
      id: 'role',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Role
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="flex min-w-0 items-start gap-3">
          <RoleBadge role={row.original} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.original.name}</p>
            {row.original.description ? (
              <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
            ) : null}
          </div>
        </div>
      ),
      sortFn: 'text'
    }),
    helper.display({
      id: 'members',
      header: () => 'Members',
      enableSorting: false,
      cell: ({ row }) => {
        const count = row.original.memberCount ?? 0
        return (
          <span className="font-mono text-sm tabular-nums">
            {count}
            <span className="text-muted-foreground"> member{count === 1 ? '' : 's'}</span>
          </span>
        )
      }
    }),
    helper.accessor((row) => grantedCount(row), {
      id: 'permissions',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Permissions
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">
          {row.original.isSuper ? (
            <span className="text-primary">All</span>
          ) : (
            grantedCount(row.original)
          )}
        </span>
      ),
      sortFn: 'basic'
    })
  ])
}

/**
 * The roles table (Module 15). One row per org-scoped role with its headcount
 * and effective permission count; super roles show "All" because they
 * short-circuit the permission check instead of enumerating codes. Clicking a
 * row opens the permission editor.
 */
export function RolesTable({
  roles,
  isLoading,
  onOpen
}: {
  roles: Role[]
  isLoading: boolean
  onOpen: (role: Role) => void
}): React.JSX.Element {
  const columns = useMemo(() => buildColumns(), [])

  const exportData = useMemo(
    () =>
      roles.map((r) => ({
        name: r.name,
        description: r.description ?? '',
        memberCount: r.memberCount ?? 0,
        permissions: r.isSuper ? 'All' : String(grantedCount(r))
      })),
    [roles]
  )

  return (
    <DataTable
      columns={columns}
      data={roles}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      initialSorting={[{ id: 'role', desc: false }]}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      searchPlaceholder="Search roles…"
      onRowClick={onOpen}
      emptyIcon={UserCog}
      emptyTitle="No roles"
      emptyDescription="Roles shipped with the organization will appear here."
      headerTone="primary"
      toolbar={<ExportExcelButton columns={EXPORT_COLUMNS} rows={exportData} sheetName="Roles" />}
    />
  )
}
