import { TASKS_STORE, runDatabaseTransaction } from '../db/indexedDb'

export interface Task {
  id: string
  text: string
  scheduledDate: string
  isCompleted: boolean
  completedAt?: string
  rescheduledFrom?: string
  createdAt: string
  updatedAt: string
}

interface StoredTask extends Task {
  isCompletedIndex: 0 | 1
}

export interface TasksForDate {
  current: Task[]
  overdue: Task[]
}

export const MAX_TASK_TEXT_LENGTH = 160
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function createUuidV4() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
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

export function validateTaskDate(date: string, now = new Date()) {
  const parsedDate = parseLocalDateKey(date)
  const latestAllowedDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  )
  latestAllowedDate.setDate(latestAllowedDate.getDate() + 365)
  if (parsedDate > latestAllowedDate) {
    throw new RangeError('Tasks cannot be scheduled more than 365 days ahead.')
  }
}

function normalizeTaskText(text: string) {
  if (typeof text !== 'string') {
    throw new TypeError('Task text must be a string.')
  }
  const normalized = text.trim()
  if (normalized.length === 0 || normalized.length > MAX_TASK_TEXT_LENGTH) {
    throw new RangeError(
      `Task text must contain 1 to ${MAX_TASK_TEXT_LENGTH} characters.`,
    )
  }
  return normalized
}

function validateId(id: string) {
  if (!UUID_V4_PATTERN.test(id)) {
    throw new TypeError('Task ID must be a UUID v4.')
  }
}

function validateTask(task: Task) {
  validateId(task.id)
  normalizeTaskText(task.text)
  validateTaskDate(task.scheduledDate)
  if (typeof task.isCompleted !== 'boolean') {
    throw new TypeError('Task completion state must be boolean.')
  }
  if (
    Number.isNaN(Date.parse(task.createdAt)) ||
    Number.isNaN(Date.parse(task.updatedAt)) ||
    (task.completedAt !== undefined && Number.isNaN(Date.parse(task.completedAt)))
  ) {
    throw new TypeError('Task timestamps must be valid ISO dates.')
  }
  if (
    task.rescheduledFrom !== undefined &&
    !/^\d{4}-\d{2}-\d{2}$/.test(task.rescheduledFrom)
  ) {
    throw new TypeError('Reschedule date must use YYYY-MM-DD format.')
  }
}

function toStoredTask(task: Task): StoredTask {
  return { ...task, isCompletedIndex: task.isCompleted ? 1 : 0 }
}

function fromStoredTask(task: StoredTask | undefined): Task | undefined {
  if (task === undefined) return undefined
  const { isCompletedIndex: _isCompletedIndex, ...record } = task
  return record
}

function ensureFound(task: Task | undefined, fail: (error: Error) => void) {
  if (task !== undefined) return task
  fail(new Error('Task was not found.'))
  return null
}

export function addTask(text: string, scheduledDate: string): Promise<Task> {
  const normalizedText = normalizeTaskText(text)
  validateTaskDate(scheduledDate)
  const now = new Date().toISOString()
  const task: Task = {
    id: createUuidV4(),
    text: normalizedText,
    scheduledDate,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
  }
  return runDatabaseTransaction<Task>(
    TASKS_STORE,
    'readwrite',
    (store, _transaction, setResult) => {
      const request = store.add(toStoredTask(task))
      request.onsuccess = () => setResult(task)
    },
  )
}

export function toggleTaskCompletion(
  id: string,
  isCompleted: boolean,
): Promise<Task> {
  validateId(id)
  if (typeof isCompleted !== 'boolean') {
    return Promise.reject(new TypeError('Task completion state must be boolean.'))
  }
  return runDatabaseTransaction<Task>(
    TASKS_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const existing = ensureFound(
          fromStoredTask(request.result as StoredTask | undefined),
          fail,
        )
        if (existing === null) return
        const now = new Date().toISOString()
        const updated: Task = {
          ...existing,
          isCompleted,
          ...(isCompleted ? { completedAt: now } : { completedAt: undefined }),
          updatedAt: now,
        }
        const putRequest = store.put(toStoredTask(updated))
        putRequest.onsuccess = () => setResult(updated)
      }
    },
  )
}

