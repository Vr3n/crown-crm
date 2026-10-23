import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FormLegend } from '@/components/ui/field'
import { focusFirstError, FormTextField, type FormFieldApi } from '@/components/ui/form-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { StatusPill } from '@/components/ui/status-pill'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { can, useSession, type SessionContextValue } from '@/context/session-context'
import { formatDate } from '@/lib/format'
import { errorMessage } from '../../../../../shared/contracts/errors'
import type {
  PermissionOutput,
  RoleOutput,
  StaffMemberOutput
} from '../../../../../shared/contracts/access'

const TH =
  'h-8 whitespace-nowrap border-b border-border bg-muted/60 px-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'h-11 border-b border-border px-3 align-middle'
const TAG = 'rounded-none px-1.5 py-0 text-[0.6875rem] uppercase tracking-[0.08em]'

const PERMISSION_LABELS: Record<string, string> = {
  'company.view': 'View company profile',
  'company.manage': 'Edit company and settings',
  'user.view': 'View people',
  'user.create': 'Invite people',
  'user.manage': 'Edit people, roles and passwords',
  'role.view': 'View roles',
  'role.manage': 'Create and edit roles',
  'party.view': 'View parties',
  'party.create': 'Create parties',
  'party.edit': 'Edit parties',
  'party.deactivate': 'Deactivate parties',
  'item.view': 'View items and masters',
  'item.create': 'Create items',
  'item.edit': 'Edit items',
  'item.deactivate': 'Deactivate items',
  'voucher.view': 'View vouchers',
  'voucher.create': 'Create vouchers',
  'voucher.post': 'Post vouchers',
  'voucher.cancel': 'Cancel vouchers',
  'receipt.view': 'View receipts',
  'receipt.record': 'Record receipts',
  'payment.view': 'View payments',
  'payment.record': 'Record payments',
  'note.view': 'View credit and debit notes',
  'note.create': 'Create credit and debit notes',
  'journal.view': 'View journals',
  'journal.create': 'Create journal entries',
  'report.view': 'View reports',
  'report.export': 'Export reports',
  'backup.manage': 'Back up and restore',
  'settings.manage': 'Manage numbering and settings'
}

const DOMAIN_LABELS: Record<string, string> = {
  company: 'Company',
  user: 'People',
  role: 'Roles',
  party: 'Parties',
  item: 'Items and masters',
  voucher: 'Vouchers',
  receipt: 'Receipts',
  payment: 'Payments',
  note: 'Notes',
  journal: 'Journals',
  report: 'Reports',
  backup: 'Backup',
  settings: 'Settings'
}

const newStaffSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .max(120, 'Keep it under 120 characters'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email').max(254),
  password: z.string().min(8, 'Use at least 8 characters').max(256),
  roleId: z.string().min(1, 'Choose a role')
})

const editStaffSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .max(120, 'Keep it under 120 characters'),
  roleId: z.string().min(1, 'Choose a role'),
  status: z.enum(['ACTIVE', 'DISABLED'])
})

const passwordSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters').max(256),
    confirm: z.string().min(1, 'Repeat the password')
  })
  .refine((value) => value.password === value.confirm, {
    message: 'Passwords do not match',
    path: ['confirm']
  })

const roleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Use at least 2 characters')
    .max(60, 'Keep it under 60 characters'),
  description: z.string().max(200, 'Keep it under 200 characters'),
  permissionCodes: z.array(z.string())
})

function assignableRoles(roles: RoleOutput[], session: SessionContextValue): RoleOutput[] {
  return roles.filter(
    (role) =>
      session.isSuper ||
      (!role.isSuper && role.permissionCodes.every((code) => session.permissions.includes(code)))
  )
}

function canManageRole(
  role: RoleOutput,
  session: SessionContextValue,
  mayManage: boolean
): boolean {
  if (!mayManage) return false
  if (session.isSuper) return true
  if (role.isSuper) return false
  return role.permissionCodes.every((code) => session.permissions.includes(code))
}

