import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { INVOICE_COPY_CAPTIONS } from '../../../../../shared/contracts/invoice'
import { InvoiceSheet } from '../components/InvoiceSheet'

/**
 * A4 is set here, not in the stylesheet, so the rule exists only while this
 * route is mounted. Other screens keep the browser's own print margins.
 */
const PAGE_STYLE = '@page { size: A4; margin: 0; }'

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'This voucher cannot be printed as an invoice.'
}

export function InvoicePrintPage({ id }: { id: number }): React.JSX.Element {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => window.api.invoice.document(id)
  })

  /**
   * The hidden print window polls this flag. It must stay undefined while the
   * query is in flight, otherwise the main process prints the loading state.
   */
  useEffect(() => {
    window.__invoicePrintState = undefined

    if (isLoading) return

    if (isError || !data) {
      window.__invoicePrintState = { ready: false, error: errorMessage(error) }
      return
    }

    let cancelled = false
    const prepare = async (): Promise<void> => {
      try {
        await document.fonts.ready
        await Promise.all(
          Array.from(document.images).map((image) =>
            typeof image.decode === 'function' ? image.decode().catch(() => undefined) : undefined
          )
        )
        if (!cancelled) window.__invoicePrintState = { ready: true }
      } catch (cause) {
        if (!cancelled) {
          window.__invoicePrintState = {
            ready: false,
            error: cause instanceof Error ? cause.message : errorMessage(cause)
          }
        }
      }
    }
    void prepare()

    return () => {
      cancelled = true
    }
  }, [data, error, isError, isLoading])

  if (isLoading) {
    return (
      <div className="invoice-print-page">
        <style>{PAGE_STYLE}</style>
        <p className="p-10 text-[0.9375rem] text-muted-foreground">Preparing the invoice…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="invoice-print-page">
        <style>{PAGE_STYLE}</style>
        <div className="mx-auto flex max-w-md flex-col items-start gap-3 p-10">
          <p className="text-[0.9375rem] font-medium">This voucher cannot be printed.</p>
          <p className="text-[0.875rem] text-muted-foreground">{errorMessage(error)}</p>
          <Link to={`/vouchers/${id}`} className="text-[0.875rem] text-primary hover:underline">
            Back to the voucher
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="invoice-print-page">
      <style>{PAGE_STYLE}</style>

      <div className="invoice-toolbar">
        <div className="flex items-center gap-4">
          <Link
            to={`/vouchers/${id}`}
            className="flex items-center gap-1.5 text-[0.875rem] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.75} />
            Back
          </Link>
          <p className="invoice-toolbar-note">{data.number} · two copies, one page each</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
      </div>

      <div className="invoice-preview">
        {INVOICE_COPY_CAPTIONS.map((caption, index) => (
          <InvoiceSheet
            key={caption}
            document={data}
            caption={caption}
            page={index + 1}
            pages={INVOICE_COPY_CAPTIONS.length}
          />
        ))}
      </div>
    </div>
  )
}
