const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

export interface PendingPhoto {
  filename: string
  data: string // base64-encoded (no data-URL prefix)
}

export interface PhotoValidationError {
  type: 'type'
  message: string
}

export function validatePhotoFile(file: File): PhotoValidationError | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      type: 'type',
      message: `Invalid file type: .${ext}. Allowed types: jpg, jpeg, png, webp`
    }
  }
  return null
}

export function readFileAsBase64(file: File): Promise<PendingPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip data-URL prefix (e.g. "data:image/jpeg;base64,")
      const base64 = result.split(',')[1] ?? result
      resolve({ filename: file.name, data: base64 })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
