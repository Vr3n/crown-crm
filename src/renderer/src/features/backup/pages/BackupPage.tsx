import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DatabaseBackup } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { formatDateTime } from '@/lib/format'

/**
 * Local backups. Restore is deliberately manual: close the app, replace
 * `crown-books.db`, reopen. Automating a live database swap risks data loss.
 */
export function BackupPage(): React.JSX.Element {
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => window.api.backup.list()
  })

  const create = useMutation({
    mutationFn: () => window.api.backup.create(),
    onSuccess: (file) => {
      toast.success('Backup created', { description: file.name })
      void qc.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (error) =>
      toast.error('Could not create a backup', {
        description: error instanceof Error ? error.message : undefined
      })
  })

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5 p-6">
      <PageHeader
        title="Backup"
        description="A copy of the books file, written to the backup folder next to the database."
        actions={
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="flex h-8 items-center gap-1.5 bg-primary px-3 text-[0.875rem] font-medium text-primary-foreground disabled:opacity-60"
          >
            <DatabaseBackup className="size-3.5" strokeWidth={1.75} />
            {create.isPending ? 'Creating...' : 'Create backup'}
          </button>
        }
      />

      <div className="border border-border bg-accent-soft/50 px-4 py-3 text-[0.875rem] leading-relaxed text-muted-foreground">
        Restoring is manual by design. Close Crown Books, keep a copy of the current
        <span className="font-mono text-foreground"> crown-books.db</span>, then replace it with the
        backup file and reopen the app.
      </div>

      {isLoading ? (
        <div className="border border-border bg-card p-6 text-[0.875rem] text-muted-foreground">
          Reading the backup folder...
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={DatabaseBackup}
          title="No backups yet"
          description="Create the first backup before you start posting real bills."
        />
      ) : (
        <div className="border border-border bg-card">
          <table className="w-full border-collapse text-[0.875rem]">
            <thead>
              <tr>
                {['File', 'Created', 'Size'].map((head, index) => (
                  <th
                    key={head}
                    className={
                      index === 2
                        ? 'border-b border-border px-3 py-2 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
                        : 'border-b border-border px-3 py-2 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
                    }
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((file) => (
                <tr key={file.name} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-[0.75rem]">{file.name}</td>
                  <td className="px-3 py-2">{formatDateTime(file.createdAt)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {(file.sizeBytes / 1024).toFixed(1)} KB
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
