import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { PendingPhoto } from './photo-constants'

type CameraStatus = 'loading' | 'active' | 'error'

function cameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException || err instanceof Error) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Camera access was denied. Allow camera permission in your browser/OS settings, then retry.'
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No camera was found on this device. Connect a camera, then retry.'
      case 'NotReadableError':
        return 'The camera is already in use by another app. Close it, then retry.'
      default:
        break
    }
  }
  return 'Could not access the camera. Check your camera connection and permissions, then retry.'
}

/**
 * Webcam capture dialog. Opens the user's camera, shows a live preview, and
 * captures a single frame as a JPEG when the user clicks "Capture". The
 * captured frame is returned via `onCapture` as a `PendingPhoto`.
 */
export function WebcamCaptureDialog({
  open,
  onOpenChange,
  onCapture
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (photo: PendingPhoto) => void
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [captured, setCaptured] = useState<string | null>(null) // data-URL for preview
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('loading')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0) // bumped by Retry to re-run the effect

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  /** Pure async request — no state inside, so the open-effect may subscribe. */
  const requestStream = useCallback(async (): Promise<MediaStream> => {
    // Feature-detect: insecure contexts / old browsers have no mediaDevices.
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DOMException('Camera API unavailable', 'NotSupportedError')
    }
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 512 }, height: { ideal: 512 } },
      audio: false
    })
  }, [])

  // Start the camera when the dialog opens (or after Retake/Retry clears the
  // preview). State transitions happen only in the async callbacks — i.e. when
  // the external camera system responds — never synchronously in the effect.
  // The cancellation flag drops late responses and releases their tracks, so a
  // slow first request can't attach after a retry superseded it.
  useEffect(() => {
    if (!open || captured) return
    let cancelled = false
    void requestStream().then(
      (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setCameraStatus('active')
      },
      (err: unknown) => {
        if (cancelled) return
        stopStream()
        setCameraError(cameraErrorMessage(err))
        setCameraStatus('error')
      }
    )
    return () => {
      cancelled = true
      stopStream()
    }
  }, [open, captured, attempt, requestStream, stopStream])

  const handleCapture = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setCaptured(dataUrl)
    stopStream()
  }, [stopStream])

  const handleRetake = useCallback(() => {
    // Clearing the preview re-runs the open-effect, which restarts the camera.
    setCaptured(null)
    setCameraStatus('loading')
    setCameraError(null)
  }, [])

  const handleAccept = useCallback(() => {
    if (!captured) return
    // Strip data-URL prefix
    const base64 = captured.split(',')[1] ?? ''
    onCapture({ filename: 'capture.jpg', data: base64 })
    setCaptured(null)
    onOpenChange(false)
  }, [captured, onCapture, onOpenChange])

  const handleClose = useCallback(() => {
    setCaptured(null)
    setCameraError(null)
    setCameraStatus('loading')
    onOpenChange(false)
  }, [onOpenChange])

  const handleRetry = useCallback(() => {
    // The preview is already clear in the error state; bumping `attempt`
    // re-runs the open-effect for a fresh request.
    setCameraStatus('loading')
    setCameraError(null)
    setAttempt((a) => a + 1)
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-4 text-primary" />
            Capture photo
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-center">
          <div className="relative size-48 overflow-hidden rounded-full border-2 border-border bg-muted">
            {captured ? (
              <img src={captured} alt="Captured photo" className="size-full object-cover" />
            ) : cameraStatus === 'error' ? (
              <div
                role="alert"
                className="flex size-full flex-col items-center justify-center gap-1.5 p-4 text-center"
              >
                <CameraOff className="size-6 text-muted-foreground" aria-hidden />
                <p className="text-xs text-muted-foreground">{cameraError}</p>
              </div>
            ) : (
              <>
                {cameraStatus === 'loading' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2
                      className="size-6 animate-spin text-muted-foreground"
                      aria-label="Starting camera"
                    />
                  </div>
                )}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="size-full -scale-x-100 object-cover"
                />
              </>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        <DialogFooter>
          {captured ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleRetake}>
                <RotateCcw className="size-3.5" />
                Retake
              </Button>
              <Button type="button" size="sm" onClick={handleAccept}>
                Use photo
              </Button>
            </>
          ) : cameraStatus === 'error' ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                Close
              </Button>
              <Button type="button" size="sm" onClick={handleRetry}>
                <RotateCcw className="size-3.5" />
                Retry
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCapture}
                disabled={cameraStatus !== 'active'}
              >
                <Camera className="size-3.5" />
                Capture
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
