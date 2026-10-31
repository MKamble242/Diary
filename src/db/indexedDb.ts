export interface Note {
  date: string
  content: string
  updatedAt: string
  createdAt: string
}

const DATABASE_NAME = 'diary_local_db'
const DATABASE_VERSION = 7
export const APP_SECURITY_STORE = 'app_security'
export const NOTES_STORE = 'notes'
export const MONEY_ENTRIES_STORE = 'money_entries'
export const TASKS_STORE = 'tasks'
export const PEOPLE_STORE = 'people'
export const UDHAR_ENTRIES_STORE = 'udhar_entries'
export const UDHAR_SETTLEMENTS_STORE = 'udhar_settlements'
export const UDHAR_ALLOCATIONS_STORE = 'udhar_allocations'
export const DIARY_DATA_STORES = [
  NOTES_STORE,
  MONEY_ENTRIES_STORE,
  UDHAR_ENTRIES_STORE,
  UDHAR_SETTLEMENTS_STORE,
  UDHAR_ALLOCATIONS_STORE,
  PEOPLE_STORE,
  TASKS_STORE,
] as const
export const DIARY_PREFERENCE_KEYS = [
  'diary-language',
  'diary-text-size',
  'diary-onboarded',
  'diary-last-backup',
  'diary-backup-reminder-dismissed',
] as const
export const MAX_NOTE_LENGTH = 2000

let databasePromise: Promise<IDBDatabase> | null = null
const saveQueues = new Map<string, Promise<Note>>()

function validateDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError('Note date must use YYYY-MM-DD format.')
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise !== null) return databasePromise

  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'))
  }

  let openingPromise: Promise<IDBDatabase>
  openingPromise = new Promise((resolve, reject) => {
    let settled = false
    let blocked = false
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(NOTES_STORE)) {
        database.createObjectStore(NOTES_STORE, { keyPath: 'date' })
      }
      if (!database.objectStoreNames.contains(MONEY_ENTRIES_STORE)) {
        const store = database.createObjectStore(MONEY_ENTRIES_STORE, {
          keyPath: 'id',
        })
        store.createIndex('by_date', 'date', { unique: false })
      }
      let taskStore: IDBObjectStore
      const taskStoreExists = database.objectStoreNames.contains(TASKS_STORE)
      if (!taskStoreExists) {
        taskStore = database.createObjectStore(TASKS_STORE, { keyPath: 'id' })
      } else {
        taskStore = request.transaction!.objectStore(TASKS_STORE)
      }
      if (!taskStore.indexNames.contains('by_scheduled_date')) {
        taskStore.createIndex('by_scheduled_date', 'scheduledDate', {
          unique: false,
        })
      }
      if (
        taskStore.indexNames.contains('by_completed') &&
        taskStore.index('by_completed').keyPath !== 'isCompletedIndex'
      ) {
        taskStore.deleteIndex('by_completed')
      }
      if (!taskStore.indexNames.contains('by_completed')) {
        taskStore.createIndex('by_completed', 'isCompletedIndex', {
          unique: false,
        })
      }
      if (taskStoreExists) {
        const cursorRequest = taskStore.openCursor()
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (cursor === null) return
          const record = cursor.value as { isCompleted?: unknown }
          cursor.update({
            ...record,
            isCompletedIndex: record.isCompleted === true ? 1 : 0,
          })
          cursor.continue()
        }
      }
      if (!database.objectStoreNames.contains(PEOPLE_STORE)) {
        const store = database.createObjectStore(PEOPLE_STORE, { keyPath: 'id' })
        store.createIndex('by_name', 'normalizedName', { unique: false })
      }
      if (!database.objectStoreNames.contains(UDHAR_ENTRIES_STORE)) {
        const store = database.createObjectStore(UDHAR_ENTRIES_STORE, {
          keyPath: 'id',
        })
        store.createIndex('by_date', 'date', { unique: false })
        store.createIndex('by_person', 'personId', { unique: false })
      }
      if (!database.objectStoreNames.contains(UDHAR_SETTLEMENTS_STORE)) {
        const store = database.createObjectStore(UDHAR_SETTLEMENTS_STORE, {
          keyPath: 'id',
        })
        store.createIndex('by_person', 'personId', { unique: false })
        store.createIndex('by_date', 'date', { unique: false })
      }
      if (!database.objectStoreNames.contains(UDHAR_ALLOCATIONS_STORE)) {
        const store = database.createObjectStore(UDHAR_ALLOCATIONS_STORE, {
          keyPath: 'id',
        })
        store.createIndex('by_settlement', 'settlementId', { unique: false })
        store.createIndex('by_principal', 'principalEntryId', { unique: false })
      }
      if (!database.objectStoreNames.contains(APP_SECURITY_STORE)) {
        database.createObjectStore(APP_SECURITY_STORE, { keyPath: 'id' })
      }
    }

    request.onblocked = () => {
      blocked = true
      if (!settled) {
        settled = true
        reject(new Error('Database upgrade is blocked by another open Diary tab.'))
      }
    }

    request.onerror = () => {
      if (!settled) {
        settled = true
        reject(request.error ?? new Error('Could not open the local diary database.'))
      }
      if (databasePromise === openingPromise) databasePromise = null
    }

    request.onsuccess = () => {
      const database = request.result
      if (blocked || settled) {
        database.close()
        return
      }

      database.onversionchange = () => {
        database.close()
        if (databasePromise === openingPromise) databasePromise = null
      }

      settled = true
      resolve(database)
    }
  })

  databasePromise = openingPromise
  void openingPromise.catch(() => {
    if (databasePromise === openingPromise) databasePromise = null
  })
  return openingPromise
}

