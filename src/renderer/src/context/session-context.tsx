/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export interface SessionContextValue {
  organizationId: number
  organizationSlug: string
  organizationName: string
  userId: number
  userFullName: string
  userEmail: string
  roleId: number
  roleName: string
  isSuper: boolean
  permissions: string[]
  onSignOut: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export interface SessionProviderProps {
  value: Omit<SessionContextValue, 'onSignOut'>
  onSignOut: () => void
  children: ReactNode
}

export function SessionProvider({
  value,
  onSignOut,
  children
}: SessionProviderProps): React.JSX.Element {
  return (
    <SessionContext.Provider value={{ ...value, onSignOut }}>{children}</SessionContext.Provider>
  )
}

/** Returns the resolved session (identity + role + permission set) for the shell. */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}

/**
 * Permission guard used by nav/actions. A code of `undefined` means "any signed-in
 * user". Super (Owner/Admin) short-circuits, mirroring the command layer's
 * `requirePermission` (Module 15 rule: check codes, never role names).
 */
export function can(permissions: string[], isSuper: boolean, code?: string): boolean {
  return code === undefined || isSuper || permissions.includes(code)
}
