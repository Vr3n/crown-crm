import { Plus } from 'lucide-react'

/**
 * The create action that sits at the foot of a picker. It stays outside the
 * command list so a search term never filters it away.
 */
export function PickerCreateAction({
  label,
  onClick
}: {
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-left text-[0.8125rem] font-medium text-primary transition-colors hover:bg-accent-soft/50"
    >
      <Plus className="size-3.5" strokeWidth={2} aria-hidden />
      {label}
    </button>
  )
}