export function postponeTask(id: string, newDate: string): Promise<Task> {
  validateId(id)
  validateTaskDate(newDate)
  return runDatabaseTransaction<Task>(
    TASKS_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const existing = ensureFound(
          fromStoredTask(request.result as StoredTask | undefined),
          fail,
        )
        if (existing === null) return
        const updated: Task = {
          ...existing,
          scheduledDate: newDate,
          rescheduledFrom: existing.scheduledDate,
          updatedAt: new Date().toISOString(),
        }
        const putRequest = store.put(toStoredTask(updated))
        putRequest.onsuccess = () => setResult(updated)
      }
    },
  )
}

export function updateTaskText(id: string, text: string): Promise<Task> {
  validateId(id)
  const normalizedText = normalizeTaskText(text)
  return runDatabaseTransaction<Task>(
    TASKS_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const existing = ensureFound(
          fromStoredTask(request.result as StoredTask | undefined),
          fail,
        )
        if (existing === null) return
        const updated = {
          ...existing,
          text: normalizedText,
          updatedAt: new Date().toISOString(),
        }
        const putRequest = store.put(toStoredTask(updated))
        putRequest.onsuccess = () => setResult(updated)
      }
    },
  )
}

export function deleteTask(id: string): Promise<Task> {
  validateId(id)
  return runDatabaseTransaction<Task>(
    TASKS_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const task = ensureFound(
          fromStoredTask(request.result as StoredTask | undefined),
          fail,
        )
        if (task === null) return
        store.delete(id)
        setResult(task)
      }
    },
  )
}

export function restoreTask(task: Task): Promise<void> {
  validateTask(task)
  return runDatabaseTransaction<void>(
    TASKS_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.get(task.id)
      request.onsuccess = () => {
        const existing = fromStoredTask(request.result as StoredTask | undefined)
        if (existing === undefined) {
          store.add(toStoredTask(task))
        } else if (JSON.stringify(existing) !== JSON.stringify(task)) {
          fail(new Error('A different task already uses this ID.'))
          return
        }
        setResult(undefined)
      }
    },
  )
}

export function getTasksForDate(
  date: string,
  isToday: boolean,
): Promise<TasksForDate> {
  parseLocalDateKey(date)
  return runDatabaseTransaction<TasksForDate>(
    TASKS_STORE,
    'readonly',
    (store, _transaction, setResult) => {
      const scheduledRequest = store.index('by_scheduled_date').getAll(date)
      if (!isToday) {
        scheduledRequest.onsuccess = () => {
          const current = (scheduledRequest.result as StoredTask[])
            .map((task) => fromStoredTask(task)!)
            .sort(sortTasks)
          setResult({ current, overdue: [] })
        }
        return
      }

      const incompleteRequest = store
        .index('by_completed')
        .getAll(IDBKeyRange.only(0))
      let scheduledTasks: Task[] | undefined
      let incompleteTasks: Task[] | undefined
      const complete = () => {
        if (scheduledTasks === undefined || incompleteTasks === undefined) return
        const overdue = incompleteTasks
          .filter((task) => task.scheduledDate < date)
          .sort(sortTasks)
        const current = scheduledTasks.sort(sortTasks)
        setResult({ current, overdue })
      }
      scheduledRequest.onsuccess = () => {
        scheduledTasks = (scheduledRequest.result as StoredTask[]).map(
          (task) => fromStoredTask(task)!,
        )
        complete()
      }
      incompleteRequest.onsuccess = () => {
        incompleteTasks = (incompleteRequest.result as StoredTask[]).map(
          (task) => fromStoredTask(task)!,
        )
        complete()
      }
    },
  )
}

function sortTasks(first: Task, second: Task) {
  return (
    Number(first.isCompleted) - Number(second.isCompleted) ||
    first.createdAt.localeCompare(second.createdAt) ||
    first.id.localeCompare(second.id)
  )
}
