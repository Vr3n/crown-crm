import { CalendarClock, BellOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isTerminal } from '../../constants'
import { dueLabel, formatDateTime } from '../../format'
import type { Lead } from '../../types'

/**
 * "What should happen next?" (Module 01 §25). A non-terminal lead with no
 * scheduled follow-up is flagged as operationally suspicious — a real leak.
 */
export function NextActionCard({ lead }: { lead: Lead }): React.JSX.Element {
  const open = lead.followUps
    .filter((f) => !f.completedAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
  const terminal = isTerminal(lead.stage)

  if (open) {
    const d = dueLabel(open.dueAt)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4 text-primary" />
            Next action
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium">{open.title}</p>
          <p
            className={cn(
              'mt-1 text-sm',
              d.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
            )}
          >
            {d.overdue ? 'Overdue — ' : 'Due '}
            {d.text} · {formatDateTime(open.dueAt)}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (terminal) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next action</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This lead is {lead.stage === 'WON' ? 'won' : 'lost'} — no follow-up needed.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellOff className="size-4 text-destructive" />
          No next action
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This lead has no scheduled follow-up. Schedule one so it doesn&apos;t go cold.
        </p>
      </CardContent>
    </Card>
  )
}
