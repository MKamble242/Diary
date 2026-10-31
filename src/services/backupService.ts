import {
  DIARY_DATA_STORES,
  DIARY_PREFERENCE_KEYS,
  clearDiaryDatabase,
  NOTES_STORE,
  MONEY_ENTRIES_STORE,
  PEOPLE_STORE,
  TASKS_STORE,
  UDHAR_ALLOCATIONS_STORE,
  UDHAR_ENTRIES_STORE,
  UDHAR_SETTLEMENTS_STORE,
  runDatabaseTransactionOnStores,
} from '../db/indexedDb'
import type { Locale } from '../i18n'

const LAST_BACKUP_KEY = 'diary-last-backup'
const BACKUP_REMINDER_DISMISSED_KEY = 'diary-backup-reminder-dismissed'
const MAX_BACKUP_BYTES = 50 * 1024 * 1024
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const STORE_PRIMARY_KEYS: Record<(typeof DIARY_DATA_STORES)[number], string> = {
  notes: 'date',
  money_entries: 'id',
  udhar_entries: 'id',
  udhar_settlements: 'id',
  udhar_allocations: 'id',
  people: 'id',
  tasks: 'id',
}

export type TextSize = '100' | '115' | '130'

export interface BackupPreferences {
  language: Locale
  textSize: TextSize
}

export interface BackupStoreData {
  notes: Record<string, unknown>[]
  money_entries: Record<string, unknown>[]
  udhar_entries: Record<string, unknown>[]
  udhar_settlements: Record<string, unknown>[]
  udhar_allocations: Record<string, unknown>[]
  people: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
}

export interface BackupSnapshot {
  app: 'Diary'
  version: 1
  exportedAt: string
  preferences: BackupPreferences
  stores: BackupStoreData
}

export interface ImportResult {
  added: number
  skipped: number
  conflicts: number
  total: number
}

export interface BackupStatus {
  hasData: boolean
  lastBackupTimestamp: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value)
}

function validAmount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 999_999_999
}

function optionalText(value: unknown, maxLength: number) {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength)
}

function validateRecord(store: (typeof DIARY_DATA_STORES)[number], value: unknown) {
  if (!isRecord(value)) return false
  const hasTimestamps = isTimestamp(value.createdAt) && isTimestamp(value.updatedAt)
  switch (store) {
    case NOTES_STORE:
      return (
        isDateKey(value.date) &&
        typeof value.content === 'string' &&
        value.content.length <= 2000 &&
        isTimestamp(value.createdAt) &&
        isTimestamp(value.updatedAt)
      )
    case MONEY_ENTRIES_STORE:
      return (
        validId(value.id) &&
        isDateKey(value.date) &&
        (value.type === 'IN' || value.type === 'OUT') &&
        validAmount(value.amountPaise) &&
        optionalText(value.description, 120) &&
        optionalText(value.note, 300) &&
        hasTimestamps
      )
    case PEOPLE_STORE:
      return (
        validId(value.id) &&
        typeof value.name === 'string' &&
        value.name.trim() === value.name &&
        value.name.length >= 1 &&
        value.name.length <= 80 &&
        value.normalizedName === value.name.toLowerCase() &&
        hasTimestamps
      )
    case UDHAR_ENTRIES_STORE:
      return (
        validId(value.id) &&
        validId(value.personId) &&
        typeof value.personName === 'string' &&
        value.personName.length >= 1 &&
        value.personName.length <= 80 &&
        (value.type === 'GIVEN' || value.type === 'TAKEN') &&
        validAmount(value.amountPaise) &&
        isDateKey(value.date) &&
        optionalText(value.description, 120) &&
        hasTimestamps
      )
    case UDHAR_SETTLEMENTS_STORE:
      return (
        validId(value.id) &&
        validId(value.personId) &&
        typeof value.personName === 'string' &&
        value.personName.length >= 1 &&
        value.personName.length <= 80 &&
        (value.type === 'RECEIVED' || value.type === 'PAID') &&
        validAmount(value.amountPaise) &&
        isDateKey(value.date) &&
        optionalText(value.description, 120) &&
        hasTimestamps
      )
    case UDHAR_ALLOCATIONS_STORE:
      return (
        validId(value.id) &&
        validId(value.settlementId) &&
        validId(value.principalEntryId) &&
        validAmount(value.amountPaise) &&
        isTimestamp(value.createdAt)
      )
    case TASKS_STORE:
      return (
        validId(value.id) &&
        typeof value.text === 'string' &&
        value.text.trim().length >= 1 &&
        value.text.length <= 160 &&
        isDateKey(value.scheduledDate) &&
        typeof value.isCompleted === 'boolean' &&
        (value.isCompletedIndex === undefined ||
          value.isCompletedIndex === (value.isCompleted ? 1 : 0)) &&
        (value.completedAt === undefined || isTimestamp(value.completedAt)) &&
        (value.rescheduledFrom === undefined || isDateKey(value.rescheduledFrom)) &&
        hasTimestamps
      )
  }
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (!isRecord(value)) return JSON.stringify(value)
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
}

