import {
  MONEY_ENTRIES_STORE,
  runDatabaseTransaction,
} from '../db/indexedDb'

export type MoneyEntryType = 'IN' | 'OUT'

export interface MoneyEntry {
  id: string
  date: string
  type: MoneyEntryType
  amountPaise: number
  description?: string
  note?: string
  createdAt: string
  updatedAt: string
}

export type NewMoneyEntry = Omit<
  MoneyEntry,
  'id' | 'createdAt' | 'updatedAt'
>

export const MAX_MONEY_AMOUNT_PAISE = 999_999_999
export const HIGH_AMOUNT_CONFIRMATION_PAISE = 10_000_000
export const MAX_DESCRIPTION_LENGTH = 120
export const MAX_MONEY_NOTE_LENGTH = 300

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseMoneyAmount(input: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (match === null) {
    throw new TypeError('Enter an amount with at most two decimal places.')
  }

  const rupees = Number(match[1])
  const paise = Number((match[2] ?? '').padEnd(2, '0'))
  const amountPaise = rupees * 100 + paise
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new RangeError('Amount must be greater than zero.')
  }
  if (amountPaise > MAX_MONEY_AMOUNT_PAISE) {
    throw new RangeError('Amount exceeds the maximum allowed value.')
  }
  return amountPaise
}

export function formatMoney(amountPaise: number): string {
  if (!Number.isSafeInteger(amountPaise)) {
    throw new TypeError('Money amounts must be an integer number of paise.')
  }
  const isNegative = amountPaise < 0
  const absolutePaise = Math.abs(amountPaise)
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: absolutePaise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(absolutePaise / 100)
  return isNegative ? `-${formatted}` : formatted
}

function parseLocalDateKey(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (match === null) throw new TypeError('Date must use YYYY-MM-DD format.')

  const [year, month, day] = match.slice(1).map(Number)
  const parsedDate = new Date(0)
  parsedDate.setFullYear(year, month - 1, day)
  parsedDate.setHours(0, 0, 0, 0)
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    throw new TypeError('Date must be a valid calendar date.')
  }
  return parsedDate
}

export function validateMoneyDate(date: string, now = new Date()) {
  const parsedDate = parseLocalDateKey(date)

  const latestAllowedDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  )
  latestAllowedDate.setDate(latestAllowedDate.getDate() + 365)
  if (parsedDate > latestAllowedDate) {
    throw new RangeError('Money entries cannot be more than 365 days in the future.')
  }
}

function createUuidV4() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function validateId(id: string) {
  if (!UUID_V4_PATTERN.test(id)) {
    throw new TypeError('Money entry ID must be a UUID v4.')
  }
}

function validateEntryFields(entry: NewMoneyEntry) {
  validateMoneyDate(entry.date)
  if (entry.type !== 'IN' && entry.type !== 'OUT') {
    throw new TypeError('Money entry type must be IN or OUT.')
  }
  if (
    !Number.isSafeInteger(entry.amountPaise) ||
    entry.amountPaise <= 0 ||
    entry.amountPaise > MAX_MONEY_AMOUNT_PAISE
  ) {
    throw new RangeError('Money entry amount must be valid positive paise.')
  }
  if (entry.description !== undefined && entry.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new RangeError(`Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.`)
  }
  if (entry.note !== undefined && entry.note.length > MAX_MONEY_NOTE_LENGTH) {
    throw new RangeError(`Entry note cannot exceed ${MAX_MONEY_NOTE_LENGTH} characters.`)
  }
}

function validateMoneyEntry(entry: MoneyEntry) {
  validateId(entry.id)
  validateEntryFields(entry)
  if (
    Number.isNaN(Date.parse(entry.createdAt)) ||
    Number.isNaN(Date.parse(entry.updatedAt))
  ) {
    throw new TypeError('Money entry timestamps must be valid ISO dates.')
  }
}

export function addMoneyEntry(
  entry: NewMoneyEntry,
  id = createUuidV4(),
): Promise<MoneyEntry> {
  validateId(id)
  validateEntryFields(entry)
  const now = new Date().toISOString()
  const record: MoneyEntry = { ...entry, id, createdAt: now, updatedAt: now }

  return runDatabaseTransaction<MoneyEntry>(
    MONEY_ENTRIES_STORE,
    'readwrite',
    (store, _transaction, setResult) => {
      const request = store.add(record)
      request.onsuccess = () => setResult(record)
    },
  )
}

export function updateMoneyEntry(
  id: string,
  updates: Partial<MoneyEntry>,
): Promise<MoneyEntry> {
  validateId(id)
  return runDatabaseTransaction<MoneyEntry>(
    MONEY_ENTRIES_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const existing = request.result as MoneyEntry | undefined
        if (existing === undefined) {
          fail(new Error('Money entry was not found for update.'))
          return
        }

        const updated: MoneyEntry = {
          ...existing,
          ...updates,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        }
        try {
          validateEntryFields(updated)
        } catch (error) {
          fail(
            error instanceof Error
              ? error
              : new Error('Updated money entry fields are invalid.'),
          )
          return
        }
        const putRequest = store.put(updated)
        putRequest.onsuccess = () => setResult(updated)
      }
    },
  )
}

export function deleteMoneyEntry(id: string): Promise<MoneyEntry> {
  validateId(id)
  return runDatabaseTransaction<MoneyEntry>(
    MONEY_ENTRIES_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const entry = request.result as MoneyEntry | undefined
        if (entry === undefined) {
          fail(new Error('Money entry was not found for deletion.'))
          return
        }
        store.delete(id)
        setResult(entry)
      }
    },
  )
}

export function restoreMoneyEntry(entry: MoneyEntry): Promise<void> {
  validateMoneyEntry(entry)
  return runDatabaseTransaction<void>(
    MONEY_ENTRIES_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.get(entry.id)
      request.onsuccess = () => {
        const existing = request.result as MoneyEntry | undefined
        if (existing === undefined) {
          store.add(entry)
        } else if (
          existing.date !== entry.date ||
          existing.type !== entry.type ||
          existing.amountPaise !== entry.amountPaise ||
          existing.description !== entry.description ||
          existing.note !== entry.note ||
          existing.createdAt !== entry.createdAt ||
          existing.updatedAt !== entry.updatedAt
        ) {
          fail(new Error('A different money entry already uses this ID.'))
          return
        }
        setResult(undefined)
      }
    },
  )
}

export function getMoneyEntriesByDate(date: string): Promise<MoneyEntry[]> {
  parseLocalDateKey(date)
  return runDatabaseTransaction<MoneyEntry[]>(
    MONEY_ENTRIES_STORE,
    'readonly',
    (store, _transaction, setResult) => {
      const request = store.index('by_date').getAll(date)
      request.onsuccess = () => {
        const entries = request.result as MoneyEntry[]
        setResult(
          entries.sort(
            (first, second) =>
              first.createdAt.localeCompare(second.createdAt) ||
              first.id.localeCompare(second.id),
          ),
        )
      }
    },
  )
}
