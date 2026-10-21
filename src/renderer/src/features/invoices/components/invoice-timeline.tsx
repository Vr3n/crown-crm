import { FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Timeline, type TimelineEntry } from '@/components/timeline'
import { formatDate } from '@/lib/format'
import { formatMinor, type CurrencyCode } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { Invoice } from '../types'

/**
 * Maps Invoice[] into generic TimelineEntry[] for the universal
 * Timeline component. Each invoice becomes a timeline entry.
 */
function mapInvoicesToEntries(invoices: Invoice[], currency: CurrencyCode): TimelineEntry[] {
  return [...invoices]
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
    .map((inv) => ({
      id: inv.id,
      label: inv.invoiceNo,
      date: inv.issuedAt,
      description: inv.lines.map((l) => l.description).join(', '),
      icon: FileText,
      iconTone:
        inv.status === 'PAID'
          ? 'bg-success/15 text-success'
          : inv.status === 'VOID'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-primary/10 text-primary',
      badge: {
        label: inv.status.replace(/_/g, ' '),
        variant:
          inv.status === 'PAID'
            ? ('success' as const)
            : inv.status === 'VOID'
              ? ('destructive' as const)
              : ('secondary' as const)
      },
      meta:
        inv.outstandingMinor > 0
          ? `${formatMinor(inv.totalMinor, currency)} · ${formatMinor(inv.outstandingMinor, currency)} due`
          : formatMinor(inv.totalMinor, currency)
    }))
}

/**
 * Invoice history as a timeline — every invoice issued for a customer rendered
 * chronologically using the universal Timeline component. This is a placeholder
 * that becomes fully functional when Module 04 (Billing & Invoicing) database
 * tables are implemented.
 */
export function InvoiceTimeline({ invoices }: { invoices: Invoice[] }): React.JSX.Element {
  const currency = useCurrency()
  const entries = mapInvoicesToEntries(invoices, currency)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-primary" />
          Invoice history
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {entries.length} invoice{entries.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices issued yet.</p>
        ) : (
          <Timeline entries={entries} formatDate={formatDate} />
        )}
      </CardContent>
    </Card>
  )
}
