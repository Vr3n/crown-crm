import { CircleHelp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Short field explanation shown from a help affordance in the label row.
 *
 * `summary` is one plain sentence. `points` are optional bullets for rules a
 * user must know before typing. The same text is exposed to screen readers, so
 * help never depends on hovering.
 */
export interface FieldHelpContent {
  summary: string
  points?: string[]
}

export function helpText(content: FieldHelpContent): string {
  return [content.summary, ...(content.points ?? [])].join('. ')
}

/**
 * Keyboard reachable "what is this field" control. The tooltip opens on hover
 * and on focus, and a visually hidden copy of the text is linked with
 * `aria-describedby` so assistive technology reads it without interaction.
 */
export function FieldHelp({
  label,
  content,
  className
}: {
  label: string
  content: FieldHelpContent
  className?: string
}): React.JSX.Element {
  const descriptionId = `help-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return (
    <TooltipProvider delayDuration={150}>
      <span className={cn('inline-flex items-center', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`About ${label}`}
              aria-describedby={descriptionId}
              className="inline-flex size-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <CircleHelp className="size-3.5" strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="start"
            className="max-w-[280px] text-left leading-relaxed"
          >
            <div className="space-y-1 py-0.5">
              <p className="font-medium">{content.summary}</p>
              {content.points?.length ? (
                <ul className="list-disc space-y-0.5 pl-3.5">
                  {content.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </TooltipContent>
        </Tooltip>
        <span id={descriptionId} className="sr-only">
          {helpText(content)}
        </span>
      </span>
    </TooltipProvider>
  )
}
