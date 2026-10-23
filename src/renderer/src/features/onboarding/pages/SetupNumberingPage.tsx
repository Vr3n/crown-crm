import { useNavigate } from 'react-router-dom'
import { SetupShell } from '@/components/layout/SetupShell'
import { NumberingPage } from '@/features/numbering/pages/NumberingPage'

/**
 * Step one of first run. The same numbering screen the owner can reopen from
 * Company settings, wrapped in the wizard shell.
 */
export function SetupNumberingPage(): React.JSX.Element {
  const navigate = useNavigate()

  return (
    <SetupShell
      step={1}
      title="Number your vouchers"
      description="Check the series and starting number for each document. The preview shows exactly what the next posted voucher will be called. You can change this later from Company settings."
    >
      <NumberingPage embedded onSaved={() => navigate('/setup/tour')} />
    </SetupShell>
  )
}
