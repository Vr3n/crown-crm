import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { can, useSession } from '@/context/session-context'
import { filterLeads, isTerminal, moveableStages, sortLeads, STAGES } from '../constants'
import { useBulkMoveStage, useDeleteLeads, useLeads } from '../queries'
import type { Lead, LeadFilters, StageKey } from '../types'
import { LeadFilters as Filters } from '../components/lead-filters'
import { LeadMetrics } from '../components/lead-metrics'
import { LeadSelectionToolbar } from '../components/lead-selection-toolbar'
import { LeadTable } from '../components/lead-table'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'
import { SOURCES } from '../constants'

const LEAD_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Name', key: 'name', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Email', key: 'email', format: 'text' },
  { header: 'Source', key: 'source', format: 'text' },
  { header: 'Stage', key: 'stage', format: 'text' },
  { header: 'Owner', key: 'owner', format: 'text' },
  { header: 'Next Follow-up', key: 'nextFollowUp', format: 'datetime' },
  { header: 'Last Activity', key: 'lastActivity', format: 'datetime' },
  { header: 'Acquired', key: 'createdAt', format: 'datetime' }
]

// Lazy-load the dialogs so their module graphs (Radix Dialog/Select, the query
// hooks) only parse and execute when a dialog is first opened — the leads page
// itself stays lean at startup, and each dialog remounts fresh per open.
const NewLeadDialog = lazy(() =>
  import('../components/new-lead-dialog').then((m) => ({ default: m.NewLeadDialog }))
)
const MoveStageDialog = lazy(() =>
  import('../components/move-stage-dialog').then((m) => ({ default: m.MoveStageDialog }))
)
const MarkLostDialog = lazy(() =>
  import('../components/mark-lost-dialog').then((m) => ({ default: m.MarkLostDialog }))
)
const LogActivityDialog = lazy(() =>
  import('../components/log-activity-dialog').then((m) => ({ default: m.LogActivityDialog }))
)
const FollowUpDialog = lazy(() =>
  import('../components/follow-up-dialog').then((m) => ({ default: m.FollowUpDialog }))
)
const BulkFollowUpDialog = lazy(() =>
  import('../components/bulk-follow-up-dialog').then((m) => ({ default: m.BulkFollowUpDialog }))
)
const BulkActivityDialog = lazy(() =>
  import('../components/bulk-activity-dialog').then((m) => ({ default: m.BulkActivityDialog }))
)
const BulkMoveStageDialog = lazy(() =>
  import('../components/bulk-move-stage-dialog').then((m) => ({ default: m.BulkMoveStageDialog }))
)
const EditLeadDialog = lazy(() =>
  import('../components/edit-lead-dialog').then((m) => ({ default: m.EditLeadDialog }))
)
const BlacklistDialog = lazy(() =>
  import('@/features/people/components/blacklist-dialog').then((m) => ({
    default: m.BlacklistDialog
  }))
)

type Action =
  | { type: 'move'; lead: Lead; to?: StageKey }
  | { type: 'lost'; lead: Lead }
  | { type: 'activity'; lead: Lead }
  | { type: 'followup'; lead: Lead }
  | null

type BulkAction =
  { type: 'followup' } | { type: 'activity' } | { type: 'move'; to: StageKey } | null

const DEFAULT_FILTERS: LeadFilters = {
  search: '',
  stage: 'ALL',
  sourceId: 'ALL',
  ownerId: 'ALL',
  personStatus: 'ALL',
  range: 'all'
}

