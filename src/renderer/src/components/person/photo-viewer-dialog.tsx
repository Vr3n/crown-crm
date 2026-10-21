import { useCallback, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useDeletePersonPhoto, useUpdatePersonPhoto } from '@/features/people/person-photo'
import type { PendingPhoto } from './photo-constants'
import { PhotoUploader } from './photo-uploader'
import { PhotoCapturer } from './photo-capturer'

/**
 * Full-size photo viewer dialog for a person. Shows the current photo as a
 * circle (matching the avatar shape) and provides upload/capture options to
 * replace it, plus a trash icon to delete.
 */
export function PhotoViewerDialog({
  personId,
  name,
  photoData,
  open,
  onOpenChange
}: {
  personId: number
  name: string
  photoData: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const updatePhoto = useUpdatePersonPhoto()
  const deletePhoto = useDeletePersonPhoto()
  const [isDeleting, setIsDeleting] = useState(false)

  const avatarSrc = photoData ? `data:image/jpeg;base64,${photoData}` : undefined
  const initials = getInitials(name)

  const handlePhoto = useCallback(
    (photo: PendingPhoto) => {
      updatePhoto.mutate(
        { personId, filename: photo.filename, data: photo.data },
        { onSuccess: () => onOpenChange(false) }
      )
    },
    [personId, updatePhoto, onOpenChange]
  )

  const handleDelete = useCallback(() => {
    setIsDeleting(true)
    deletePhoto.mutate(
      { personId },
      {
        onSuccess: () => onOpenChange(false),
        onSettled: () => setIsDeleting(false)
      }
    )
  }, [personId, deletePhoto, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>View or update the profile photo.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {/* Circle photo preview */}
          <Avatar size="2xl" className="[&>[data-slot=avatar-image]]:rounded-full">
            {avatarSrc && <AvatarImage src={avatarSrc} alt={name} />}
            <AvatarFallback>
              <span className="text-muted-foreground">{initials}</span>
            </AvatarFallback>
          </Avatar>

          {/* Upload / Capture controls */}
          <div className="flex gap-2">
            <PhotoUploader onPhoto={handlePhoto} className="items-center" />
            <PhotoCapturer onPhoto={handlePhoto} className="items-center" />
          </div>
        </div>

        {/* Footer with delete */}
        <div className="flex justify-between border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isDeleting || updatePhoto.isPending}
          >
            <Trash2 className="size-3.5" />
            {isDeleting ? 'Removing…' : 'Remove photo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
