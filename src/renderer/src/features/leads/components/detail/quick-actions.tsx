import { useState } from 'react'
import { PhoneCall, BellPlus, ArrowRight, XCircle, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BlacklistDialog } from '@/features/people/components/blacklist-dialog'
import { isTerminal } from '../../constants'
import type { Lead } from '../../types'

export type QuickActionType = 'activity' | 'followup' | 'move' | 'lost'

/**
 * Quick actions on the detail page — the primary verbs a staff member uses
 * with a lead. WON is absorbing so move/mark-lost hide once won; LOST stays
 * re-openable (win-back), hiding only mark-lost. Converting to a customer is
 * Module 02 (not built yet), so no WON action is surfaced here.
 */
export function QuickActions({
  lead,
  onAction,
  isBlacklisted,
  canManageBlacklist
}: {
  lead: Lead
  onAction: (a: QuickActionType) => void
  isBlacklisted: boolean
  canManageBlacklist: boolean
}): React.JSX.Element {
  const terminal = isTerminal(lead.stage)
  const [blacklistOpen, setBlacklistOpen] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button variant="outline" className="justify-start" onClick={() => onAction('activity')}>
          <PhoneCall className="text-primary" />
          Log activity
        </Button>
        <Button variant="outline" className="justify-start" onClick={() => onAction('followup')}>
          <BellPlus className="text-primary" />
          Add follow-up
        </Button>
        {lead.stage !== 'WON' && (
          <Button variant="outline" className="justify-start" onClick={() => onAction('move')}>
            <ArrowRight className="text-primary" />
            Move stage
          </Button>
        )}
        {!terminal && (
          <Button
            variant="outline"
            className="justify-start text-destructive hover:bg-destructive/10"
            onClick={() => onAction('lost')}
          >
            <XCircle className="text-destructive" />
            Mark as lost
          </Button>
        )}
        {canManageBlacklist && (
          <Button
            variant="outline"
            className="justify-start text-destructive hover:bg-destructive/10"
            onClick={() => setBlacklistOpen(true)}
          >
            <Ban className="text-destructive" />
            {isBlacklisted ? 'Lift blacklist' : 'Blacklist person'}
          </Button>
        )}
      </CardContent>

      <BlacklistDialog
        open={blacklistOpen}
        onOpenChange={setBlacklistOpen}
        personId={lead.personId}
        personName={lead.name}
        isBlacklisted={isBlacklisted}
      />
    </Card>
  )
}
