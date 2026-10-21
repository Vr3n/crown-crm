import * as React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

/**
 * Reactive labeled field that wires a TanStack field to the auth-form UX:
 *
 * - `aria-invalid` on error → red border + ring (control styles it)
 * - `data-valid` once complete and correct → green border
 * - a `CheckCircle2` success check in the reserved helper line
 *
 * Evaluation rules (the app-wide standard, from the auth forms):
 *   a field is "evaluated" once it is touched, the form was submitted, or its
 *   `completeWhen` predicate flips true (e.g. a 10-digit mobile) — so inputs
 *   react live, not only after blur. An externally-computed `extraError`
 *   (e.g. an async "already exists" check) is always treated as invalid.
 *
 * Two usage modes:
 *  - Text inputs: pass `leading`/`trailing` icons + input props and let
 *    `FormField` render the `Input` inside an `InputGroup` (most common).
 *  - Custom controls (Select, Textarea, DateTimePicker, combobox): pass a
 *    render-prop `children` that receives `{ value, invalid, valid,
 *    describedBy, onBlur, onChange }` to spread onto the control.
 */
export function FormField({
  name,
  state,
  handleChange,
  handleBlur,
  submitted,
  label,
  labelEnd,
  hint,
  validate,
  completeWhen,
  extraError,
  warning,
  showSuccessCheck = true,
  leading,
  trailing,
  type = 'text',
  placeholder,
  autoComplete,
  inputMode,
  inputClassName,
  onChange,
  children
}: {
  name: string
  state: { value: string; meta: { isTouched: boolean } }
  handleChange: (value: string) => void
  handleBlur: () => void
  /** True once the enclosing form has been submitted at least once. */
  submitted: boolean
  label: React.ReactNode
  /** Node rendered right-aligned on the label row (e.g. a live "digits remaining" counter). */
  labelEnd?: React.ReactNode
  hint?: React.ReactNode
  /** Granular message; `undefined` means valid. */
  validate: (value: string) => string | undefined
  /**
   * Returns true once the value is complete enough to judge live (e.g. a
   * 10-digit mobile). When provided the field evaluates as soon as it flips
   * true; when omitted it evaluates only on blur/submit.
   */
  completeWhen?: (value: string) => boolean
  /** Externally-computed error shown in the same red style as a field error. */
  extraError?: string | null
  /**
   * Non-blocking amber notice (yellow input + `FieldWarning` message) shown only
   * while the field is otherwise valid. An active error (field or `extraError`)
   * always wins over it.
   */
  warning?: React.ReactNode
  showSuccessCheck?: boolean
  /** Node rendered as a leading addon inside the input (Input convenience mode). */
  leading?: React.ReactNode
  /** Node rendered as a trailing addon inside the input (e.g. counter, eye). */
  trailing?: React.ReactNode
  type?: string
  placeholder?: string
  autoComplete?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'url'
  inputClassName?: string
  /** Optional transform applied on change (e.g. digit stripping). */
  onChange?: (value: string) => void
  /** Render-prop mode: receives the reactive control state to spread onto any control. */
  children?: (control: {
    id: string
    value: string
    invalid: boolean | undefined
    valid: boolean | undefined
    warning: boolean | undefined
    describedBy: string | undefined
    onBlur: () => void
    onChange: (value: string) => void
  }) => React.ReactNode
}): React.JSX.Element {
  const value = state.value
  const evaluated = state.meta.isTouched || submitted || Boolean(completeWhen?.(value))
  const errorMsg = validate(value)
  const hasExtra = Boolean(extraError)
  const invalid = (Boolean(errorMsg) || hasExtra) && (evaluated || hasExtra)
  const valid = !errorMsg && !hasExtra && evaluated
  const error = invalid ? (extraError ?? errorMsg) : undefined
  const hasWarning = Boolean(warning) && !invalid
  const describedBy = error
    ? `${name}-error`
    : hasWarning
      ? `${name}-warning`
      : hint
        ? `${name}-hint`
        : undefined

  const control = {
    id: name,
    value,
    invalid: invalid || undefined,
    valid: valid || undefined,
    warning: hasWarning || undefined,
    describedBy,
    onBlur: handleBlur,
    onChange: handleChange
  }

  return (
    <Field
      id={name}
      label={label}
      labelEnd={labelEnd}
      hint={hint}
      warning={hasWarning ? warning : undefined}
      error={error}
      trailing={
        valid && showSuccessCheck && !hasWarning ? (
          <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" aria-hidden />
        ) : undefined
      }
    >
      {children ? (
        children(control)
      ) : (
        <InputGroup>
          {leading ? <InputGroupAddon align="start">{leading}</InputGroupAddon> : null}
          <Input
            id={name}
            name={name}
            value={value}
            onChange={(e) => (onChange ?? handleChange)(e.target.value)}
            onBlur={handleBlur}
            type={type}
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            aria-invalid={control.invalid}
            data-valid={control.valid}
            data-warning={control.warning}
            aria-describedby={describedBy}
            className={cn(inputClassName, leading ? 'pl-9' : '', trailing ? 'pr-10' : '')}
          />
          {trailing ? <InputGroupAddon align="end">{trailing}</InputGroupAddon> : null}
        </InputGroup>
      )}
    </Field>
  )
}