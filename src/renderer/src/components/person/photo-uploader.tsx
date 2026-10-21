import { useCallback, useRef } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { validatePhotoFile, readFileAsBase64, type PendingPhoto } from './photo-constants'

/**
 * File-picker based photo upload. Renders a hidden `<input type="file">` and a
 * trigger button. Validates file type (jpg/jpeg/png/webp)
 * before emitting a `PendingPhoto` to the parent.
 */
export function PhotoUploader({
  onPhoto,
  className
}: {
  onPhoto: (photo: PendingPhoto) => void
  className?: string
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      const error = validatePhotoFile(file)
      if (error) {
        // Surface validation error via the parent's error handler — for now,
        // we rely on the parent's toast/inline error. If we need a local
        // error state, we can add it later.
        window.alert(error.message)
        return
      }
      const photo = await readFileAsBase64(file)
      onPhoto(photo)
    },
    [onPhoto]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFile(file)
        // Reset input so re-selecting the same file triggers onChange
        e.target.value = ''
      }
    },
    [handleFile]
  )

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        className="gap-1.5"
      >
        <Upload className="size-3.5" />
        Upload photo
      </Button>
      <p className="text-[11px] text-muted-foreground">JPG, PNG, or WebP</p>
    </div>
  )
}
