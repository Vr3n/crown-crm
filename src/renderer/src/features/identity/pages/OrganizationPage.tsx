import { useState } from 'react'
import { Building2, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { can, useSession } from '@/context/session-context'
import { OrgEditDialog } from '../components/org-edit-dialog'
import { OrgProfileCard } from '../components/org-profile-card'
import { TenancyCard } from '../components/tenancy-card'
import { useOrganization } from '../queries'

/**
 * Organization (Module 14) — the tenant's identity and tenancy posture. The
 * profile card carries the business facts (name, billing, timezone, currency);
 * the tenancy card carries the schema facts (slug, id, plan). Editing the
 * profile needs `org.manage`; viewing needs `org.view`.
 */
export function OrganizationPage(): React.JSX.Element {
  const session = useSession()
  const { data: org, isLoading } = useOrganization()
  const [editOpen, setEditOpen] = useState(false)

  const canView = can(session.permissions, session.isSuper, 'org.view')
  const canEdit = can(session.permissions, session.isSuper, 'org.manage')

  if (!canView) {
    return (
      <div className="flex w-full flex-col gap-6 p-6">
        <PageHeader
          title="Organization"
          description="You need the org.view permission to see organization settings."
        />
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" />
          Access restricted by your role.
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Organization"
        description="Your gym\u2019s identity, timezone and currency."
        actions={
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="size-4" />
            {session.organizationName}
          </span>
        }
      />

      {isLoading || !org ? (
        <div className="flex flex-col gap-6">
          <div className="h-56 animate-pulse rounded-lg border border-border bg-muted/40" />
          <div className="h-56 animate-pulse rounded-lg border border-border bg-muted/40" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <OrgProfileCard org={org} onEdit={() => setEditOpen(true)} canEdit={canEdit} />
          <TenancyCard org={org} />
        </div>
      )}

      {org && <OrgEditDialog org={org} open={editOpen} onOpenChange={setEditOpen} />}
    </div>
  )
}
