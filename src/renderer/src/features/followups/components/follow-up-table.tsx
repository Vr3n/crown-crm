import { useCallback, useMemo, useState } from 'react'
import { Check, CheckCircle2, Inbox, CalendarClock, XCircle } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PersonCell } from '@/components/person/person-cell'
import { EditFollowUpDialog } from '@/features/leads/components/edit-follow-up-dialog'
import { CancelFollowUpDialog } from './cancel-follow-up-dialog'
import { CompleteFollowUpDialog } from './complete-follow-up-dialog'
import { BulkCompleteFollowUpDialog } from './bulk-complete-follow-up-dialog'
import { StageBadge } from '@/features/leads/components/stage-badge'
import { formatDateTime, timeAgo } from '@/features/leads/format'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { cn } from '@/lib/utils'
import { bucketOf, dueAtOpenFirst } from '../build'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'
import type { FollowUpBucket, FollowUpRow } from '../types'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Lead', key: 'leadName', format: 'text' },
  { header: 'Stage', key: 'stage', format: 'text' },
  { header: 'What To Do', key: 'title', format: 'text' },
  { header: 'Due', key: 'dueAt', format: 'datetime' },
  { header: 'Owner', key: 'ownerName', format: 'text' },
  { header: 'Status', key: 'status', format: 'text' }
]

const helper = createColumnHelper<DashboardFeatures, FollowUpRow>()

function CompleteFollowUpButton({
  followUp,
  onDone
}: {
  followUp: FollowUpRow
  onDone: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="text-success hover:bg-success/10 hover:text-success"
            aria-label="Mark follow-up done"
            disabled={followUp.isBlacklisted}
            onClick={(e) => {
              e.stopPropagation()
              setOpen(true)
            }}
          >
            <Check className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {followUp.isBlacklisted ? 'Blacklisted — refunds only' : 'Mark done'}
        </TooltipContent>
      </Tooltip>
      {open && (
        <CompleteFollowUpDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) onDone()
          }}
          followUp={followUp}
        />
      )}
    </>
  )
}

function CancelFollowUpButton({
  followUp,
  onDone
}: {
  followUp: FollowUpRow
  onDone: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Cancel follow-up"
            disabled={followUp.isBlacklisted}
            onClick={(e) => {
              e.stopPropagation()
              setOpen(true)
            }}
          >
            <XCircle className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {followUp.isBlacklisted ? 'Blacklisted — refunds only' : 'Cancel'}
        </TooltipContent>
      </Tooltip>
      {open && (
        <CancelFollowUpDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) onDone()
          }}
          followUp={followUp}
        />
      )}
    </>
  )
}

function EditFollowUpButton({
  followUp,
  onDone
}: {
  followUp: FollowUpRow
  onDone: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Edit follow-up"
            disabled={followUp.isBlacklisted}
            onClick={(e) => {
              e.stopPropagation()
              setOpen(true)
            }}
          >
            <CalendarClock className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {followUp.isBlacklisted ? 'Blacklisted — refunds only' : 'Extend due date'}
        </TooltipContent>
      </Tooltip>
      {open && (
        <EditFollowUpDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) onDone()
          }}
          followUp={followUp}
        />
      )}
    </>
  )
}

/** Due column: mono date, urgency-tinted relative line. */
function DueCell({ row }: { row: FollowUpRow }): React.JSX.Element {
  const bucket = bucketOf(row)
  const relative = row.completedAt
    ? timeAgo(row.completedAt)
    : row.cancelledAt
      ? timeAgo(row.cancelledAt)
      : timeAgo(row.dueAt)
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs font-medium tabular-nums">
        {formatDateTime(row.dueAt)}
      </span>
      <span
        className={cn(
          'text-xs',
          bucket === 'overdue' && 'text-destructive',
          bucket === 'today' && 'text-primary',
          (bucket === 'upcoming' || bucket === 'done') && 'text-muted-foreground'
        )}
      >
        {row.completedAt
          ? `Done ${relative}`
          : row.cancelledAt
            ? `Cancelled ${relative}`
            : bucket === 'overdue'
              ? `Overdue ${relative}`
              : `Due ${relative}`}
      </span>
    </div>
  )
}

/** Urgency badge for the status column. */
function StatusBadge({ row }: { row: FollowUpRow }): React.JSX.Element {
  const bucket = bucketOf(row)
  const isCancelled = !row.completedAt && row.cancelledAt
  const variant = isCancelled
    ? 'destructive'
    : bucket === 'overdue'
      ? 'destructive'
      : bucket === 'today'
        ? 'default'
        : bucket === 'done'
          ? 'success'
          : 'outline'
  const label = isCancelled
    ? 'Cancelled'
    : bucket === 'done'
      ? 'Done'
      : bucket === 'overdue'
        ? 'Overdue'
        : bucket === 'today'
          ? 'Today'
          : 'Upcoming'
  return (
    <Badge variant={variant} className="rounded-full px-2.5 py-0.5">
      {bucket === 'done' && !isCancelled ? <CheckCircle2 className="size-3" /> : null}
      {isCancelled ? <XCircle className="size-3" /> : null}
      {label}
    </Badge>
  )
}

