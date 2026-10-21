import type { OrganizationProfile, StaffMember, Role } from './types'
import type { UpdateOrganizationInput } from '../../../../shared/contracts/identity'
import type {
  UpdateOrgLogoInput,
  OrgLogoOutput
} from '../../../../shared/contracts/organization-logo'

interface CreateStaffInput {
  fullName: string
  email: string
  password: string
  roleName: string
}

/**
 * Thin IPC facade for the identity surface. Every method delegates to the
 * preload bridge (`window.api.identityRead.*` or `window.api.identity.*`).
 */
export const api = {
  organization: (): Promise<OrganizationProfile> =>
    window.api.identityRead.organization() as unknown as Promise<OrganizationProfile>,
  staff: (): Promise<StaffMember[]> =>
    window.api.identityRead.staff() as unknown as Promise<StaffMember[]>,
  roles: (): Promise<Role[]> => window.api.identityRead.roles() as unknown as Promise<Role[]>,
  createStaff: (input: CreateStaffInput): Promise<StaffMember> =>
    window.api.identity.createStaff(input) as unknown as Promise<StaffMember>,
  updateStaff: (_input: Record<string, unknown>): Promise<StaffMember> => Promise.resolve({} as StaffMember),
  updateRole: (_input: Record<string, unknown>): Promise<Role> => Promise.resolve({} as Role),
  updateOrganization: (input: UpdateOrganizationInput): Promise<OrganizationProfile> =>
    window.api.identity.updateOrganization(input) as unknown as Promise<OrganizationProfile>,
  orgLogo: (): Promise<OrgLogoOutput> =>
    window.api.organizationLogo.get() as unknown as Promise<OrgLogoOutput>,
  updateOrgLogo: (input: UpdateOrgLogoInput): Promise<OrgLogoOutput> =>
    window.api.organizationLogo.update(input) as unknown as Promise<OrgLogoOutput>,
  deleteOrgLogo: (): Promise<void> => window.api.organizationLogo.remove() as unknown as Promise<void>
}
