import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function SaleSectionCard({
  id,
  step,
  title,
  description,
  required,
  badge,
  icon,
  children
}: {
  id: string
  step: number
  title: string
  description: string
  required?: boolean
  badge?: string
  icon?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20">
      <Card className="gap-0 overflow-hidden rounded-xl border border-border bg-card py-0 shadow-sm transition-shadow hover:shadow-md">
        <CardHeader className="gap-1.5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground shadow-sm">
              {step}
            </span>
            {icon ? (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
                {icon}
              </span>
            ) : null}
            <CardTitle id={`${id}-heading`} className="text-sm font-semibold tracking-tight">
              {title}
              {required ? <span className="ml-1 text-destructive">*</span> : null}
            </CardTitle>
            {badge ? (
              <Badge variant="secondary" className="text-[11px]">
                {badge}
              </Badge>
            ) : null}
            <span className="text-xs font-normal text-muted-foreground">· {description}</span>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center">
            {children}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
