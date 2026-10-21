import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

/** Returns a "salt:hash" string suitable for storage. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString('hex')
  return `${salt}:${hash}`
}

/** Constant-time comparison of a plain password against a stored "salt:hash". */
export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(plain, salt, KEY_LENGTH)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
