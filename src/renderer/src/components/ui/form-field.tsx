import * as React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Field, type FieldProps } from '@/components/ui/field'
import type { FieldHelpContent } from '@/components/ui/field-help'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Structural shape of a TanStack Form field. Keeping the adapter decoupled from
 * the generic `FieldApi` signature lets every dialog share one control without
 * casts.
 */
export interface FormFieldApi<T = string> {
  name: string
  state: {
    value: T
    meta: { isTouched: boolean; errors: unknown[] }
  }
  handleChange: (value: T) => void
  handleBlur: () => void
  validate: (cause: 'change' | 'blur' | 'submit') => unknown
  /** TanStack keeps a blur error until the next blur; clear it on edit. */
  setErrorMap?: (map: { onBlur?: undefined; onChange?: undefined }) => void
}

type Filter = 'digits' | 'upper' | 'decimal'

function applyFilter(value: string, filter?: Filter): string {
  if (filter === 'digits') return value.replace(/\D/g, '')
  if (filter === 'upper') return value.toUpperCase()
  return value
}

/**
 * Reactive labelled input for a TanStack Form field.
 *
 * Validation runs on blur. Once a field has been touched or the form has been
 * submitted, changing the value re-runs the rule immediately, so an error
 * disappears as soon as it is fixed. A success check marks a complete field.
 */
export function FormTextField({
  field,
  submitted,
  label,
  required,
  help,
  hint,
  warning,
  validate,
  filter,
  mono,
  className,
  inputClassName,
  showSuccessCheck = true,
  afterChange,
  ...input
}: {
  field: FormFieldApi
  /** True once the enclosing form has been submitted at least once. */
  submitted: boolean
  label: React.ReactNode
  required?: boolean
  help?: FieldHelpContent
  hint?: React.ReactNode
  warning?: React.ReactNode
  /** Extra cross-field rule evaluated after the field-level validators. */
  validate?: (value: string) => string | undefined
  filter?: Filter
  mono?: boolean
  className?: string
  inputClassName?: string
  showSuccessCheck?: boolean
  /** Runs after the field value is committed, for dependent fields. */
  afterChange?: (value: string) => void
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'className'>): React.JSX.Element {
  const value = field.state.value
  const evaluated = field.state.meta.isTouched || submitted
  const fieldError = field.state.meta.errors.find((error) => Boolean(error))
  const extraError = validate?.(value)
  const error = extraError ?? (fieldError ? String(fieldError) : undefined)
  const valid = !error && evaluated

  const change = (raw: string): void => {
    const next = applyFilter(raw, filter)
    field.handleChange(next)
    afterChange?.(next)
    // A blur error would otherwise outlive the fix; drop it and re-check live.
    field.setErrorMap?.({ onBlur: undefined, onChange: undefined })
    if (evaluated) void field.validate('change')
  }

  return (
    <Field
      id={field.name}
      label={label}
      required={required}
      help={help}
      hint={hint}
      warning={error ? undefined : warning}
      error={error}
      className={className}
      trailing={
        valid && showSuccessCheck ? (
          <CheckCircle2 className="size-4 text-success" aria-hidden />
        ) : undefined
      }
    >
      <Input
        {...input}
        id={field.name}
        name={field.name}
        value={value}
        onChange={(event) => change(event.target.value)}
        onBlur={() => {
          field.handleBlur()
          void field.validate('blur')
        }}
        aria-invalid={Boolean(error)}
        aria-required={required}
        data-valid={valid || undefined}
        aria-describedby={error ? `${field.name}-error` : hint ? `${field.name}-hint` : undefined}
        className={cn(mono && 'font-mono tabular-nums', inputClassName)}
      />
    </Field>
  )
}

/** Focus the first field TanStack Form reports as invalid. */
export function focusFirstError(form: {
  state: { fieldMeta: Record<string, { errors: unknown[] }> }
}): void {
  const first = Object.entries(form.state.fieldMeta).find(
    ([, meta]) => Array.isArray(meta.errors) && meta.errors.length > 0
  )
  if (!first) return
  const element = document.getElementById(first[0])
  element?.focus()
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

export type { FieldProps }
