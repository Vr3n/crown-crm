import { format } from 'date-fns'
import { useSession } from '@/context/session-context'

/**
 * Dashboard masthead (plan §7). The greeting is the dashboard's human layer:
 * a compact heading with the user's name (final punctuation in teal),
 * and the current date right-aligned.
 */
export function DashboardHeader(): React.JSX.Element {
  const session = useSession()
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const firstName = session.userFullName.split(' ')[0] ?? session.userFullName
  const today = format(new Date(), 'EEEE, MMMM d, yyyy')

  return (
    <section
      aria-label="Dashboard greeting"
      className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
    >
      <h1 className="font-heading text-base font-semibold tracking-tight text-foreground">
        {greeting}, <span className="text-primary">{firstName}</span>.
      </h1>
      <p className="text-sm text-muted-foreground">{today}</p>
    </section>
  )
}
