import { APP_SECURITY_STORE, runDatabaseTransaction } from '../db/indexedDb'

const PIN_RECORD_ID = 'pin-verifier'
const PIN_PATTERN = /^\d{6}$/
const PBKDF2_ITERATIONS = 100_000
const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 30_000

interface PinVerifier {
  id: typeof PIN_RECORD_ID
  algorithm: 'PBKDF2-SHA-256'
  iterations: number
  salt: string
  hash: string
}

let failedAttempts = 0
let lockoutUntil = 0

function assertPin(pin: string) {
  if (!PIN_PATTERN.test(pin)) {
    throw new TypeError('PIN must contain exactly six digits.')
  }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) {
    throw new TypeError('Stored PIN verifier is invalid.')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

async function deriveHash(pin: string, salt: Uint8Array, iterations: number) {
  const saltBuffer = new ArrayBuffer(salt.byteLength)
  new Uint8Array(saltBuffer).set(salt)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations },
    keyMaterial,
    256,
  )
  return new Uint8Array(derivedBits)
}

function equalBytes(first: Uint8Array, second: Uint8Array) {
  if (first.length !== second.length) return false
  let difference = 0
  for (let index = 0; index < first.length; index += 1) {
    difference |= first[index] ^ second[index]
  }
  return difference === 0
}

function readVerifier(): Promise<PinVerifier | undefined> {
  return runDatabaseTransaction<PinVerifier | undefined>(
    APP_SECURITY_STORE,
    'readonly',
    (store, _transaction, setResult, fail) => {
      const request = store.get(PIN_RECORD_ID)
      request.onsuccess = () => setResult(request.result as PinVerifier | undefined)
      request.onerror = () => fail(request.error ?? new Error('Could not read the PIN verifier.'))
    },
  )
}

function resetAttemptState() {
  failedAttempts = 0
  lockoutUntil = 0
}

export function getPinLockoutRemainingMs(now = Date.now()) {
  return Math.max(0, lockoutUntil - now)
}

export function getPinFailedAttemptCount() {
  return failedAttempts
}

export async function setupPin(pin: string): Promise<void> {
  assertPin(pin)
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('Web Crypto is not available in this browser.')
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await deriveHash(pin, salt, PBKDF2_ITERATIONS)
  const verifier: PinVerifier = {
    id: PIN_RECORD_ID,
    algorithm: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToHex(salt),
    hash: bytesToHex(hash),
  }
  await runDatabaseTransaction<void>(
    APP_SECURITY_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.put(verifier)
      request.onsuccess = () => setResult(undefined)
      request.onerror = () => fail(request.error ?? new Error('Could not save the PIN verifier.'))
    },
  )
  resetAttemptState()
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (getPinLockoutRemainingMs() > 0) return false
  if (!PIN_PATTERN.test(pin)) {
    failedAttempts += 1
    if (failedAttempts >= LOCKOUT_THRESHOLD) lockoutUntil = Date.now() + LOCKOUT_DURATION_MS
    return false
  }
  const verifier = await readVerifier()
  if (verifier === undefined) return false
  if (
    verifier.algorithm !== 'PBKDF2-SHA-256' ||
    verifier.iterations !== PBKDF2_ITERATIONS
  ) {
    throw new Error('Stored PIN verifier uses an unsupported format.')
  }
  const valid = equalBytes(
    await deriveHash(pin, hexToBytes(verifier.salt), verifier.iterations),
    hexToBytes(verifier.hash),
  )
  if (valid) resetAttemptState()
  else {
    failedAttempts += 1
    if (failedAttempts >= LOCKOUT_THRESHOLD) lockoutUntil = Date.now() + LOCKOUT_DURATION_MS
  }
  return valid
}

export async function isPinEnabled(): Promise<boolean> {
  return (await readVerifier()) !== undefined
}

export async function removePin(currentPin: string): Promise<boolean> {
  if (!(await verifyPin(currentPin))) return false
  await runDatabaseTransaction<void>(
    APP_SECURITY_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.delete(PIN_RECORD_ID)
      request.onsuccess = () => setResult(undefined)
      request.onerror = () => fail(request.error ?? new Error('Could not remove the PIN verifier.'))
    },
  )
  resetAttemptState()
  return true
}

export async function changePin(currentPin: string, newPin: string): Promise<boolean> {
  assertPin(newPin)
  if (!(await verifyPin(currentPin))) return false
  await setupPin(newPin)
  return true
}
