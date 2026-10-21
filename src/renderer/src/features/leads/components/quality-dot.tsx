import { CircleAlert, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { LeadQuality } from '../data-quality'
import { qualityMessage, qualityTier } from '../data-quality'

/**
 * A subtle warning dot on a lead row/card whose record has data-quality
 * issues (missing phone, placeholder data, no owner, possible duplicate, …).
 * Hovering reveals the specific problems — the app surfaces the dirt rather
 * than hiding it.
 */
export function QualityDot({
  quality,
  className
}: {
  quality: LeadQuality
  className?: string
}): React.JSX.Element | null {
  const tier = qualityTier(quality)
  if (tier === 'clean') return null
  const message = qualityMessage(quality)
  const Icon = tier === 'bad' ? CircleAlert : TriangleAlert
  const color = tier === 'bad' ? 'text-destructive' : 'text-warning'
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className}>
            <Icon className={cn('size-3.5 shrink-0', color)} aria-hidden />
            <span className="sr-only">{message}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="max-w-56 text-xs">{message}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
