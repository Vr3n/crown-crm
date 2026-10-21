import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

/**
 * Shared destructive-confirm dialog for catalog deletions. Stays mounted only
 * while something is pending deletion, so no internal state is needed.
 */
export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  pendingLabel = 'Deleting…',
  isPending,
  onConfirm,
  onOpenChange
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  pendingLabel?: string
  isPending: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {isPending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
