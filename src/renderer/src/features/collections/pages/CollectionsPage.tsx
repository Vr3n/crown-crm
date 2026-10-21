import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { RecordPaymentDialog } from '@/features/finance/components/record-payment-dialog'
import { usePayments } from '../queries'
import { buildDayCollection } from '../build'
import { CollectionDatePicker } from '../components/collection-date-picker'
import { CollectionSummary } from '../components/collection-summary'
import { CollectionsTable } from '../components/collections-table'

/**
 * Daily Collection (Module 05 · Finance) — the answer to "how much money was
 * recorded on a given day". The day is the unit: a date picker drives the
 * summary and the ledger, both derived from the same payment rows so the
 * report can never disagree with its source (Module 09 §63).
 */
export function CollectionsPage(): React.JSX.Element {
  const { data, isLoading } = usePayments()
  const [recordOpen, setRecordOpen] = useState(false)
  const [day, setDay] = useState<Date>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  const collection = useMemo(() => buildDayCollection(data ?? [], day), [data, day])

  const dayPayments = useMemo(() => {
    const from = day.getTime()
    const to = from + 86400000
    return (data ?? [])
      .filter((p) => {
        const t = new Date(p.receivedAt).getTime()
        return t >= from && t < to
      })
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  }, [data, day])

  const isToday = day.getTime() === new Date(new Date().setHours(0, 0, 0, 0)).getTime()

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Daily Collection"
        description={`Money recorded on ${format(day, 'd MMMM yyyy')}, by method.`}
        actions={
          <>
            <Badge variant="secondary" className="rounded-none">
              Module 05 · Finance
            </Badge>
            <CollectionDatePicker value={day} onValueChange={setDay} />
            <Button onClick={() => setRecordOpen(true)}>
              <Plus />
              Record payment
            </Button>
          </>
        }
      />

      <CollectionSummary collection={collection} isToday={isToday} />

      <CollectionsTable payments={dayPayments} isLoading={isLoading} />

      {recordOpen && <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} />}
    </div>
  )
}
