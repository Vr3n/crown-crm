import { Route } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { stageConfig } from '../../constants'
import { formatDateTime } from '../../format'
import type { Lead } from '../../types'

/**
 * Stage history trail (Module 01 §24): NEW → CONTACTED → … with who/when,
 * proving every stage change was caused by a recorded activity.
 */
export function StageHistory({ lead }: { lead: Lead }): React.JSX.Element {
  const entries = [...lead.stageHistory].sort((a, b) => a.at.localeCompare(b.at))
  return (
    <Card
      className="crm-gradient-border"
      style={
        {
          '--gradient-start': 'var(--primary)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="size-4 text-primary" />
          Stage history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stage changes recorded.</p>
        ) : (
          <ol className="relative ml-2 flex flex-col gap-3 border-l border-border pl-4">
            {entries.map((e, i) => (
              <li key={i} className="relative">
                <span
                  className={`absolute top-1 -left-[21px] size-2 rounded-full ${
                    stageConfig(e.to).tone === 'success'
                      ? 'bg-success'
                      : stageConfig(e.to).tone === 'danger'
                        ? 'bg-red-800'
                        : stageConfig(e.to).tone === 'engaged'
                          ? 'bg-cyan-500'
                          : stageConfig(e.to).tone === 'hot'
                            ? 'bg-yellow-500'
                            : 'bg-muted-foreground'
                  }`}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {e.from ? `${stageConfig(e.from).label} → ` : ''}
                    {stageConfig(e.to).label}
                  </p>
                  <span className="text-xs text-muted-foreground">{formatDateTime(e.at)}</span>
                </div>
                {e.by ? <p className="text-xs text-muted-foreground">by {e.by}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
