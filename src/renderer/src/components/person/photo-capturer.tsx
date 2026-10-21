import { useState } from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PendingPhoto } from './photo-constants'
import { WebcamCaptureDialog } from './webcam-capture-dialog'

/**
 * Webcam capture trigger. Shows a button that opens the `WebcamCaptureDialog`.
 * Captured photos are emitted via `onPhoto`.
 */
export function PhotoCapturer({
  onPhoto,
  className
}: {
  onPhoto: (photo: PendingPhoto) => void
  className?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Camera className="size-3.5" />
        Capture photo
      </Button>
      <p className="text-[11px] text-muted-foreground">Take a photo with your camera</p>
      <WebcamCaptureDialog open={open} onOpenChange={setOpen} onCapture={onPhoto} />
    </div>
  )
}
