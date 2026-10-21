export interface OrgLogo {
  filename: string | null
  /** data-URI src for <img>, or null when no logo. */
  src: string | null
}

export const ORG_LOGO_MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set(['jpg', 'jpeg', 'png', 'webp'])

export function logoFileError(file: File): string | undefined {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED.has(ext)) return 'Use a jpg, png or webp image'
  if (file.size > ORG_LOGO_MAX_BYTES) return 'Logo must be 5MB or smaller'
  return undefined
}

/** Reads a File as raw base64 (no data-URL prefix). */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}
