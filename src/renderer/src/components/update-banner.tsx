import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import type { Update } from '@tauri-apps/plugin-updater'
import { Button } from '@/components/ui/button'

type Phase = 'idle' | 'available' | 'downloading' | 'installing' | 'error'

const CHECK_INTERVAL = 6 * 60 * 60 * 1000

/**
 * Background update check.
 *
 * The updater is a production-only concern: `tauri dev` runs the same UI but
 * must never replace itself with a released build. The first check waits a few
 * seconds so it cannot compete with sign-in and the first queries; later checks
 * run every six hours while the window stays open.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('idle')
  const [update, setUpdate] = useState<Update | null>(null)
  const [percent, setPercent] = useState(0)
  const updateRef = useRef<Update | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD || !('__TAURI_INTERNALS__' in window)) return
    let cancelled = false

    async function checkForUpdate(): Promise<void> {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const found = await check({ timeout: 60_000 })
        if (cancelled) {
          await found?.close()
          return
        }
        if (!found) return
        updateRef.current = found
        setUpdate(found)
        setPhase('available')
      } catch {
        // Offline or a manifest that is not published yet. Try again next time.
      }
    }

    const first = setTimeout(() => void checkForUpdate(), 5_000)
    const interval = setInterval(() => void checkForUpdate(), CHECK_INTERVAL)
    return () => {
      cancelled = true
      clearTimeout(first)
      clearInterval(interval)
      void updateRef.current?.close()
      updateRef.current = null
    }
  }, [])

  function dismiss(): void {
    void updateRef.current?.close()
    updateRef.current = null
    setPhase('idle')
    setUpdate(null)
  }

  async function install(): Promise<void> {
    const current = updateRef.current
    if (!current) return
    setPhase('downloading')
    setPercent(0)
    try {
      let total = 0
      let received = 0
      await current.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0
        if (event.event === 'Progress') {
          received += event.data.chunkLength
          if (total > 0) setPercent(Math.min(100, Math.round((received / total) * 100)))
        }
        if (event.event === 'Finished') {
          setPercent(100)
          setPhase('installing')
        }
      })
      // On Windows the installer exits the app before this resolves.
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch {
      setPhase('error')
    }
  }

  if (phase === 'idle' || !update) return null

  return (
    <aside
      aria-label="Application update"
      className="fixed bottom-4 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)] border border-border border-t-4 border-t-primary bg-card p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-primary">
            Update available
          </p>
          <p className="mt-1 text-[0.9375rem] font-semibold leading-snug">
            Crown Books {update.version} is ready
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={dismiss}
          aria-label="Remind me later"
        >
          <X />
        </Button>
      </div>

      {phase === 'available' ? (
        <>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted-foreground">
            You are on {update.currentVersion}. The update installs in place and restarts the app.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => void install()}>
              <Download />
              Install update
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
              Later
            </Button>
          </div>
        </>
      ) : null}

      {phase === 'downloading' || phase === 'installing' ? (
        <div className="mt-3">
          <p className="text-[0.8125rem] text-muted-foreground">
            {phase === 'installing' ? 'Installing and restarting…' : `Downloading ${percent}%`}
          </p>
          <div
            className="mt-2 h-1 w-full overflow-hidden bg-border"
            role="progressbar"
            aria-label="Update download progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={phase === 'installing' ? 100 : percent}
          >
            <div
              className="h-full bg-primary transition-[width] duration-200 ease-out"
              style={{ width: `${phase === 'installing' ? 100 : percent}%` }}
            />
          </div>
        </div>
      ) : null}

      {phase === 'error' ? (
        <>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-destructive">
            The update did not install. Check the connection and try again.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => void install()}>
              <RefreshCw />
              Retry
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
              Later
            </Button>
          </div>
        </>
      ) : null}
    </aside>
  )
}
