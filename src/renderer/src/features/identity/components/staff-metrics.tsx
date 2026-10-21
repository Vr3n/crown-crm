import { CircleUserRound, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import { IdentityMetric } from './identity-metric'
import type { StaffMember } from '../types'

/**
 * Staff headline (Module 15). Active vs invited vs disabled tells the front
 * desk at a glance who can actually sign in; the super count is the blast
 * radius of the two root roles (Owner/Admin).
 */
export function StaffMetrics({
  staff,
  superCount
}: {
  staff: StaffMember[]
  superCount: number
}): React.JSX.Element {
  const active = staff.filter((s) => s.status === 'ACTIVE').length
  const invited = staff.filter((s) => s.status === 'INVITED').length
  const disabled = staff.filter((s) => s.status === 'DISABLED').length

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <IdentityMetric
        icon={CircleUserRound}
        label="Total staff"
        value={String(staff.length)}
        hint={`${active} active`}
      />
      <IdentityMetric
        icon={UserCheck}
        label="Active"
        value={String(active)}
        hint="Can sign in"
        tone="success"
      />
      <IdentityMetric
        icon={UserCheck}
        label="Invited"
        value={String(invited)}
        hint="Awaiting first login"
        tone="warning"
      />
      <IdentityMetric
        icon={UserX}
        label="Disabled"
        value={String(disabled)}
        hint="Sign-in blocked"
        tone="destructive"
      />
      <IdentityMetric
        icon={ShieldCheck}
        label="Super roles"
        value={String(superCount)}
        hint="Owner + Admin"
      />
    </div>
  )
}
