import { z } from 'zod'

/**
 * Access-control read models and command inputs. The main process is the
 * enforcement point; these shapes are validated at the IPC boundary and then
 * checked again against the signed-in actor's permissions.
 */

export const staffStatusSchema = z.enum(['ACTIVE', 'INVITED', 'DISABLED'])
export type StaffStatus = z.infer<typeof staffStatusSchema>

export interface StaffMemberOutput {
  id: number
  userId: number
  fullName: string
  email: string
  roleId: number
  roleName: string
  isSuper: boolean
  isSystemRole: boolean
  status: StaffStatus
  joinedAt: string
  isSelf: boolean
}

export interface RoleOutput {
  id: number
  name: string
  description: string | null
  isSystemRole: boolean
  isSuper: boolean
  permissionCodes: string[]
  memberCount: number
}

export interface PermissionOutput {
  code: string
  description: string
  domain: string
}

export const updateStaffInputSchema = z
  .object({
    id: z.number().int().positive(),
    fullName: z.string().min(1).max(120).optional(),
    roleId: z.number().int().positive().optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional()
  })
  .refine(
    (value) =>
      value.fullName !== undefined || value.roleId !== undefined || value.status !== undefined,
    { message: 'Nothing to update' }
  )
export type UpdateStaffInput = z.infer<typeof updateStaffInputSchema>

export const resetStaffPasswordInputSchema = z.object({
  id: z.number().int().positive(),
  password: z.string().min(8).max(256)
})
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordInputSchema>

export const createRoleInputSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(200).optional().nullable(),
  permissionCodes: z.array(z.string().min(1).max(80)).max(200).default([])
})
export type CreateRoleInput = z.infer<typeof createRoleInputSchema>

export const updateRoleInputSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(2).max(60).optional(),
    description: z.string().max(200).optional().nullable(),
    permissionCodes: z.array(z.string().min(1).max(80)).max(200).optional()
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.permissionCodes !== undefined,
    { message: 'Nothing to update' }
  )
export type UpdateRoleInput = z.infer<typeof updateRoleInputSchema>

export const roleIdSchema = z.object({ id: z.number().int().positive() })
export type RoleIdInput = z.infer<typeof roleIdSchema>
