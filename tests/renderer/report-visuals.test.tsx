import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReportVisuals } from '@/features/reports/components/report-visuals'
import type {
  AgeingRow,
  ProfitLossReport,
  ReceivableRow,
  RegisterRow
} from '../../src/shared/contracts/reports'

const RECEIVABLES: ReceivableRow[] = [
  {
    partyId: 1,
    partyName: 'Acme',
    notDueMinor: 200000,
    overdueMinor: 600000,
    totalMinor: 800000,
    bucketsMinor: [200000, 600000, 0, 0, 0],
    dueWithin7Minor: 0,
    dueWithin30Minor: 200000
  },
  {
    partyId: 2,
    partyName: 'Beta',
    notDueMinor: 0,
    overdueMinor: 0,
    totalMinor: 400000,
    bucketsMinor: [0, 0, 400000, 0, 0],
    dueWithin7Minor: 0,
    dueWithin30Minor: 0
  }
]

const PAYABLES: ReceivableRow[] = [
  {
    partyId: 3,
    partyName: 'Supply Co',
    notDueMinor: 300000,
    overdueMinor: 0,
    totalMinor: 300000,
    bucketsMinor: [300000, 0, 0, 0, 0],
    dueWithin7Minor: 100000,
    dueWithin30Minor: 300000
  }
]

const AGEING: AgeingRow[] = [
  { partyId: 1, partyName: 'Acme', bucketsMinor: [100, 200, 0, 0, 0], totalMinor: 300 },
  { partyId: 2, partyName: 'Beta', bucketsMinor: [0, 0, 0, 0, 500], totalMinor: 500 }
]

function registerRow(overrides: Partial<RegisterRow>): RegisterRow {
  return {
    id: 1,
    date: '2026-04-10',
    number: 'S-1',
    partyName: 'Acme',
    taxableMinor: 100000,
    cgstMinor: 9000,
    sgstMinor: 9000,
    igstMinor: 0,
    roundOffMinor: 0,
    totalMinor: 118000,
    status: 'POSTED',
    ...overrides
  }
}

const REGISTER: RegisterRow[] = [
  registerRow({}),
  registerRow({
    id: 2,
    date: '2026-05-14',
    taxableMinor: 50000,
    cgstMinor: 0,
    sgstMinor: 0,
    igstMinor: 9000,
    totalMinor: 59000
  })
]

const PROFIT_LOSS: ProfitLossReport = {
  income: [{ id: 1, name: 'Sales', groupName: 'Sales', type: 'INCOME', debitMinor: 0, creditMinor: 200000 }],
  expenses: [
    { id: 2, name: 'Rent', groupName: 'Expenses', type: 'EXPENSE', debitMinor: 50000, creditMinor: 0 }
  ],
  totalIncomeMinor: 200000,
  totalExpenseMinor: 50000,
  netProfitMinor: 150000,
  monthly: [
    { month: '2026-04', incomeMinor: 120000, expenseMinor: 30000, netProfitMinor: 90000 },
    { month: '2026-05', incomeMinor: 80000, expenseMinor: 20000, netProfitMinor: 60000 }
  ]
}

function names(): string[] {
  return screen.queryAllByRole('img').map((element) => element.getAttribute('aria-label') ?? '')
}

describe('ReportVisuals', () => {
  it('gives receivables a bucket composition and a top-eight ranking', () => {
    render(<ReportVisuals kind="receivables" data={RECEIVABLES} from="2026-04-01" to="2026-04-30" />)
    expect(names()).toEqual([
      'Receivable outstanding by ageing bucket',
      'Top 8 customers by overdue'
    ])
    expect(screen.getAllByText('Show data table')).toHaveLength(2)
    expect(
      screen.getByRole('table', { name: 'Receivable outstanding by ageing bucket' })
    ).toBeInTheDocument()
  })

  it('gives payables a bucket composition and the due-in-thirty ranking', () => {
    render(<ReportVisuals kind="payables" data={PAYABLES} from="2026-04-01" to="2026-04-30" />)
    expect(names()).toEqual([
      'Payable outstanding by ageing bucket',
      'Top 8 suppliers due within 30 days'
    ])
  })

  it('stacks ageing buckets per party', () => {
    render(<ReportVisuals kind="ageing" data={AGEING} from="2026-04-01" to="2026-04-30" />)
    expect(names()).toEqual([
      'Open balance by ageing bucket for each of the ten largest parties'
    ])
    expect(
      screen.getByRole('table', {
        name: 'Open balance by ageing bucket for each of the ten largest parties'
      })
    ).toBeInTheDocument()
  })

  it('gives the sales register a monthly area and a tax split', () => {
    render(
      <ReportVisuals kind="sales-register" data={REGISTER} from="2026-04-01" to="2026-05-31" />
    )
    expect(names()).toEqual([
      'Monthly revenue with a GST overlay line',
      'GST split by month into CGST, SGST and IGST'
    ])
    expect(screen.getAllByText('Show data table')).toHaveLength(2)
  })

  it('gives the purchase register an input tax overlay and split', () => {
    render(
      <ReportVisuals
        kind="purchase-register"
        data={REGISTER}
        from="2026-04-01"
        to="2026-05-31"
      />
    )
    expect(names()).toEqual([
      'Monthly purchases with an input tax overlay line',
      'Input tax split by month into CGST, SGST and IGST'
    ])
  })

  it('gives profit and loss grouped areas and an expense composition', () => {
    render(
      <ReportVisuals kind="profit-loss" data={PROFIT_LOSS} from="2026-04-01" to="2026-05-31" />
    )
    expect(names()).toEqual([
      'Monthly income and expenses with a net profit line',
      'Expense composition by account'
    ])
  })

  it('keeps trial balance and the balance sheet chart-free', () => {
    const { container: trial } = render(
      <ReportVisuals kind="trial-balance" data={[]} from="2026-04-01" to="2026-04-30" />
    )
    expect(trial).toBeEmptyDOMElement()

    const { container: sheet } = render(
      <ReportVisuals kind="balance-sheet" data={{}} from="2026-04-01" to="2026-04-30" />
    )
    expect(sheet).toBeEmptyDOMElement()
  })

  it('draws nothing when the report is empty', () => {
    const { container } = render(
      <ReportVisuals kind="receivables" data={[]} from="2026-04-01" to="2026-04-30" />
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })
})
