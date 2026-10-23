import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, FileText, Package, PieChart, Receipt, Users } from 'lucide-react'
import { toast } from 'sonner'
import { SetupShell } from '@/components/layout/SetupShell'
import { Button } from '@/components/ui/button'
import { errorMessage } from '../../../../../shared/contracts/errors'

interface Step {
  id: string
  title: string
  description: string
  to: string
  done: boolean
  icon: typeof Users
}

/**
 * The guided tour after numbering. It is a checklist of the main flow rather
 * than a modal coach mark: each step opens the real screen, and progress comes
 * from the same rows the dashboard reads.
 */
export function SetupTourPage(): React.JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const summary = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => window.api.dashboard.summary()
  })
  const purchases = useQuery({
    queryKey: ['vouchers', 'tour', 'purchase'],
    queryFn: () => window.api.vouchers.list({ type: 'PURCHASE', limit: 1, offset: 0 })
  })
  const sales = useQuery({
    queryKey: ['vouchers', 'tour', 'sales'],
    queryFn: () => window.api.vouchers.list({ type: 'SALES', limit: 1, offset: 0 })
  })

  const finish = useMutation({
    mutationFn: () => window.api.numbering.completeOnboarding(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company', 'profile'] })
      navigate('/', { replace: true })
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save your progress. Try again.'))
  })

  const steps: Step[] = [
    {
      id: 'party',
      title: 'Add a customer or supplier',
      description:
        'One record per business, with credit days and an opening balance if they owe you.',
      to: '/parties',
      done: (summary.data?.partyCount ?? 0) > 0,
      icon: Users
    },
    {
      id: 'item',
      title: 'Add an item or service',
      description: 'Set the unit, GST rate and selling price once, then pick it on every line.',
      to: '/items',
      done: (summary.data?.itemCount ?? 0) > 0,
      icon: Package
    },
    {
      id: 'purchase',
      title: 'Post a purchase bill',
      description: 'The supplier bill moves stock in, writes the ledger and records what you owe.',
      to: '/purchases/new',
      done: (purchases.data?.length ?? 0) > 0,
      icon: Receipt
    },
    {
      id: 'sale',
      title: 'Post a sales invoice',
      description: 'The invoice moves stock out, records GST and creates a receivable.',
      to: '/sales/new',
      done: (sales.data?.length ?? 0) > 0,
      icon: FileText
    },
    {
      id: 'reports',
      title: 'Read the trial balance',
      description:
        'Every account with its debit and credit total. If the books are right, it balances.',
      to: '/reports/trial-balance',
      done: false,
      icon: PieChart
    }
  ]

  const dataSteps = steps.filter((step) => step.id !== 'reports')
  const completed = dataSteps.filter((step) => step.done).length

  return (
    <SetupShell
      step={2}
      title="Walk through the main flow"
      description="Five steps from an empty set of books to a balanced trial balance. Open any step now, or skip and come back from the dashboard."
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-4 py-3">
        <div>
          <p className="text-[0.875rem] font-medium">
            {completed} of {dataSteps.length} data steps ready
          </p>
          <p className="text-[0.75rem] text-muted-foreground">
            Ticks appear as you add real records. Nothing is simulated.
          </p>
        </div>
        <div className="h-1.5 w-48 overflow-hidden bg-muted" aria-hidden>
          <div
            className="h-full bg-success transition-[width] duration-500"
            style={{ width: `${(completed / dataSteps.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="grid gap-3">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <li
              key={step.id}
              className="flex flex-wrap items-center gap-3 border border-border bg-card px-4 py-3"
            >
              <span
                className={
                  step.done
                    ? 'flex size-8 shrink-0 items-center justify-center bg-success text-white'
                    : 'flex size-8 shrink-0 items-center justify-center bg-accent-soft text-primary'
                }
                aria-hidden
              >
                {step.done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[0.6875rem] text-muted-foreground">
                    {index + 1}
                  </span>
                  <h2 className="text-[0.9375rem] font-semibold">{step.title}</h2>
                  {step.done ? (
                    <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-success">
                      Done
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
              <Link
                to={step.to}
                className="flex h-8 shrink-0 items-center gap-1.5 border border-border bg-background px-3 text-[0.8125rem] font-medium hover:border-rule-strong"
              >
                Open
                <ArrowRight className="size-3.5" />
              </Link>
            </li>
          )
        })}
      </ol>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => finish.mutate()}
          disabled={finish.isPending}
        >
          Skip the tour
        </Button>
        <Button type="button" size="sm" onClick={() => finish.mutate()} disabled={finish.isPending}>
          {finish.isPending ? 'Saving...' : 'Finish and open dashboard'}
        </Button>
      </div>
    </SetupShell>
  )
}
