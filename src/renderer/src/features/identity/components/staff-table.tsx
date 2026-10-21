import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { formatDate, initials, timeAgo } from '@/features/leads/format'
import { STAFF_STATUS_META } from '../constants'
import { RoleBadge } from './role-badge'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'
import type { StaffMember } from '../types'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Name', key: 'fullName', format: 'text' },
  { header: 'Email', key: 'email', format: 'text' },
  { header: 'Role', key: 'roleName', format: 'text' },
  { header: 'Status', key: 'status', format: 'text' },
  { header: 'Joined', key: 'joinedAt', format: 'date' }
]

const helper = createColumnHelper<DashboardFeatures, StaffMember>()

function buildColumns(youEmail?: string): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.fullName, {
      id: 'member',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Staff member
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar size="sm" className="shrink-0">
            <AvatarFallback className="text-xs">{initials(row.original.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{row.original.fullName}</span>
              {row.original.email.toLowerCase() === youEmail?.toLowerCase() ? (
                <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                  You
                </Badge>
              ) : null}
            </p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {row.original.email}
            </p>
          </div>
        </div>
      ),
      sortFn: 'text'
    }),
    helper.accessor((row) => row.roleName, {
      id: 'role',
      header: () => 'Role',
      enableSorting: false,
      cell: ({ row }) => (
        <RoleBadge
          role={{
            name: row.original.roleName,
            isSuper: row.original.isSuper,
            isSystemRole: row.original.isSystemRole
          }}
        />
      )
    }),
    helper.accessor((row) => row.status, {
      id: 'status',
      header: () => 'Status',
      enableSorting: false,
      cell: ({ row }) => {
        const meta = STAFF_STATUS_META[row.original.status]
        return <Badge variant={meta.tone}>{meta.label}</Badge>
      }
    }),
    helper.accessor('joinedAt', {
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Joined
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs tabular-nums">
            {formatDate(row.original.joinedAt)}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(row.original.joinedAt)}</span>
        </div>
      ),
      sortFn: 'datetime'
    })
  ])
}

/**
 * The staff table (Module 15). One row per OrganizationStaff membership — the
 * user's identity plus the role it holds *in this organization*. Rows open the
 * staff drawer for role changes and enable/disable.
 */
export function StaffTable({
  staff,
  isLoading,
  onOpen,
  youEmail
}: {
  staff: StaffMember[]
  isLoading: boolean
  onOpen: (member: StaffMember) => void
  youEmail?: string
}): React.JSX.Element {
  const columns = useMemo(() => buildColumns(youEmail), [youEmail])

  const exportData = useMemo(
    () =>
      staff.map((r) => ({
        fullName: r.fullName,
        email: r.email,
        roleName: r.roleName,
        status: r.status,
        joinedAt: r.joinedAt
      })),
    [staff]
  )

  return (
    <DataTable
      columns={columns}
      data={staff}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      initialSorting={[{ id: 'joinedAt', desc: true }]}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      searchPlaceholder="Search name, email, role…"
      onRowClick={onOpen}
      emptyIcon={Users}
      emptyTitle="No staff found"
      emptyDescription="Add a staff member from the button above."
      headerTone="primary"
      toolbar={<ExportExcelButton columns={EXPORT_COLUMNS} rows={exportData} sheetName="Staff" />}
    />
  )
}
