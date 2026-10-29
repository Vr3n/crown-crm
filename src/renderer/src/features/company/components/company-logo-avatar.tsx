import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { companyKeys } from '@/lib/company-queries'
import { COMPANY_LOGO_ACCEPT, prepareLogoDataUrl } from '@/lib/company-logo'
import { errorMessage } from '../../../../../shared/contracts/errors'

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'CB'
  )
}

/**
 * Company avatar with an always-visible pen button. The picked file never
 * leaves the renderer as a path: it is decoded, downscaled and re-encoded to a
 * data URL, then saved through the normal company patch so the logo travels in
 * the database backup.
 */
export function CompanyLogoAvatar({
  name,
  logo
}: {
  name: string
  logo: string | null
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const save = useMutation({
    mutationFn: (input: { logo: string | null }) =>
      window.api.identity.updateCompany({ logo: input.logo }),
    onSuccess: (updated, input) => {
      queryClient.setQueryData(companyKeys.profile, updated)
      void queryClient.invalidateQueries({ queryKey: companyKeys.profile })
      toast.success(input.logo ? 'Company logo updated' : 'Company logo removed')
    },
    onError: (error, input) =>
      toast.error(
        errorMessage(
          error,
          input.logo ? 'Could not save the company logo' : 'Could not remove the company logo'
        )
      )
  })

  const busy = preparing || save.isPending

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    // Clear the input so picking the same file again still fires a change.
    event.target.value = ''
    if (!file) return

    setPreparing(true)
    try {
      const dataUrl = await prepareLogoDataUrl(file)
      save.mutate({ logo: dataUrl })
    } catch (error) {
      toast.error(errorMessage(error, 'Could not use that image'))
    } finally {
      setPreparing(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative">
        <div className="flex size-12 items-center justify-center overflow-hidden border border-rule-strong bg-card">
          {logo ? (
            <img src={logo} alt={`${name} logo`} className="size-full object-contain" />
          ) : (
            <span
              aria-hidden
              className="flex size-full items-center justify-center bg-muted font-heading text-[1.0625rem] font-semibold tracking-tight"
            >
              {initials(name)}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          className="absolute -right-2 -top-2 rounded-full bg-card shadow-xs"
          aria-label="Change company logo"
          aria-busy={busy}
          title="Change company logo"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <Pencil className="size-3" strokeWidth={2} aria-hidden />
          )}
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept={COMPANY_LOGO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label="Company logo file"
          onChange={(event) => void handleFile(event)}
        />
      </div>

      {/* Reserved height keeps the summary card from jumping when a logo is added. */}
      <div className="flex h-5 items-center">
        {logo ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-5 px-1.5 text-[0.6875rem] font-medium text-muted-foreground hover:text-destructive"
            aria-label="Remove company logo"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove company logo?"
        description="The company initials will show in place of the logo. You can upload a new one later."
        confirmLabel="Remove logo"
        destructive
        isPending={save.isPending}
        onConfirm={() => {
          setConfirmRemove(false)
          save.mutate({ logo: null })
        }}
      />
    </div>
  )
}
