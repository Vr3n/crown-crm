import { useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { exportExcel, type ExportColumn } from '../api'
import { useCurrency } from '@/hooks/use-currency'
import { useOrganization } from '@/features/identity/queries'

interface ExportExcelButtonProps {
  columns: ExportColumn[]
  rows: Record<string, unknown>[]
  sheetName: string
  filename?: string
  disabled?: boolean
}

function todayStamp(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Toolbar "Export" action that generates a styled .xlsx file from the
 * currently displayed table data. Shows a loading spinner while the main
 * process generates the workbook, then toasts the saved file path.
 */
export function ExportExcelButton({
  columns,
  rows,
  sheetName,
  filename,
  disabled = false
}: ExportExcelButtonProps): React.JSX.Element {
  const [loading, setLoading] = useState(false)
  const currency = useCurrency()
  const { data: organization } = useOrganization()
  // Organization-local wall clock for dates (#110); backend falls back safely.
  const timezone = organization?.timezone ?? undefined

  async function handleExport(): Promise<void> {
    if (rows.length === 0) {
      toast.warning('Nothing to export', {
        description: 'The table is empty. Adjust your filters and try again.'
      })
      return
    }

    setLoading(true)
    try {
      const name = filename ?? `${sheetName.toLowerCase()}-${todayStamp()}`
      const filePath = await exportExcel({
        sheetName,
        filename: name,
        columns,
        rows,
        currency,
        timezone
      })
      toast.success('Exported & opened', {
        description: filePath
      })
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : 'Could not generate spreadsheet'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 rounded-md px-3 text-xs text-success shadow-sm hover:bg-success/10 hover:text-success"
          disabled={disabled || loading}
          onClick={handleExport}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="size-4" />
          )}
          Export
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Export as Excel</TooltipContent>
    </Tooltip>
  )
}
