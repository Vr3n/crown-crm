import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ReportVisuals } from '@/features/reports/components/report-visuals'
import type {
  AgeingRow,
  ProfitLossReport,
  ReceivableRow,
  RegisterRow
} from '../../src/shared/contracts/reports'

/**
 * Visual proof generator. Run with REPORT_PROOF_DIR set to write one SVG per
 * chart in light and dark mode; a normal `npm test` skips it.
 *
 *   $env:REPORT_PROOF_DIR="docs/e2e-screens/report-visuals"; npm test
 */
const proofDir = process.env.REPORT_PROOF_DIR

const RECEIVABLES: ReceivableRow[] = [
  {
    partyId: 1,
    partyName: 'Acme Distributors',
    notDueMinor: 4250000,
    overdueMinor: 1280000,
    totalMinor: 5530000,
    bucketsMinor: [4250000, 1280000, 0, 0, 0],
    dueWithin7Minor: 0,
    dueWithin30Minor: 2200000
  },
  {
    partyId: 2,
    partyName: 'Meridian Traders',
    notDueMinor: 0,
    overdueMinor: 940000,
    totalMinor: 940000,
    bucketsMinor: [0, 940000, 0, 0, 0],
    dueWithin7Minor: 0,
    dueWithin30Minor: 0
  },
  {
    partyId: 3,
    partyName: 'Blue Square',
    notDueMinor: 0,
    overdueMinor: 610000,
    totalMinor: 610000,
    bucketsMinor: [0, 0, 610000, 0, 0],
    dueWithin7Minor: 0,
    dueWithin30Minor: 0
  }
]

const PAYABLES: ReceivableRow[] = [
  {
    partyId: 4,
    partyName: 'TechConnect',
    notDueMinor: 3100000,
    overdueMinor: 0,
    totalMinor: 3100000,
    bucketsMinor: [3100000, 0, 0, 0, 0],
    dueWithin7Minor: 1200000,
    dueWithin30Minor: 2400000
  },
  {
    partyId: 5,
    partyName: 'Sri Ram Papers',
    notDueMinor: 780000,
    overdueMinor: 0,
    totalMinor: 780000,
    bucketsMinor: [780000, 0, 0, 0, 0],
    dueWithin7Minor: 0,
    dueWithin30Minor: 780000
  }
]

const AGEING: AgeingRow[] = [
  { partyId: 1, partyName: 'Acme Distributors', bucketsMinor: [425000, 128000, 0, 0, 0], totalMinor: 553000 },
  { partyId: 2, partyName: 'Meridian Traders', bucketsMinor: [0, 94000, 0, 0, 0], totalMinor: 94000 },
  { partyId: 3, partyName: 'Blue Square', bucketsMinor: [0, 0, 61000, 0, 0], totalMinor: 61000 },
  { partyId: 6, partyName: 'Kaveri Electricals', bucketsMinor: [18000, 0, 0, 42000, 0], totalMinor: 60000 },
  { partyId: 7, partyName: 'Northwind', bucketsMinor: [0, 0, 0, 0, 98000], totalMinor: 98000 }
]

function registerRow(overrides: Partial<RegisterRow>): RegisterRow {
  return {
    id: 1,
    date: '2026-04-10',
    number: 'S-1',
    partyName: 'Acme Distributors',
    taxableMinor: 1850000,
    cgstMinor: 166500,
    sgstMinor: 166500,
    igstMinor: 0,
    roundOffMinor: 0,
    totalMinor: 2183000,
    status: 'POSTED',
    ...overrides
  }
}

const REGISTER: RegisterRow[] = [
  registerRow({}),
  registerRow({ id: 2, date: '2026-05-08', taxableMinor: 1200000, cgstMinor: 0, sgstMinor: 0, igstMinor: 216000, totalMinor: 1416000 }),
  registerRow({ id: 3, date: '2026-06-19', taxableMinor: 2400000, cgstMinor: 216000, sgstMinor: 216000, igstMinor: 0, totalMinor: 2832000 })
]

const PROFIT_LOSS: ProfitLossReport = {
  income: [
    { id: 1, name: 'Sales', groupName: 'Sales', type: 'INCOME', debitMinor: 0, creditMinor: 5450000 },
    { id: 2, name: 'Other income', groupName: 'Other income', type: 'INCOME', debitMinor: 0, creditMinor: 120000 }
  ],
  expenses: [
    { id: 3, name: 'Cost of goods sold', groupName: 'Purchase', type: 'EXPENSE', debitMinor: 3100000, creditMinor: 0 },
    { id: 4, name: 'Rent', groupName: 'Indirect expenses', type: 'EXPENSE', debitMinor: 480000, creditMinor: 0 },
    { id: 5, name: 'Salaries', groupName: 'Indirect expenses', type: 'EXPENSE', debitMinor: 760000, creditMinor: 0 }
  ],
  totalIncomeMinor: 5570000,
  totalExpenseMinor: 4340000,
  netProfitMinor: 1230000,
  monthly: [
    { month: '2026-04', incomeMinor: 1580000, expenseMinor: 1210000, netProfitMinor: 370000 },
    { month: '2026-05', incomeMinor: 1420000, expenseMinor: 1130000, netProfitMinor: 290000 },
    { month: '2026-06', incomeMinor: 2570000, expenseMinor: 2000000, netProfitMinor: 570000 }
  ]
}

interface ProofCase {
  name: string
  element: React.JSX.Element
}

const CASES: ProofCase[] = [
  {
    name: 'receivables',
    element: <ReportVisuals kind="receivables" data={RECEIVABLES} from="2026-04-01" to="2026-06-30" />
  },
  {
    name: 'payables',
    element: <ReportVisuals kind="payables" data={PAYABLES} from="2026-04-01" to="2026-06-30" />
  },
  {
    name: 'ageing',
    element: <ReportVisuals kind="ageing" data={AGEING} from="2026-04-01" to="2026-06-30" />
  },
  {
    name: 'sales-register',
    element: <ReportVisuals kind="sales-register" data={REGISTER} from="2026-04-01" to="2026-06-30" />
  },
  {
    name: 'purchase-register',
    element: <ReportVisuals kind="purchase-register" data={REGISTER} from="2026-04-01" to="2026-06-30" />
  },
  {
    name: 'profit-loss',
    element: <ReportVisuals kind="profit-loss" data={PROFIT_LOSS} from="2026-04-01" to="2026-06-30" />
  }
]

const MODES = [
  { name: 'light', background: '#fcfbf8', foreground: '#141a1f' },
  { name: 'dark', background: '#1a1e23', foreground: '#e8e5de' }
]

describe.skipIf(!proofDir)('report visual proofs', () => {
  it('writes one SVG per chart in light and dark mode', () => {
    if (!proofDir) return
    mkdirSync(proofDir, { recursive: true })

    for (const proof of CASES) {
      const { container, unmount } = render(proof.element)
      const charts = [...container.querySelectorAll('svg')]
      charts.forEach((chart, index) => {
        for (const mode of MODES) {
          const markup = chart.outerHTML.replace(
            'style="display:block;overflow:visible"',
            `style="background:${mode.background};color:${mode.foreground};display:block;overflow:visible"`
          )
          writeFileSync(join(proofDir, `${proof.name}-${index + 1}-${mode.name}.svg`), markup)
        }
      })
      unmount()
    }
  })
})