function normalizeStoredRecord(
  store: (typeof DIARY_DATA_STORES)[number],
  record: Record<string, unknown>,
) {
  if (store !== TASKS_STORE) return record
  return {
    ...record,
    isCompletedIndex: record.isCompleted ? 1 : 0,
  }
}

function keyFor(
  store: (typeof DIARY_DATA_STORES)[number],
  record: Record<string, unknown>,
) {
  return String(record[STORE_PRIMARY_KEYS[store]])
}

function getLocalDateKey(date: Date) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validateSnapshot(value: unknown): BackupSnapshot {
  if (
    !isRecord(value) ||
    value.app !== 'Diary' ||
    value.version !== 1 ||
    !isTimestamp(value.exportedAt) ||
    !isRecord(value.preferences) ||
    !isRecord(value.stores)
  ) {
    throw new TypeError('यह मान्य Diary बैकअप फ़ाइल नहीं है।')
  }

  const preferences = value.preferences
  if (
    !['hi', 'en', 'mr'].includes(String(preferences.language)) ||
    !['100', '115', '130'].includes(String(preferences.textSize))
  ) {
    throw new TypeError('बैकअप में भाषा या अक्षर आकार की जानकारी मान्य नहीं है।')
  }

  const stores = {} as BackupStoreData
  for (const store of DIARY_DATA_STORES) {
    const records = value.stores[store]
    if (!Array.isArray(records)) {
      throw new TypeError(`बैकअप में ${store} डेटा मौजूद नहीं है।`)
    }
    const keys = new Set<string>()
    const normalized = records.map((record) => {
      if (!validateRecord(store, record)) {
        throw new TypeError(`बैकअप में ${store} का एक रिकॉर्ड मान्य नहीं है।`)
      }
      const prepared = normalizeStoredRecord(store, record)
      const key = keyFor(store, prepared)
      if (keys.has(key)) throw new TypeError(`बैकअप में ${store} की दोहराई गई एंट्री है।`)
      keys.add(key)
      return prepared
    })
    stores[store] = normalized
  }
  return {
    app: 'Diary',
    version: 1,
    exportedAt: value.exportedAt,
    preferences: {
      language: preferences.language as Locale,
      textSize: preferences.textSize as TextSize,
    },
    stores,
  }
}

