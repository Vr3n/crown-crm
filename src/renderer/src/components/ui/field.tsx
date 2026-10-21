import * as React from 'react'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type FieldErrorValue = string | { message?: string } | undefined

function firstMessage(errors: FieldErrorValue[] | undefined): string | undefined {
  if (!errors) return undefined
  for (const err of errors) {
    if (typeof err === 'string') {
      if (err) return err
    } else if (err && typeof err.message === 'string') {
      return err.message
    }
  }
  return undefined
}

interface FieldProps {
  id?: string
  label?: React.ReactNode
  /** Node rendered right-aligned on the label row (e.g. a live "digits remaining" counter). */
  labelEnd?: React.ReactNode
  /** Helper text shown when the field is not in an error state. */
  hint?: React.ReactNode
  /**
   * Non-blocking amber notice (e.g. an async "this value already exists"
   * warning). Shown beneath the control when the field is otherwise valid; an
   * error always wins over it.
   */
  warning?: React.ReactNode
  /** Convenience error message; takes precedence over `errors`. */
  error?: React.ReactNode
  /** TanStack Form error array shape (`field.state.meta.errors`). */
  errors?: FieldErrorValue[]
  /** Node rendered right-aligned in the helper line (e.g. a character counter / success check). */
  trailing?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * Accessible labeled field block. Follows the shadcn convention: the caller owns the
 * control and sets `aria-invalid` / `id` / `data-valid` directly on it (no cloning),
 * while this component renders the label, the control, and a reserved helper line that
 * swaps hint/error text without causing layout shift.
 */
export function Field({
  id,
  label,
  labelEnd,
  hint,
  warning,
  error,
  errors,
  trailing,
  className,
  children
}: FieldProps): React.JSX.Element {
  const message = error ?? firstMessage(errors)

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label ? (
        labelEnd ? (
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <div className="shrink-0">{labelEnd}</div>
          </div>
        ) : (
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
        )
      ) : null}

      {children}

      <div className="flex min-h-5 items-center justify-between gap-3">
        {message ? (
          <FieldError id={id ? `${id}-error` : undefined}>{message}</FieldError>
        ) : warning ? (
          <FieldWarning id={id ? `${id}-warning` : undefined}>{warning}</FieldWarning>
        ) : hint ? (
          <FieldDescription id={id ? `${id}-hint` : undefined}>{hint}</FieldDescription>
        ) : (
          <span aria-hidden className="grow" />
        )}
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </div>
  )
}

export function FieldLabel({
  htmlFor,
  className,
  ...props
}: React.ComponentProps<'label'>): React.JSX.Element {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('text-sm font-medium text-foreground', className)}
      {...props}
    />
  )
}

export function FieldDescription({
  id,
  className,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  return <p id={id} className={cn('text-xs text-muted-foreground', className)} {...props} />
}

export function FieldError({
  id,
  className,
  children,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      id={id}
      role="alert"
      className={cn(
        'flex animate-in items-center gap-1.5 text-xs font-medium text-destructive fade-in-0 slide-in-from-top-1 duration-200',
        className
      )}
      {...props}
    >
      <AlertCircle className="size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/**
 * Non-blocking amber notice shown beneath the control when the field is valid
 * but deserves attention (e.g. "this mobile number already exists"). Announced
 * politely via `aria-live`, not as an `alert` — it never blocks submission.
 */
export function FieldWarning({
  id,
  className,
  children,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn(
        'flex animate-in items-center gap-1.5 text-xs font-medium text-amber-600 fade-in-0 slide-in-from-top-1 duration-200 dark:text-amber-500',
        className
      )}
      {...props}
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function FieldGroup({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('flex flex-col gap-5', className)} {...props} />
}
