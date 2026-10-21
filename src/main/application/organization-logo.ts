import { readFileSync } from 'node:fs'
import { requirePermission, currentOrganizationId } from '../auth/session'
import { organizationRepo } from '../repositories/identity'
import {
  saveLogoSync,
  deleteLogoFileSync,
  getLogoPathSync,
  validateFileType
} from '../lib/photo-storage'
import { NotFoundError, ValidationError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'
import type { UpdateOrgLogoInput, OrgLogoOutput } from '../../shared/contracts/organization-logo'
import { ORG_LOGO_MAX_BYTES } from '../../shared/contracts/organization-logo'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

function mimeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'image/png'
}

/** Uploads or replaces the organization's logo. Single active BrandMark; old file deleted. */
export function updateOrgLogo(input: UpdateOrgLogoInput): OrgLogoOutput {
  requirePermission(PERMISSIONS.ORG_MANAGE)
  const organizationId = currentOrganizationId()
  const org = organizationRepo.findById(organizationId)
  if (!org) throw new NotFoundError('Organization not found')

  try {
    validateFileType(input.filename)
  } catch {
    throw new ValidationError('Logo must be a jpg, png or webp image')
  }
  const buffer = Buffer.from(input.data, 'base64')
  if (buffer.length === 0) throw new ValidationError('Logo data is empty')
  if (buffer.length > ORG_LOGO_MAX_BYTES) throw new ValidationError('Logo must be 5MB or smaller')

  const existing = organizationRepo.findLogoFilename(organizationId)
  // Legacy data-URL values are treated as missing (never a filename on disk).
  if (existing && !existing.startsWith('data:')) {
    deleteLogoFileSync(organizationId, existing)
  }

  const filename = saveLogoSync(organizationId, input.filename, buffer)
  organizationRepo.updateLogo(organizationId, filename)

  return {
    logoFilename: filename,
    logoData: buffer.toString('base64'),
    mimeType: mimeFor(filename)
  }
}

/** Removes the organization's logo. */
export function deleteOrgLogo(): void {
  requirePermission(PERMISSIONS.ORG_MANAGE)
  const organizationId = currentOrganizationId()
  const existing = organizationRepo.findLogoFilename(organizationId)
  if (existing && !existing.startsWith('data:')) {
    deleteLogoFileSync(organizationId, existing)
  }
  organizationRepo.updateLogo(organizationId, null)
}

/**
 * Returns the logo with base64 data for display. Nulls when missing or
 * unreadable. Session-only (no permission gate): the logo is tenant brand
 * shown in the sidebar for every role, like the identity-read organization
 * endpoint. Writes stay `org.manage`-gated.
 */
export function getOrgLogo(): OrgLogoOutput {
  const organizationId = currentOrganizationId()
  const filename = organizationRepo.findLogoFilename(organizationId)
  if (!filename || filename.startsWith('data:')) {
    return { logoFilename: null, logoData: null, mimeType: null }
  }
  try {
    const buffer = readFileSync(getLogoPathSync(organizationId, filename))
    return {
      logoFilename: filename,
      logoData: buffer.toString('base64'),
      mimeType: mimeFor(filename)
    }
  } catch {
    return { logoFilename: null, logoData: null, mimeType: null }
  }
}
