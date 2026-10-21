import { useMemo, useState } from 'react'
import { Ban, Pencil, UserRound, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SOURCES, STAGES } from '../constants'
import { computeQuality } from '../data-quality'
import { timeAgo } from '../format'
import type { Lead, StageKey } from '../types'
import { QualityDot } from './quality-dot'

/**
 * Kanban board (Module 01): one column per stage. Dropping a card never moves
 * the lead silently — it opens the strict move dialog (WON/LOST open their
 * reason-requiring dialogs). Columns stay populated but compact.
 */
export function LeadBoard({
  leads,
  onOpen,
  onStageChange,
  onEdit,
  canEditLead
}: {
  leads: Lead[]
  onOpen: (lead: Lead) => void
  onStageChange: (lead: Lead, to: StageKey) => void
  onEdit: (lead: Lead) => void
  canEditLead: (lead: Lead) => boolean
}): React.JSX.Element {
  const all = leads
  const [dragId, setDragId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<StageKey | null>(null)

  const groups = useMemo(
    () => new Map(STAGES.map((s) => [s.key, all.filter((l) => l.stage === s.key)])),
    [all]
  )

  return (
    <div className="grid grid-cols-3 gap-3">
      {STAGES.map((stage) => {
        const columnLeads = groups.get(stage.key) ?? []
        return (
          <div
            key={stage.key}
            onDragOver={(e) => {
              e.preventDefault()
              setOverCol(stage.key)
            }}
            onDragLeave={() => setOverCol((c) => (c === stage.key ? null : c))}
            onDrop={(e) => {
              e.preventDefault()
              const id = Number(e.dataTransfer.getData('text/lead-id'))
              const lead = all.find((l) => l.id === id)
              setOverCol(null)
              setDragId(null)
              if (lead && lead.stage !== stage.key) onStageChange(lead, stage.key)
            }}
            className={cn(
              'flex min-w-0 flex-col rounded-lg border bg-muted/30',
              overCol === stage.key && 'border-primary bg-primary/5'
            )}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">{stage.label}</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {columnLeads.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {columnLeads.map((lead) => {
                const q = computeQuality(lead, all)
                return (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(lead.id)
                      e.dataTransfer.setData('text/lead-id', String(lead.id))
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverCol(null)
                    }}
                    onClick={() => onOpen(lead)}
                    className={cn(
                      'cursor-pointer rounded-md border bg-card p-2.5 transition-transform hover:shadow-sm',
                      dragId === lead.id && 'opacity-50',
                      lead.isBlacklisted && 'border-destructive/30 bg-destructive/5'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                        {lead.isBlacklisted ? (
                          <Ban className="size-3 shrink-0 text-destructive" aria-label="Blacklisted" />
                        ) : null}
                        <span className="truncate">{lead.name}</span>
                      </span>
                      <QualityDot quality={q} className="mt-0.5" />
                    </div>
                    <div className="mt-2 flex flex-col gap-1 border-t pt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <UserRound className="size-3" />
                        {lead.owner?.name || 'Unassigned'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <CalendarClock className="size-3" />
                        {(() => {
                          const open = lead.followUps
                            .filter((f) => !f.completedAt)
                            .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
                          return open ? `Next ${timeAgo(open.dueAt)}` : 'No follow-up'
                        })()}
                      </span>
                      <span className="truncate text-muted-foreground/70">
                        {SOURCES[lead.source]}
                      </span>
                    </div>
                    {canEditLead(lead) ? (
                      <div className="mt-1.5 flex justify-end border-t pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit ${lead.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onEdit(lead)
                          }}
                          className="size-6 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {columnLeads.length === 0 ? (
                <p className="rounded-md border border-dashed px-2 py-3 text-center text-xs text-muted-foreground/60">
                  Drop a lead here
                </p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
