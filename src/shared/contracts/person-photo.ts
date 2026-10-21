import { z } from 'zod'

/**
 * Contracts for person photo IPC operations (Issue #106).
 * Photo belongs to Person — persists when Lead converts to Customer.
 */

export const updatePersonPhotoInputSchema = z.object({
  personId: z.number().int().positive(),
  filename: z.string().min(1).max(255),
  /** Base64-encoded image data (for webcam capture or file import via renderer). */
  data: z.string().min(1)
})
export type UpdatePersonPhotoInput = z.infer<typeof updatePersonPhotoInputSchema>

export const deletePersonPhotoInputSchema = z.object({
  personId: z.number().int().positive()
})
export type DeletePersonPhotoInput = z.infer<typeof deletePersonPhotoInputSchema>

export const getPersonPhotoInputSchema = z.object({
  personId: z.number().int().positive()
})
export type GetPersonPhotoInput = z.infer<typeof getPersonPhotoInputSchema>

export interface PersonPhotoOutput {
  personId: number
  photoFilename: string | null
  /** Absolute path to the photo file, or null if no photo exists. */
  photoPath: string | null
  /** Base64-encoded photo data (no data-URL prefix), or null if no photo exists. */
  photoData: string | null
}

export const getManyPersonPhotosInputSchema = z.object({
  personIds: z.array(z.number().int().positive())
})
export type GetManyPersonPhotosInput = z.infer<typeof getManyPersonPhotosInputSchema>

export interface GetManyPersonPhotosOutput {
  photos: Record<number, string | null>
}