function buildColumns(
  bucket: FollowUpBucket,
  onDone: () => void
): ReturnType<typeof helper.columns> {
  return helper
    .columns([
      helper.accessor((row) => row.leadName, {
        id: 'leadName',
        header: ({ column }) => (
          <SortButton
            className="text-primary"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          >
            Lead
          </SortButton>
        ),
        cell: ({ row }) => (
          <PersonCell
            personId={row.original.personId}
            name={row.original.leadName}
            subtext={
              <StageBadge
                stage={row.original.stage}
                isBlacklisted={row.original.isBlacklisted}
                className="mt-0.5"
              />
            }
          />
        ),
        sortFn: 'alphanumeric'
      }),
      helper.accessor((row) => row.title, {
        id: 'title',
        header: ({ column }) => (
          <SortButton
            className="text-primary"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          >
            What to do
          </SortButton>
        ),
        cell: ({ row }) => (
          <div className="min-w-0 max-w-56">
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="truncate text-sm font-medium">{row.original.title}</p>
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
            className="text-primary"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting()}
          >
            Due
          </SortButton>
        ),
        cell: ({ row }) => <DueCell row={row.original} />,
        sortFn: dueAtOpenFirst
      }),
      helper.accessor((row) => row.ownerName ?? '', {
        id: 'ownerName',
        header: () => 'Owner',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.ownerName ?? 'Unassigned'}
          </span>
        )
      }),
      helper.accessor((row) => bucketOf(row), {
        id: 'status',
        header: () => 'Status',
        enableSorting: false,
        cell: ({ row }) => <StatusBadge row={row.original} />
      }),
      helper.display({
        id: 'actions',
        header: () => null,
        cell: ({ row }) => {
          const isDone = row.original.completedAt || row.original.cancelledAt
          if (isDone) return null
          return (
            <div className="flex items-center justify-end gap-1">
              <EditFollowUpButton followUp={row.original} onDone={onDone} />
              <CompleteFollowUpButton followUp={row.original} onDone={onDone} />
              <CancelFollowUpButton followUp={row.original} onDone={onDone} />
            </div>
          )
        }
      })
    ])
    .filter((c) => !(bucket === 'done' && c.id === 'actions'))
}

/**
 * The follow-up queue table: every open follow-up across leads, open first and
 * earliest-due first (done items sink — see `dueAtOpenFirst`), with an inline
 * "mark done" verb and row-click through to the lead. The default row order is
 * the upstream `sortFollowUpRows` order; the table applies no initial sort of
 * its own so done rows never interleave with open ones.
 */
export function FollowUpTable({
  rows,
  bucket,
  isLoading,
  onOpenLead
}: {
  rows: FollowUpRow[]
  bucket: FollowUpBucket
  isLoading: boolean
  onOpenLead: (leadId: number) => void
}): React.JSX.Element {
  const handleDone = useCallback(() => {
    // nothing extra — the leads query invalidation refreshes this table
  }, [])
  const columns = useMemo(() => buildColumns(bucket, handleDone), [bucket, handleDone])
  const [bulkDoneRows, setBulkDoneRows] = useState<FollowUpRow[] | null>(null)

  const exportData = useMemo(
    () =>
      rows.map((r) => ({
        leadName: r.leadName,
        stage: r.stage,
        title: r.title,
        dueAt: r.dueAt,
        ownerName: r.ownerName ?? 'Unassigned',
        status: r.completedAt ? 'Done' : r.cancelledAt ? 'Cancelled' : bucketOf(r)
      })),
    [rows]
  )

  const handleBulkDone = useCallback((ids: string[]) => {
    const rowMap = new Map(rows.map((r) => [String(r.id), r]))
    const pending = ids
      .map((id) => rowMap.get(id))
      .filter((r): r is FollowUpRow => !!r && !r.completedAt && !r.cancelledAt)
    if (pending.length === 0) return
    setBulkDoneRows(pending)
  }, [rows])

  const emptyCopy: Record<FollowUpBucket, { title: string; description: string }> = {
    all: {
      title: 'No follow-ups scheduled',
      description: 'Schedule one from any lead or the button above.'
    },
    overdue: {
      title: 'Nothing overdue',
      description: 'No follow-up is past its due time. Clear queue.'
    },
    today: { title: 'Nothing due today', description: 'No follow-up is due today.' },
    upcoming: { title: 'No upcoming follow-ups', description: 'Nothing scheduled past today.' },
    done: { title: 'Nothing completed', description: 'Follow-ups you mark done will appear here.' }
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        isLoading={isLoading}
        initialPageSize={8}
        pageSizeOptions={[8, 16, 32]}
        onRowClick={(row) => onOpenLead(row.leadId)}
        showSearch={false}
        emptyIcon={bucket === 'done' ? CheckCircle2 : Inbox}
        emptyTitle={emptyCopy[bucket].title}
        emptyDescription={emptyCopy[bucket].description}
        headerTone="primary"
        onMarkSelectedDone={bucket === 'done' ? undefined : handleBulkDone}
        toolbar={
          <ExportExcelButton columns={EXPORT_COLUMNS} rows={exportData} sheetName="Follow-ups" />
        }
      />
      {bulkDoneRows && (
        <BulkCompleteFollowUpDialog
          open
          onOpenChange={(o) => {
            if (!o) setBulkDoneRows(null)
          }}
          rows={bulkDoneRows}
          onSuccess={() => {}}
        />
      )}
    </>
  )
}
