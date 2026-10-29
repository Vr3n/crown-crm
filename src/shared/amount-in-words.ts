/**
 * Amount in words, Indian numbering system (thousand, lakh, crore, arab ...).
 *
 * Integer only: the input is minor units, so no floating point ever decides
 * what the invoice says. Used by the printed invoice and available to the main
 * process for any future PDF or email body.
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen'
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

/** Indian scale words. Index 1 is thousand, then every step is one hundred times. */
const SCALES = ['', 'Thousand', 'Lakh', 'Crore', 'Arab', 'Kharab', 'Neel', 'Padma', 'Shankh']

function twoDigits(value: number): string {
  if (value < 20) return ONES[value]
  const tens = Math.floor(value / 10)
  const ones = value % 10
  return ones === 0 ? TENS[tens] : `${TENS[tens]} ${ONES[ones]}`
}

function threeDigits(value: number): string {
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  const parts: string[] = []
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`)
  if (rest > 0) parts.push(twoDigits(rest))
  return parts.join(' ')
}

/** 0 -> "" (the caller decides how to phrase a zero amount). */
function wholeNumberWords(value: number): string {
  if (value === 0) return ''
  const groups: number[] = []
  let remaining = value
  // The first group is three digits, every later group is two digits.
  groups.push(remaining % 1000)
  remaining = Math.floor(remaining / 1000)
  while (remaining > 0) {
    groups.push(remaining % 100)
    remaining = Math.floor(remaining / 100)
  }

  const words: string[] = []
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]
    if (group === 0) continue
    const scale = SCALES[index] ?? ''
    const groupWords = index === 0 ? threeDigits(group) : twoDigits(group)
    words.push(scale ? `${groupWords} ${scale}` : groupWords)
  }
  return words.join(' ')
}

const CURRENCY_WORDS: Readonly<Record<string, string>> = {
  INR: 'Rupees',
  USD: 'Dollars',
  EUR: 'Euros',
  GBP: 'Pounds',
  AED: 'Dirhams',
  SGD: 'Singapore Dollars'
}

const SUBUNIT_WORDS: Readonly<Record<string, string>> = {
  INR: 'Paise',
  USD: 'Cents',
  EUR: 'Cents',
  GBP: 'Pence',
  AED: 'Fils',
  SGD: 'Cents'
}

/**
 * "Rupees Four Thousand Five Hundred Fifty Only"
 * "Rupees Two Thousand Three Hundred Seventy One and Eighteen Paise Only"
 */
export function amountInWords(
  minor: number,
  currency: string = 'INR',
  subunitDecimals: number = 2
): string {
  const safe = Number.isFinite(minor) ? Math.trunc(minor) : 0
  const negative = safe < 0
  const absolute = Math.abs(safe)
  const factor = 10 ** subunitDecimals
  const whole = Math.floor(absolute / factor)
  const fraction = absolute % factor

  const currencyWord = CURRENCY_WORDS[currency.toUpperCase()] ?? currency.toUpperCase()
  const subunitWord = SUBUNIT_WORDS[currency.toUpperCase()] ?? 'Cents'

  const wholeWords = wholeNumberWords(whole)
  const parts: string[] = []
  parts.push(wholeWords === '' ? `${currencyWord} Zero` : `${currencyWord} ${wholeWords}`)

  if (fraction > 0) {
    parts.push(`${wholeNumberWords(fraction)} ${subunitWord}`)
  }

  const body = parts.join(' and ')
  return `${negative ? 'Minus ' : ''}${body} Only`
}
