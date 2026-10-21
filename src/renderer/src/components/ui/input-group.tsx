import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Relative wrapper that lets leading/trailing icons sit over an `<Input>`.
 * The `<Input>` is the direct responsibility of the caller, which sets its own
 * `id`, `aria-invalid`, `data-valid`, and side padding (`pl-9` / `pr-10`).
 */
export function InputGroup({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="input-group" className={cn('relative', className)} {...props} />
}

interface InputGroupAddonProps extends React.ComponentProps<'div'> {
  align?: 'start' | 'end'
}

/**
 * Positioned slot inside an `InputGroup`. Does not force `pointer-events-none`,
 * so callers may render interactive controls (e.g. a password visibility toggle);
 * static icons should set `pointer-events-none` themselves.
 */
export function InputGroupAddon({
  align = 'start',
  className,
  ...props
}: InputGroupAddonProps): React.JSX.Element {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        'absolute top-0 flex h-full items-center text-muted-foreground',
        align === 'start' ? 'left-0 pl-3' : 'right-0 pr-3',
        className
      )}
      {...props}
    />
  )
}