function validateRelationships(stores: BackupStoreData) {
  const people = new Map(stores.people.map((person) => [String(person.id), person]))
  const principals = new Map(stores.udhar_entries.map((entry) => [String(entry.id), entry]))
  const settlements = new Map(
    stores.udhar_settlements.map((settlement) => [String(settlement.id), settlement]),
  )
  const allocationsBySettlement = new Map<string, number>()
  const allocationsByPrincipal = new Map<string, number>()

  for (const entry of stores.udhar_entries) {
    if (!people.has(String(entry.personId))) {
      throw new TypeError('बैकअप में उधार एंट्री से जुड़ा व्यक्ति मौजूद नहीं है।')
    }
  }
  for (const settlement of stores.udhar_settlements) {
    if (!people.has(String(settlement.personId))) {
      throw new TypeError('बैकअप में भुगतान से जुड़ा व्यक्ति मौजूद नहीं है।')
    }
  }
  for (const allocation of stores.udhar_allocations) {
    const settlement = settlements.get(String(allocation.settlementId))
    const principal = principals.get(String(allocation.principalEntryId))
    if (
      settlement === undefined ||
      principal === undefined ||
      settlement.personId !== principal.personId ||
      (settlement.type === 'RECEIVED' && principal.type !== 'GIVEN') ||
      (settlement.type === 'PAID' && principal.type !== 'TAKEN') ||
      String(principal.date) > String(settlement.date)
    ) {
      throw new TypeError('बैकअप में भुगतान आवंटन का संबंध मान्य नहीं है।')
    }
    allocationsBySettlement.set(
      String(settlement.id),
      (allocationsBySettlement.get(String(settlement.id)) ?? 0) +
        Number(allocation.amountPaise),
    )
    allocationsByPrincipal.set(
      String(principal.id),
      (allocationsByPrincipal.get(String(principal.id)) ?? 0) +
        Number(allocation.amountPaise),
    )
  }
  for (const settlement of stores.udhar_settlements) {
    if (allocationsBySettlement.get(String(settlement.id)) !== settlement.amountPaise) {
      throw new TypeError('बैकअप में भुगतान की राशि और आवंटन मेल नहीं खाते।')
    }
  }
  for (const principal of stores.udhar_entries) {
    if ((allocationsByPrincipal.get(String(principal.id)) ?? 0) > Number(principal.amountPaise)) {
      throw new TypeError('बैकअप में उधार का आवंटन मूल राशि से अधिक है।')
    }
  }
}

function getPreferenceSnapshot(): BackupPreferences {
  const language = window.localStorage.getItem('diary-language')
  const textSize = window.localStorage.getItem('diary-text-size')
  return {
    language: language === 'en' || language === 'mr' ? language : 'hi',
    textSize: textSize === '115' || textSize === '130' ? textSize : '100',
  }
}

export async function createBackupSnapshot(): Promise<Blob> {
  const records = await runDatabaseTransactionOnStores<BackupStoreData>(
    [...DIARY_DATA_STORES],
    'readonly',
    (stores, _transaction, setResult, fail) => {
      const data = {} as BackupStoreData
      let completed = 0
      for (let index = 0; index < DIARY_DATA_STORES.length; index += 1) {
        const storeName = DIARY_DATA_STORES[index]
        const request = stores[index].getAll()
        request.onsuccess = () => {
          data[storeName] = (request.result as Record<string, unknown>[])
            .map((record) => JSON.parse(canonicalize(record)) as Record<string, unknown>)
            .sort((a, b) => keyFor(storeName, a).localeCompare(keyFor(storeName, b)))
          completed += 1
          if (completed === DIARY_DATA_STORES.length) setResult(data)
        }
        request.onerror = () => fail(request.error ?? new Error(`Could not read ${storeName}.`))
      }
    },
  )
  const snapshot: BackupSnapshot = {
    app: 'Diary',
    version: 1,
    exportedAt: new Date().toISOString(),
    preferences: getPreferenceSnapshot(),
    stores: records,
  }
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json',
  })
  const downloadUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = downloadUrl
  anchor.download = `diary-backup-${getLocalDateKey(new Date())}.json`
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
  window.localStorage.setItem(LAST_BACKUP_KEY, snapshot.exportedAt)
  return blob
}

