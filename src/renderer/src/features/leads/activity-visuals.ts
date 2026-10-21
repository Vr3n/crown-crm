import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Dumbbell,
  FileText,
  MapPin,
  MessageCircle,
  PhoneCall,
  Tag,
  UserRound,
  Users,
  XCircle
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ActivityTypeKey } from './types'

/**
 * Shared activity iconography + tone chips. Used by the lead-detail Timeline and
 * by the global Activities page so every activity reads identically across the
 * app — one icon family, one set of tints.
 */
export const ACTIVITY_ICONS: Partial<Record<ActivityTypeKey, LucideIcon>> = {
  LEAD_CREATED: Users,
  PHONE_CALL: PhoneCall,
  WALK_IN: MapPin,
  WHATSAPP: MessageCircle,
  GYM_TOUR: Dumbbell,
  TRIAL: Dumbbell,
  NO_SHOW: XCircle,
  PRICE_DISCUSSION: Tag,
  MEMBERSHIP_PROPOSAL: Tag,
  OWNER_CHANGE: UserRound,
  STAGE_CHANGE: ArrowRight,
  FOLLOW_UP_CREATED: BellRing,
  FOLLOW_UP_DONE: CheckCircle2,
  NOTE: FileText,
  LOST: XCircle,
  WON: CheckCircle2
}

export const ACTIVITY_TONE: Record<ActivityTypeKey, string> = {
  LEAD_CREATED: 'bg-muted text-muted-foreground',
  PHONE_CALL: 'bg-primary/10 text-primary',
  WALK_IN: 'bg-muted text-muted-foreground',
  WHATSAPP: 'bg-primary/10 text-primary',
  GYM_TOUR: 'bg-primary/10 text-primary',
  TRIAL: 'bg-success/15 text-success',
  NO_SHOW: 'bg-warning/15 text-warning',
  PRICE_DISCUSSION: 'bg-muted text-muted-foreground',
  MEMBERSHIP_PROPOSAL: 'bg-primary/10 text-primary',
  OWNER_CHANGE: 'bg-primary/10 text-primary',
  STAGE_CHANGE: 'bg-muted text-muted-foreground',
  FOLLOW_UP_CREATED: 'bg-muted text-muted-foreground',
  FOLLOW_UP_DONE: 'bg-success/15 text-success',
  NOTE: 'bg-muted text-muted-foreground',
  LOST: 'bg-destructive/10 text-destructive',
  WON: 'bg-success/15 text-success'
}
