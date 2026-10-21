import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'

/**
 * Honest landing for modules that are designed (docs/modules 01–15) but not yet
 * built. Renders the shared page-header convention plus an invitation, so the
 * shell's nav is fully navigable today without fake screens.
 */
export function ModulePlaceholder({
  title,
  description,
  icon: Icon,
  scope
}: {
  title: string
  description: string
  icon: LucideIcon
  scope: string
}): React.JSX.Element {
  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title={title}
        description={description}
        actions={<Badge variant="secondary">{scope}</Badge>}
      />
      <EmptyState
        icon={Icon}
        title={`${title} is on the roadmap`}
        description="This module's read model isn't wired up yet. The shell is ready — the screen below will host it."
      />
    </div>
  )
}