export async function restoreBackupSnapshot(
  file: File,
  isFirstLaunch: boolean,
): Promise<ImportResult> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new RangeError('बैकअप फ़ाइल बहुत बड़ी है।')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text()) as unknown
  } catch {
    throw new TypeError('बैकअप फ़ाइल पढ़ी नहीं जा सकी।')
  }
  const snapshot = validateSnapshot(parsed)
  validateRelationships(snapshot.stores)
  const total = DIARY_DATA_STORES.reduce(
    (count, store) => count + snapshot.stores[store].length,
    0,
  )

  const result = await runDatabaseTransactionOnStores<ImportResult>(
    [...DIARY_DATA_STORES],
    'readwrite',
    (stores, _transaction, setResult, fail) => {
      const existing = {} as BackupStoreData
      let pending = stores.length
      for (let index = 0; index < stores.length; index += 1) {
        const storeName = DIARY_DATA_STORES[index]
        const request = stores[index].getAll()
        request.onsuccess = () => {
          existing[storeName] = request.result as Record<string, unknown>[]
          pending -= 1
          if (pending !== 0) return

          try {
            const additions = {} as BackupStoreData
            let skipped = 0
            let conflicts = 0
            for (const storeName of DIARY_DATA_STORES) {
              const existingByKey = new Map(
                existing[storeName].map((record) => [keyFor(storeName, record), record]),
              )
              additions[storeName] = []
              for (const record of snapshot.stores[storeName]) {
                const current = existingByKey.get(keyFor(storeName, record))
                if (current === undefined) {
                  additions[storeName].push(record)
                } else if (canonicalize(current) === canonicalize(record)) {
                  skipped += 1
                } else {
                  conflicts += 1
                }
              }
            }
            const merged = {} as BackupStoreData
            for (const storeName of DIARY_DATA_STORES) {
              merged[storeName] = [...existing[storeName], ...additions[storeName]]
            }
            validateRelationships(merged)
            for (let index = 0; index < stores.length; index += 1) {
              const storeName = DIARY_DATA_STORES[index]
              for (const record of additions[storeName]) stores[index].add(record)
            }
            setResult({
              added: total - skipped - conflicts,
              skipped,
              conflicts,
              total,
            })
          } catch (error) {
            fail(error instanceof Error ? error : new Error('Backup import failed.'))
          }
        }
        request.onerror = () =>
          fail(request.error ?? new Error(`Could not inspect ${storeName}.`))
      }
    },
  )

  if (isFirstLaunch) {
    window.localStorage.setItem('diary-language', snapshot.preferences.language)
    window.localStorage.setItem('diary-text-size', snapshot.preferences.textSize)
  }
  return result
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const hasData = await runDatabaseTransactionOnStores<boolean>(
    [...DIARY_DATA_STORES],
    'readonly',
    (stores, _transaction, setResult, fail) => {
      let pending = stores.length
      let foundData = false
      for (let index = 0; index < stores.length; index += 1) {
        const storeName = DIARY_DATA_STORES[index]
        const request = stores[index].count()
        request.onsuccess = () => {
          foundData ||= request.result > 0
          pending -= 1
          if (pending === 0) setResult(foundData)
        }
        request.onerror = () =>
          fail(request.error ?? new Error(`Could not inspect ${storeName}.`))
      }
    },
  )
  const savedTimestamp = window.localStorage.getItem(LAST_BACKUP_KEY)
  return {
    hasData,
    lastBackupTimestamp:
      savedTimestamp !== null && Number.isFinite(Date.parse(savedTimestamp))
        ? savedTimestamp
        : null,
  }
}

export async function resetDiaryData(): Promise<void> {
  await clearDiaryDatabase()
  for (const key of DIARY_PREFERENCE_KEYS) window.localStorage.removeItem(key)
}

export const backupReminderDismissedKey = BACKUP_REMINDER_DISMISSED_KEY