export function UsersRolesPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const session = useSession()
  const mayViewRoles = can(session.permissions, session.isSuper, 'role.view')
  const mayManageUsers = can(session.permissions, session.isSuper, 'user.manage')
  const mayManageRoles = can(session.permissions, session.isSuper, 'role.manage')

  const [newStaffOpen, setNewStaffOpen] = useState(false)
  const [editStaff, setEditStaff] = useState<StaffMemberOutput | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<StaffMemberOutput | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<StaffMemberOutput | null>(null)
  const [roleDialog, setRoleDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; role: RoleOutput } | null
  >(null)
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleOutput | null>(null)

  const staff = useQuery({
    queryKey: ['access', 'staff'],
    queryFn: () => window.api.identity.staff()
  })
  const roles = useQuery({
    queryKey: ['access', 'roles'],
    queryFn: () => window.api.identity.roles()
  })
  const permissions = useQuery({
    queryKey: ['access', 'permissions'],
    queryFn: () => window.api.identity.permissions(),
    enabled: mayViewRoles
  })

  const setStatus = useMutation({
    mutationFn: (member: StaffMemberOutput) =>
      window.api.identity.updateStaff({
        id: member.id,
        status: member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      }),
    onSuccess: (updated) => {
      toast.success(updated.status === 'ACTIVE' ? 'Person reactivated' : 'Person deactivated')
      setDeactivateTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['access'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the person'))
  })

  const removeRole = useMutation({
    mutationFn: (role: RoleOutput) => window.api.identity.deleteRole(role.id),
    onSuccess: () => {
      toast.success('Role deleted')
      setDeleteRoleTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['access'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the role'))
  })

  const staffRows = staff.data ?? []
  const roleRows = roles.data ?? []
  const permissionRows = permissions.data ?? []
  const activePeople = staffRows.filter((member) => member.status === 'ACTIVE').length
  const customRoles = roleRows.filter((role) => !role.isSystemRole).length

  function canManageMember(member: StaffMemberOutput): boolean {
    if (!mayManageUsers) return false
    if (session.isSuper) return true
    if (member.isSuper) return false
    const role = roleRows.find((candidate) => candidate.id === member.roleId)
    return role?.permissionCodes.every((code) => session.permissions.includes(code)) ?? false
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-6">
      <PageHeader
        title="Users and Roles"
        description={`${staffRows.length} ${staffRows.length === 1 ? 'person' : 'people'} · ${activePeople} active · ${roleRows.length} ${roleRows.length === 1 ? 'role' : 'roles'}`}
        actions={
          mayManageUsers ? (
            <Button size="sm" onClick={() => setNewStaffOpen(true)}>
              <UserPlus className="size-3.5" strokeWidth={2} />
              New person
            </Button>
          ) : undefined
        }
      />

      <div className="border border-border bg-card px-4 py-3">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-[0.875rem] font-medium">Local accounts, permission-first roles.</p>
            <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
              People sign in with an email and password. Owner and Admin are locked system roles; at
              least one active owner must remain, and nobody can change their own role or disable
              themselves. Billing roles cannot cancel vouchers, edit accounts or open backups unless
              you grant those permissions.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="people" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
          <TabsList variant="line">
            <TabsTrigger value="people">
              <Users className="size-3.5" />
              People
            </TabsTrigger>
            {mayViewRoles ? (
              <TabsTrigger value="roles">
                <ShieldCheck className="size-3.5" />
                Roles
              </TabsTrigger>
            ) : null}
          </TabsList>
          <p className="pb-1 text-[0.75rem] text-muted-foreground">
            {mayManageUsers || mayManageRoles
              ? 'Changes are recorded in the audit trail.'
              : 'Read only. Ask an owner for access.'}
          </p>
        </div>

        <TabsContent value="people">
          {staff.isError ? (
            <ErrorPanel
              title="Could not load people"
              message={errorMessage(staff.error, 'Try again in a moment.')}
              onRetry={() => void staff.refetch()}
            />
          ) : staffRows.length === 0 && !staff.isPending ? (
            <EmptyState
              icon={Users}
              title="No people yet"
              description="Add a person and choose the role that fits their work."
              action={
                mayManageUsers ? (
                  <Button size="sm" onClick={() => setNewStaffOpen(true)}>
                    <UserPlus className="size-3.5" strokeWidth={2} />
                    New person
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-auto border border-border bg-card">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      Person
                    </th>
                    <th scope="col" className={TH}>
                      Role
                    </th>
                    <th scope="col" className={TH}>
                      Status
                    </th>
                    <th scope="col" className={TH}>
                      Joined
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {staff.isPending ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-[0.875rem] text-muted-foreground"
                      >
                        Loading people...
                      </td>
                    </tr>
                  ) : (
                    staffRows.map((member) => {
                      const manageable = canManageMember(member)
                      return (
                        <tr
                          key={member.id}
                          className={
                            member.status === 'ACTIVE' ? 'hover:bg-muted/40' : 'opacity-60'
                          }
                        >
                          <td className={TD}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[0.9375rem] font-medium">
                                {member.fullName}
                              </span>
                              {member.isSelf ? (
                                <Badge variant="secondary" className={TAG}>
                                  You
                                </Badge>
                              ) : null}
                            </div>
                            <p className="font-mono text-[0.75rem] text-muted-foreground">
                              {member.email}
                            </p>
                          </td>
                          <td className={TD}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[0.875rem]">{member.roleName}</span>
                              {member.isSuper ? (
                                <Badge variant="outline" className={TAG}>
                                  Full access
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className={TD}>
                            <StatusPill tone={member.status === 'ACTIVE' ? 'success' : 'neutral'}>
                              {member.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                            </StatusPill>
                          </td>
                          <td className={`${TD} text-[0.8125rem] text-muted-foreground`}>
                            {formatDate(member.joinedAt)}
                          </td>
                          <td className={`${TD} text-right`}>
                            {manageable ? (
                              <div className="flex justify-end gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => setEditStaff(member)}
                                >
                                  <Pencil className="size-3.5" strokeWidth={2} />
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => setPasswordTarget(member)}
                                >
                                  <KeyRound className="size-3.5" strokeWidth={2} />
                                  Reset password
                                </Button>
                                {member.isSelf ? null : member.status === 'ACTIVE' ? (
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeactivateTarget(member)}
                                  >
                                    <XCircle className="size-3.5" strokeWidth={2} />
                                    Deactivate
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    disabled={setStatus.isPending}
                                    onClick={() => setStatus.mutate(member)}
                                  >
                                    <RotateCcw className="size-3.5" strokeWidth={2} />
                                    Reactivate
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[0.75rem] text-muted-foreground">
                                Read only
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {mayViewRoles ? (
          <TabsContent value="roles">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.8125rem] text-muted-foreground">
                {customRoles} custom {customRoles === 1 ? 'role' : 'roles'} plus the locked Owner
                and Admin presets.
              </p>
              {mayManageRoles ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRoleDialog({ mode: 'create' })}
                >
                  <Plus className="size-3.5" strokeWidth={2} />
                  New role
                </Button>
              ) : null}
            </div>

            {roles.isError ? (
              <ErrorPanel
                title="Could not load roles"
                message={errorMessage(roles.error, 'Try again in a moment.')}
                onRetry={() => void roles.refetch()}
              />
            ) : roleRows.length === 0 && !roles.isPending ? (
              <EmptyState
                icon={ShieldCheck}
                title="No roles yet"
                description="Create a role to group the permissions a person needs."
              />
            ) : (
              <div className="overflow-auto border border-border bg-card">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>
                        Role
                      </th>
                      <th scope="col" className={TH}>
                        Access
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        People
                      </th>
                      <th scope="col" className={TH}>
                        Type
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.isPending ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-8 text-center text-[0.875rem] text-muted-foreground"
                        >
                          Loading roles...
                        </td>
                      </tr>
                    ) : (
                      roleRows.map((role) => {
                        const manageable = canManageRole(role, session, mayManageRoles)
                        return (
                          <tr key={role.id} className="hover:bg-muted/40">
                            <td className={TD}>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[0.9375rem] font-medium">{role.name}</span>
                                {role.isSuper ? (
                                  <Badge variant="outline" className={TAG}>
                                    Full access
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="max-w-[420px] truncate text-[0.75rem] text-muted-foreground">
                                {role.description ?? 'No description'}
                              </p>
                            </td>
                            <td className={`${TD} text-[0.8125rem]`}>
                              {role.isSuper
                                ? 'Every permission'
                                : `${role.permissionCodes.length} ${role.permissionCodes.length === 1 ? 'permission' : 'permissions'}`}
                            </td>
                            <td
                              className={`${TD} text-right font-mono text-[0.8125rem] tabular-nums`}
                            >
                              {role.memberCount}
                            </td>
                            <td className={TD}>
                              <StatusPill tone={role.isSystemRole ? 'info' : 'neutral'}>
                                {role.isSystemRole ? 'System' : 'Custom'}
                              </StatusPill>
                            </td>
                            <td className={`${TD} text-right`}>
                              {role.isSystemRole ? (
                                <span className="inline-flex items-center gap-1 text-[0.75rem] text-muted-foreground">
                                  <LockKeyhole className="size-3.5" strokeWidth={2} />
                                  Locked
                                </span>
                              ) : manageable ? (
                                <div className="flex justify-end gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => setRoleDialog({ mode: 'edit', role })}
                                  >
                                    <Pencil className="size-3.5" strokeWidth={2} />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    className="text-muted-foreground hover:text-destructive"
                                    disabled={role.memberCount > 0}
                                    title={
                                      role.memberCount > 0
                                        ? 'Move those people to another role first'
                                        : undefined
                                    }
                                    onClick={() => setDeleteRoleTarget(role)}
                                  >
                                    <Trash2 className="size-3.5" strokeWidth={2} />
                                    Delete
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-[0.75rem] text-muted-foreground">
                                  Read only
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        ) : null}
      </Tabs>

      {newStaffOpen ? (
        <NewStaffDialog
          open={newStaffOpen}
          onOpenChange={setNewStaffOpen}
          roles={assignableRoles(roleRows, session)}
          onSaved={() => setNewStaffOpen(false)}
        />
      ) : null}

      {editStaff ? (
        <EditStaffDialog
          key={editStaff.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditStaff(null)
          }}
          member={editStaff}
          roles={assignableRoles(roleRows, session)}
          session={session}
          onSaved={() => setEditStaff(null)}
        />
      ) : null}

      {passwordTarget ? (
        <PasswordDialog
          key={passwordTarget.id}
          open
          onOpenChange={(open) => {
            if (!open) setPasswordTarget(null)
          }}
          member={passwordTarget}
          onSaved={() => setPasswordTarget(null)}
        />
      ) : null}

      {roleDialog ? (
        <RoleDialog
          key={roleDialog.mode === 'edit' ? roleDialog.role.id : 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setRoleDialog(null)
          }}
          role={roleDialog.mode === 'edit' ? roleDialog.role : null}
          permissions={permissionRows}
          permissionsLoading={permissions.isPending}
          session={session}
          onSaved={() => setRoleDialog(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null)
        }}
        title={`Deactivate ${deactivateTarget?.fullName ?? 'this person'}?`}
        description="They will not be able to sign in. Their name stays on past vouchers and audit entries, and you can reactivate them later."
        confirmLabel="Deactivate"
        destructive
        isPending={setStatus.isPending}
        onConfirm={() => {
          if (deactivateTarget) setStatus.mutate(deactivateTarget)
        }}
      />

      <ConfirmDialog
        open={deleteRoleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteRoleTarget(null)
        }}
        title={`Delete ${deleteRoleTarget?.name ?? 'this role'}?`}
        description="This role has no people assigned. Deleting it cannot be undone, though the audit trail keeps a record of the change."
        confirmLabel="Delete role"
        destructive
        isPending={removeRole.isPending}
        onConfirm={() => {
          if (deleteRoleTarget) removeRole.mutate(deleteRoleTarget)
        }}
      />
    </div>
  )
}

function ErrorPanel({
  title,
  message,
  onRetry
}: {
  title: string
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="border border-border bg-card px-4 py-8 text-center">
      <p className="text-[0.9375rem] font-medium">{title}</p>
      <p className="mt-1 text-[0.875rem] text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function RoleSelect({
  field,
  id,
  label,
  roles,
  disabled,
  hint
}: {
  field: FormFieldApi
  id: string
  label: string
  roles: RoleOutput[]
  disabled?: boolean
  hint?: string
}): React.JSX.Element {
  return (
    <Field
      id={id}
      label={label}
      required
      errors={field.state.meta.errors as Array<string | { message?: string }>}
      hint={hint}
    >
      <Select
        value={field.state.value}
        disabled={disabled}
        onValueChange={(value) => {
          field.handleChange(value)
          field.setErrorMap?.({ onBlur: undefined, onChange: undefined })
          void field.validate('change')
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose a role" />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role.id} value={String(role.id)}>
              {role.name}
              {role.isSuper ? ' · full access' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function NewStaffDialog({
  open,
  onOpenChange,
  roles,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: RoleOutput[]
  onSaved: () => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const defaultRole = roles.find((role) => role.name === 'Billing Clerk') ?? roles[0]

  const create = useMutation({
    mutationFn: (input: { fullName: string; email: string; password: string; roleId: number }) =>
      window.api.identity.createStaff(input),
    onSuccess: () => {
      toast.success('Person added')
      void queryClient.invalidateQueries({ queryKey: ['access'] })
      onSaved()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not add the person'))
  })

  const form = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      roleId: defaultRole ? String(defaultRole.id) : ''
    },
    canSubmitWhenInvalid: true,
    validators: { onSubmit: newStaffSchema },
    onSubmitInvalid: ({ formApi }) => focusFirstError(formApi),
    onSubmit: ({ value }) => {
      create.mutate({
        fullName: value.fullName.trim(),
        email: value.email.trim(),
        password: value.password,
        roleId: Number(value.roleId)
      })
    }
  })

  function textField(name: 'fullName' | 'email' | 'password'): React.JSX.Element {
    return (
      <form.Field
        name={name}
        validators={{
          onBlur: ({ value }) => staffFieldError(name, value),
          onChange: ({ value }) => staffFieldError(name, value),
          onSubmit: ({ value }) => staffFieldError(name, value)
        }}
      >
        {(field) => (
          <FormTextField
            field={field as unknown as FormFieldApi}
            submitted={form.state.isSubmitted}
            label={name === 'fullName' ? 'Full name' : name === 'email' ? 'Email' : 'Password'}
            required
            type={name === 'password' ? 'password' : name === 'email' ? 'email' : 'text'}
            autoComplete={
              name === 'password' ? 'new-password' : name === 'email' ? 'email' : 'name'
            }
            autoFocus={name === 'fullName'}
            mono={name === 'email'}
            hint={
              name === 'password'
                ? 'At least 8 characters. Share it securely; they can change it later.'
                : name === 'email'
                  ? 'They will use this to sign in.'
                  : 'As it should appear on vouchers and audit entries.'
            }
            afterChange={() => field.setErrorMap({ onBlur: undefined })}
          />
        )}
      </form.Field>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New person</DialogTitle>
          <DialogDescription>
            Create a local account. The role decides what they can see and change.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormLegend />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {textField('fullName')}
            {textField('email')}
            {textField('password')}
            <form.Field
              name="roleId"
              validators={{
                onSubmit: ({ value }) => (value ? undefined : 'Choose a role')
              }}
            >
              {(field) => (
                <RoleSelect
                  field={field as unknown as FormFieldApi}
                  id="new-staff-role"
                  label="Role"
                  roles={roles}
                  hint="Only roles you can grant are listed."
                />
              )}
            </form.Field>
          </div>

          {roles.length === 0 ? (
            <p className="border border-warning/40 bg-warning/5 px-2.5 py-2 text-[0.875rem] text-warning">
              There is no role you can assign yet. Ask an owner to create one.
            </p>
          ) : null}

          {create.isError ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
            >
              {errorMessage(create.error, 'Could not add the person.')}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={create.isPending || roles.length === 0}>
              <CheckCircle2 className="size-3.5" strokeWidth={2} />
              {create.isPending ? 'Adding...' : 'Add person'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditStaffDialog({
  open,
  onOpenChange,
  member,
  roles,
  session,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: StaffMemberOutput
  roles: RoleOutput[]
  session: SessionContextValue
  onSaved: () => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const isSelf = member.userId === session.userId

  const update = useMutation({
    mutationFn: (input: { fullName: string; roleId: number; status: 'ACTIVE' | 'DISABLED' }) =>
      window.api.identity.updateStaff({ id: member.id, ...input }),
    onSuccess: () => {
      toast.success('Person updated')
      void queryClient.invalidateQueries({ queryKey: ['access'] })
      onSaved()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the person'))
  })

  const form = useForm({
    defaultValues: {
      fullName: member.fullName,
      roleId: String(member.roleId),
      status: member.status === 'DISABLED' ? ('DISABLED' as const) : ('ACTIVE' as const)
    },
    canSubmitWhenInvalid: true,
    validators: { onSubmit: editStaffSchema },
    onSubmitInvalid: ({ formApi }) => focusFirstError(formApi),
    onSubmit: ({ value }) => {
      update.mutate({
        fullName: value.fullName.trim(),
        roleId: Number(value.roleId),
        status: value.status
      })
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit {member.fullName}</DialogTitle>
          <DialogDescription>
            {isSelf
              ? 'You can update your name, but you cannot change your own role or disable yourself.'
              : 'Changing the role takes effect the next time they sign in.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormLegend />
          <form.Field
            name="fullName"
            validators={{
              onBlur: ({ value }) => staffFieldError('fullName', value),
              onChange: ({ value }) => staffFieldError('fullName', value),
              onSubmit: ({ value }) => staffFieldError('fullName', value)
            }}
          >
            {(field) => (
              <FormTextField
                field={field as unknown as FormFieldApi}
                submitted={form.state.isSubmitted}
                label="Full name"
                required
                autoComplete="name"
                hint="As it should appear on vouchers and audit entries."
                afterChange={() => field.setErrorMap({ onBlur: undefined })}
              />
            )}
          </form.Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form.Field name="roleId">
              {(field) => (
                <RoleSelect
                  field={field as unknown as FormFieldApi}
                  id="edit-staff-role"
                  label="Role"
                  roles={roles}
                  disabled={isSelf}
                  hint={isSelf ? 'You cannot change your own role.' : undefined}
                />
              )}
            </form.Field>

            <form.Field name="status">
              {(field) => (
                <Field
                  id="edit-staff-status"
                  label="Status"
                  hint={
                    isSelf
                      ? 'You cannot disable your own account.'
                      : 'Disabled people cannot sign in.'
                  }
                >
                  <Select
                    value={field.state.value}
                    disabled={isSelf}
                    onValueChange={(value) => field.handleChange(value as 'ACTIVE' | 'DISABLED')}
                  >
                    <SelectTrigger id="edit-staff-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="DISABLED">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>
          </div>

          {update.isError ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
            >
              {errorMessage(update.error, 'Could not update the person.')}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={update.isPending}>
              <CheckCircle2 className="size-3.5" strokeWidth={2} />
              {update.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PasswordDialog({
  open,
  onOpenChange,
  member,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: StaffMemberOutput
  onSaved: () => void
}): React.JSX.Element {
  const reset = useMutation({
    mutationFn: (password: string) =>
      window.api.identity.resetStaffPassword({ id: member.id, password }),
    onSuccess: () => {
      toast.success(`Password reset for ${member.fullName}`)
      onSaved()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not reset the password'))
  })

  const form = useForm({
    defaultValues: { password: '', confirm: '' },
    canSubmitWhenInvalid: true,
    validators: { onSubmit: passwordSchema },
    onSubmitInvalid: ({ formApi }) => focusFirstError(formApi),
    onSubmit: ({ value }) => reset.mutate(value.password)
  })

  function passwordField(name: 'password' | 'confirm'): React.JSX.Element {
    return (
      <form.Field
        name={name}
        validators={{
          onBlur: ({ value }) =>
            name === 'password' && value.length > 0 && value.length < 8
              ? 'Use at least 8 characters'
              : undefined,
          onChange: ({ value }) =>
            name === 'password' && value.length > 0 && value.length < 8
              ? 'Use at least 8 characters'
              : undefined,
          onSubmit: ({ value }) =>
            name === 'password' && value.length < 8 ? 'Use at least 8 characters' : undefined
        }}
      >
        {(field) => (
          <FormTextField
            field={field as unknown as FormFieldApi}
            submitted={form.state.isSubmitted}
            label={name === 'password' ? 'New password' : 'Repeat password'}
            required
            type="password"
            autoComplete="new-password"
            autoFocus={name === 'password'}
            hint={name === 'password' ? 'At least 8 characters.' : undefined}
            afterChange={() => field.setErrorMap({ onBlur: undefined })}
          />
        )}
      </form.Field>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {member.fullName}. The old password stops working immediately.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormLegend />
          {passwordField('password')}
          {passwordField('confirm')}

          {reset.isError ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
            >
              {errorMessage(reset.error, 'Could not reset the password.')}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={reset.isPending}>
              <KeyRound className="size-3.5" strokeWidth={2} />
              {reset.isPending ? 'Resetting...' : 'Reset password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RoleDialog({
  open,
  onOpenChange,
  role,
  permissions,
  permissionsLoading,
  session,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: RoleOutput | null
  permissions: PermissionOutput[]
  permissionsLoading: boolean
  session: SessionContextValue
  onSaved: () => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const editing = role !== null

  const save = useMutation({
    mutationFn: (input: { name: string; description: string | null; permissionCodes: string[] }) =>
      role
        ? window.api.identity.updateRole({ id: role.id, ...input })
        : window.api.identity.createRole(input),
    onSuccess: () => {
      toast.success(editing ? 'Role updated' : 'Role created')
      void queryClient.invalidateQueries({ queryKey: ['access'] })
      onSaved()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the role'))
  })

  const form = useForm({
    defaultValues: {
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissionCodes: role?.permissionCodes ?? []
    },
    canSubmitWhenInvalid: true,
    validators: { onSubmit: roleSchema },
    onSubmitInvalid: ({ formApi }) =>
      focusFirstError(formApi as unknown as Parameters<typeof focusFirstError>[0]),
    onSubmit: ({ value }) => {
      save.mutate({
        name: value.name.trim(),
        description: value.description.trim() || null,
        permissionCodes: value.permissionCodes
      })
    }
  })

  const groups = new Map<string, PermissionOutput[]>()
  for (const permission of permissions) {
    const list = groups.get(permission.domain) ?? []
    list.push(permission)
    groups.set(permission.domain, list)
  }

  function grantable(code: string): boolean {
    return session.isSuper || session.permissions.includes(code)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${role.name}` : 'New role'}</DialogTitle>
          <DialogDescription>
            Pick the work this role can do. A person can only grant permissions they already hold.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormLegend />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
            <form.Field
              name="name"
              validators={{
                onBlur: ({ value }) => roleFieldError('name', value),
                onChange: ({ value }) => roleFieldError('name', value),
                onSubmit: ({ value }) => roleFieldError('name', value)
              }}
            >
              {(field) => (
                <FormTextField
                  field={field as unknown as FormFieldApi}
                  submitted={form.state.isSubmitted}
                  label="Role name"
                  required
                  autoFocus
                  hint="For example Billing Clerk or Store Manager."
                  afterChange={() => field.setErrorMap({ onBlur: undefined })}
                />
              )}
            </form.Field>

            <form.Field
              name="description"
              validators={{
                onBlur: ({ value }) => roleFieldError('description', value),
                onChange: ({ value }) => roleFieldError('description', value),
                onSubmit: ({ value }) => roleFieldError('description', value)
              }}
            >
              {(field) => (
                <FormTextField
                  field={field as unknown as FormFieldApi}
                  submitted={form.state.isSubmitted}
                  label="Description"
                  hint="Optional. What is this role for?"
                  afterChange={() => field.setErrorMap({ onBlur: undefined })}
                />
              )}
            </form.Field>
          </div>

          <form.Field name="permissionCodes">
            {(field) => {
              const selected = field.state.value
              return (
                <div className="flex min-h-0 flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Permissions
                    </p>
                    <p className="font-mono text-[0.75rem] text-muted-foreground">
                      {selected.length} selected
                    </p>
                  </div>

                  <div className="max-h-[46vh] overflow-y-auto border border-border">
                    {permissionsLoading ? (
                      <p className="px-3 py-6 text-center text-[0.875rem] text-muted-foreground">
                        Loading permissions...
                      </p>
                    ) : groups.size === 0 ? (
                      <p className="px-3 py-6 text-center text-[0.875rem] text-muted-foreground">
                        The permission catalog is empty.
                      </p>
                    ) : (
                      [...groups.entries()].map(([domain, items]) => {
                        const grantableItems = items.filter((item) => grantable(item.code))
                        const allSelected =
                          grantableItems.length > 0 &&
                          grantableItems.every((item) => selected.includes(item.code))
                        return (
                          <section key={domain} className="border-b border-border last:border-b-0">
                            <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
                              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em]">
                                {DOMAIN_LABELS[domain] ?? domain}
                              </p>
                              {grantableItems.length > 0 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => {
                                    const next = allSelected
                                      ? selected.filter(
                                          (code) =>
                                            !grantableItems.some((item) => item.code === code)
                                        )
                                      : [
                                          ...selected,
                                          ...grantableItems
                                            .map((item) => item.code)
                                            .filter((code) => !selected.includes(code))
                                        ]
                                    field.handleChange(next)
                                  }}
                                >
                                  {allSelected ? 'Clear' : 'Select all'}
                                </Button>
                              ) : null}
                            </div>
                            <div className="divide-y divide-border">
                              {items.map((permission) => {
                                const enabled = grantable(permission.code)
                                return (
                                  <label
                                    key={permission.code}
                                    className={`flex cursor-pointer items-start gap-2.5 px-3 py-2 ${
                                      enabled
                                        ? 'hover:bg-muted/30'
                                        : 'cursor-not-allowed opacity-50'
                                    }`}
                                    title={
                                      enabled
                                        ? undefined
                                        : 'You cannot grant a permission you do not hold.'
                                    }
                                  >
                                    <Checkbox
                                      className="mt-0.5"
                                      checked={selected.includes(permission.code)}
                                      disabled={!enabled}
                                      onCheckedChange={(checked) => {
                                        const next =
                                          checked === true
                                            ? [...selected, permission.code]
                                            : selected.filter((code) => code !== permission.code)
                                        field.handleChange(next)
                                      }}
                                    />
                                    <span className="min-w-0">
                                      <span className="block text-[0.875rem]">
                                        {PERMISSION_LABELS[permission.code] ??
                                          permission.description}
                                      </span>
                                      <span className="block font-mono text-[0.6875rem] text-muted-foreground">
                                        {permission.code}
                                      </span>
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                          </section>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            }}
          </form.Field>

          {save.isError ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[0.875rem] text-destructive"
            >
              {errorMessage(save.error, 'Could not save the role.')}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={save.isPending}>
              <CheckCircle2 className="size-3.5" strokeWidth={2} />
              {save.isPending ? 'Saving...' : editing ? 'Save changes' : 'Create role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function staffFieldError(
  name: 'fullName' | 'email' | 'password',
  value: string
): string | undefined {
  const result = newStaffSchema.shape[name].safeParse(value)
  if (result.success) return undefined
  return result.error.issues[0]?.message
}

function roleFieldError(name: 'name' | 'description', value: string): string | undefined {
  const result = roleSchema.shape[name].safeParse(value)
  if (result.success) return undefined
  return result.error.issues[0]?.message
}
