import { Lock, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Role } from '../types'

/**
 * Role badge. The tone is meaningful, not decorative: super roles (Owner/Admin)
 * render in the primary accent with a shield — they short-circuit the permission
 * check — while system roles get a lock (non-removable) and ordinary roles stay
 * quiet outline so the table scans on the exceptions.
 */
export function RoleBadge({
  role
}: {
  role: Pick<Role, 'name' | 'isSuper' | 'isSystemRole'>
}): React.JSX.Element {
  if (role.isSuper) {
    return (
      <Badge variant="default" className="gap-1">
        <ShieldCheck className="size-3" />
        {role.name}
      </Badge>
    )
  }
  if (role.isSystemRole) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Lock className="size-3" />
        {role.name}
      </Badge>
    )
  }
  return <Badge variant="outline">{role.name}</Badge>
}
