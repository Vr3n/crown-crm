import { useState } from 'react'
import { Lock, ShieldCheck, UserCog } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { effectivePermissionCodes } from '../build'
import { useUpdateRole } from '../queries'
import { PermissionPanel } from './permission-panel'
import { RoleBadge } from './role-badge'
import type { Role } from '../types'

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const code of a) if (!b.has(code)) return false
  return true
}

/**
 * The role drawer (Module 15). For a custom role this is the permission editor —
 * name, description, and the grouped code catalog. Super roles render a lock
 * note instead of the catalog because they short-circuit the permission check
 * entirely; system roles keep the catalog but their name/description are locked.
 */
export function RoleDetailSheet({
  role,
  open,
  onOpenChange,
  readOnly = false
}: {
  role: Role | null
  open: boolean
  onOpenChange: (open: boolean) => void
  readOnly?: boolean
}): React.JSX.Element {
  if (!role) return <Sheet open={open} onOpenChange={onOpenChange} />
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Keyed by role id so the editor state resets when the selection changes. */}
      <RoleDetailSheetBody
        key={role.id}
        role={role}
        onOpenChange={onOpenChange}
        readOnly={readOnly}
      />
    </Sheet>
  )
}

function RoleDetailSheetBody({
  role,
  onOpenChange,
  readOnly
}: {
  role: Role
  onOpenChange: (open: boolean) => void
  readOnly: boolean
}): React.JSX.Element {
  const updateRole = useUpdateRole()
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description ?? '')
  const [codes, setCodes] = useState<Set<string>>(() => new Set(effectivePermissionCodes(role)))

  const editable = !role.isSystemRole && !readOnly
  const dirty =
    name !== role.name ||
    description !== (role.description ?? '') ||
    !setsEqual(codes, new Set(effectivePermissionCodes(role)))

  const save = (): void => {
    updateRole.mutate(
      {
        roleId: role.id,
        name: editable ? name : undefined,
        description: editable ? description : undefined,
        permissionCodes: role.isSuper ? undefined : [...codes]
      },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  const toggle = (code: string, checked: boolean): void => {
    setCodes((prev) => {
      const next = new Set(prev)
      if (checked) next.add(code)
      else next.delete(code)
      return next
    })
  }

  return (
    <SheetContent className="w-full gap-0 border-l p-0 sm:max-w-md">
      <SheetHeader className="gap-3 border-b border-border/80 pr-12">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            {role.isSuper ? <ShieldCheck className="size-5" /> : <UserCog className="size-5" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-lg">{role.name}</SheetTitle>
              <RoleBadge role={role} />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {role.memberCount ?? 0} member{role.memberCount === 1 ? '' : 's'} assigned
            </p>
          </div>
        </div>
        {role.description ? (
          <p className="text-sm text-muted-foreground">{role.description}</p>
        ) : null}
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-6">
          {role.isSuper ? (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">Grants every permission</p>
                <p className="text-xs text-muted-foreground">
                  Super roles bypass the permission check — they can never be locked out of the
                  organization. The permission set is fixed.
                </p>
              </div>
            </div>
          ) : (
            <>
              {editable ? (
                <div className="flex flex-col gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="role-name">Role name</Label>
                    <Input
                      id="role-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Front Desk"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="role-description">Description</Label>
                    <Input
                      id="role-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What this role is allowed to do"
                    />
                  </div>
                </div>
              ) : !readOnly ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <Lock className="size-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    System role — name and description are fixed, but permissions below are still
                    configurable.
                  </p>
                </div>
              ) : null}

              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-heading text-sm font-medium">Permissions</h3>
                  <Badge variant="outline" className="font-mono tabular-nums">
                    {codes.size} granted
                  </Badge>
                </div>
                <PermissionPanel granted={codes} onToggle={toggle} readOnly={readOnly} />
              </section>
            </>
          )}
        </div>
      </div>

      <SheetFooter className="border-t border-border/80 px-5 py-4">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        {!role.isSuper && !readOnly ? (
          <Button onClick={save} disabled={!dirty || updateRole.isPending}>
            {updateRole.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        ) : null}
      </SheetFooter>
    </SheetContent>
  )
}
