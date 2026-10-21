import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Ban, Pencil, ShieldCheck, UserPlus } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { timeAgo } from '@/lib/format'
import { SOURCES } from '@/features/leads/constants'
import { useLeads } from '@/features/leads/queries'
import type { Lead } from '@/features/leads/types'
import { MAX_ROWS, PAGE_SIZE_OPTIONS } from '../constants'
import { DataTable, type DashboardFeatures, type DataTableColumnMeta } from './data-table'
import { CardPaginationFooter } from './card-pagination-footer'
import { ContactCell } from './contact-cell'
import { NameCell } from './name-cell'
import { SortButton } from './sort-button'

const helper = createColumnHelper<DashboardFeatures, Lead>()

function buildColumns(
  onEdit: (lead: Lead) => void,
  onBlacklist: (lead: Lead) => void,
  canEditLead: (lead: Lead) => boolean,
  canBlacklist: boolean
): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.name, {
      id: 'name',
      header: ({ column }) => (
        <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
          Lead
        </SortButton>
      ),
      cell: ({ row }) => <NameCell name={row.original.name} personId={row.original.personId} />,
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row, {
      id: 'contact',
      header: () => 'Contact',
      enableSorting: false,
      cell: ({ row }) => <ContactCell phone={row.original.phone} email={row.original.email} />
    }),
    helper.accessor((row) => SOURCES[row.source], {
      id: 'source',
      header: ({ column }) => (
        <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
          Source
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{SOURCES[row.original.source]}</span>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor('createdAt', {
      header: ({ column }) => (
        <SortButton
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
          className="w-full justify-end"
        >
          Created
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="block text-right font-mono text-xs tabular-nums text-muted-foreground">
          {timeAgo(row.original.createdAt)}
        </span>
      ),
      meta: { align: 'right' } as DataTableColumnMeta,
      sortFn: 'datetime'
    }),
    helper.display({
      id: 'actions',
      header: () => null,
      cell: ({ row }) => {
        const lead = row.original
        return (
          <div className="flex items-center justify-end gap-1">
            {canBlacklist ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      lead.isBlacklisted
                        ? `Lift blacklist for ${lead.name}`
                        : `Blacklist ${lead.name}`
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      onBlacklist(lead)
                    }}
                    className={
                      lead.isBlacklisted
                        ? 'text-primary hover:text-primary'
                        : 'text-muted-foreground hover:text-destructive'
                    }
                  >
                    {lead.isBlacklisted ? (
                      <ShieldCheck className="size-4" />
                    ) : (
                      <Ban className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {lead.isBlacklisted ? 'Lift blacklist' : 'Blacklist'}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {canEditLead(lead) ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${lead.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(lead)
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Edit</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        )
      }
    })
  ])
}

/**
 * Recently created leads in the active pipeline (Module 09 §58). Sorted by
 * createdAt descending so the newest leads surface first. Clicking a row
 * navigates to the lead detail.
 */
export function RecentLeadsTable({
  onEdit,
  onBlacklist,
  canEditLead,
  canBlacklist
}: {
  onEdit: (lead: Lead) => void
  onBlacklist: (lead: Lead) => void
  canEditLead: (lead: Lead) => boolean
  canBlacklist: boolean
}): React.JSX.Element {
  const { data, isLoading, isError } = useLeads()
  const navigate = useNavigate()

  const rows = useMemo(() => {
    if (!data) return []
    return data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_ROWS)
  }, [data])

  const columns = useMemo(
    () => buildColumns(onEdit, onBlacklist, canEditLead, canBlacklist),
    [onEdit, onBlacklist, canEditLead, canBlacklist]
  )

  const handleRowClick = useCallback(
    (lead: Lead) => {
      navigate(`/leads/${lead.id}`, { state: { from: '/dashboard' } })
    },
    [navigate]
  )

  return (
    <Card
      className="crm-gradient-border"
      style={
        {
          '--gradient-start': 'var(--success)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-success/10 text-success">
            <UserPlus className="size-4" />
          </span>
          <div>
            <span className="font-heading text-base">Recent leads</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
          isLoading={isLoading}
          initialSorting={[{ id: 'createdAt', desc: true }]}
          initialPageSize={6}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          showPagination={false}
          footer={<CardPaginationFooter />}
          onRowClick={handleRowClick}
          showSearch={false}
          emptyIcon={isError ? AlertTriangle : UserPlus}
          emptyTitle={isError ? 'Failed to load leads' : 'No recent leads'}
          emptyDescription={
            isError
              ? 'Something went wrong. Please try again.'
              : 'New leads in the pipeline will appear here.'
          }
        />
      </CardContent>
    </Card>
  )
}
