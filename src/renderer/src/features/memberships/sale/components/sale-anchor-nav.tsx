import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { id: 'lead', label: 'Member' },
  { id: 'plan', label: 'Plan' },
  { id: 'offer', label: 'Offer' },
  { id: 'dates', label: 'Dates' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'payment', label: 'Payment' }
] as const

export function SaleAnchorNav(): React.JSX.Element {
  const [active, setActive] = useState<string>('lead')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  function scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav
      aria-label="Form sections"
      className="sticky top-0 z-10 -mx-6 border-b border-border/50 bg-background/80 px-6 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {SECTIONS.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => scrollTo(s.id)}
              aria-current={active === s.id ? 'true' : undefined}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                active === s.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              )}
            >
              <span className="tabular-nums">{idx + 1}.</span> {s.label}
            </button>
            {idx < SECTIONS.length - 1 ? (
              <span aria-hidden className="h-px w-3 shrink-0 bg-border" />
            ) : null}
          </div>
        ))}
      </div>
    </nav>
  )
}
