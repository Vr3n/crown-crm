import { z } from 'zod'

/** Organization logo (BrandMark) IPC contracts — single active logo per org. */

export const updateOrgLogoInputSchema = z.object({
  filename: z.string().min(1).max(255),
  /** Base64-encoded image data (no data-URL prefix). */
  data: z.string().min(1)
})
export type UpdateOrgLogoInput = z.infer<typeof updateOrgLogoInputSchema>

export interface OrgLogoOutput {
  logoFilename: string | null
  /** Base64-encoded image data (no prefix), or null when no logo. */
  logoData: string | null
  /** MIME type for data-URI construction, or null. */
  mimeType: string | null
}

export const ORG_LOGO_MAX_BYTES = 5 * 1024 * 1024
export const ORG_LOGO_ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp'] as const
