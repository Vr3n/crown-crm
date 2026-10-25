import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Clock,
  Database,
  DatabaseBackup,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { KpiCard } from '@/components/ui/kpi-card'
import { StatusPill } from '@/components/ui/status-pill'
import { formatDateTime } from '@/lib/format'

/**
 * Local backups. Restore is deliberately manual: close the app, replace
 * `crown-books.db`, reopen. Automating a live database swap risks data loss.
 *
 * Every backup is written to the primary folder next to the database and to
 * each extra folder below. Extra folders are a machine setting, so they are
 * stored outside the database and never appear in the backup itself.
 */
export function BackupPage(): React.JSX.Element {
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => window.api.backup.list()
  })
  const destinations = useQuery({
    queryKey: ['backups', 'destinations'],
    queryFn: () => window.api.backup.destinations()
  })

  const [removing, setRemoving] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => window.api.backup.create(),
    onSuccess: (file) => {
      const copies = file.copies ?? [{ path: 'the backup folder', ok: true }]
      const failed = copies.filter((copy) => !copy.ok)
      const written = copies.filter((copy) => copy.ok).length

      if (failed.length > 0) {
        toast.warning(`Backup written to ${written} of ${copies.length} folders`, {
          description: `${file.name} — not copied to ${failed.map((copy) => copy.path).join(', ')}`
        })
      } else {
        toast.success(written > 1 ? `Backup written to ${written} folders` : 'Backup created', {
          description: file.name
        })
      }
      void qc.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (error) =>
      toast.error('Could not create a backup', {
        description: error instanceof Error ? error.message : undefined
      })
  })

  const addFolder = useMutation({
    mutationFn: () => window.api.backup.addDestination(),
    onSuccess: (next) => {
      if (!next) return
      toast.success('Backup folder added')
      void qc.invalidateQueries({ queryKey: ['backups', 'destinations'] })
    },
    onError: (error) =>
      toast.error('Could not add the folder', {
        description: error instanceof Error ? error.message : undefined
      })
  })

  const removeFolder = useMutation({
    mutationFn: (path: string) => window.api.backup.removeDestination({ path }),
    onSuccess: () => {
      setRemoving(null)
      toast.success('Backup folder removed')
      void qc.invalidateQueries({ queryKey: ['backups', 'destinations'] })
    },
    onError: (error) =>
      toast.error('Could not remove the folder', {
        description: error instanceof Error ? error.message : undefined
      })
  })

  const reveal = useMutation({
    mutationFn: (path: string) => window.api.backup.revealFolder({ path }),
    onError: (error) =>
      toast.error('Could not open the folder', {
        description: error instanceof Error ? error.message : undefined
      })
  })

  const latest = data[0]
  const [now] = useState(() => Date.now())
  // `now` is captured at mount, so a backup created a moment ago can be a few
  // seconds in the future. Clamp it instead of showing "-1d ago".
  const ageDays = latest
    ? Math.max(0, Math.floor((now - new Date(latest.createdAt).getTime()) / 86_400_000))
    : null
  const totalBytes = data.reduce((sum, file) => sum + file.sizeBytes, 0)
  const fresh = ageDays !== null && ageDays <= 7
  const extras = destinations.data?.extras ?? []
  const missing = extras.filter((folder) => !folder.available).length

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

      <section className="grid grid-cols-2 gap-px border border-border bg-border xl:grid-cols-4">
        <KpiCard
          label="Last backup"
          value={ageDays === null ? 'Never' : ageDays === 0 ? 'Today' : `${ageDays}d ago`}
          context={latest ? formatDateTime(latest.createdAt) : 'No copy exists yet'}
          icon={Clock}
          tone={fresh ? 'success' : 'warning'}
        />
        <KpiCard
          label="Backups"
          value={String(data.length)}
          context="Copies on this computer"
          icon={Database}
        />
        <KpiCard
          label="Total size"
          value={`${(totalBytes / 1024 / 1024).toFixed(1)} MB`}
          context="Across all copies"
          icon={HardDrive}
        />
        <KpiCard
          label="Health"
          value={fresh ? 'Fresh' : data.length === 0 ? 'None' : 'Stale'}
          context={fresh ? 'Safe to keep posting' : 'Create a copy before posting more'}
          icon={ShieldCheck}
          tone={fresh ? 'success' : 'stamp'}
        />
      </section>

      <section className="border border-border bg-card" aria-labelledby="backup-folders-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
          <h2 id="backup-folders-heading" className="text-[0.875rem] font-semibold">
            Backup folders
          </h2>
          <span className="text-[0.75rem] text-muted-foreground">
            {extras.length === 0
              ? 'One folder, on this computer'
              : `${extras.length} extra folder${extras.length === 1 ? '' : 's'}${
                  missing > 0 ? `, ${missing} unavailable` : ''
                }`}
          </span>
        </div>

        <ul className="divide-y divide-border">
          <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <Database className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[0.9375rem] font-medium">This computer</span>
                <StatusPill tone="success">Primary</StatusPill>
              </div>
              <p className="truncate font-mono text-[0.75rem] text-muted-foreground">
                {destinations.data?.primary ?? 'Reading the backup folder...'}
              </p>
            </div>
            <button
              type="button"
              disabled={!destinations.data?.primary || reveal.isPending}
              onClick={() => {
                const path = destinations.data?.primary
                if (path) reveal.mutate(path)
              }}
              className="flex h-7 items-center gap-1 border border-border bg-background px-2 text-[0.75rem] font-medium hover:border-rule-strong disabled:opacity-50"
            >
              <FolderOpen className="size-3.5" strokeWidth={1.75} />
              Open
            </button>
          </li>

          {extras.map((folder) => (
            <li key={folder.path} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <Folder className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[0.9375rem] font-medium">Extra copy</span>
                  <StatusPill tone={folder.available ? 'success' : 'warning'}>
                    {folder.available ? 'Available' : 'Missing'}
                  </StatusPill>
                </div>
                <p
                  className="truncate font-mono text-[0.75rem] text-muted-foreground"
                  title={folder.path}
                >
                  {folder.path}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!folder.available || reveal.isPending}
                  onClick={() => reveal.mutate(folder.path)}
                  className="flex h-7 items-center gap-1 border border-border bg-background px-2 text-[0.75rem] font-medium hover:border-rule-strong disabled:opacity-50"
                >
                  <FolderOpen className="size-3.5" strokeWidth={1.75} />
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => setRemoving(folder.path)}
                  className="flex h-7 items-center gap-1 border border-border bg-background px-2 text-[0.75rem] font-medium text-destructive hover:border-destructive disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2.5">
          <span className="text-[0.75rem] text-muted-foreground">
            Every backup is written to all folders. A folder that is unplugged is skipped, not
            retried.
          </span>
          <button
            type="button"
            onClick={() => addFolder.mutate()}
            disabled={addFolder.isPending}
            className="flex h-7 items-center gap-1 border border-border bg-background px-2 text-[0.75rem] font-medium hover:border-rule-strong disabled:opacity-50"
          >
            <FolderPlus className="size-3.5" strokeWidth={1.75} />
            {addFolder.isPending ? 'Choosing...' : 'Add folder'}
          </button>
        </div>
      </section>

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

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="Remove this backup folder?"
        description={
          <>
            New backups will stop being copied to{' '}
            <span className="font-mono text-foreground">{removing}</span>. The files already there
            are left alone.
          </>
        }
        confirmLabel="Remove folder"
        destructive
        isPending={removeFolder.isPending}
        onConfirm={() => {
          if (removing) removeFolder.mutate(removing)
        }}
      />
    </div>
  )
}
