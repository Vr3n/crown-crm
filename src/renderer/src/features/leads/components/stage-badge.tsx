import { Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stageConfig } from '../constants'
import type { StageKey } from '../types'

const toneClass: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  engaged: 'bg-cyan-500/10 text-cyan-600',
  hot: 'bg-yellow-500/10 text-yellow-600',
  success: 'bg-success/15 text-success',
  danger: 'bg-red-800/15 text-red-800'
}

/**
 * Stage pill. `isBlacklisted` is an optional *person-state* marker layered on
 * top of the stage tone — pipeline position (tone) and person state read as
 * two dimensions, so blacklisting never overrides the stage color. Only lead-
 * context call sites pass it; stage-key-only usages (filter options, target
 * displays) leave it unset.
 */
export function StageBadge({
  stage,
  isBlacklisted,
  className
}: {
  stage: StageKey
  isBlacklisted?: boolean
  className?: string
}): React.JSX.Element {
  const cfg = stageConfig(stage)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClass[cfg.tone],
        className
      )}
    >
      <span
        className={cn('size-1.5 rounded-full', {
          'bg-current': true
        })}
      />
      {cfg.label}
      {isBlacklisted ? (
        <span className="inline-flex items-center gap-0.5" title="Blacklisted">
          <Ban className="size-3" aria-label="Blacklisted" />
        </span>
      ) : null}
    </span>
  )
}
