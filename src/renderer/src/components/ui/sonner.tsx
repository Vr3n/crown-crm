import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useTheme } from '@/lib/theme'

/**
 * App-wide sonner <Toaster/>. Minimal surface with subtle semantic color so
 * feedback reads at a glance: success (login/setup) tints the success token,
 * error/destructive (logout) tints the destructive token. Bottom-right, 2s.
 *
 * Mounted once at the app root (not inside the authenticated layout) so toasts
 * survive logout/login transitions instead of being torn down or queued.
 */
function Toaster(props: ToasterProps): React.JSX.Element {
  const { resolved } = useTheme()

  return (
    <Sonner
      theme={resolved}
      richColors
      position="bottom-right"
      duration={2000}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--success-bg': 'color-mix(in oklab, var(--success) 12%, var(--popover))',
          '--success-text': 'var(--popover-foreground)',
          '--success-border': 'color-mix(in oklab, var(--success) 45%, var(--border))',
          '--error-bg': 'color-mix(in oklab, var(--destructive) 12%, var(--popover))',
          '--error-text': 'var(--popover-foreground)',
          '--error-border': 'color-mix(in oklab, var(--destructive) 45%, var(--border))'
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: '!border',
          title: '!text-sm !font-medium',
          description: '!text-xs !text-muted-foreground'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }