import { ArrowRightLeft, BellPlus, NotebookPen, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { stageConfig } from '../constants'
import type { StageConfig, StageKey } from '../types'
import { StageBadge } from './stage-badge'

/**
 * The bulk-action toolbar shown in the Table/Board tab row while rows are
 * selected (table view only). Delete is gated on `lead.delete`, Move Stage on
 * `lead.update_stage`, follow-ups on `followup.create`, activities on
 * `lead.record_activity` — the same codes the backend enforces, so hiding these
 * is UX, never authorization. Move Stage lists only stages reachable from
 * EVERY selected lead (intersection of forward stages), so a single choice is
 * always legal for the whole batch.
 */
export function LeadSelectionToolbar({
  count,
  canDelete,
  canMove,
  canScheduleFollowup,
  canLogActivity,
  moveOptions,
  isDeleting,
  isMoving,
  onDelete,
  onMoveStage,
  onScheduleFollowups,
  onLogActivities
}: {
  count: number
  canDelete: boolean
  canMove: boolean
  canScheduleFollowup: boolean
  canLogActivity: boolean
  moveOptions: StageConfig[]
  isDeleting: boolean
  isMoving: boolean
  onDelete: () => void
  onMoveStage: (key: StageKey) => void
  onScheduleFollowups: () => void
  onLogActivities: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium tabular-nums">{count} selected</span>
      <span className="h-4 w-px bg-border" aria-hidden="true" />

      {canScheduleFollowup && (
        <Button
          variant="outline"
          size="sm"
          onClick={onScheduleFollowups}
          className="text-primary hover:bg-primary/10 hover:text-primary"
        >
          <BellPlus className="size-4" />
          Schedule follow-up
        </Button>
      )}

      {canLogActivity && (
        <Button
          variant="outline"
          size="sm"
          onClick={onLogActivities}
          className="text-violet hover:bg-violet/10 hover:text-violet"
        >
          <NotebookPen className="size-4" />
          Schedule activity
        </Button>
      )}

      {canMove && (
        <Select
          disabled={isMoving || moveOptions.length === 0}
          onValueChange={(v) => onMoveStage(v as StageKey)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Move stage"
            className="w-44 gap-2 border-transparent bg-muted/60 text-secondary hover:bg-secondary/10 hover:text-secondary data-placeholder:text-secondary"
          >
            <ArrowRightLeft className="size-4" />
            <SelectValue placeholder={isMoving ? 'Moving…' : 'Move stage'} />
          </SelectTrigger>
          <SelectContent align="start">
            {moveOptions.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                <span className="flex items-center gap-2">
                  <StageBadge stage={s.key} />
                  {stageConfig(s.key).label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {canDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isDeleting}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {count} {count === 1 ? 'lead' : 'leads'}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the selected leads, their activities, follow-ups, and stage
                history. It can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
