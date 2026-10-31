import {
  MONEY_ENTRIES_STORE,
  TASKS_STORE,
  UDHAR_ENTRIES_STORE,
  UDHAR_SETTLEMENTS_STORE,
  runDatabaseTransaction,
} from '../db/indexedDb'
import type { Task } from './taskService'
import type { MoneyEntry } from './moneyService'
import type { UdharEntry, UdharSettlement } from './udharService'

export interface DayActivity {
  hasNote: boolean
  hasMoney: boolean
  hasUdhar: boolean
  hasTask: boolean
  isAllTasksCompleted: boolean
}

interface NoteRecord {
  date: string
  content: string
}

function validateMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError('Calendar year must be an integer from 1 to 9999.')
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Calendar month must be an integer from 1 to 12.')
  }
}

export function getMonthActivity(
  year: number,
  month: number,
): Promise<Record<string, DayActivity>> {
  validateMonth(year, month)
  const monthPrefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-`
  const range = IDBKeyRange.bound(monthPrefix, `${monthPrefix}\uffff`)
  return Promise.all([
    runDatabaseTransaction<NoteRecord[]>(
      'notes',
      'readonly',
      (store, _transaction, setResult) => {
        const request = store.getAll(range)
        request.onsuccess = () => setResult(request.result as NoteRecord[])
      },
    ),
    runDatabaseTransaction<MoneyEntry[]>(
      MONEY_ENTRIES_STORE,
      'readonly',
      (store, _transaction, setResult) => {
        const request = store.index('by_date').getAll(range)
        request.onsuccess = () => setResult(request.result as MoneyEntry[])
      },
    ),
    runDatabaseTransaction<UdharEntry[]>(
      UDHAR_ENTRIES_STORE,
      'readonly',
      (store, _transaction, setResult) => {
        const request = store.index('by_date').getAll(range)
        request.onsuccess = () => setResult(request.result as UdharEntry[])
      },
    ),
    runDatabaseTransaction<UdharSettlement[]>(
      UDHAR_SETTLEMENTS_STORE,
      'readonly',
      (store, _transaction, setResult) => {
        const request = store.index('by_date').getAll(range)
        request.onsuccess = () => setResult(request.result as UdharSettlement[])
      },
    ),
    runDatabaseTransaction<Task[]>(
      TASKS_STORE,
      'readonly',
      (store, _transaction, setResult) => {
        const request = store.index('by_scheduled_date').getAll(range)
        request.onsuccess = () => setResult(request.result as Task[])
      },
    ),
  ]).then(([notes, money, udhar, settlements, tasks]) => {
    const activity: Record<string, DayActivity> = {}
    const ensureDate = (date: string) => {
      activity[date] ??= {
        hasNote: false,
        hasMoney: false,
        hasUdhar: false,
        hasTask: false,
        isAllTasksCompleted: true,
      }
      return activity[date]
    }

    for (const note of notes) {
      if (note.content.trim() !== '') ensureDate(note.date).hasNote = true
    }
    for (const entry of money) ensureDate(entry.date).hasMoney = true
    for (const entry of udhar) ensureDate(entry.date).hasUdhar = true
    for (const settlement of settlements) {
      ensureDate(settlement.date).hasUdhar = true
    }
    for (const task of tasks) {
      const day = ensureDate(task.scheduledDate)
      day.hasTask = true
      day.isAllTasksCompleted &&= task.isCompleted
    }
    return activity
  })
}
