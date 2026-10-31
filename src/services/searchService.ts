import { MONEY_ENTRIES_STORE, TASKS_STORE, UDHAR_ENTRIES_STORE, UDHAR_SETTLEMENTS_STORE, runDatabaseTransaction } from '../db/indexedDb'
import type { Note } from '../db/indexedDb'
import type { MoneyEntry } from './moneyService'
import { formatMoney } from './moneyService'
import type { Task } from './taskService'
import type { UdharEntry, UdharSettlement } from './udharService'

export type SearchCategory = 'NOTE' | 'MONEY_IN' | 'MONEY_OUT' | 'UDHAR' | 'TASK'

export interface SearchResultItem {
  id: string
  date: string
  category: SearchCategory
  title: string
  snippet: string
  createdAt: string
}

function normalize(value: string) {
  return value.normalize('NFC').trim().toLocaleLowerCase()
}

function matches(query: string, values: Array<string | undefined>) {
  const normalizedQuery = normalize(query)
  const numericQuery = normalizedQuery.replace(/[₹,\s]/g, '')
  return values.some((value) => {
    if (value === undefined) return false
    const candidate = normalize(value)
    if (candidate.includes(normalizedQuery)) return true
    const numericCandidate = candidate.replace(/[₹,\s]/g, '')
    return numericQuery !== '' && numericCandidate.includes(numericQuery)
  })
}

function makeSnippet(text: string, query: string) {
  const source = text.trim()
  if (source.length <= 120) return source
  const index = normalize(source).indexOf(normalize(query))
  const start = index < 0 ? 0 : Math.max(0, index - 45)
  const end = Math.min(source.length, start + 110)
  return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`
}

function amountSearchValues(amountPaise: number) {
  const rupees = amountPaise / 100
  return [
    formatMoney(amountPaise),
    String(rupees),
    String(Math.floor(rupees)),
    String(amountPaise),
  ]
}

function textResult(
  query: string,
  item: SearchResultItem,
  searchable: Array<string | undefined>,
) {
  return matches(query, searchable) ? item : null
}

export async function searchAll(
  query: string,
  limit = 30,
): Promise<SearchResultItem[]> {
  if (typeof query !== 'string') {
    throw new TypeError('Search query must be a string.')
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
    throw new RangeError('Search result limit must be from 1 to 30.')
  }
  const normalizedQuery = normalize(query)
  if (normalizedQuery === '') return []

  const [notes, money, udhar, settlements, tasks] = await Promise.all([
    runDatabaseTransaction<Note[]>('notes', 'readonly', (store, _tx, setResult) => {
      const request = store.getAll()
      request.onsuccess = () => setResult(request.result as Note[])
    }),
    runDatabaseTransaction<MoneyEntry[]>(MONEY_ENTRIES_STORE, 'readonly', (store, _tx, setResult) => {
      const request = store.getAll()
      request.onsuccess = () => setResult(request.result as MoneyEntry[])
    }),
    runDatabaseTransaction<UdharEntry[]>(UDHAR_ENTRIES_STORE, 'readonly', (store, _tx, setResult) => {
      const request = store.getAll()
      request.onsuccess = () => setResult(request.result as UdharEntry[])
    }),
    runDatabaseTransaction<UdharSettlement[]>(UDHAR_SETTLEMENTS_STORE, 'readonly', (store, _tx, setResult) => {
      const request = store.getAll()
      request.onsuccess = () => setResult(request.result as UdharSettlement[])
    }),
    runDatabaseTransaction<Task[]>(TASKS_STORE, 'readonly', (store, _tx, setResult) => {
      const request = store.getAll()
      request.onsuccess = () => setResult(request.result as Task[])
    }),
  ])

  const results: SearchResultItem[] = []
  for (const note of notes) {
    if (note.content.trim() === '') continue
    const result = textResult(
      normalizedQuery,
      {
        id: `note:${note.date}`,
        date: note.date,
        category: 'NOTE',
        title: note.content.split(/\r?\n/)[0] || note.content,
        snippet: makeSnippet(note.content, normalizedQuery),
        createdAt: note.updatedAt,
      },
      [note.content],
    )
    if (result !== null) results.push(result)
  }
  for (const entry of money) {
    const result = textResult(
      normalizedQuery,
      {
        id: entry.id,
        date: entry.date,
        category: entry.type === 'IN' ? 'MONEY_IN' : 'MONEY_OUT',
        title: entry.description || formatMoney(entry.amountPaise),
        snippet: [entry.description, entry.note, formatMoney(entry.amountPaise)]
          .filter(Boolean)
          .join(' · '),
        createdAt: entry.createdAt,
      },
      [entry.description, entry.note, ...amountSearchValues(entry.amountPaise)],
    )
    if (result !== null) results.push(result)
  }
  for (const entry of udhar) {
    const result = textResult(
      normalizedQuery,
      {
        id: entry.id,
        date: entry.date,
        category: 'UDHAR',
        title: entry.personName,
        snippet: [entry.personName, entry.description, formatMoney(entry.amountPaise)]
          .filter(Boolean)
          .join(' · '),
        createdAt: entry.createdAt,
      },
      [entry.personName, entry.description, ...amountSearchValues(entry.amountPaise)],
    )
    if (result !== null) results.push(result)
  }
  for (const entry of settlements) {
    const result = textResult(
      normalizedQuery,
      {
        id: entry.id,
        date: entry.date,
        category: 'UDHAR',
        title: entry.personName,
        snippet: [entry.personName, entry.description, formatMoney(entry.amountPaise)]
          .filter(Boolean)
          .join(' · '),
        createdAt: entry.createdAt,
      },
      [entry.personName, entry.description, ...amountSearchValues(entry.amountPaise)],
    )
    if (result !== null) results.push(result)
  }
  for (const task of tasks) {
    const result = textResult(
      normalizedQuery,
      {
        id: task.id,
        date: task.scheduledDate,
        category: 'TASK',
        title: task.text,
        snippet: task.text,
        createdAt: task.createdAt,
      },
      [task.text],
    )
    if (result !== null) results.push(result)
  }

  return results
    .sort(
      (first, second) =>
        second.date.localeCompare(first.date) ||
        second.createdAt.localeCompare(first.createdAt) ||
        first.id.localeCompare(second.id),
    )
    .slice(0, limit)
}
