import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellPlus, CalendarClock, Check, XCircle } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime, timeAgo } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { bucketOf } from '@/features/followups/build'
import { useFollowUpRows } from '@/features/followups/queries'
import type { FollowUpRow } from '@/features/followups/types'
import { StageBadge } from '@/features/leads/components/stage-badge'
import { MAX_ROWS, PAGE_SIZE_OPTIONS, UPCOMING_FOLLOWUP_DAYS } from '../constants'
import { DataTable, type DashboardFeatures, type DataTableColumnMeta } from './data-table'
import { CardPaginationFooter } from './card-pagination-footer'
import { NameCell } from './name-cell'
import { SortButton } from './sort-button'
import { cn } from '@/lib/utils'

const helper = createColumnHelper<DashboardFeatures, FollowUpRow>()

function buildColumns(
  onComplete: (row: FollowUpRow) => void,
  onEdit: (row: FollowUpRow) => void,
  onCancel: (row: FollowUpRow) => void
): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.leadName, {
      id: 'leadName',
      header: ({ column }) => (
        <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
          Lead
        </SortButton>
      ),
      cell: ({ row }) => (
        <NameCell
          name={row.original.leadName}
          personId={row.original.personId}
          subtext={
            <StageBadge stage={row.original.stage} isBlacklisted={row.original.isBlacklisted} />
          }
        />
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.title, {
      id: 'title',
      header: ({ column }) => (
        <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
          Follow-up
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="min-w-0 max-w-48">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate text-sm font-medium">{row.original.title}</span>
            </TooltipTrigger>
            {row.original.notes && (
              <TooltipContent side="top" className="max-w-xs">
                {row.original.notes}
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor('dueAt', {
      header: ({ column }) => (
        <SortButton
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
          className="w-full justify-end"
        >
          Due
        </SortButton>
      ),
      cell: ({ row }) => {
        const bucket = bucketOf(row.original)
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-xs font-medium tabular-nums">
              {formatDateTime(row.original.dueAt)}
            </span>
            <span
              className={cn(
                'text-xs',
                bucket === 'today' && 'text-primary',
                bucket === 'upcoming' && 'text-muted-foreground'
              )}
            >
              {timeAgo(row.original.dueAt)}
            </span>
          </div>
        )
      },
      meta: { align: 'right' } as DataTableColumnMeta,
      sortFn: 'datetime'
    }),
    helper.display({
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Extend due date for ${row.original.title}`}
                disabled={row.original.isBlacklisted}
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(row.original)
                }}
              >
                <CalendarClock className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {row.original.isBlacklisted ? 'Blacklisted — refunds only' : 'Extend due date'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                className="text-success hover:bg-success/10 hover:text-success"
                aria-label={`Mark ${row.original.title} done`}
                disabled={row.original.isBlacklisted}
                onClick={(e) => {
                  e.stopPropagation()
                  onComplete(row.original)
                }}
              >
                <Check className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {row.original.isBlacklisted ? 'Blacklisted — refunds only' : 'Mark done'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Cancel ${row.original.title}`}
                disabled={row.original.isBlacklisted}
                onClick={(e) => {
                  e.stopPropagation()
                  onCancel(row.original)
                }}
              >
                <XCircle className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {row.original.isBlacklisted ? 'Blacklisted — refunds only' : 'Cancel'}
            </TooltipContent>
          </Tooltip>
        </div>
      )
    })
  ])
}

/**
 * Follow-ups due from today through the next week (Module 09 §58). The most
 * time-sensitive work items for the front desk. Sorted by due date ascending,
 * clicking a row navigates to the lead detail.
 */
export function UpcomingFollowupsTable({
  onComplete,
  onEdit,
  onCancel
}: {
  onComplete: (row: FollowUpRow) => void
  onEdit: (row: FollowUpRow) => void
  onCancel: (row: FollowUpRow) => void
}): React.JSX.Element {
  const { rows: allRows, isLoading } = useFollowUpRows()
  const navigate = useNavigate()
  const now = useNow()

  const rows = useMemo(() => {
    const horizon = now + UPCOMING_FOLLOWUP_DAYS * 24 * 60 * 60 * 1000
    return allRows
      .filter((r) => {
        if (r.completedAt || r.cancelledAt) return false
        const due = new Date(r.dueAt).getTime()
        return due >= now && due <= horizon
      })
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, MAX_ROWS)
  }, [allRows, now])

  const columns = useMemo(
    () => buildColumns(onComplete, onEdit, onCancel),
    [onComplete, onEdit, onCancel]
  )

  const handleRowClick = useCallback(
    (row: FollowUpRow) => {
      navigate(`/leads/${row.leadId}`, { state: { from: '/dashboard' } })
    },
    [navigate]
  )

  return (
    <Card
      className="crm-gradient-border"
      style={
        {
          '--gradient-start': 'var(--violet)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-violet/10 text-violet">
            <BellPlus className="size-4" />
          </span>
          <div>
            <span className="font-heading text-base">Upcoming followups</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
          isLoading={isLoading}
          initialSorting={[{ id: 'dueAt', desc: false }]}
          initialPageSize={6}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          showPagination={false}
          footer={<CardPaginationFooter />}
          onRowClick={handleRowClick}
          showSearch={false}
          emptyIcon={BellPlus}
          emptyTitle="No upcoming followups"
          emptyDescription="Follow-ups due in the next 7 days will appear here."
        />
      </CardContent>
    </Card>
  )
}
