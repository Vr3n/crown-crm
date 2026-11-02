import { AlertTriangle, CheckCircle2, Clock3, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ReportStatus = 'overdue' | 'due-soon' | 'current' | 'settled' | 'posted'
export type AmountTone = 'negative' | 'positive' | 'zero'

interface StatusStyle {
  label: string
  tone: 'destructive' | 'warning' | 'success' | 'neutral'
  icon: LucideIcon
}

/**
 * Status is a 3px stripe plus a word and an icon. Every state survives
 * greyscale: the word and the icon carry the meaning, the colour reinforces it.
 */
export const REPORT_STATUS: Record<ReportStatus, StatusStyle> = {
  overdue: { label: 'Overdue', tone: 'destructive', icon: AlertTriangle },
  'due-soon': { label: 'Due in 7 days', tone: 'warning', icon: Clock3 },
  current: { label: 'Current', tone: 'success', icon: CheckCircle2 },
  settled: { label: 'Settled', tone: 'success', icon: CheckCircle2 },
  posted: { label: 'Posted', tone: 'neutral', icon: FileText }
}

export const STATUS_STRIPE: Record<StatusStyle['tone'], string> = {
  destructive: 'border-l-destructive',
  warning: 'border-l-warning',
  success: 'border-l-success',
  neutral: 'border-l-border'
}

export const STATUS_TEXT: Record<StatusStyle['tone'], string> = {
  destructive: 'text-destructive',
  warning: 'text-warning',
  success: 'text-success',
  neutral: 'text-muted-foreground'
}

export const AMOUNT_TONE: Record<AmountTone, string> = {
  negative: 'text-destructive',
  positive: 'text-success',
  zero: 'text-muted-foreground'
}
