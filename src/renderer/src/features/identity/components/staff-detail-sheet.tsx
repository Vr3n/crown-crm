import { useMemo } from 'react'
import { BadgeCheck, KeyRound, Lock, UserX } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDate, initials, timeAgo } from '@/features/leads/format'
import { STAFF_STATUS_META } from '../constants'
import { isOwner } from '../build'
import { useUpdateStaff } from '../queries'
import { RoleBadge } from './role-badge'
import type { Role, StaffMember, StaffStatus } from '../types'

/**
 * The staff drawer (Module 15). Read: who this user is and which role they hold
 * in this organization. Write: reassign the role or flip sign-in status. The
 * Owner and your own membership are protected from self-inflicted lockouts —
 * exactly the guard the command layer enforces.
 */
export function StaffDetailSheet({
  member,
  roles,
  open,
  onOpenChange,
  youEmail,
  readOnly = false
}: {
  member: StaffMember | null
  roles: Role[]
  open: boolean
  onOpenChange: (open: boolean) => void
  youEmail?: string
  readOnly?: boolean
}): React.JSX.Element {
  const updateStaff = useUpdateStaff()
  const isYou = member?.email.toLowerCase() === youEmail?.toLowerCase()

  const changeRole = (roleId: string): void => {
    if (member) {
      updateStaff.mutate({ staffId: member.id, roleId })
    }
  }

  const setStatus = (status: StaffStatus): void => {
    if (member) {
      updateStaff.mutate({ staffId: member.id, status }, { onSuccess: () => onOpenChange(false) })
    }
  }

  const roleOptions = useMemo(() => roles, [roles])

  if (!member) return <Sheet open={open} onOpenChange={onOpenChange} />

  const locked = isOwner(member) || isYou
  const statusMeta = STAFF_STATUS_META[member.status]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-l p-0 sm:max-w-md">
        <SheetHeader className="gap-3 border-b border-border/80 pr-12">
          <div className="flex items-start gap-3">
            <Avatar size="lg" className="shrink-0">
              <AvatarFallback className="font-mono">{initials(member.fullName)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg">{member.fullName}</SheetTitle>
                <Badge variant={statusMeta.tone} className="shrink-0">
                  {statusMeta.label}
                </Badge>
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground">{member.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
            <span className="text-xs text-muted-foreground">Role in this organization</span>
            <RoleBadge
              role={{
                name: member.roleName,
                isSuper: member.isSuper,
                isSystemRole: member.isSystemRole
              }}
            />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h3 className="font-heading text-sm font-medium">Details</h3>
              <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-4 px-3 py-2">
                  <span className="text-xs text-muted-foreground">User ID</span>
                  <span className="font-mono text-sm tabular-nums">#{member.userId}</span>
                </div>
                <div className="flex items-center justify-between gap-4 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Joined</span>
                  <span className="text-sm tabular-nums">
                    {formatDate(member.joinedAt)}{' '}
                    <span className="text-xs text-muted-foreground">
                      ({timeAgo(member.joinedAt)})
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Access</span>
                  <span className="text-sm">{statusMeta.label}</span>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="font-heading text-sm font-medium">Role assignment</h3>
              {locked ? (
                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {isOwner(member)
                      ? 'The Owner cannot be demoted or removed.'
                      : 'You cannot change your own role.'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="staff-role">Role</Label>
                  <Select
                    value={member.roleId}
                    onValueChange={changeRole}
                    disabled={readOnly || updateStaff.isPending}
                  >
                    <SelectTrigger id="staff-role" className="w-full">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="font-heading text-sm font-medium">Sign-in access</h3>
              {locked ? (
                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <UserX className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Sign-in status cannot be changed for the Owner or your own account.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {member.status === 'ACTIVE' ? (
                    <Button
                      variant="outline"
                      onClick={() => setStatus('DISABLED')}
                      disabled={readOnly}
                    >
                      Disable sign-in
                    </Button>
                  ) : (
                    <Button onClick={() => setStatus('ACTIVE')} disabled={readOnly}>
                      <BadgeCheck className="size-4" />
                      {member.status === 'INVITED' ? 'Activate account' : 'Enable sign-in'}
                    </Button>
                  )}
                  {member.status === 'DISABLED' ? (
                    <p className="text-xs text-muted-foreground">
                      The member keeps their data; they just can&apos;t sign in.
                    </p>
                  ) : null}
                  {member.status === 'INVITED' ? (
                    <p className="text-xs text-muted-foreground">
                      Invited but hasn&apos;t signed in yet — no password set.
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          </div>
        </div>

        <SheetFooter className="border-t border-border/80 px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {member.status === 'INVITED' && !locked ? (
            <Button onClick={() => setStatus('DISABLED')} variant="destructive" disabled={readOnly}>
              <KeyRound className="size-4" />
              Revoke invite
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
