export interface ModuleTone {
  /** 2px rule above a page header. */
  rule: string
  /** Accent text for eyebrows and links. */
  text: string
  /** Tinted icon plate for empty states. */
  soft: string
  /** Solid chip for charts or counts. */
  chip: string
}

const TONES = {
  primary: {
    rule: 'border-t-primary',
    text: 'text-primary',
    soft: 'bg-accent-soft text-primary',
    chip: 'bg-primary text-primary-foreground'
  },
  success: {
    rule: 'border-t-success',
    text: 'text-success',
    soft: 'bg-success-soft text-success',
    chip: 'bg-success text-white'
  },
  warning: {
    rule: 'border-t-warning',
    text: 'text-warning',
    soft: 'bg-warning-soft text-warning',
    chip: 'bg-warning text-paper'
  },
  stamp: {
    rule: 'border-t-stamp',
    text: 'text-stamp',
    soft: 'bg-stamp-soft text-stamp',
    chip: 'bg-stamp text-paper'
  },
  info: {
    rule: 'border-t-info',
    text: 'text-info',
    soft: 'bg-accent-soft text-info',
    chip: 'bg-info text-white'
  }
} satisfies Record<string, ModuleTone>

export type ModuleToneName = keyof typeof TONES

/**
 * One accent per workflow area so pages are recognisable without changing the
 * neutral body. Colour is a wayfinding cue, never the only signal.
 */
export function toneForPath(pathname: string): ModuleTone {
  if (pathname.startsWith('/parties') || pathname.startsWith('/customers') || pathname.startsWith('/suppliers')) {
    return TONES.success
  }
  if (pathname.startsWith('/items') || pathname.startsWith('/stock')) return TONES.warning
  if (pathname.startsWith('/reports') || pathname.startsWith('/day-book')) return TONES.info
  if (pathname.startsWith('/settings') || pathname.startsWith('/setup')) return TONES.stamp
  if (pathname.startsWith('/purchases') || pathname.startsWith('/payments')) return TONES.stamp
  return TONES.primary
}
