import { Pencil, PhoneCall, Mail, Ban, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { PersonCell } from '@/components/person/person-cell'
import { SOURCES, STAGES } from '../constants'
import { computeQuality, qualityMessage, qualityTier } from '../data-quality'
import { displayPhone, timeAgo } from '../format'
import type { Lead, StageKey } from '../types'
import { QualityDot } from './quality-dot'
import { StageBadge } from './stage-badge'

/**
 * Airtable-minimal lead table: one row per lead, quiet hairlines, no heavy
 * card chrome. Stage is edited inline and always routes through the strict
 * move dialog (LOST opens its reason-requiring dialog; WON is unreachable
 * until the Module 02 conversion handoff exists).
 *
 * Selection is lifted to the page so the tab-row toolbar (Delete / Move Stage)
 * can act on it; the page owns the `Set<number>` and passes it back down.
 */
export function LeadTable({
  leads,
  selected,
  onSelectionChange,
  onOpen,
  onStageChange,
  onEdit,
  onBlacklist,
  canEditLead,
  canBlacklist
}: {
  leads: Lead[]
  selected: Set<number>
  onSelectionChange: (next: Set<number>) => void
  onOpen: (lead: Lead) => void
  onStageChange: (lead: Lead, to: StageKey) => void
  onEdit: (lead: Lead) => void
  onBlacklist: (lead: Lead) => void
  canEditLead: (lead: Lead) => boolean
  canBlacklist: boolean
}): React.JSX.Element {
  const all = leads
  // The Actions column renders only when at least one row is editable, so a
  // read-only role (e.g. Front Desk) never sees empty column chrome.
  const anyEditable = all.some(canEditLead)
  const showActions = anyEditable || canBlacklist

  const toggleRow = (id: number): void =>
    onSelectionChange(
      (() => {
        const next = new Set(selected)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })()
    )

  const toggleAll = (value: boolean): void =>
    onSelectionChange(value ? new Set(all.map((l) => l.id)) : new Set())

  const nextFollowUp = (lead: Lead): string => {
    const open = lead.followUps
      .filter((f) => !f.completedAt)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
    return open ? timeAgo(open.dueAt) : '—'
  }
  const lastActivity = (lead: Lead): string => {
    const sorted = [...lead.activities].sort((a, b) => b.at.localeCompare(a.at))
    return sorted[0] ? timeAgo(sorted[0].at) : '—'
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-primary/5 hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox
                checked={
                  all.length > 0 && selected.size === all.length
                    ? true
                    : selected.size > 0
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(value) => toggleAll(Boolean(value))}
                aria-label="Select all leads"
              />
            </TableHead>
            <TableHead className="w-[22%] text-primary">Lead</TableHead>
            <TableHead className="text-primary">Contact</TableHead>
            <TableHead className="text-primary">Source</TableHead>
            <TableHead className="text-primary">Stage</TableHead>
            <TableHead className="text-primary">Owner</TableHead>
            <TableHead className="text-primary">Next follow-up</TableHead>
            <TableHead className="text-right text-primary">Last activity</TableHead>
            {showActions ? (
              <TableHead className="w-16 text-right text-primary">Actions</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {all.map((lead) => {
            const q = computeQuality(lead, all)
            // WON stays absorbing; LOST leads can be won back, so only WON
            // disables the inline stage move.
            const moveDisabled = lead.stage === 'WON'
            return (
              <TableRow
                key={lead.id}
                data-state={selected.has(lead.id) ? 'selected' : undefined}
                className={cn(
                  'group cursor-pointer',
                  lead.isBlacklisted
                    ? 'bg-destructive/5 hover:bg-destructive/10 data-[state=selected]:!bg-destructive/15'
                    : 'data-[state=selected]:bg-primary/5'
                )}
                onClick={() => onOpen(lead)}
              >
                <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(lead.id)}
                    onCheckedChange={() => toggleRow(lead.id)}
                    aria-label={`Select ${lead.name}`}
                    className="group-hover:border-muted-foreground/60"
                  />
                </TableCell>
                <TableCell>
                  <PersonCell
                    personId={lead.personId}
                    name={lead.name}
                    subtext={
                      <>
                        {lead.isBlacklisted ? (
                          <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                            <Ban className="size-2.5" />
                            Blacklisted
                          </Badge>
                        ) : null}
                        {qualityTier(q) !== 'clean' ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-[11px] font-medium',
                              qualityTier(q) === 'bad' ? 'text-destructive' : 'text-warning'
                            )}
                          >
                            <QualityDot quality={q} />
                            {qualityMessage(q)}
                          </span>
                        ) : null}
                      </>
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <PhoneCall className="size-3" /> {displayPhone(lead.phone)}
                    </span>
                    {lead.email ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Mail className="size-3" /> {lead.email}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{SOURCES[lead.source]}</span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={lead.stage}
                    onValueChange={(v) => v !== lead.stage && onStageChange(lead, v as StageKey)}
                    disabled={moveDisabled}
                  >
                    <SelectTrigger className="h-8 w-36 border-transparent bg-transparent text-left hover:bg-accent">
                      <SelectValue>
                        <StageBadge stage={lead.stage} isBlacklisted={lead.isBlacklisted} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      {STAGES.filter((s) => s.key !== 'WON').map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {lead.owner?.name || 'Unassigned'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{nextFollowUp(lead)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm text-muted-foreground">{lastActivity(lead)}</span>
                </TableCell>
                {showActions ? (
                  <TableCell className="w-16 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {canBlacklist ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={
                                lead.isBlacklisted
                                  ? `Lift blacklist for ${lead.name}`
                                  : `Blacklist ${lead.name}`
                              }
                              onClick={() => onBlacklist(lead)}
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
                              size="icon"
                              aria-label={`Edit ${lead.name}`}
                              onClick={() => onEdit(lead)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">Edit</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
