import { useNavigate } from 'react-router-dom'
import { SetupShell } from '@/components/layout/SetupShell'
import { NumberingPage } from '@/features/numbering/pages/NumberingPage'

/**
 * The only first-run screen. Saving the numbering opens the dashboard, where the
 * setup checklist guides the rest of the flow one action at a time.
 */
export function SetupNumberingPage(): React.JSX.Element {
  const navigate = useNavigate()

  return (
    <SetupShell
      title="Number your vouchers"
      description="Check the series and starting number for each document. The preview shows exactly what the next posted voucher will be called. You can change this later from Company settings."
    >
      <NumberingPage embedded onSaved={() => navigate('/', { replace: true })} />
    </SetupShell>
  )
}
