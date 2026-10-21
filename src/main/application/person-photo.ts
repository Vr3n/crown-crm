import { requirePermission, currentOrganizationId } from '../auth/session'
import { personRepo } from '../repositories/sales'
import {
  savePhotoSync,
  deletePhotoFile,
  getPhotoPathSync
} from '../lib/photo-storage'
import { readFileSync } from 'node:fs'
import { NotFoundError, ValidationError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'
import type {
  UpdatePersonPhotoInput,
  DeletePersonPhotoInput,
  GetPersonPhotoInput,
  PersonPhotoOutput,
  GetManyPersonPhotosInput,
  GetManyPersonPhotosOutput
} from '../../shared/contracts/person-photo'

/**
 * Module 01 — Person Photo use cases.
 *
 * Photo belongs to Person (not Lead or Customer) so it persists across
 * lifecycle changes. The use case owns the transaction boundary and
 * coordinates file storage with DB updates.
 */

/**
 * Updates (or replaces) a person's photo. Accepts base64-encoded image data
 * from either a file import or webcam capture. If the person already has a
 * photo, the old file is deleted before saving the new one.
 */
export function updatePersonPhoto(input: UpdatePersonPhotoInput): PersonPhotoOutput {
  requirePermission(PERMISSIONS.LEAD_EDIT)
  const organizationId = currentOrganizationId()

  const person = personRepo.findById(organizationId, input.personId)
  if (!person) throw new NotFoundError('Person not found')

  // Decode base64 data
  const buffer = Buffer.from(input.data, 'base64')
  if (buffer.length === 0) {
    throw new ValidationError('Photo data is empty')
  }

  // Delete old photo if it exists (best-effort, non-blocking)
  if (person.photoFilename) {
    deletePhotoFile(organizationId, person.photoFilename).catch(() => {})
  }

  // Save new photo (validates file type and size internally)
  const filename = savePhotoSync(organizationId, input.filename, buffer)

  // Update the person record
  personRepo.updatePhoto(organizationId, person.id, filename)

  return {
    personId: person.id,
    photoFilename: filename,
    photoPath: null,
    photoData: buffer.toString('base64')
  }
}

/**
 * Removes a person's photo. Deletes the file from disk and clears the
 * photo_filename column.
 */
export function deletePersonPhoto(input: DeletePersonPhotoInput): void {
  requirePermission(PERMISSIONS.LEAD_EDIT)
  const organizationId = currentOrganizationId()

  const person = personRepo.findById(organizationId, input.personId)
  if (!person) throw new NotFoundError('Person not found')

  if (person.photoFilename) {
    deletePhotoFile(organizationId, person.photoFilename).catch(() => {})
  }

  personRepo.updatePhoto(organizationId, person.id, null)
}

/**
 * Returns the photo metadata for a person, including the absolute file path
 * for display. Returns null values when no photo exists.
 */
export function getPersonPhoto(input: GetPersonPhotoInput): PersonPhotoOutput {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()

  const person = personRepo.findById(organizationId, input.personId)
  if (!person) throw new NotFoundError('Person not found')

  if (!person.photoFilename) {
    return {
      personId: person.id,
      photoFilename: null,
      photoPath: null,
      photoData: null
    }
  }

  const absolutePath = getPhotoPathSync(organizationId, person.photoFilename)

  // Read the file and return as base64 for renderer display
  let photoData: string | null = null
  try {
    const buffer = readFileSync(absolutePath)
    photoData = buffer.toString('base64')
  } catch {
    // File may have been deleted from disk — treat as no photo
    return {
      personId: person.id,
      photoFilename: null,
      photoPath: null,
      photoData: null
    }
  }

  return {
    personId: person.id,
    photoFilename: person.photoFilename,
    photoPath: absolutePath,
    photoData
  }
}

/**
 * Batch-fetches photo data for multiple persons in one call. Used by the
 * windowed batcher in the renderer to coalesce many per-row `usePersonPhoto`
 * hooks into a single IPC round-trip.
 */
export function getManyPersonPhotos(input: GetManyPersonPhotosInput): GetManyPersonPhotosOutput {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()

  const photos: Record<number, string | null> = {}
  for (const personId of input.personIds) {
    const person = personRepo.findById(organizationId, personId)
    if (!person || !person.photoFilename) {
      photos[personId] = null
      continue
    }

    const absolutePath = getPhotoPathSync(organizationId, person.photoFilename)
    try {
      const buffer = readFileSync(absolutePath)
      photos[personId] = buffer.toString('base64')
    } catch {
      photos[personId] = null
    }
  }

  return { photos }
}
