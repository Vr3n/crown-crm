import { useMemo, useState } from 'react'
import { ShieldCheck, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { can, useSession } from '@/context/session-context'
import { memberCountByRole, superStaff } from '../build'
import { AddStaffDialog } from '../components/add-staff-dialog'
import { RoleDetailSheet } from '../components/role-detail-sheet'
import { RolesTable } from '../components/roles-table'
import { StaffDetailSheet } from '../components/staff-detail-sheet'
import { StaffMetrics } from '../components/staff-metrics'
import { StaffTable } from '../components/staff-table'
import { filterStaff } from '../filters'
import { useRoles, useStaff } from '../queries'
import type { Role, StaffMember, StaffStatus } from '../types'

const STAFF_STATUS_OPTIONS: (StaffStatus | 'ALL')[] = ['ALL', 'ACTIVE', 'INVITED', 'DISABLED']

/**
 * Users & Roles (Module 15) — the access-control workbench. Who can sign in
 * (staff, with role + status), and what each role can do (the permission
 * editor). Every action is gated: viewing needs `user.view`, assigning roles or
 * toggling status needs `user.manage`, and editing a role's permission set
 * needs `role.manage`.
 */
export function UsersPage(): React.JSX.Element {
  const session = useSession()
  const { data: staff = [], isLoading: staffLoading } = useStaff()
  const { data: roles = [], isLoading: rolesLoading } = useRoles()

  const [tab, setTab] = useState<'users' | 'roles'>('users')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<StaffStatus | 'ALL'>('ALL')

  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [staffSheetOpen, setStaffSheetOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [roleSheetOpen, setRoleSheetOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const canView = can(session.permissions, session.isSuper, 'user.view')
  const canManage = can(session.permissions, session.isSuper, 'user.manage')
  const canCreate = can(session.permissions, session.isSuper, 'user.create')
  const canManageRoles = can(session.permissions, session.isSuper, 'role.manage')

  const visibleStaff = useMemo(
    () => filterStaff(staff, { search: '', roleId: roleFilter, status: statusFilter }),
    [staff, roleFilter, statusFilter]
  )

  const memberCounts = useMemo(() => memberCountByRole(roles, staff), [roles, staff])
  const rolesWithCounts = useMemo(
    () =>
      roles.map((r) => ({
        ...r,
        memberCount: memberCounts.get(r.id) ?? 0
      })),
    [roles, memberCounts]
  )

  if (!canView) {
    return (
      <div className="flex w-full flex-col gap-6 p-6">
        <PageHeader
          title="Users & Roles"
          description="You need the user.view permission to manage staff and roles."
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
        title="Users & Roles"
        description="Staff accounts, their roles, and the permissions each role can use."
        actions={
          canCreate ? (
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus />
              Add staff
            </Button>
          ) : null
        }
      />

      <StaffMetrics staff={staff} superCount={superStaff(staff).length} />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'users' | 'roles')}
        className="flex w-full flex-col gap-4"
      >
        <Card className="gap-0 py-0">
          <CardContent className="px-3 py-2.5">
            <TabsList variant="line" className="w-fit">
              <TabsTrigger value="users">
                <Users className="size-4" />
                Staff
                <span className="ml-1 font-mono text-xs text-muted-foreground tabular-nums">
                  {staff.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="roles">
                <ShieldCheck className="size-4" />
                Roles
                <span className="ml-1 font-mono text-xs text-muted-foreground tabular-nums">
                  {roles.length}
                </span>
              </TabsTrigger>
            </TabsList>
          </CardContent>
        </Card>

        <TabsContent value="users" className="mt-0 flex flex-col gap-4">
          <Card className="gap-0 py-0">
            <CardContent className="flex items-center gap-3 px-3 py-2.5">
              <div className="grid gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Role</Label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger size="default" className="h-9 w-44 rounded-md text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All roles</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as StaffStatus | 'ALL')}
                >
                  <SelectTrigger size="default" className="h-9 w-40 rounded-md text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === 'ALL' ? 'All statuses' : s.charAt(0) + s.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardContent className="px-3 py-3">
              <StaffTable
                staff={visibleStaff}
                isLoading={staffLoading}
                youEmail={session.userEmail}
                onOpen={(member) => {
                  setSelectedStaff(member)
                  setStaffSheetOpen(true)
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="mt-0">
          <Card className="gap-0 py-0">
            <CardContent className="px-3 py-3">
              <RolesTable
                roles={rolesWithCounts}
                isLoading={rolesLoading}
                onOpen={(role) => {
                  setSelectedRole(role)
                  setRoleSheetOpen(true)
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {addOpen && <AddStaffDialog open={addOpen} onOpenChange={setAddOpen} roles={roles} />}

      <StaffDetailSheet
        member={selectedStaff}
        roles={roles}
        open={staffSheetOpen}
        onOpenChange={setStaffSheetOpen}
        youEmail={session.userEmail}
        readOnly={!canManage}
      />

      <RoleDetailSheet
        role={selectedRole}
        open={roleSheetOpen}
        onOpenChange={setRoleSheetOpen}
        readOnly={!canManageRoles}
      />
    </div>
  )
}
