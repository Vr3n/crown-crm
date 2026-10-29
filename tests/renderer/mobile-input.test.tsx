import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormTextField } from '@/components/ui/form-field'
import { mobileDigitsLeft, toMobileDigits } from '@/lib/validation'

function MobileHarness(): React.JSX.Element {
  const [value, setValue] = useState('')
  const field = {
    name: 'phone',
    state: { value, meta: { isTouched: false, errors: [] as unknown[] } },
    handleChange: (next: string) => setValue(next),
    handleBlur: () => undefined,
    validate: () => undefined
  }
  return <FormTextField field={field} submitted={false} label="Mobile" filter="mobile" />
}

describe('mobile input digits', () => {
  it('keeps only digits and caps the value at ten', () => {
    expect(toMobileDigits('98765-43210')).toBe('9876543210')
    expect(toMobileDigits('98765432109')).toBe('9876543210')
    expect(toMobileDigits('98 76 54')).toBe('987654')
  })

  it('removes a pasted Indian country code or trunk prefix', () => {
    expect(toMobileDigits('+91 98765 43210')).toBe('9876543210')
    expect(toMobileDigits('0091 98765 43210')).toBe('9876543210')
    expect(toMobileDigits('0 98765 43210')).toBe('9876543210')
  })

  it('counts the digits still missing', () => {
    expect(mobileDigitsLeft('')).toBe(10)
    expect(mobileDigitsLeft('98765')).toBe(5)
    expect(mobileDigitsLeft('9876543210')).toBe(0)
  })

  it('stops the field at ten digits and shows the remaining count', async () => {
    const user = userEvent.setup()
    render(<MobileHarness />)

    const input = screen.getByLabelText('Mobile')
    expect(screen.getByText('10 left')).toBeInTheDocument()

    await user.type(input, '98765432109')

    expect(input).toHaveValue('9876543210')
    expect(screen.getByText('0 left')).toBeInTheDocument()
  })

  it('accepts a pasted number with a country code and updates the counter', async () => {
    const user = userEvent.setup()
    render(<MobileHarness />)

    const input = screen.getByLabelText('Mobile')
    await user.click(input)
    await user.paste('+91 98765 43210')

    expect(input).toHaveValue('9876543210')
    expect(screen.getByText('0 left')).toBeInTheDocument()
  })
})
