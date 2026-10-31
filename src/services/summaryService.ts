import {
  MONEY_ENTRIES_STORE,
  TASKS_STORE,
  UDHAR_ENTRIES_STORE,
  UDHAR_SETTLEMENTS_STORE,
  runDatabaseTransaction,
} from '../db/indexedDb'
import type { Note } from '../db/indexedDb'
import type { MoneyEntry } from './moneyService'
import type { Task } from './taskService'
import {
  getOverallUdharTotals,
  type UdharEntry,
  type UdharSettlement,
} from './udharService'

export interface MonthSummaryData {
  incomePaise: number
  expensePaise: number
  netPaise: number
  udharGivenPaise: number
  udharTakenPaise: number
  totalReceivablePaise: number
  totalPayablePaise: number
  daysWithNotes: number
  totalTransactions: number
  tasksCompleted: number
  totalTasks: number
}

function validateMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError('Summary year must be an integer from 1 to 9999.')
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Summary month must be an integer from 1 to 12.')
  }
}

export async function getMonthSummary(
  year: number,
  month: number,
): Promise<MonthSummaryData> {
  validateMonth(year, month)
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-`
  const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`)
  const [
    notes,
    money,
    udhar,
    settlements,
    tasks,
    currentBalances,
  ] = await Promise.all([
    runDatabaseTransaction<Note[]>('notes', 'readonly', (store, _tx, setResult) => {
      const request = store.getAll(range)
      request.onsuccess = () => setResult(request.result as Note[])
    }),
    runDatabaseTransaction<MoneyEntry[]>(MONEY_ENTRIES_STORE, 'readonly', (store, _tx, setResult) => {
      const request = store.index('by_date').getAll(range)
      request.onsuccess = () => setResult(request.result as MoneyEntry[])
    }),
    runDatabaseTransaction<UdharEntry[]>(UDHAR_ENTRIES_STORE, 'readonly', (store, _tx, setResult) => {
      const request = store.index('by_date').getAll(range)
      request.onsuccess = () => setResult(request.result as UdharEntry[])
    }),
    runDatabaseTransaction<UdharSettlement[]>(UDHAR_SETTLEMENTS_STORE, 'readonly', (store, _tx, setResult) => {
      const request = store.index('by_date').getAll(range)
      request.onsuccess = () => setResult(request.result as UdharSettlement[])
    }),
    runDatabaseTransaction<Task[]>(TASKS_STORE, 'readonly', (store, _tx, setResult) => {
      const request = store.index('by_scheduled_date').getAll(range)
      request.onsuccess = () => setResult(request.result as Task[])
    }),
    getOverallUdharTotals(),
  ])
  const directIncome = money
    .filter((entry) => entry.type === 'IN')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const directExpense = money
    .filter((entry) => entry.type === 'OUT')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const loanTaken = udhar
    .filter((entry) => entry.type === 'TAKEN')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const loanGiven = udhar
    .filter((entry) => entry.type === 'GIVEN')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const received = settlements
    .filter((entry) => entry.type === 'RECEIVED')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const paid = settlements
    .filter((entry) => entry.type === 'PAID')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const incomePaise = directIncome + loanTaken + received
  const expensePaise = directExpense + loanGiven + paid

  return {
    incomePaise,
    expensePaise,
    netPaise: incomePaise - expensePaise,
    udharGivenPaise: loanGiven,
    udharTakenPaise: loanTaken,
    totalReceivablePaise: currentBalances.totalReceivablePaise,
    totalPayablePaise: currentBalances.totalPayablePaise,
    daysWithNotes: notes.filter((note) => note.content.trim() !== '').length,
    totalTransactions: money.length + udhar.length + settlements.length,
    tasksCompleted: tasks.filter((task) => task.isCompleted).length,
    totalTasks: tasks.length,
  }
}
