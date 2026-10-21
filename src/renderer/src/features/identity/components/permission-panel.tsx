import { Checkbox } from '@/components/ui/checkbox'
import { PERMISSION_GROUPS } from '../constants'

/**
 * The role permission editor — the permission catalog grouped by bounded
 * context, each row a code with its plain-language label and description.
 * Rendering permissions as data (checkbox rows) is exactly Module 15's core
 * decision: reconfiguring who can do what is a data change, not a code change.
 */
export function PermissionPanel({
  granted,
  onToggle,
  readOnly = false
}: {
  granted: Set<string>
  onToggle: (code: string, checked: boolean) => void
  readOnly?: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      {PERMISSION_GROUPS.map((group) => (
        <section key={group.id} className="flex flex-col gap-2">
          <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {group.label}
          </h4>
          <div className="flex flex-col divide-y divide-border/70 rounded-lg border border-border bg-card">
            {group.permissions.map((p) => {
              const checked = granted.has(p.code)
              return (
                <label
                  key={p.code}
                  className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <Checkbox
                    checked={checked}
                    disabled={readOnly}
                    onCheckedChange={(value) => onToggle(p.code, Boolean(value))}
                    className="mt-0.5"
                    aria-label={p.label}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{p.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.description}
                    </span>
                  </span>
                  <code className="mt-0.5 shrink-0 font-mono text-[10px] text-muted-foreground/70">
                    {p.code}
                  </code>
                </label>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
