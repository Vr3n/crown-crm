import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  ReportAreaChart,
  ReportRankedBars,
  ReportStackedBars
} from '@/components/charts/report-charts'
import { AGEING_SERIES, TAX_SERIES } from '@/components/charts/report-chart-palette'

describe('ReportAreaChart', () => {
  it('renders with its accessible name, legend and data table', () => {
    render(
      <ReportAreaChart
        points={[
          { label: 'Apr 2026', primaryMinor: 100000, secondaryMinor: 18000, netMinor: 50000 },
          { label: 'May 2026', primaryMinor: 150000, secondaryMinor: 27000, netMinor: 70000 }
        ]}
        primaryLabel="Revenue"
        secondaryLabel="GST"
        netLabel="Net profit"
        ariaLabel="Monthly revenue with a GST overlay line"
      />
    )

    expect(screen.getByRole('img', { name: 'Monthly revenue with a GST overlay line' })).toBeInTheDocument()
    expect(screen.getAllByText('Revenue').length).toBeGreaterThan(0)
    expect(screen.getAllByText('GST').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Net profit').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('table', { name: 'Monthly revenue with a GST overlay line' })
    ).toBeInTheDocument()
    expect(screen.getAllByText('Show data table')).toHaveLength(1)
    expect(screen.getAllByText(/1,000\.00/).length).toBeGreaterThan(0)
  })

  it('omits optional series from the legend and table', () => {
    render(
      <ReportAreaChart
        points={[{ label: 'Apr 2026', primaryMinor: 100000 }]}
        primaryLabel="Purchases"
        ariaLabel="Monthly purchases"
      />
    )
    expect(screen.getByRole('img', { name: 'Monthly purchases' })).toBeInTheDocument()
    expect(screen.queryByText('GST')).not.toBeInTheDocument()
  })
})

describe('ReportStackedBars', () => {
  it('renders a stacked chart with every series in the legend and table', () => {
    render(
      <ReportStackedBars
        rows={[
          { x: 'Apr 2026', series: 'CGST', valueMinor: 900 },
          { x: 'Apr 2026', series: 'SGST', valueMinor: 900 },
          { x: 'Apr 2026', series: 'IGST', valueMinor: 0 }
        ]}
        series={TAX_SERIES}
        categoryLabel="Month"
        ariaLabel="GST split by month"
      />
    )
    expect(screen.getByRole('img', { name: 'GST split by month' })).toBeInTheDocument()
    expect(screen.getAllByText('CGST').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('table', { name: 'GST split by month' })
    ).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Apr 2026' })).toBeInTheDocument()
  })

  it('renders the horizontal composition used for ageing buckets', () => {
    render(
      <ReportStackedBars
        rows={AGEING_SERIES.map((series, index) => ({
          x: 'Outstanding',
          series: series.label,
          valueMinor: (index + 1) * 1000
        }))}
        series={AGEING_SERIES}
        orientation="horizontal"
        categoryLabel="Outstanding"
        ariaLabel="Receivable outstanding by ageing bucket"
      />
    )
    expect(
      screen.getByRole('img', { name: 'Receivable outstanding by ageing bucket' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('table', { name: 'Receivable outstanding by ageing bucket' })
    ).toBeInTheDocument()
  })
})

describe('ReportRankedBars', () => {
  it('names the chart and lists exact values in its data table', () => {
    render(
      <ReportRankedBars
        items={[
          { label: 'Acme', valueMinor: 5000 },
          { label: 'Beta', valueMinor: 3000 }
        ]}
        valueLabel="Overdue"
        ariaLabel="Top 8 customers by overdue"
      />
    )
    expect(screen.getByRole('img', { name: 'Top 8 customers by overdue' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Top 8 customers by overdue' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Acme' })).toBeInTheDocument()
    expect(screen.getByText(/50\.00/)).toBeInTheDocument()
  })
})
