import { Bell, Eye, RotateCcw, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Row actions: icon-only View-details (Eye), Make Payment (Wallet), optional
 * Renew (RotateCcw, only when onRenew is provided) and Follow-up (Bell). Each
 * is a slightly larger outlined button tinted with a brand accent so the
 * actions are easy to tell apart at a glance.
 */
export function RowActions({
  memberName,
  onView,
  onMakePayment,
  onRenew,
  onFollowUp
}: {
  memberName: string
  onView?: () => void
  onMakePayment?: () => void
  onRenew?: () => void
  onFollowUp?: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-end gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="text-primary hover:bg-primary/10 hover:text-primary"
            aria-label={`View ${memberName} details`}
            onClick={() =>
              onView
                ? onView()
                : toast('Member details', {
                    description: 'The Members module (Module 02) will open the full member record.'
                  })
            }
          >
            <Eye className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">View details</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700 dark:text-cyan-400 dark:hover:bg-cyan-950"
            aria-label={`Make payment for ${memberName}`}
            onClick={() =>
              onMakePayment
                ? onMakePayment()
                : toast('Record payment', {
                    description: 'Payment recording will open shortly.'
                  })
            }
          >
            <Wallet className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Make payment</TooltipContent>
      </Tooltip>

      {onRenew ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
              aria-label={`Renew ${memberName} membership`}
              onClick={onRenew}
            >
              <RotateCcw className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Renew</TooltipContent>
        </Tooltip>
      ) : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="text-secondary hover:bg-secondary/10 hover:text-secondary"
            aria-label={`Follow up on ${memberName}`}
            onClick={() =>
              onFollowUp
                ? onFollowUp()
                : toast('Follow-up scheduling', {
                    description: 'Member follow-ups arrive with the Members module (Module 02).'
                  })
            }
          >
            <Bell className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Follow up</TooltipContent>
      </Tooltip>
    </div>
  )
}
