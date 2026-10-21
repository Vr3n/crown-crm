import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderSummary } from '../../src/renderer/src/features/memberships/sale/components/order-summary'

vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => 'INR' }))

/**
 * The cheque-number field must appear only while CHEQUE is the selected
 * payment method, stay optional, and report keystrokes up to the form.
 */

function ChequeHarness(): React.JSX.Element {
  const [chequeNumber, setChequeNumber] = useState('')
  return (
    <OrderSummary
      paymentMethod="CHEQUE"
      chequeNumber={chequeNumber}
      onChequeNumberChange={setChequeNumber}
    />
  )
}
describe('OrderSummary — cheque number field', () => {
  it('shows an optional cheque number input when the payment type is CHEQUE', () => {
    render(<OrderSummary paymentMethod="CHEQUE" chequeNumber="CHQ-0042" />)

    expect(screen.getByLabelText(/cheque number/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('CHQ-0042')).toBeInTheDocument()
  })

  it('hides the cheque number input for any other payment type', () => {
    const { rerender } = render(<OrderSummary paymentMethod="UPI" />)
    expect(screen.queryByLabelText(/cheque number/i)).not.toBeInTheDocument()

    rerender(<OrderSummary paymentMethod="" />)
    expect(screen.queryByLabelText(/cheque number/i)).not.toBeInTheDocument()
  })

  it('reports typed cheque numbers through onChequeNumberChange', async () => {
    const user = userEvent.setup()
    render(<ChequeHarness />)

    await user.type(screen.getByLabelText(/cheque number/i), '123456')
    expect(screen.getByDisplayValue('123456')).toBeInTheDocument()
  })
})

describe('OrderSummary — billing date cautions (#110)', () => {
  it('shows no caution for today', () => {
    render(<OrderSummary billingDate="2026-09-08" todayIso="2026-09-08" />)
    expect(screen.queryByText(/back-dated entry/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/rule 47/i)).not.toBeInTheDocument()
  })

  it('shows the series note for a recent back-date', () => {
    render(<OrderSummary billingDate="2026-09-01" todayIso="2026-09-08" />)
    expect(screen.getByText(/invoice number uses this date/i)).toBeInTheDocument()
    expect(screen.queryByText(/rule 47/i)).not.toBeInTheDocument()
  })

  it('shows the Rule-47 caution with source past 30 days', () => {
    render(<OrderSummary billingDate="2026-07-01" todayIso="2026-09-08" />)
    expect(screen.getByText(/rule 47/i)).toBeInTheDocument()
    expect(screen.getByText(/cbic-gst\.gov\.in/)).toBeInTheDocument()
  })

  it('shows the FY-mismatch caution across April', () => {
    render(<OrderSummary billingDate="2026-03-20" todayIso="2026-04-10" />)
    expect(screen.getByText(/FY 2025-26/)).toBeInTheDocument()
    expect(screen.getByText(/GSTR-1/)).toBeInTheDocument()
  })
})