export function runDatabaseTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (
    store: IDBObjectStore,
    transaction: IDBTransaction,
    setResult: (value: T) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  return runDatabaseTransactionOnStores(
    [storeName],
    mode,
    (stores, transaction, setResult, fail) =>
      run(stores[0], transaction, setResult, fail),
  )
}

export function runDatabaseTransactionOnStores<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  run: (
    stores: IDBObjectStore[],
    transaction: IDBTransaction,
    setResult: (value: T) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        let result: T
        let hasResult = false
        let failure: DOMException | Error | null = null
        let transaction: IDBTransaction

        try {
          transaction = database.transaction(storeNames, mode)
          const stores = storeNames.map((storeName) =>
            transaction.objectStore(storeName),
          )
          run(
            stores,
            transaction,
            (value) => {
              result = value
              hasResult = true
            },
            (error) => {
              failure = error
              transaction.abort()
            },
          )
        } catch (error) {
          reject(error)
          return
        }

        transaction.onerror = () => {
          failure ??= transaction.error ?? new Error('The local diary transaction failed.')
        }
        transaction.onabort = () => {
          reject(failure ?? transaction.error ?? new Error('The local diary transaction was aborted.'))
        }
        transaction.oncomplete = () => {
          if (!hasResult) {
            reject(new Error('The local diary transaction completed without a result.'))
            return
          }
          resolve(result)
        }
      }),
  )
}

export function clearDiaryDatabase(): Promise<void> {
  return runDatabaseTransactionOnStores<void>(
    [...DIARY_DATA_STORES, APP_SECURITY_STORE],
    'readwrite',
    (stores, _transaction, setResult) => {
      for (const store of stores) store.clear()
      setResult(undefined)
    },
  )
}

export class NoteRepository {
  static getNoteByDate(date: string): Promise<Note | null> {
    validateDate(date)

    return runDatabaseTransaction<Note | null>(NOTES_STORE, 'readonly', (store, _transaction, setResult) => {
      const request = store.get(date)
      request.onsuccess = () => {
        setResult((request.result as Note | undefined) ?? null)
      }
    })
  }

  static saveNote(date: string, content: string): Promise<Note> {
    validateDate(date)
    if (typeof content !== 'string') {
      return Promise.reject(new TypeError('Note content must be a string.'))
    }
    if (content.length > MAX_NOTE_LENGTH) {
      return Promise.reject(
        new RangeError(`Note content cannot exceed ${MAX_NOTE_LENGTH} characters.`),
      )
    }

    const write = () =>
      runDatabaseTransaction<Note>('notes', 'readwrite', (store, _transaction, setResult) => {
        const readRequest = store.get(date)
        readRequest.onsuccess = () => {
          const previous = readRequest.result as Note | undefined
          const now = new Date().toISOString()
          const note: Note = {
            date,
            content: content.trim().length === 0 ? '' : content,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
          }
          const writeRequest = store.put(note)
          writeRequest.onsuccess = () => setResult(note)
        }
      })
    const previousSave = saveQueues.get(date)
    const nextSave =
      previousSave === undefined
        ? write()
        : previousSave.catch(() => undefined).then(write)

    saveQueues.set(date, nextSave)
    void nextSave.finally(() => {
      if (saveQueues.get(date) === nextSave) saveQueues.delete(date)
    }).catch(() => undefined)
    return nextSave
  }
}