export function LeadsPage(): React.JSX.Element {
  const navigate = useNavigate()
  const session = useSession()
  const { data, isLoading } = useLeads()
  const deleteLeads = useDeleteLeads()
  const bulkMove = useBulkMoveStage()
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS)

  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [newOpen, setNewOpen] = useState(false)
  const [action, setAction] = useState<Action>(null)
  const [bulkAction, setBulkAction] = useState<BulkAction>(null)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [blacklisting, setBlacklisting] = useState<Lead | null>(null)

  const filtered = useMemo(
    () => (data ? sortLeads(filterLeads(data, filters)) : []),
    [data, filters]
  )

  const leadExportData = useMemo(() => {
    return filtered.map((l) => {
      const openFollowUps = l.followUps
        .filter((f) => !f.completedAt)
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      const nextFollowUp = openFollowUps[0]?.dueAt ?? ''
      const sortedActivities = [...l.activities].sort((a, b) => b.at.localeCompare(a.at))
      const lastActivity = sortedActivities[0]?.at ?? ''
      return {
        name: l.name,
        phone: l.phone ?? '',
        email: l.email ?? '',
        source: SOURCES[l.source] ?? l.source,
        stage: l.stage,
        owner: l.owner?.name ?? 'Unassigned',
        nextFollowUp,
        lastActivity,
        createdAt: l.createdAt
      }
    })
  }, [filtered])

  const selectedLeads = useMemo(
    () => filtered.filter((l) => selected.has(l.id)),
    [filtered, selected]
  )

  /** Selected leads on a terminal stage — bulk scheduling/logging confirms first. */
  const terminalSelectedCount = useMemo(
    () => selectedLeads.filter((l) => isTerminal(l.stage)).length,
    [selectedLeads]
  )

  /** Stages every selected lead can be moved to — the safe intersection. */
  const moveOptions = useMemo(() => {
    if (selectedLeads.length === 0) return []
    const optionSets = selectedLeads.map((l) => new Set(moveableStages(l.stage).map((s) => s.key)))
    const shared = new Set(optionSets[0])
    for (const set of optionSets.slice(1)) {
      for (const key of shared) if (!set.has(key)) shared.delete(key)
    }
    return STAGES.filter((s) => shared.has(s.key))
  }, [selectedLeads])

  function openLead(lead: Lead): void {
    navigate(`/leads/${lead.id}`, { state: { from: '/leads' } })
  }

  /**
   * Edit is owned: only the lead's owner or an admin (super) may edit. The
   * backend enforces the same rule — hiding the button is UX only.
   */
  function canEditLead(lead: Lead): boolean {
    return (
      can(session.permissions, session.isSuper, 'lead.edit') &&
      (session.isSuper || lead.owner?.id === session.userId)
    )
  }

  /**
   * Strict routing: LOST goes to its reason-requiring dialog; every other move
   * opens the move dialog with the picked target preselected (WON stays
   * unreachable until the Module 02 conversion handoff exists).
   */
  function onStageChange(lead: Lead, to: StageKey): void {
    if (to === 'LOST') setAction({ type: 'lost', lead })
    else setAction({ type: 'move', lead, to })
  }

  function onDeleteSelection(): void {
    deleteLeads.mutate({ leadIds: [...selected] }, { onSuccess: () => setSelected(new Set()) })
  }

  function onBulkScheduleFollowups(): void {
    if (selected.size === 0) return
    setBulkAction({ type: 'followup' })
  }

  function onBulkLogActivities(): void {
    if (selected.size === 0) return
    setBulkAction({ type: 'activity' })
  }

  function clearSelection(): void {
    setSelected(new Set())
  }

  /** Picking a target in the toolbar opens the strict bulk-move verification dialog. */
  function onMoveSelection(key: StageKey): void {
    setBulkAction({ type: 'move', to: key })
  }

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Leads"
        description={`${session.organizationName} · sales pipeline`}
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus />
            New lead
          </Button>
        }
      />

      <LeadMetrics leads={filtered} />

      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-2.5">
          <Filters leads={filtered} filters={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      {isLoading ? (
        <Card className="gap-0 py-0">
          <CardContent className="px-3 py-3">
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="gap-0 py-0">
          <CardContent className="px-3 py-3">
            <EmptyState
              icon={Plus}
              title="No leads match"
              description="Try widening the filters, or add a new lead to get started."
              action={
                <Button onClick={() => setNewOpen(true)}>
                  <Plus />
                  New lead
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="flex flex-col gap-3 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <ExportExcelButton
                columns={LEAD_EXPORT_COLUMNS}
                rows={leadExportData}
                sheetName="Leads"
              />
              {selected.size > 0 ? (
                <LeadSelectionToolbar
                  count={selected.size}
                  canDelete={can(session.permissions, session.isSuper, 'lead.delete')}
                  canMove={can(session.permissions, session.isSuper, 'lead.update_stage')}
                  canScheduleFollowup={can(session.permissions, session.isSuper, 'followup.create')}
                  canLogActivity={can(session.permissions, session.isSuper, 'lead.record_activity')}
                  moveOptions={moveOptions}
                  isDeleting={deleteLeads.isPending}
                  isMoving={bulkMove.isPending}
                  onDelete={onDeleteSelection}
                  onMoveStage={onMoveSelection}
                  onScheduleFollowups={onBulkScheduleFollowups}
                  onLogActivities={onBulkLogActivities}
                />
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {filtered.length} lead{filtered.length === 1 ? '' : 's'}
                  </span>
                  {filters.range !== 'all' && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Sample data</span>
                  )}
                </div>
              )}
            </div>
            <LeadTable
              leads={filtered}
              selected={selected}
              onSelectionChange={setSelected}
              onOpen={openLead}
              onStageChange={onStageChange}
              onEdit={setEditing}
              onBlacklist={setBlacklisting}
              canEditLead={canEditLead}
              canBlacklist={can(session.permissions, session.isSuper, 'person.blacklist')}
            />
          </CardContent>
        </Card>
      )}

      {newOpen && (
        <Suspense fallback={null}>
          <NewLeadDialog open onOpenChange={setNewOpen} />
        </Suspense>
      )}

      {action?.type === 'move' && (
        <Suspense fallback={null}>
          <MoveStageDialog
            key={action.lead.id}
            open
            onOpenChange={() => setAction(null)}
            lead={action.lead}
            initialStage={action.to}
          />
        </Suspense>
      )}
      {action?.type === 'lost' && (
        <Suspense fallback={null}>
          <MarkLostDialog
            key={action.lead.id}
            open
            onOpenChange={() => setAction(null)}
            lead={action.lead}
          />
        </Suspense>
      )}
      {action?.type === 'activity' && (
        <Suspense fallback={null}>
          <LogActivityDialog
            key={action.lead.id}
            open
            onOpenChange={() => setAction(null)}
            lead={action.lead}
          />
        </Suspense>
      )}
      {action?.type === 'followup' && (
        <Suspense fallback={null}>
          <FollowUpDialog
            key={action.lead.id}
            open
            onOpenChange={() => setAction(null)}
            lead={action.lead}
          />
        </Suspense>
      )}

      {bulkAction?.type === 'followup' && (
        <Suspense fallback={null}>
          <BulkFollowUpDialog
            open
            onOpenChange={() => setBulkAction(null)}
            count={selected.size}
            leadIds={[...selected]}
            moveOptions={moveOptions}
            terminalCount={terminalSelectedCount}
            onSuccess={clearSelection}
          />
        </Suspense>
      )}
      {bulkAction?.type === 'activity' && (
        <Suspense fallback={null}>
          <BulkActivityDialog
            open
            onOpenChange={() => setBulkAction(null)}
            count={selected.size}
            leadIds={[...selected]}
            moveOptions={moveOptions}
            terminalCount={terminalSelectedCount}
            onSuccess={clearSelection}
          />
        </Suspense>
      )}
      {bulkAction?.type === 'move' && (
        <Suspense fallback={null}>
          <BulkMoveStageDialog
            open
            onOpenChange={() => setBulkAction(null)}
            count={selected.size}
            leadIds={[...selected]}
            to={bulkAction.to}
            onSuccess={clearSelection}
          />
        </Suspense>
      )}

      {editing && (
        <Suspense fallback={null}>
          <EditLeadDialog
            key={editing.id}
            open
            onOpenChange={() => setEditing(null)}
            lead={editing}
          />
        </Suspense>
      )}

      {blacklisting && (
        <Suspense fallback={null}>
          <BlacklistDialog
            key={blacklisting.id}
            open
            onOpenChange={() => setBlacklisting(null)}
            personId={blacklisting.personId}
            personName={blacklisting.name}
            isBlacklisted={blacklisting.isBlacklisted}
          />
        </Suspense>
      )}
    </div>
  )
}
