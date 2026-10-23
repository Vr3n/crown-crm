import { cn } from '@/lib/utils'

export type StatusTone = 'success' | 'warning' | 'destructive' | 'info' | 'neutral' | 'stamp'

const TONES: Record<StatusTone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  destructive: 'bg-destructive-soft text-destructive',
  info: 'bg-accent-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
  stamp: 'bg-stamp-soft text-stamp'
}

/** Small, colour-coded status chip. Colour is never the only signal. */
export function StatusPill({
  children,
  tone = 'neutral',
  className
}: {
  children: React.ReactNode
  tone?: StatusTone
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-none px-1.5 py-0 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
