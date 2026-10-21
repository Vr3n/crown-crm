import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'

/**
 * Honest landing for a screen whose phase has not started. It says which phase
 * delivers it and what the screen will do, so the navigation is complete
 * without pretending a feature exists.
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
        title={`${title} arrives in ${scope}`}
        description="The shell, permissions and navigation are ready. This screen will be built in the phase shown above."
      />
    </div>
  )
}
