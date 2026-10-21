import { useCallback, useState } from 'react'
import { Camera } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { usePersonPhoto, useUpdatePersonPhoto } from '@/features/people/person-photo'
import type { PendingPhoto } from './photo-constants'
import { PhotoUploader } from './photo-uploader'
import { PhotoCapturer } from './photo-capturer'
import { PhotoViewerDialog } from './photo-viewer-dialog'

type AvatarSize = 'sm' | 'default' | 'lg'

/**
 * Person avatar with optional photo upload/capture.
 *
 * **Persisted mode** — pass `personId`: the component fetches and saves the photo
 * via IPC hooks. Used in Edit Lead and both Detail pages.
 *
 * **Transient mode** — omit `personId`, pass `onPendingChange`: the component
 * holds a local preview and emits `{ filename, data }` when the user picks or
 * captures a photo. Used in the New Lead form (no person exists yet).
 */
export function PersonAvatar({
  personId,
  name,
  size = 'lg',
  editable = false,
  onPendingChange
}: {
  personId?: number
  name: string
  size?: AvatarSize
  editable?: boolean
  /** Callback when a pending photo is selected/cleared (transient mode only). */
  onPendingChange?: (photo: PendingPhoto | null) => void
}): React.JSX.Element {
  /* ------------------------------------------------------------------------ */
  /* Persisted mode state                                                      */
  /* ------------------------------------------------------------------------ */
  const { data: photoData } = usePersonPhoto(personId)
  const updatePhoto = useUpdatePersonPhoto()

  /* ------------------------------------------------------------------------ */
  /* Transient mode state                                                      */
  /* ------------------------------------------------------------------------ */
  const [pending, setPending] = useState<PendingPhoto | null>(null)

  /* ------------------------------------------------------------------------ */
  /* Photo viewer dialog state                                                 */
  /* ------------------------------------------------------------------------ */
  const [viewerOpen, setViewerOpen] = useState(false)

  /* ------------------------------------------------------------------------ */
  /* Derived values                                                            */
  /* ------------------------------------------------------------------------ */
  const hasPersistedPhoto = Boolean(personId && photoData?.photoData)
  const hasPendingPhoto = !personId && pending !== null
  const hasPhoto = hasPersistedPhoto || hasPendingPhoto
  const isLoading = personId ? updatePhoto.isPending : false

  const avatarSrc = hasPersistedPhoto
    ? `data:image/jpeg;base64,${photoData!.photoData}`
    : hasPendingPhoto
      ? `data:image/jpeg;base64,${pending!.data}`
      : undefined

  /* ------------------------------------------------------------------------ */
  /* Handlers                                                                  */
  /* ------------------------------------------------------------------------ */
  const handlePhoto = useCallback(
    (photo: PendingPhoto) => {
      if (personId) {
        updatePhoto.mutate({ personId, filename: photo.filename, data: photo.data })
      } else {
        setPending(photo)
        onPendingChange?.(photo)
      }
    },
    [personId, updatePhoto, onPendingChange]
  )

  const initials = getInitials(name)

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar */}
      <div className="relative">
        <Avatar
          size={size}
          className={hasPhoto && editable ? 'cursor-pointer' : undefined}
          onClick={hasPhoto && editable ? () => setViewerOpen(true) : undefined}
        >
          {avatarSrc && <AvatarImage src={avatarSrc} alt={name} />}
          <AvatarFallback>
            {isLoading ? (
              <div className="size-full animate-pulse bg-muted" />
            ) : (
              <span className="flex items-center justify-center text-muted-foreground">
                {initials}
              </span>
            )}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Upload / Capture toggle — only when editable and no photo present */}
      {editable && !hasPhoto && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            <UploadToggle onPhoto={handlePhoto} />
            <CaptureToggle onPhoto={handlePhoto} />
          </div>
        </div>
      )}

      {/* Photo viewer dialog — only when editable and photo exists */}
      {editable && hasPersistedPhoto && personId && (
        <PhotoViewerDialog
          personId={personId}
          name={name}
          photoData={photoData?.photoData ?? null}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Internal sub-components                                                     */
/* -------------------------------------------------------------------------- */

function UploadToggle({ onPhoto }: { onPhoto: (photo: PendingPhoto) => void }): React.JSX.Element {
  const [active, setActive] = useState(true)

  if (active) {
    return (
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium">
          <Camera className="size-3" />
          Upload
        </div>
        <div className="mt-2">
          <PhotoUploader onPhoto={onPhoto} />
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setActive(true)}
      className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <Camera className="size-3" />
      Upload
    </button>
  )
}

function CaptureToggle({ onPhoto }: { onPhoto: (photo: PendingPhoto) => void }): React.JSX.Element {
  const [active, setActive] = useState(false)

  if (active) {
    return (
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium">
          <Camera className="size-3" />
          Capture
        </div>
        <div className="mt-2">
          <PhotoCapturer onPhoto={onPhoto} />
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setActive(true)}
      className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <Camera className="size-3" />
      Capture
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
