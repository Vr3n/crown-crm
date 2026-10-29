import { MAX_COMPANY_LOGO_DATA_URL_LENGTH } from '../../../shared/contracts/identity'

/**
 * Logos are re-encoded in the renderer before they reach the database. The
 * longest edge is capped at 512px, which is enough for the company card and
 * any future document header, while keeping the stored data URL small.
 */
export const COMPANY_LOGO_MAX_EDGE = 512
export const COMPANY_LOGO_ACCEPT = 'image/png,image/jpeg,image/webp'

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const TYPE_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
}
const WEBP_QUALITIES = [0.9, 0.8, 0.7, 0.6]

export class CompanyLogoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompanyLogoError'
  }
}

/**
 * Browsers normally fill `File.type` from the picker. Some drag/drop and
 * Windows shell paths leave it empty, so fall back to the extension only in
 * that case. A type we do not accept is always rejected.
 */
function resolveType(file: File): string | null {
  if (file.type) return ACCEPTED_TYPES.has(file.type) ? file.type : null
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension ? (TYPE_BY_EXTENSION[extension] ?? null) : null
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new CompanyLogoError('That image could not be read.'))
    image.src = url
  })
}

async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close()
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await loadImageElement(url)
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url)
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) throw new CompanyLogoError('This computer cannot resize images right now.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  return context
}

/**
 * Halve the image repeatedly before the final draw. A single large downscale
 * in one step aliases badly; progressive halving keeps thin logo strokes
 * legible at 512px.
 */
function resize(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, COMPANY_LOGO_MAX_EDGE / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  let current = source
  let currentWidth = width
  let currentHeight = height

  while (currentWidth / 2 >= targetWidth && currentHeight / 2 >= targetHeight) {
    const step = document.createElement('canvas')
    step.width = Math.max(1, Math.round(currentWidth / 2))
    step.height = Math.max(1, Math.round(currentHeight / 2))
    context2d(step).drawImage(current, 0, 0, step.width, step.height)
    current = step
    currentWidth = step.width
    currentHeight = step.height
  }

  const output = document.createElement('canvas')
  output.width = targetWidth
  output.height = targetHeight
  context2d(output).drawImage(current, 0, 0, targetWidth, targetHeight)
  return output
}

function encode(canvas: HTMLCanvasElement, sourceType: string): string {
  // Keep PNG transparency for PNG input. Everything else, and PNGs that stay
  // over the cap, fall back to WebP at decreasing quality.
  const attempts: { mime: string; quality?: number }[] =
    sourceType === 'image/png'
      ? [
          { mime: 'image/png' },
          ...WEBP_QUALITIES.map((quality) => ({ mime: 'image/webp', quality }))
        ]
      : WEBP_QUALITIES.map((quality) => ({ mime: 'image/webp', quality }))

  for (const attempt of attempts) {
    const dataUrl = canvas.toDataURL(attempt.mime, attempt.quality)
    if (dataUrl.length <= MAX_COMPANY_LOGO_DATA_URL_LENGTH) return dataUrl
  }

  throw new CompanyLogoError('That image is too large. Try a simpler logo or a smaller file.')
}

/**
 * Turn a picked file into the data URL stored on `companies.logo`. The output
 * is always re-encoded from canvas pixels, so the stored value is a real
 * PNG/WebP image even if the source file was mislabelled.
 */
export async function prepareLogoDataUrl(file: File): Promise<string> {
  const type = resolveType(file)
  if (!type) throw new CompanyLogoError('Choose a PNG, JPEG or WebP image')
  if (file.size === 0) throw new CompanyLogoError('That file is empty. Choose another image.')

  let decoded: DecodedImage
  try {
    decoded = await decode(file)
  } catch (error) {
    if (error instanceof CompanyLogoError) throw error
    throw new CompanyLogoError('That image could not be read. Try another file.')
  }

  try {
    if (!decoded.width || !decoded.height) {
      throw new CompanyLogoError('That image has no usable size.')
    }
    return encode(resize(decoded.source, decoded.width, decoded.height), type)
  } finally {
    decoded.release()
  }
}
