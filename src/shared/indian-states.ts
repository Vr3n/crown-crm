/**
 * Indian GST state codes. Used on the invoice to print a place of supply as a
 * name and a code instead of a bare two digit number.
 *
 * Codes follow the CBIC state code list. 26 (Daman and Diu) is kept because
 * older books still carry it; new records use 25 for the merged union
 * territory.
 */
export const INDIAN_STATES: Readonly<Record<string, string>> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Dadra and Nagar Haveli and Daman and Diu',
  '26': 'Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction'
}

/**
 * "27" -> "Maharashtra (27)". An unknown code falls back to the code alone so a
 * missing master never blanks the invoice.
 */
export function stateLabel(code: string | null | undefined): string | null {
  const value = (code ?? '').trim()
  if (value === '') return null
  const name = INDIAN_STATES[value]
  return name ? `${name} (${value})` : value
}
