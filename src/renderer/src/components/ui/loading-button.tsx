import * as React from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LoadingButtonProps extends React.ComponentProps<typeof Button> {
  loading?: boolean
  loadingLabel?: string
  /** Shows a green success state (check + label) once the action completed. */
  success?: boolean
  successLabel?: string
}

/**
 * Button that reflects three phases: idle → loading (inline spinner) → success
 * (green check). Press feedback (scale-down) is applied via CSS so it always
 * reflects the physical interaction, independent of animation preferences.
 */
export function LoadingButton({
  loading,
  loadingLabel,
  success,
  successLabel,
  disabled,
  className,
  children,
  ...props
}: LoadingButtonProps): React.JSX.Element {
  return (
    <Button
      {...props}
      disabled={disabled || loading || success}
      className={cn(
        'active:scale-[0.985]',
        success && 'bg-green-600 text-white hover:bg-green-600 dark:bg-green-600',
        className
      )}
    >
      {success ? (
        <>
          <CheckCircle2 className="size-4" />
          {successLabel ?? 'Done'}
        </>
      ) : loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {loadingLabel ?? 'Please wait…'}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
