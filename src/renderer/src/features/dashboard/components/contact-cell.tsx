import { displayPhone } from '@/features/leads/format'

/**
 * Contact column. Mobile number is the primary channel, so it sits above at
 * full weight; email is demoted below in a muted, smaller size. Icons are
 * deliberately omitted — phone/email glyphs are unambiguous enough on their own
 * and the bare text keeps the dense rows calm. An em dash is shown only when
 * neither is known (honest about dirty data).
 */
export function ContactCell({
  phone,
  email
}: {
  phone?: string
  email?: string
}): React.JSX.Element {
  const hasPhone = Boolean(phone?.trim())
  const hasEmail = Boolean(email?.trim())

  return (
    <div className="flex flex-col gap-0.5">
      {hasPhone ? <span className="text-sm tabular-nums">{displayPhone(phone)}</span> : null}
      {hasEmail ? (
        <span className="block max-w-44 truncate text-xs text-muted-foreground">{email}</span>
      ) : null}
      {!hasPhone && !hasEmail ? <span className="text-xs text-muted-foreground">—</span> : null}
    </div>
  )
}
