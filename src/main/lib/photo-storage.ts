import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink, access } from 'node:fs/promises'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, extname } from 'node:path'

/**
 * Photo storage for person photos. Photos are stored locally in the app's
 * userData directory under `photos/{organization_id}/`. Each photo is named
 * `{uuid}.{ext}` to ensure uniqueness and preserve the original extension.
 */

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

export interface PhotoStorageConfig {
  userDataPath: string
}

let config: PhotoStorageConfig | null = null

export function configurePhotoStorage(userDataPath: string): void {
  config = { userDataPath }
}

export function getConfig(): PhotoStorageConfig {
  if (!config) {
    throw new Error('Photo storage not configured. Call configurePhotoStorage() first.')
  }
  return config
}

/**
 * Returns the directory path for photos of a given organization.
 * Creates the directory if it doesn't exist.
 */
export async function getPhotoDirectory(organizationId: number): Promise<string> {
  const { userDataPath } = getConfig()
  const dir = join(userDataPath, 'photos', String(organizationId))
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * Synchronous version of getPhotoDirectory for use in sync contexts.
 */
export function getPhotoDirectorySync(organizationId: number): string {
  const { userDataPath } = getConfig()
  const dir = join(userDataPath, 'photos', String(organizationId))
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Validates that a file extension is allowed.
 * Returns the normalized extension (lowercase, without dot).
 */
export function validateFileType(filename: string): string {
  const ext = extname(filename).toLowerCase().replace('.', '')
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Invalid file type: .${ext}. Allowed types: jpg, jpeg, png, webp`)
  }
  return ext
}

/**
 * Saves a photo buffer to disk and returns the filename (UUID.ext).
 * The caller is responsible for updating the person's photo_filename in the DB.
 */
export async function savePhoto(
  organizationId: number,
  originalFilename: string,
  buffer: Buffer
): Promise<string> {
  const ext = validateFileType(originalFilename)

  const filename = `${randomUUID()}.${ext}`
  const dir = await getPhotoDirectory(organizationId)
  const filePath = join(dir, filename)

  await writeFile(filePath, buffer)
  return filename
}

/**
 * Synchronous version of savePhoto for use in transaction contexts.
 */
export function savePhotoSync(
  organizationId: number,
  originalFilename: string,
  buffer: Buffer
): string {
  const ext = validateFileType(originalFilename)

  const filename = `${randomUUID()}.${ext}`
  const dir = getPhotoDirectorySync(organizationId)
  const filePath = join(dir, filename)

  writeFileSync(filePath, buffer)
  return filename
}

/**
 * Deletes a photo file from disk. No-op if the file doesn't exist.
 */
export async function deletePhotoFile(organizationId: number, filename: string): Promise<void> {
  const dir = await getPhotoDirectory(organizationId)
  const filePath = join(dir, filename)
  try {
    await access(filePath)
    await unlink(filePath)
  } catch {
    // File doesn't exist or already deleted — no-op
  }
}

/**
 * Synchronous version of deletePhotoFile for use in sync contexts.
 */
export function deletePhotoFileSync(organizationId: number, filename: string): void {
  const dir = getPhotoDirectorySync(organizationId)
  const filePath = join(dir, filename)
  try {
    unlinkSync(filePath)
  } catch {
    // File doesn't exist or already deleted — no-op
  }
}

/**
 * Returns the absolute path to a photo file for serving/display.
 */
export async function getPhotoPath(organizationId: number, filename: string): Promise<string> {
  const dir = await getPhotoDirectory(organizationId)
  return join(dir, filename)
}

/**
 * Synchronous version of getPhotoPath for use in sync contexts.
 */
export function getPhotoPathSync(organizationId: number, filename: string): string {
  const dir = getPhotoDirectorySync(organizationId)
  return join(dir, filename)
}

/**
 * Returns the directory path for organization logos.
 * Creates the directory if it doesn't exist.
 */
export async function getLogoDirectory(organizationId: number): Promise<string> {
  const { userDataPath } = getConfig()
  const dir = join(userDataPath, 'logos', String(organizationId))
  await mkdir(dir, { recursive: true })
  return dir
}

/** Synchronous version of getLogoDirectory for use in sync contexts. */
export function getLogoDirectorySync(organizationId: number): string {
  const { userDataPath } = getConfig()
  const dir = join(userDataPath, 'logos', String(organizationId))
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Saves a logo buffer to disk and returns the filename (UUID.ext). */
export function saveLogoSync(
  organizationId: number,
  originalFilename: string,
  buffer: Buffer
): string {
  const ext = validateFileType(originalFilename)
  const filename = `${randomUUID()}.${ext}`
  const dir = getLogoDirectorySync(organizationId)
  const filePath = join(dir, filename)
  writeFileSync(filePath, buffer)
  return filename
}

/** Deletes a logo file from disk. No-op if missing. */
export function deleteLogoFileSync(organizationId: number, filename: string): void {
  const dir = getLogoDirectorySync(organizationId)
  const filePath = join(dir, filename)
  try {
    unlinkSync(filePath)
  } catch {
    // no-op
  }
}

/** Absolute path to a logo file. */
export function getLogoPathSync(organizationId: number, filename: string): string {
  const dir = getLogoDirectorySync(organizationId)
  return join(dir, filename)
}

export const PHOTO_CONFIG = {
  ALLOWED_EXTENSIONS: Array.from(ALLOWED_EXTENSIONS)
} as const
