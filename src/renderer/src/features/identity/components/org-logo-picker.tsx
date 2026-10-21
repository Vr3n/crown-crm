import { useEffect, useRef, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useDeleteOrgLogo, useOrgLogo, useUpdateOrgLogo } from '../queries'
import { logoFileError, readFileAsBase64 } from '../logo'

/**
 * Organization logo picker — first section of the org settings form.
 * Upload jpg/png/webp (5MB max); single active BrandMark, replace or remove.
 * Preview is instant (object URL); persistence happens via IPC mutations.
 */
export function OrgLogoPicker({ disabled = false }: { disabled?: boolean }): React.JSX.Element {
  const { data: logo, isLoading } = useOrgLogo()
  const updateLogo = useUpdateOrgLogo()
  const deleteLogo = useDeleteOrgLogo()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const src = preview ?? logo?.src ?? null
  const busy = updateLogo.isPending || deleteLogo.isPending

  // Object URLs are process-local blobs: release the previous one whenever
  // the preview is replaced, cleared, or the picker unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function clearPreview(): void {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }

  async function onPick(file: File | undefined): Promise<void> {
    if (!file) return
    const err = logoFileError(file)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setPreview(URL.createObjectURL(file))
    try {
      const data = await readFileAsBase64(file)
      await updateLogo.mutateAsync({ filename: file.name, data })
      clearPreview()
    } catch {
      clearPreview()
      // error toast handled by the mutation hook
    }
  }

  async function onRemove(): Promise<void> {
    setError(null)
    clearPreview()
    try {
      await deleteLogo.mutateAsync()
    } catch {
      // error toast handled by the mutation hook
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="org-logo">Gym logo</Label>
      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
          {isLoading ? (
            <div className="size-16 animate-pulse bg-muted/60" />
          ) : src ? (
            <img src={src} alt="Gym logo" className="size-16 object-cover" />
          ) : (
            <Building2 className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
            >
              {updateLogo.isPending ? 'Uploading…' : src ? 'Change' : 'Upload'}
            </Button>
            {src ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || busy}
                onClick={() => void onRemove()}
              >
                {deleteLogo.isPending ? 'Removing…' : 'Remove'}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            jpg, png or webp · max 5MB · shown in sidebar and PDFs
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        id="org-logo"
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
