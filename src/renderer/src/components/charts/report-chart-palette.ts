import type { ChartLegendItem } from './chart-frame'

/**
 * Report chart palette. Mid-lightness values, chosen to stay visible on both
 * the warm paper sheet and the dark card, like the dashboard charts. Series
 * meaning is always carried by the legend and the data table, never by colour
 * alone.
 */
export const REPORT_ACCENT = 'oklch(0.56 0.075 235)'
export const REPORT_EXPENSE = 'oklch(0.68 0.09 75)'
const CHART_GREEN = 'oklch(0.57 0.08 158)'
const CHART_OCHRE = REPORT_EXPENSE
const CHART_AMBER = 'oklch(0.62 0.1 55)'
const CHART_VERMILION = 'oklch(0.57 0.12 32)'
export const CHART_NET = 'oklch(0.55 0.02 250)'

export const AGEING_SERIES: ChartLegendItem[] = [
  { label: '0-30', color: REPORT_ACCENT },
  { label: '31-60', color: CHART_OCHRE },
  { label: '61-90', color: CHART_AMBER },
  { label: '91-180', color: CHART_VERMILION },
  { label: '180+', color: 'oklch(0.5 0.13 25)' }
]

export const TAX_SERIES: ChartLegendItem[] = [
  { label: 'CGST', color: REPORT_ACCENT },
  { label: 'SGST', color: CHART_GREEN },
  { label: 'IGST', color: CHART_OCHRE }
]
