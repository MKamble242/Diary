import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  CalendarDays,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  FileText,
  HandCoins,
  House,
  ListChecks,
  Plus,
  Search,
  Settings,
  Wallet,
  X,
} from 'lucide-react'
import { locales, translations, type Locale } from './i18n'
import { useDailyNote } from './hooks/useDailyNote'
import { useDailyMoney } from './hooks/useDailyMoney'
import { useDailyTasks } from './hooks/useDailyTasks'
import { useDailyUdhar } from './hooks/useDailyUdhar'
import { TaskEditor, TaskForm } from './components/TaskSheets'
import { UdharForm } from './components/UdharForm'
import { SettlementForm } from './components/SettlementForm'
import { CalendarView } from './components/CalendarView'
import { SearchView } from './components/SearchView'
import { SummaryView } from './components/SummaryView'
import { SettingsView } from './components/SettingsView'
import { PinLockView } from './components/PinLockView'
import {
  backupReminderDismissedKey,
  createBackupSnapshot,
  getBackupStatus,
  resetDiaryData,
  restoreBackupSnapshot,
  type BackupStatus,
  type TextSize,
} from './services/backupService'
import {
  changePin,
  getPinLockoutRemainingMs,
  isPinEnabled,
  removePin,
  setupPin,
  verifyPin,
} from './services/pinService'
import {
  addMoneyEntry,
  deleteMoneyEntry,
  formatMoney,
  HIGH_AMOUNT_CONFIRMATION_PAISE,
  MAX_DESCRIPTION_LENGTH,
  MAX_MONEY_NOTE_LENGTH,
  parseMoneyAmount,
  restoreMoneyEntry,
  updateMoneyEntry,
  type MoneyEntry,
  type MoneyEntryType,
  type NewMoneyEntry,
} from './services/moneyService'
import {
  addTask,
  deleteTask,
  postponeTask,
  restoreTask,
  toggleTaskCompletion,
  updateTaskText,
  type Task,
} from './services/taskService'
import {
  addUdharEntry,
  deleteSettlement,
  deleteUdharEntry,
  recordSettlement,
  restoreSettlement,
  restoreUdharEntry,
  updateUdharEntry,
  UDHAR_PRINCIPAL_ACTIVE_SETTLEMENTS_MESSAGE,
  type DeletedUdharSettlement,
  type UdharEntry,
  type UdharEntryType,
  type UdharPersonBalanceDetails,
  type UdharSettlement,
  type UdharSettlementType,
  type NewUdharEntry,
} from './services/udharService'

type Dialog = 'add' | 'search' | 'settings'
type DiaryCopy = {
  [Key in keyof (typeof translations)['hi']]: (typeof translations)['hi'][Key] extends readonly string[]
    ? readonly string[]
    : string
}

interface MoneyFormProps {
  copy: DiaryCopy
  date: string
  entry?: MoneyEntry
  type: MoneyEntryType
  onCancel: () => void
  onSubmit: (value: NewMoneyEntry, id?: string) => Promise<void>
}

function MoneyForm({ copy, date, entry, type, onCancel, onSubmit }: MoneyFormProps) {
  const [amount, setAmount] = useState(() => {
    if (entry === undefined) return ''
    const rupees = Math.floor(entry.amountPaise / 100)
    const paise = entry.amountPaise % 100
    return paise === 0 ? String(rupees) : `${rupees}.${String(paise).padStart(2, '0')}`
  })
  const [description, setDescription] = useState(entry?.description ?? '')
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const amountInput = useRef<HTMLInputElement>(null)
  const submissionInProgress = useRef(false)

  useEffect(() => {
    amountInput.current?.focus()
  }, [])

  let amountPaise = 0
  if (amount.trim() !== '') {
    try {
      amountPaise = parseMoneyAmount(amount)
    } catch {
      amountPaise = 0
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionInProgress.current) return
    setError('')
    let parsedAmount: number
    try {
      parsedAmount = parseMoneyAmount(amount)
    } catch {
      setError(copy.invalidAmount)
      return
    }

    submissionInProgress.current = true
    setIsSubmitting(true)
    try {
      await onSubmit(
        {
          date,
          type,
          amountPaise: parsedAmount,
          ...(description.trim() !== ''
            ? { description: description.trim() }
            : {}),
          ...(note.trim() !== '' ? { note: note.trim() } : {}),
        },
        entry?.id,
      )
    } catch {
      setError(copy.saveError)
      submissionInProgress.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="dialog-backdrop items-end sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="money-form-title"
        className="dialog-card sheet-card money-form-sheet"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="money-form-title" className="text-lg font-semibold text-diary-text">
            {type === 'IN' ? copy.moneyIncome : copy.moneyExpense}
          </h2>
          <button
            type="button"
            aria-label={copy.close}
            onClick={onCancel}
            disabled={isSubmitting}
            className="icon-button -mr-2 -mt-2"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <form className="mt-4 grid gap-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-2 text-sm font-medium text-diary-text">
            {copy.amount}
            <div className="flex min-h-[62px] items-center gap-2 rounded-xl border border-diary-border bg-diary-bg px-4 focus-within:border-diary-primary">
              <span className="text-2xl text-diary-muted" aria-hidden="true">₹</span>
              <input
                ref={amountInput}
                aria-label={copy.amount}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                className="min-w-0 flex-1 bg-transparent text-2xl font-semibold text-diary-text outline-none placeholder:text-diary-muted/60"
                required
              />
            </div>
          </label>

          {amountPaise > HIGH_AMOUNT_CONFIRMATION_PAISE && (
            <p
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              {copy.highAmountWarning}
            </p>
          )}

          <label className="grid gap-2 text-sm font-medium text-diary-text">
            {copy.optionalDescription}
            <input
              type="text"
              maxLength={MAX_DESCRIPTION_LENGTH}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-11 rounded-xl border border-diary-border bg-white px-3 text-base font-normal"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-diary-text">
            {copy.optionalNote}
            <textarea
              maxLength={MAX_MONEY_NOTE_LENGTH}
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="resize-none rounded-xl border border-diary-border bg-white px-3 py-2 text-base font-normal"
            />
          </label>

          {error !== '' && (
            <p role="alert" className="text-sm text-red-700">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="min-h-12 rounded-xl border border-diary-border px-4 font-medium text-diary-text disabled:opacity-60"
            >
              {copy.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-12 rounded-xl bg-diary-primary px-4 font-semibold text-white hover:bg-diary-pressed disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? copy.noteSaving : copy.save}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

const localeNames: Record<Locale, string> = {
  hi: 'हिंदी',
  en: 'English',
  mr: 'मराठी',
}

const dateLocales: Record<Locale, string> = {
  hi: 'hi-IN',
  en: 'en-IN',
  mr: 'mr-IN',
}

function isLocale(value: string | null): value is Locale {
  return value !== null && locales.some((locale) => locale === value)
}

function isTextSize(value: string | null): value is TextSize {
  return value === '100' || value === '115' || value === '130'
}

function getLocalDateOffset(date: Date, offset: number) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + offset)
  return nextDate
}

function isSameLocalDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatLocalDateKey(date: string, locale: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(year, month - 1, day))
}

function shouldShowBackupReminder(status: BackupStatus | null) {
  if (status === null || !status.hasData) return false
  const now = Date.now()
  const dismissedAt = window.localStorage.getItem(backupReminderDismissedKey)
  const dismissedTime = dismissedAt === null ? Number.NaN : Date.parse(dismissedAt)
  const isDismissed =
    Number.isFinite(dismissedTime) &&
    now - dismissedTime < 30 * 24 * 60 * 60 * 1000
  const backupTime =
    status.lastBackupTimestamp === null ? Number.NaN : Date.parse(status.lastBackupTimestamp)
  const isOverdue =
    !Number.isFinite(backupTime) ||
    now - backupTime > 7 * 24 * 60 * 60 * 1000
  return isOverdue && !isDismissed
}

function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    const savedLocale = window.localStorage.getItem('diary-language')
    return isLocale(savedLocale) ? savedLocale : 'hi'
  })
  const [isOnboarded, setIsOnboarded] = useState(
    () => window.localStorage.getItem('diary-onboarded') === 'true',
  )
  const [textSize, setTextSize] = useState<TextSize>(() => {
    const savedSize = window.localStorage.getItem('diary-text-size')
    return isTextSize(savedSize) ? savedSize : '100'
  })
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [today] = useState(() => new Date())
  const [activeView, setActiveView] = useState<'day' | 'calendar' | 'summary'>('day')
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const [summaryMonth, setSummaryMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDialog, setActiveDialog] = useState<Dialog | null>(null)
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null)
  const [backupStatusError, setBackupStatusError] = useState(false)
  const [showBackupReminder, setShowBackupReminder] = useState(false)
  const [pinStatusReady, setPinStatusReady] = useState(false)
  const [pinStatusError, setPinStatusError] = useState(false)
  const [pinEnabled, setPinEnabled] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [pinLockoutRemainingMs, setPinLockoutRemainingMs] = useState(0)
  const [updateWaiting, setUpdateWaiting] = useState<ServiceWorker | null>(null)
  const [welcomeImportError, setWelcomeImportError] = useState('')
  const [isWelcomeImporting, setIsWelcomeImporting] = useState(false)
  const welcomeFileInput = useRef<HTMLInputElement>(null)
  const serviceWorkerRegistration = useRef<ServiceWorkerRegistration | null>(null)
  const [moneyForm, setMoneyForm] = useState<{
    date: string
    type: MoneyEntryType
    entry?: MoneyEntry
  } | null>(null)
  const [taskFormDate, setTaskFormDate] = useState<string | null>(null)
  const [udharForm, setUdharForm] = useState<{
    date: string
    type: UdharEntryType
    entry?: UdharEntry
  } | null>(null)
  const [selectedUdharEntry, setSelectedUdharEntry] = useState<UdharEntry | null>(null)
  const [showUdharBalances, setShowUdharBalances] = useState(false)
  const [selectedUdharPersonId, setSelectedUdharPersonId] = useState<string | null>(null)
  const [settlementForm, setSettlementForm] = useState<{
    person: UdharPersonBalanceDetails
    type: UdharSettlementType
  } | null>(null)
  const [selectedSettlement, setSelectedSettlement] = useState<UdharSettlement | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [expandedTasks, setExpandedTasks] = useState(false)
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set())
  const [taskUndo, setTaskUndo] = useState<Task | null>(null)
  const [taskError, setTaskError] = useState('')
  const [udharError, setUdharError] = useState('')
  const [udharUndo, setUdharUndo] = useState<UdharEntry | null>(null)
  const [isDeletingUdhar, setIsDeletingUdhar] = useState(false)
  const [settlementUndo, setSettlementUndo] = useState<DeletedUdharSettlement | null>(null)
  const [isDeletingSettlement, setIsDeletingSettlement] = useState(false)
  const [selectedMoneyEntry, setSelectedMoneyEntry] = useState<MoneyEntry | null>(null)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [undoEntry, setUndoEntry] = useState<MoneyEntry | null>(null)
  const [moneyError, setMoneyError] = useState('')
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const taskUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const udharUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settlementUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoUsed = useRef(false)
  const undoDeadline = useRef(0)
  const taskUndoDeadline = useRef(0)
  const udharUndoDeadline = useRef(0)
  const settlementUndoDeadline = useRef(0)
  const deleteInProgress = useRef(false)
  const taskDeleteInProgress = useRef(false)
  const udharDeleteInProgress = useRef(false)
  const settlementDeleteInProgress = useRef(false)

  const t = translations[locale]
  const selectedDateKey = getLocalDateKey(selectedDate)
  const todayDateKey = getLocalDateKey(today)
  const dailyNote = useDailyNote(selectedDateKey)
  const dailyMoney = useDailyMoney(selectedDateKey)
  const dailyTasks = useDailyTasks(selectedDateKey, todayDateKey)
  const dailyUdhar = useDailyUdhar(selectedDateKey)
  const maxTaskDate = getLocalDateOffset(today, 365)
  const maxTaskDateKey = getLocalDateKey(maxTaskDate)
  const formattedDate = new Intl.DateTimeFormat(dateLocales[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(selectedDate)
  const dateLabel = isSameLocalDay(selectedDate, today)
    ? `${t.todayDate} · ${formattedDate}`
    : formattedDate

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      !('serviceWorker' in navigator) ||
      (!window.isSecureContext && window.location.hostname !== 'localhost')
    ) {
      return
    }

    let active = true
    void navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        if (!active) return
        serviceWorkerRegistration.current = registration
        if (registration.waiting !== null && navigator.serviceWorker.controller !== null) {
          setUpdateWaiting(registration.waiting)
        }
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (installing === null) return
          installing.addEventListener('statechange', () => {
            if (
              active &&
              installing.state === 'installed' &&
              navigator.serviceWorker.controller !== null
            ) {
              setUpdateWaiting(registration.waiting ?? installing)
            }
          })
        })
      },
      (error: unknown) => {
        console.error('Diary service worker registration failed.', error)
      },
    )

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void isPinEnabled().then(
      (enabled) => {
        if (!active) return
        setPinEnabled(enabled)
        setIsLocked(enabled && isOnboarded)
        setPinLockoutRemainingMs(getPinLockoutRemainingMs())
        setPinStatusReady(true)
        setPinStatusError(false)
      },
      () => {
        if (!active) return
        setPinStatusError(true)
      },
    )
    return () => {
      active = false
    }
  }, [isOnboarded])

  useEffect(() => {
    if (!pinEnabled) return
    let wasHidden = document.visibilityState === 'hidden'
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        wasHidden = true
      } else if (wasHidden) {
        wasHidden = false
        setIsLocked(true)
        setPinLockoutRemainingMs(getPinLockoutRemainingMs())
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [pinEnabled])

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize
    if (isOnboarded) window.localStorage.setItem('diary-text-size', textSize)
  }, [isOnboarded, textSize])

  useEffect(() => {
    let active = true
    void getBackupStatus().then(
      (status) => {
        if (!active) return
        setBackupStatus(status)
        setBackupStatusError(false)
        setShowBackupReminder(shouldShowBackupReminder(status))
      },
      () => {
        if (!active) return
        setBackupStatusError(true)
        setShowBackupReminder(false)
      },
    )
    return () => {
      active = false
    }
  }, [
    dailyNote.content,
    dailyMoney.entries.length,
    dailyTasks.allTasks.length,
    dailyUdhar.entries.length,
    dailyUdhar.settlements.length,
  ])

  useEffect(() => {
    if (activeDialog === null) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActiveDialog(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeDialog])

  useEffect(
    () => () => {
      if (undoTimer.current !== null) clearTimeout(undoTimer.current)
      if (taskUndoTimer.current !== null) clearTimeout(taskUndoTimer.current)
      if (udharUndoTimer.current !== null) clearTimeout(udharUndoTimer.current)
      if (settlementUndoTimer.current !== null) clearTimeout(settlementUndoTimer.current)
    },
    [],
  )

  function changeLocale(nextLocale: Locale) {
    window.localStorage.setItem('diary-language', nextLocale)
    setLocale(nextLocale)
  }

  function changeTextSize(nextSize: TextSize) {
    setTextSize(nextSize)
  }

  async function createBackup() {
    await createBackupSnapshot()
    const status = await getBackupStatus()
    setBackupStatus(status)
    setBackupStatusError(false)
    setShowBackupReminder(shouldShowBackupReminder(status))
  }

  async function restoreFromWelcome(file: File | undefined) {
    if (file === undefined) return
    setWelcomeImportError('')
    setIsWelcomeImporting(true)
    try {
      await restoreBackupSnapshot(file, true)
      window.localStorage.setItem('diary-onboarded', 'true')
      window.location.reload()
    } catch (error) {
      setWelcomeImportError(
        error instanceof Error ? error.message : t.importError,
      )
      setIsWelcomeImporting(false)
      if (welcomeFileInput.current !== null) welcomeFileInput.current.value = ''
    }
  }

  async function resetAllDiaryData() {
    await dailyNote.flushAndWait()
    await resetDiaryData()
    window.location.reload()
  }

  async function resetAfterForgottenPin() {
    await dailyNote.flushAndWait()
    await resetDiaryData()
    window.location.reload()
  }

  async function verifyUnlockPin(pin: string) {
    const valid = await verifyPin(pin)
    setPinLockoutRemainingMs(getPinLockoutRemainingMs())
    if (valid) setIsLocked(false)
    return valid
  }

  const handlePinLockoutExpired = useCallback(() => {
    setPinLockoutRemainingMs(0)
  }, [])

  function applyAvailableUpdate() {
    const waitingWorker = updateWaiting
    if (waitingWorker === null) return
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true },
    )
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  }

  function dismissBackupReminder() {
    window.localStorage.setItem(
      backupReminderDismissedKey,
      new Date().toISOString(),
    )
    setShowBackupReminder(false)
  }

  function startDiary() {
    window.localStorage.setItem('diary-onboarded', 'true')
    setIsOnboarded(true)
  }

  function changeSelectedDate(offset: number) {
    dailyNote.flush()
    setSelectedDate((date) => getLocalDateOffset(date, offset))
  }

  function openCalendar() {
    dailyNote.flush()
    setActiveView('calendar')
  }

  function selectCalendarDate(dateKey: string) {
    dailyNote.flush()
    const [year, month, day] = dateKey.split('-').map(Number)
    setSelectedDate(new Date(year, month - 1, day))
    setActiveView('day')
  }

  const directMoneyIncomePaise = dailyMoney.entries
    .filter((entry) => entry.type === 'IN')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const directMoneyExpensePaise = dailyMoney.entries
    .filter((entry) => entry.type === 'OUT')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const udharTakenPaise = dailyUdhar.entries
    .filter((entry) => entry.type === 'TAKEN')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const udharGivenPaise = dailyUdhar.entries
    .filter((entry) => entry.type === 'GIVEN')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const repaymentsReceivedPaise = dailyUdhar.settlements
    .filter((settlement) => settlement.type === 'RECEIVED')
    .reduce((sum, settlement) => sum + settlement.amountPaise, 0)
  const repaymentsPaidPaise = dailyUdhar.settlements
    .filter((settlement) => settlement.type === 'PAID')
    .reduce((sum, settlement) => sum + settlement.amountPaise, 0)
  const moneyIncomePaise =
    directMoneyIncomePaise + udharTakenPaise + repaymentsReceivedPaise
  const moneyExpensePaise =
    directMoneyExpensePaise + udharGivenPaise + repaymentsPaidPaise
  const dailyTimeline = [
    ...dailyMoney.entries.map((entry) => ({
      kind: 'money' as const,
      entry,
      createdAt: entry.createdAt,
    })),
    ...dailyUdhar.entries.map((entry) => ({
      kind: 'udhar' as const,
      entry,
      createdAt: entry.createdAt,
    })),
    ...dailyUdhar.settlements.map((entry) => ({
      kind: 'settlement' as const,
      entry,
      createdAt: entry.createdAt,
    })),
  ].sort(
    (first, second) =>
      first.createdAt.localeCompare(second.createdAt) ||
      first.entry.id.localeCompare(second.entry.id),
  )
  const selectedUdharPerson =
    dailyUdhar.balances.find(
      (balance) => balance.personId === selectedUdharPersonId,
    ) ?? null

  function showTaskUndo(task: Task) {
    if (taskUndoTimer.current !== null) clearTimeout(taskUndoTimer.current)
    taskUndoDeadline.current = Date.now() + 10_000
    setTaskUndo(task)
    taskUndoTimer.current = setTimeout(() => {
      setTaskUndo(null)
      taskUndoTimer.current = null
      taskUndoDeadline.current = 0
    }, Math.max(0, taskUndoDeadline.current - Date.now()))
  }

  function showUdharUndo(entry: UdharEntry) {
    if (udharUndoTimer.current !== null) clearTimeout(udharUndoTimer.current)
    udharUndoDeadline.current = Date.now() + 10_000
    setUdharUndo(entry)
    udharUndoTimer.current = setTimeout(() => {
      setUdharUndo(null)
      udharUndoTimer.current = null
      udharUndoDeadline.current = 0
    }, Math.max(0, udharUndoDeadline.current - Date.now()))
  }

  function showSettlementUndo(deleted: DeletedUdharSettlement) {
    if (settlementUndoTimer.current !== null) {
      clearTimeout(settlementUndoTimer.current)
    }
    settlementUndoDeadline.current = Date.now() + 10_000
    setSettlementUndo(deleted)
    settlementUndoTimer.current = setTimeout(() => {
      setSettlementUndo(null)
      settlementUndoTimer.current = null
      settlementUndoDeadline.current = 0
    }, Math.max(0, settlementUndoDeadline.current - Date.now()))
  }

  async function saveTask(text: string, scheduledDate: string) {
    const task = await addTask(text, scheduledDate)
    setTaskFormDate(null)
    await dailyTasks.refresh(selectedDateKey)
    return task
  }

  async function saveTaskChanges(task: Task, text: string, scheduledDate: string) {
    if (text.trim() !== task.text) await updateTaskText(task.id, text)
    if (scheduledDate !== task.scheduledDate) {
      await postponeTask(task.id, scheduledDate)
    }
    await dailyTasks.refresh(selectedDateKey)
    setSelectedTask(null)
    setTaskError('')
  }

  async function completeTaskToggle(task: Task, isCompleted: boolean) {
    setPendingTaskIds((pending) => new Set(pending).add(task.id))
    const optimisticTask = {
      ...task,
      isCompleted,
      ...(isCompleted
        ? { completedAt: new Date().toISOString() }
        : { completedAt: undefined }),
    }
    const optimistic = {
      current: dailyTasks.tasks.current.map((item) =>
        item.id === task.id ? optimisticTask : item,
      ),
      overdue:
        isCompleted && task.scheduledDate < todayDateKey
          ? dailyTasks.tasks.overdue.filter((item) => item.id !== task.id)
          : dailyTasks.tasks.overdue.map((item) =>
              item.id === task.id ? optimisticTask : item,
            ),
    }
    dailyTasks.replaceTasks(selectedDateKey, optimistic)
    setTaskError('')
    try {
      await toggleTaskCompletion(task.id, isCompleted)
      await dailyTasks.refresh(selectedDateKey)
    } catch {
      setTaskError(t.taskSaveError)
      await dailyTasks.refresh(selectedDateKey).catch(() => undefined)
    } finally {
      setPendingTaskIds((pending) => {
        const next = new Set(pending)
        next.delete(task.id)
        return next
      })
    }
  }

  async function quickDeleteTask(task: Task) {
    if (taskDeleteInProgress.current) return
    taskDeleteInProgress.current = true
    setTaskError('')
    try {
      await deleteTask(task.id)
      setSelectedTask(null)
      showTaskUndo(task)
      void dailyTasks.refresh(selectedDateKey).catch(() => undefined)
    } catch {
      setTaskError(t.taskSaveError)
    } finally {
      taskDeleteInProgress.current = false
    }
  }

  async function undoTaskDelete() {
    if (taskUndo === null || taskDeleteInProgress.current) return
    if (Date.now() >= taskUndoDeadline.current) {
      if (taskUndoTimer.current !== null) clearTimeout(taskUndoTimer.current)
      taskUndoTimer.current = null
      taskUndoDeadline.current = 0
      setTaskUndo(null)
      return
    }
    taskDeleteInProgress.current = true
    const task = taskUndo
    try {
      await restoreTask(task)
      if (taskUndoTimer.current !== null) clearTimeout(taskUndoTimer.current)
      taskUndoTimer.current = null
      taskUndoDeadline.current = 0
      setTaskUndo(null)
      void dailyTasks.refresh(selectedDateKey).catch(() => undefined)
    } catch {
      setTaskError(t.taskSaveError)
    } finally {
      taskDeleteInProgress.current = false
    }
  }

  function showUndo(entry: MoneyEntry) {
    if (undoTimer.current !== null) clearTimeout(undoTimer.current)
    undoUsed.current = false
    undoDeadline.current = Date.now() + 10_000
    setUndoEntry(entry)
    undoTimer.current = setTimeout(() => {
      setUndoEntry(null)
      undoTimer.current = null
    }, Math.max(0, undoDeadline.current - Date.now()))
  }

  async function saveMoneyEntry(value: NewMoneyEntry, id?: string) {
    if (id !== undefined) {
      const updated = await updateMoneyEntry(id, value)
      dailyMoney.replaceForDate(
        updated.date,
        dailyMoney.entries
          .filter((entry) => entry.id !== id && entry.date === updated.date)
          .concat(updated)
          .sort((first, second) => first.createdAt.localeCompare(second.createdAt)),
      )
    } else {
      const created = await addMoneyEntry(value)
      dailyMoney.replaceForDate(
        created.date,
        [...dailyMoney.entries.filter((entry) => entry.date === created.date), created]
          .sort((first, second) => first.createdAt.localeCompare(second.createdAt)),
      )
    }

    setMoneyForm(null)
    setSelectedMoneyEntry(null)
    setIsConfirmingDelete(false)
    setMoneyError('')
  }

  async function saveUdharEntry(value: NewUdharEntry, id?: string) {
    let savedEntry: UdharEntry
    if (id !== undefined) {
      savedEntry = await updateUdharEntry(id, value)
    } else {
      savedEntry = await addUdharEntry(value)
    }
    setUdharForm(null)
    setSelectedUdharEntry(null)
    setUdharError('')
    await dailyUdhar.refresh(selectedDateKey)
    return savedEntry
  }

  async function quickDeleteUdharEntry(entry: UdharEntry) {
    if (udharDeleteInProgress.current) return
    udharDeleteInProgress.current = true
    setIsDeletingUdhar(true)
    setUdharError('')
    try {
      await deleteUdharEntry(entry.id)
      setSelectedUdharEntry(null)
      showUdharUndo(entry)
      void dailyUdhar.refresh(selectedDateKey).catch(() => undefined)
    } catch (error) {
      setUdharError(
        error instanceof Error &&
          error.message === UDHAR_PRINCIPAL_ACTIVE_SETTLEMENTS_MESSAGE
          ? t.principalHasSettlements
          : t.udharDeleteError,
      )
    } finally {
      udharDeleteInProgress.current = false
      setIsDeletingUdhar(false)
    }
  }

  async function undoUdharDelete() {
    if (udharUndo === null || udharDeleteInProgress.current) return
    if (Date.now() >= udharUndoDeadline.current) {
      if (udharUndoTimer.current !== null) clearTimeout(udharUndoTimer.current)
      udharUndoTimer.current = null
      udharUndoDeadline.current = 0
      setUdharUndo(null)
      return
    }

    udharDeleteInProgress.current = true
    setIsDeletingUdhar(true)
    try {
      await restoreUdharEntry(udharUndo)
      if (udharUndoTimer.current !== null) clearTimeout(udharUndoTimer.current)
      udharUndoTimer.current = null
      udharUndoDeadline.current = 0
      setUdharUndo(null)
      void dailyUdhar.refresh(selectedDateKey).catch(() => undefined)
    } catch {
      setUdharError(t.udharDeleteError)
    } finally {
      udharDeleteInProgress.current = false
      setIsDeletingUdhar(false)
    }
  }

  async function saveSettlement(
    personId: string,
    type: UdharSettlementType,
    amountPaise: number,
    date: string,
    description?: string,
  ) {
    await recordSettlement(personId, type, amountPaise, date, description)
    setSettlementForm(null)
    setUdharError('')
    await dailyUdhar.refresh(selectedDateKey)
  }

  async function removeSettlement(settlement: UdharSettlement) {
    if (settlementDeleteInProgress.current) return
    settlementDeleteInProgress.current = true
    setIsDeletingSettlement(true)
    try {
      const deleted = await deleteSettlement(settlement.id)
      setSelectedSettlement(null)
      showSettlementUndo(deleted)
      void dailyUdhar.refresh(selectedDateKey).catch(() => undefined)
    } catch {
      setUdharError(t.settlementDeleteError)
    } finally {
      settlementDeleteInProgress.current = false
      setIsDeletingSettlement(false)
    }
  }

  async function undoSettlementDelete() {
    if (settlementUndo === null || settlementDeleteInProgress.current) return
    if (Date.now() >= settlementUndoDeadline.current) {
      if (settlementUndoTimer.current !== null) {
        clearTimeout(settlementUndoTimer.current)
      }
      settlementUndoTimer.current = null
      settlementUndoDeadline.current = 0
      setSettlementUndo(null)
      return
    }
    settlementDeleteInProgress.current = true
    setIsDeletingSettlement(true)
    try {
      await restoreSettlement(settlementUndo)
      if (settlementUndoTimer.current !== null) {
        clearTimeout(settlementUndoTimer.current)
      }
      settlementUndoTimer.current = null
      settlementUndoDeadline.current = 0
      setSettlementUndo(null)
      void dailyUdhar.refresh(selectedDateKey).catch(() => undefined)
    } catch {
      setUdharError(t.settlementDeleteError)
    } finally {
      settlementDeleteInProgress.current = false
      setIsDeletingSettlement(false)
    }
  }

  async function confirmDeleteMoneyEntry() {
    if (selectedMoneyEntry === null || deleteInProgress.current) return
    deleteInProgress.current = true
    setIsDeleting(true)
    setMoneyError('')
    const deletedEntry = selectedMoneyEntry
    try {
      await deleteMoneyEntry(deletedEntry.id)
      dailyMoney.replaceForDate(
        deletedEntry.date,
        dailyMoney.entries.filter((entry) => entry.id !== deletedEntry.id),
      )
      setSelectedMoneyEntry(null)
      setIsConfirmingDelete(false)
      showUndo(deletedEntry)
    } catch {
      setMoneyError(t.deleteError)
    } finally {
      deleteInProgress.current = false
      setIsDeleting(false)
    }
  }

  async function undoDelete() {
    if (undoEntry === null || undoUsed.current) return
    if (Date.now() >= undoDeadline.current) {
      setUndoEntry(null)
      return
    }
    undoUsed.current = true
    const entryToRestore = undoEntry
    try {
      await restoreMoneyEntry(entryToRestore)
      if (selectedDateKey === entryToRestore.date) {
        dailyMoney.replaceForDate(
          entryToRestore.date,
          [...dailyMoney.entries.filter((entry) => entry.id !== entryToRestore.id), entryToRestore]
            .sort((first, second) => first.createdAt.localeCompare(second.createdAt)),
        )
      } else {
        await dailyMoney.refresh(entryToRestore.date)
      }
      if (undoTimer.current !== null) clearTimeout(undoTimer.current)
      undoTimer.current = null
      setUndoEntry(null)
    } catch {
      undoUsed.current = false
      setMoneyError(t.saveError)
    }
  }

  if (!pinStatusReady) {
    return (
      <main className="pin-lock-screen">
        <section className="pin-lock-card">
          <div className="pin-lock-brand-mark" aria-hidden="true">D</div>
          <h1 className="font-brand text-[34px] font-semibold text-diary-text">
            {t.appName}
          </h1>
          <p role={pinStatusError ? 'alert' : 'status'} className="mt-4 text-center text-sm text-diary-muted">
            {pinStatusError ? t.pinStatusError : t.noteLoading}
          </p>
          {pinStatusError && (
            <button
              type="button"
              onClick={() => {
                setPinStatusError(false)
                setPinStatusReady(false)
                void isPinEnabled().then(
                  (enabled) => {
                    setPinEnabled(enabled)
                    setIsLocked(enabled && isOnboarded)
                    setPinStatusReady(true)
                  },
                  () => setPinStatusError(true),
                )
              }}
              className="mt-4 min-h-11 rounded-xl bg-diary-primary px-4 font-semibold text-white"
            >
              {t.retry}
            </button>
          )}
        </section>
      </main>
    )
  }

  if (isLocked && isOnboarded) {
    return (
      <PinLockView
        key={pinLockoutRemainingMs > 0 ? 'pin-rate-limited' : 'pin-entry'}
        copy={t}
        lockoutRemainingMs={pinLockoutRemainingMs}
        onVerify={verifyUnlockPin}
        onForgotReset={resetAfterForgottenPin}
        onLockoutExpired={handlePinLockoutExpired}
      />
    )
  }

  if (!isOnboarded) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <section className="w-full max-w-[420px] text-center">
          <div className="mx-auto mb-7 flex h-[68px] w-[68px] items-center justify-center rounded-[22px] bg-diary-selected text-diary-primary">
            <FileText size={32} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h1 className="font-brand text-[42px] font-semibold tracking-[-0.04em] text-diary-text">
            {t.appName}
          </h1>
          <p className="mx-auto mt-3 max-w-[330px] text-base leading-7 text-diary-muted">
            {t.tagline}
          </p>

          <div
            className="mt-9 flex justify-center gap-2"
            aria-label={t.languageLabel}
          >
            {locales.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={locale === option}
                onClick={() => changeLocale(option)}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-diary-primary ${
                  locale === option
                    ? 'border-diary-primary bg-diary-selected text-diary-primary'
                    : 'border-diary-border bg-diary-surface text-diary-muted hover:bg-diary-selected'
                }`}
              >
                {localeNames[option]}
              </button>
            ))}
          </div>

          <div className="mt-8 grid gap-3">
            <button
              type="button"
              onClick={startDiary}
              className="min-h-12 rounded-xl bg-diary-primary px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-diary-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-diary-primary"
            >
              {t.startDiary}
            </button>
            <button
              type="button"
              disabled={isWelcomeImporting}
              onClick={() => welcomeFileInput.current?.click()}
              className="min-h-11 rounded-xl px-5 py-3 text-sm font-medium text-diary-primary hover:bg-diary-selected focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-diary-primary"
            >
              {isWelcomeImporting ? t.noteSaving : t.restoreBackup}
            </button>
            <input
              ref={welcomeFileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label={t.restoreBackup}
              onChange={(event) => void restoreFromWelcome(event.currentTarget.files?.[0])}
            />
            {welcomeImportError !== '' && (
              <p role="alert" className="text-sm leading-6 text-red-700">
                {welcomeImportError}
              </p>
            )}
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="min-h-screen pb-[calc(150px+env(safe-area-inset-bottom))]">
      <main className="mx-auto w-full max-w-[680px] px-4 pb-8 pt-5">
        <header className="flex min-h-12 items-center justify-between">
          <span className="font-brand text-[25px] font-semibold tracking-[-0.04em] text-diary-text">
            {t.appName}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t.search}
              onClick={() => setActiveDialog('search')}
              className="icon-button"
            >
              <Search size={21} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t.settings}
              onClick={() => setActiveDialog('settings')}
              className="icon-button"
            >
              <Settings size={21} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </header>

        {activeView === 'calendar' ? (
          <CalendarView
            copy={t}
            locale={locale}
            month={calendarMonth}
            selectedDateKey={selectedDateKey}
            todayDateKey={todayDateKey}
            maxDateKey={maxTaskDateKey}
            onMonthChange={setCalendarMonth}
            onSelectDate={selectCalendarDate}
          />
        ) : activeView === 'summary' ? (
          <SummaryView
            copy={t}
            locale={locale}
            month={summaryMonth}
            maxDateKey={maxTaskDateKey}
            onMonthChange={setSummaryMonth}
          />
        ) : (
          <>
        <section
          aria-label={t.today}
          className="mt-6 flex min-h-14 items-center justify-between rounded-2xl border border-diary-border bg-diary-surface px-2"
        >
          <button
            type="button"
            aria-label={t.previousDay}
            onClick={() => changeSelectedDate(-1)}
            className="icon-button"
          >
            <ChevronLeft size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`${t.openCalendar}: ${dateLabel}`}
            onClick={openCalendar}
            className="min-h-11 min-w-0 flex-1 px-2 text-center text-sm font-semibold capitalize text-diary-text"
          >
            {dateLabel}
          </button>
          <button
            type="button"
            aria-label={t.nextDay}
            onClick={() => changeSelectedDate(1)}
            className="icon-button"
          >
            <ChevronRight size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </section>

        <section className="mt-6 rounded-2xl border border-diary-border bg-diary-surface p-4 sm:p-5">
          <h1 className="text-sm font-semibold text-diary-text">{t.noteLabel}</h1>
          <textarea
            aria-label={t.noteLabel}
            placeholder={t.notePlaceholder}
            value={dailyNote.content}
            onChange={(event) => dailyNote.updateContent(event.target.value)}
            onBlur={dailyNote.flush}
            maxLength={dailyNote.characterLimit}
            disabled={!dailyNote.isReady}
            rows={3}
            className="mt-3 w-full resize-none rounded-xl border border-diary-border bg-diary-bg px-3 py-3 text-base text-diary-text placeholder:text-diary-muted/80 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <div className="mt-2 flex min-h-6 items-center justify-between gap-3 text-xs leading-5 text-diary-muted">
            <span aria-live="polite" role="status">
              {dailyNote.status === 'loading' && t.noteLoading}
              {dailyNote.status === 'saving' && t.noteSaving}
              {dailyNote.status === 'saved' && t.noteSaved}
              {dailyNote.status === 'error' && (
                <span className="flex items-center gap-2">
                  <span>{t.noteError}</span>
                  <button
                    type="button"
                    onClick={dailyNote.retry}
                    className="min-h-11 rounded-lg px-2 font-semibold text-diary-primary underline underline-offset-2"
                  >
                    {dailyNote.isReady ? t.noteRetry : t.noteRetryLoad}
                  </button>
                </span>
              )}
            </span>
            <span aria-label={`${dailyNote.content.length}/${dailyNote.characterLimit} ${t.characters}`}>
              {dailyNote.content.length}/{dailyNote.characterLimit}
            </span>
          </div>
        </section>

        {dailyTimeline.length > 0 && (
          <section className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-diary-border bg-diary-surface p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-diary-text">{t.moneyTitle}</h2>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-diary-muted">{t.moneyIn}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-diary-primary sm:text-base">
                    {formatMoney(moneyIncomePaise)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-diary-muted">{t.moneyOut}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-[#9A5A45] sm:text-base">
                    {formatMoney(moneyExpensePaise)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-diary-muted">{t.net}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-diary-text sm:text-base">
                    {formatMoney(moneyIncomePaise - moneyExpensePaise)}
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-diary-border bg-diary-surface">
              {dailyTimeline.map((item) => {
                const time = new Intl.DateTimeFormat(dateLocales[locale], {
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(item.createdAt))
                if (item.kind === 'money') {
                  const { entry } = item
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setSelectedMoneyEntry(entry)
                        setIsConfirmingDelete(false)
                        setMoneyError('')
                      }}
                      className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-diary-bg focus-visible:relative focus-visible:outline"
                    >
                      <span
                        className={`inline-flex min-w-12 items-center justify-center rounded-full px-2 py-1 text-xs font-semibold ${
                          entry.type === 'IN'
                            ? 'bg-diary-selected text-diary-primary'
                            : 'bg-[#F7EAE5] text-[#9A5A45]'
                        }`}
                      >
                        {entry.type === 'IN' ? t.moneyInBadge : t.moneyOutBadge}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-diary-text">
                          {entry.description ||
                            (entry.type === 'IN' ? t.moneyIncome : t.moneyExpense)}
                        </span>
                        <span className="mt-1 block truncate text-xs text-diary-muted">
                          {time}{entry.note ? ` · ${entry.note}` : ''}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-sm font-semibold ${
                          entry.type === 'IN' ? 'text-diary-primary' : 'text-[#9A5A45]'
                        }`}
                      >
                        {entry.type === 'IN' ? '+' : '−'}
                        {formatMoney(entry.amountPaise)}
                      </span>
                    </button>
                  )
                }

                if (item.kind === 'udhar') {
                  const { entry } = item
                  const isGiven = entry.type === 'GIVEN'
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setSelectedUdharEntry(entry)
                        setUdharError('')
                      }}
                      className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-diary-bg focus-visible:relative focus-visible:outline"
                    >
                      <span
                        className={`inline-flex min-w-12 items-center justify-center rounded-full px-2 py-1 text-xs font-semibold ${
                          isGiven
                            ? 'bg-[#F7F1E7] text-[#80643B]'
                            : 'bg-[#EEF0F4] text-[#596579]'
                        }`}
                      >
                        {isGiven ? t.loanGiven : t.loanTaken}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-diary-text">
                          {entry.personName}
                        </span>
                        <span className="mt-1 block truncate text-xs text-diary-muted">
                          {entry.description ? `${entry.description} · ` : ''}{time}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-sm font-semibold ${
                          isGiven ? 'text-[#80643B]' : 'text-[#596579]'
                        }`}
                      >
                        {isGiven ? '−' : '+'}{formatMoney(entry.amountPaise)}
                      </span>
                    </button>
                  )
                }

                const { entry } = item
                const received = entry.type === 'RECEIVED'
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSelectedSettlement(entry)
                      setUdharError('')
                    }}
                    className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-diary-bg focus-visible:relative focus-visible:outline"
                  >
                    <span
                      className={`inline-flex min-w-12 items-center justify-center rounded-full px-2 py-1 text-xs font-semibold ${
                        received
                          ? 'bg-diary-selected text-diary-primary'
                          : 'bg-[#F7EAE5] text-[#9A5A45]'
                      }`}
                    >
                      {received ? t.settlementReceivedShort : t.settlementPaidShort}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-diary-text">
                        {entry.personName}
                      </span>
                      <span className="mt-1 block truncate text-xs text-diary-muted">
                        {entry.description ? `${entry.description} · ` : ''}{time}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        received ? 'text-diary-primary' : 'text-[#9A5A45]'
                      }`}
                    >
                      {received ? '+' : '−'}{formatMoney(entry.amountPaise)}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {dailyMoney.hasError && (
          <div role="alert" className="mt-4 flex items-center justify-between gap-3 text-sm text-red-700">
            <span>{t.moneyLoadError}</span>
            <button
              type="button"
              onClick={() => void dailyMoney.refresh().catch(() => undefined)}
              className="min-h-11 rounded-lg px-3 font-semibold underline underline-offset-2"
            >
              {t.retry}
            </button>
          </div>
        )}

        {dailyUdhar.hasError && (
          <div role="alert" className="mt-4 flex items-center justify-between gap-3 text-sm text-red-700">
            <span>{t.udharLoadError}</span>
            <button
              type="button"
              onClick={() => void dailyUdhar.refresh().catch(() => undefined)}
              className="min-h-11 rounded-lg px-3 font-semibold underline underline-offset-2"
            >
              {t.retry}
            </button>
          </div>
        )}

        {(dailyUdhar.entries.length > 0 ||
          dailyUdhar.totals.totalReceivablePaise > 0 ||
          dailyUdhar.totals.totalPayablePaise > 0) && (
          <section className="mt-5 rounded-2xl border border-diary-border bg-diary-surface p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-diary-text">{t.udharTitle}</h2>
              <button
                type="button"
                onClick={() => setShowUdharBalances(true)}
                className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-diary-primary underline underline-offset-2"
              >
                {t.view}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <p className="text-xs text-diary-muted">{t.receive}</p>
                <p className="mt-1 truncate text-sm font-semibold text-diary-text">
                  {formatMoney(dailyUdhar.totals.totalReceivablePaise)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-diary-muted">{t.pay}</p>
                <p className="mt-1 truncate text-sm font-semibold text-diary-text">
                  {formatMoney(dailyUdhar.totals.totalPayablePaise)}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="mt-5 rounded-2xl border border-diary-border bg-diary-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-diary-text">{t.tasksTitle}</h2>
            {dailyTasks.allTasks.length > 0 && (
              <span className="text-xs text-diary-muted">
                {dailyTasks.allTasks.length}
              </span>
            )}
          </div>

          {dailyTasks.isLoading ? (
            <p className="mt-3 text-sm text-diary-muted">{t.moneyLoading}</p>
          ) : dailyTasks.hasError ? (
            <div role="alert" className="mt-3 flex items-center justify-between gap-3 text-sm text-red-700">
              <span>{t.taskLoadError}</span>
              <button
                type="button"
                onClick={() => void dailyTasks.refresh().catch(() => undefined)}
                className="min-h-11 rounded-lg px-3 font-semibold underline underline-offset-2"
              >
                {t.taskRetry}
              </button>
            </div>
          ) : dailyTasks.allTasks.length === 0 ? (
            <p className="mt-3 text-sm text-diary-muted">{t.taskEmpty}</p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-diary-border">
                {dailyTasks.allTasks
                  .slice(
                    0,
                    selectedDateKey === todayDateKey && !expandedTasks
                      ? 5
                      : undefined,
                  )
                  .map((task) => {
                    const isOverdue =
                      selectedDateKey === todayDateKey &&
                      task.scheduledDate < todayDateKey &&
                      !task.isCompleted
                    return (
                      <li key={task.id} className="flex min-h-[60px] items-center gap-2 py-2">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={task.isCompleted}
                          aria-label={`${task.isCompleted ? t.markTaskUndone : t.markTaskDone}: ${task.text}`}
                          disabled={pendingTaskIds.has(task.id)}
                          onClick={() => void completeTaskToggle(task, !task.isCompleted)}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-diary-primary disabled:opacity-60"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-200 ${
                              task.isCompleted
                                ? 'border-diary-primary bg-diary-primary text-white'
                                : 'border-diary-border bg-white'
                            }`}
                          >
                            {task.isCompleted && (
                              <span aria-hidden="true" className="text-xs leading-none">✓</span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTask(task)
                            setTaskError('')
                          }}
                          className="min-h-11 min-w-0 flex-1 rounded-lg px-1 text-left"
                        >
                          <span
                            className={`block truncate text-sm transition-all duration-200 ${
                              task.isCompleted
                                ? 'text-diary-muted line-through'
                                : 'text-diary-text'
                            }`}
                          >
                            {task.text}
                          </span>
                          {isOverdue && (
                            <span className="mt-1 inline-flex rounded-full bg-[#F7F1E7] px-2 py-0.5 text-[11px] font-medium text-[#80643B]">
                              {t.overduePrefix} · {formatLocalDateKey(task.scheduledDate, dateLocales[locale])}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
              </ul>
              {selectedDateKey === todayDateKey && dailyTasks.allTasks.length > 5 && (
                <button
                  type="button"
                  onClick={() => setExpandedTasks((expanded) => !expanded)}
                  className="mt-2 min-h-11 rounded-lg px-2 text-sm font-semibold text-diary-primary underline underline-offset-2"
                >
                  {expandedTasks
                    ? t.showFewerTasks
                    : t.showAllTasks.replace(
                        '{count}',
                        String(dailyTasks.allTasks.length),
                      )}
                </button>
              )}
            </>
          )}
          {taskError !== '' && (
            <p role="alert" className="mt-3 text-sm text-red-700">{taskError}</p>
          )}
        </section>

        {dailyNote.isReady &&
          dailyNote.content.trim().length === 0 &&
          !dailyMoney.isLoading &&
          !dailyMoney.hasError &&
          dailyMoney.entries.length === 0 &&
          !dailyUdhar.isLoading &&
          !dailyUdhar.hasError &&
          dailyUdhar.entries.length === 0 &&
          dailyUdhar.settlements.length === 0 &&
          dailyUdhar.totals.totalReceivablePaise === 0 &&
          dailyUdhar.totals.totalPayablePaise === 0 &&
          !dailyTasks.isLoading &&
          !dailyTasks.hasError &&
          dailyTasks.allTasks.length === 0 && (
          <section
            role="status"
            className="mt-5 rounded-2xl border border-diary-border bg-diary-surface px-4 py-5 text-center"
          >
            <p className="text-sm leading-6 text-diary-muted">{t.emptyDay}</p>
          </section>
          )}
          </>
        )}
      </main>

      {activeView === 'day' && <div className={`fab-container${showBackupReminder ? ' fab-with-reminder' : ''}`}>
        <button
          type="button"
          onClick={() => setActiveDialog('add')}
          className="flex min-h-12 items-center gap-2 rounded-full bg-diary-primary px-5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(31,107,82,0.2)] transition-colors hover:bg-diary-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-diary-primary"
        >
          <Plus size={19} strokeWidth={1.75} aria-hidden="true" />
          {t.add}
        </button>
      </div>}

      {showBackupReminder && (
        <aside
          role="status"
          className="backup-reminder"
          aria-label={t.backupReminder}
        >
          <p className="min-w-0 flex-1 text-sm leading-5 text-diary-text">
            {t.backupReminder}
          </p>
          <button
            type="button"
            onClick={() => setActiveDialog('settings')}
            className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-diary-primary underline underline-offset-2"
          >
            {t.backupNow}
          </button>
          <button
            type="button"
            aria-label={t.later}
            onClick={dismissBackupReminder}
            className="icon-button shrink-0 text-xs"
          >
            {t.later}
          </button>
        </aside>
      )}

      {updateWaiting !== null && (
        <aside
          role="status"
          className="app-update-notice"
        >
          <p className="min-w-0 flex-1 text-sm text-diary-text">
            {t.appUpdateAvailable}
          </p>
          <button
            type="button"
            onClick={applyAvailableUpdate}
            className="min-h-11 shrink-0 rounded-lg bg-diary-primary px-3 text-sm font-semibold text-white"
          >
            {t.updateNow}
          </button>
        </aside>
      )}

      <nav
        aria-label={t.navigationLabel}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-diary-border bg-diary-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid min-h-[64px] max-w-[680px] grid-cols-3 px-2">
          <button
            type="button"
            aria-current={activeView === 'day' ? 'page' : undefined}
            onClick={() => setActiveView('day')}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl ${
              activeView === 'day'
                ? 'text-diary-primary'
                : 'text-diary-muted hover:bg-diary-selected'
            }`}
          >
            <House size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-xs font-semibold">{t.today}</span>
          </button>
          <button
            type="button"
            aria-current={activeView === 'calendar' ? 'page' : undefined}
            onClick={openCalendar}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl ${
              activeView === 'calendar'
                ? 'text-diary-primary'
                : 'text-diary-muted hover:bg-diary-selected'
            }`}
          >
            <CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-xs font-medium">{t.calendar}</span>
          </button>
          <button
            type="button"
            aria-current={activeView === 'summary' ? 'page' : undefined}
            onClick={() => setActiveView('summary')}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl ${
              activeView === 'summary'
                ? 'text-diary-primary'
                : 'text-diary-muted hover:bg-diary-selected'
            }`}
          >
            <ChartNoAxesColumn size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-xs font-medium">{t.summary}</span>
          </button>
        </div>
      </nav>

      {activeDialog === 'add' && (
        <div
          className="dialog-backdrop items-end sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) setActiveDialog(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="dialog-card sheet-card"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="dialog-title" className="text-lg font-semibold text-diary-text">
                {t.addTitle}
              </h2>
              <button
                type="button"
                aria-label={t.close}
                onClick={() => setActiveDialog(null)}
                className="icon-button -mr-2 -mt-2"
              >
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
                {[
                  {
                    icon: Wallet,
                    label: t.moneyIncome,
                    type: 'IN' as const,
                  },
                  {
                    icon: Wallet,
                    label: t.moneyExpense,
                    type: 'OUT' as const,
                  },
                ].map(({ icon: Icon, label, type }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setActiveDialog(null)
                      setMoneyForm({ date: selectedDateKey, type })
                    }}
                    className="flex min-h-[54px] items-center gap-3 rounded-xl border border-diary-border bg-white px-4 text-left text-sm text-diary-text hover:bg-diary-selected"
                  >
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                    <span className="flex-1 font-medium">{label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setActiveDialog(null)
                    setTaskFormDate(selectedDateKey)
                  }}
                  className="flex min-h-[54px] items-center gap-3 rounded-xl border border-diary-border bg-white px-4 text-left text-sm text-diary-text hover:bg-diary-selected"
                >
                  <ListChecks size={20} strokeWidth={1.75} aria-hidden="true" />
                  <span className="flex-1 font-medium">{t.addTask}</span>
                </button>
                {[
                  { icon: HandCoins, label: t.loanGiven, type: 'GIVEN' as const },
                  { icon: HandCoins, label: t.loanTaken, type: 'TAKEN' as const },
                ].map(({ icon: Icon, label, type }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setActiveDialog(null)
                      setUdharForm({ date: selectedDateKey, type })
                    }}
                    className="flex min-h-[54px] items-center gap-3 rounded-xl border border-diary-border bg-white px-4 text-left text-sm text-diary-text hover:bg-diary-selected"
                  >
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                    <span className="flex-1 font-medium">{label}</span>
                  </button>
                ))}
            </div>
          </section>
        </div>
      )}

      {activeDialog === 'settings' && (
        <SettingsView
          copy={t}
          locale={locale}
          textSize={textSize}
          backupStatus={backupStatus}
          statusError={backupStatusError}
          pinEnabled={pinEnabled}
          onLocaleChange={changeLocale}
          onTextSizeChange={changeTextSize}
          onCreateBackup={createBackup}
          onRestoreBackup={(file) => restoreBackupSnapshot(file, false)}
          onReset={resetAllDiaryData}
          onPinSetup={async (pin) => {
            await setupPin(pin)
            setPinEnabled(true)
            setPinLockoutRemainingMs(0)
            setIsLocked(true)
          }}
          onPinChange={changePin}
          onPinRemove={removePin}
          onPinEnabledChange={(enabled) => {
            setPinEnabled(enabled)
            if (!enabled) setIsLocked(false)
          }}
          onImportDismiss={() => window.location.reload()}
          onClose={() => setActiveDialog(null)}
        />
      )}

      {activeDialog === 'search' && (
        <SearchView
          copy={t}
          locale={locale}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={() => setActiveDialog(null)}
          onSelectResult={(dateKey) => {
            dailyNote.flush()
            const [year, month, day] = dateKey.split('-').map(Number)
            setSelectedDate(new Date(year, month - 1, day))
            setActiveView('day')
            setActiveDialog(null)
          }}
        />
      )}

      {moneyForm !== null && (
        <MoneyForm
          copy={t}
          date={moneyForm.date}
          type={moneyForm.type}
          entry={moneyForm.entry}
          onCancel={() => setMoneyForm(null)}
          onSubmit={saveMoneyEntry}
        />
      )}

      {taskFormDate !== null && (
        <TaskForm
          copy={t}
          selectedDate={taskFormDate}
          maxDate={maxTaskDateKey}
          onCancel={() => setTaskFormDate(null)}
          onSubmit={saveTask}
        />
      )}

      {udharForm !== null && (
        <UdharForm
          copy={t}
          date={udharForm.date}
          maxDate={maxTaskDateKey}
          type={udharForm.type}
          entry={udharForm.entry}
          onCancel={() => setUdharForm(null)}
          onSubmit={saveUdharEntry}
        />
      )}

      {selectedTask !== null && (
        <TaskEditor
          copy={t}
          task={selectedTask}
          maxDate={maxTaskDateKey}
          onCancel={() => setSelectedTask(null)}
          onSave={(text, scheduledDate) =>
            saveTaskChanges(selectedTask, text, scheduledDate)
          }
          onDelete={() => quickDeleteTask(selectedTask)}
        />
      )}

      {selectedUdharEntry !== null && udharForm === null && (
        <div
          className="dialog-backdrop items-end sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedUdharEntry(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="udhar-detail-title"
            className="dialog-card sheet-card"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="udhar-detail-title" className="text-lg font-semibold text-diary-text">
                {selectedUdharEntry.type === 'GIVEN' ? t.loanGiven : t.loanTaken}
              </h2>
              <button
                type="button"
                aria-label={t.close}
                onClick={() => setSelectedUdharEntry(null)}
                className="icon-button -mr-2 -mt-2"
              >
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-4 text-base font-semibold text-diary-text">
              {selectedUdharEntry.personName}
            </p>
            <p className="mt-1 text-2xl font-semibold text-diary-text">
              {formatMoney(selectedUdharEntry.amountPaise)}
            </p>
            <p className="mt-1 text-sm text-diary-muted">
              {formatLocalDateKey(selectedUdharEntry.date, dateLocales[locale])}
              {' · '}
              {new Intl.DateTimeFormat(dateLocales[locale], {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(selectedUdharEntry.createdAt))}
            </p>
            {selectedUdharEntry.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-diary-muted">
                {selectedUdharEntry.description}
              </p>
            )}
            {udharError !== '' && (
              <p role="alert" className="mt-3 text-sm text-red-700">{udharError}</p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setUdharForm({
                    date: selectedUdharEntry.date,
                    type: selectedUdharEntry.type,
                    entry: selectedUdharEntry,
                  })
                  setUdharError('')
                }}
                className="min-h-12 rounded-xl bg-diary-primary px-4 font-semibold text-white"
              >
                {t.editEntry}
              </button>
              <button
                type="button"
                onClick={() => void quickDeleteUdharEntry(selectedUdharEntry)}
                disabled={isDeletingUdhar}
                className="min-h-12 rounded-xl border border-[#D8B3A7] px-4 font-semibold text-[#9A5A45] disabled:opacity-60"
              >
                {t.deleteEntry}
              </button>
            </div>
          </section>
        </div>
      )}

      {showUdharBalances && (
        <div
          className="dialog-backdrop items-end sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowUdharBalances(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="udhar-balances-title"
            className="dialog-card sheet-card"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="udhar-balances-title" className="text-lg font-semibold text-diary-text">
                {selectedUdharPerson?.personName ?? t.udharPersonBalances}
              </h2>
              <button
                type="button"
                aria-label={t.close}
                onClick={() => {
                  setShowUdharBalances(false)
                  setSelectedUdharPersonId(null)
                }}
                className="icon-button -mr-2 -mt-2"
              >
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            {dailyUdhar.hasError ? (
              <div role="alert" className="mt-4 flex items-center justify-between gap-3 text-sm text-red-700">
                <span>{t.udharLoadError}</span>
                <button
                  type="button"
                  onClick={() => void dailyUdhar.refresh().catch(() => undefined)}
                  className="min-h-11 rounded-lg px-3 font-semibold underline underline-offset-2"
                >
                  {t.retry}
                </button>
              </div>
            ) : dailyUdhar.balances.length === 0 ? (
              <p className="mt-4 text-sm text-diary-muted">{t.noUdharPeople}</p>
            ) : selectedUdharPerson !== null ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setSelectedUdharPersonId(null)}
                  className="min-h-11 rounded-lg px-2 text-sm font-semibold text-diary-primary underline underline-offset-2"
                >
                  {t.back}
                </button>
                <div className="mt-2 grid grid-cols-2 gap-3 rounded-xl bg-diary-bg p-3">
                  <p className="text-sm text-diary-muted">
                    {t.receive}<span className="mt-1 block font-semibold text-diary-text">{formatMoney(selectedUdharPerson.receivablePaise)}</span>
                  </p>
                  <p className="text-sm text-diary-muted">
                    {t.pay}<span className="mt-1 block font-semibold text-diary-text">{formatMoney(selectedUdharPerson.payablePaise)}</span>
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {selectedUdharPerson.receivablePaise > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSettlementForm({
                          person: selectedUdharPerson,
                          type: 'RECEIVED',
                        })
                      }
                      className="min-h-12 rounded-xl bg-diary-primary px-3 text-sm font-semibold text-white"
                    >
                      {t.settlementReceived}
                    </button>
                  )}
                  {selectedUdharPerson.payablePaise > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSettlementForm({
                          person: selectedUdharPerson,
                          type: 'PAID',
                        })
                      }
                      className="min-h-12 rounded-xl border border-[#D8B3A7] px-3 text-sm font-semibold text-[#9A5A45]"
                    >
                      {t.settlementPaid}
                    </button>
                  )}
                </div>
                <h3 className="mt-5 text-sm font-semibold text-diary-text">{t.activeLoans}</h3>
                <ul className="mt-2 divide-y divide-diary-border">
                  {selectedUdharPerson.principals.map(({ entry, remainingPaise }) => (
                    <li key={entry.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-diary-text">
                          {entry.type === 'GIVEN' ? t.loanGiven : t.loanTaken}
                        </span>
                        <span className="text-xs text-diary-muted">
                          {formatLocalDateKey(entry.date, dateLocales[locale])}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-diary-text">
                        {formatMoney(remainingPaise)}
                      </span>
                    </li>
                  ))}
                </ul>
                {selectedUdharPerson.settlements.length > 0 && (
                  <>
                    <h3 className="mt-5 text-sm font-semibold text-diary-text">{t.settlementHistory}</h3>
                    <ul className="mt-2 divide-y divide-diary-border">
                      {selectedUdharPerson.settlements.map((settlement) => (
                        <li key={settlement.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                          <span className="text-diary-muted">
                            {settlement.type === 'RECEIVED' ? t.settlementReceivedShort : t.settlementPaidShort}
                            {' · '}{formatLocalDateKey(settlement.date, dateLocales[locale])}
                          </span>
                          <span className="font-semibold text-diary-text">{formatMoney(settlement.amountPaise)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <ul className="mt-4 max-h-[60vh] divide-y divide-diary-border overflow-y-auto">
                {dailyUdhar.balances.map((balance) => (
                  <li
                    key={balance.personId}
                    className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedUdharPersonId(balance.personId)}
                      className="min-h-11 min-w-0 truncate rounded-lg px-1 text-left text-sm font-semibold text-diary-text hover:bg-diary-bg"
                    >
                      {balance.personName}
                    </button>
                    <span className="text-right">
                      <span className="block text-[11px] text-diary-muted">{t.receive}</span>
                      <span className="text-xs font-medium text-diary-text">
                        {formatMoney(balance.receivablePaise)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[11px] text-diary-muted">{t.pay}</span>
                      <span className="text-xs font-medium text-diary-text">
                        {formatMoney(balance.payablePaise)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {settlementForm !== null && (
        <SettlementForm
          copy={t}
          personId={settlementForm.person.personId}
          personName={settlementForm.person.personName}
          type={settlementForm.type}
          date={selectedDateKey}
          maxDate={maxTaskDateKey}
          outstandingPaise={
            settlementForm.type === 'RECEIVED'
              ? settlementForm.person.receivablePaise
              : settlementForm.person.payablePaise
          }
          onCancel={() => setSettlementForm(null)}
          onSubmit={saveSettlement}
        />
      )}

      {selectedSettlement !== null && (
        <div
          className="dialog-backdrop items-end sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isDeletingSettlement) {
              setSelectedSettlement(null)
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="settlement-detail-title"
            className="dialog-card sheet-card"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="settlement-detail-title" className="text-lg font-semibold text-diary-text">
                {t.settlementDetails}
              </h2>
              <button
                type="button"
                aria-label={t.close}
                onClick={() => setSelectedSettlement(null)}
                disabled={isDeletingSettlement}
                className="icon-button -mr-2 -mt-2"
              >
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-4 text-base font-semibold text-diary-text">
              {selectedSettlement.personName}
            </p>
            <p className="mt-1 text-sm text-diary-muted">
              {selectedSettlement.type === 'RECEIVED'
                ? t.settlementReceived
                : t.settlementPaid}
              {' · '}{formatLocalDateKey(selectedSettlement.date, dateLocales[locale])}
            </p>
            <p className="mt-2 text-2xl font-semibold text-diary-text">
              {formatMoney(selectedSettlement.amountPaise)}
            </p>
            {selectedSettlement.description && (
              <p className="mt-2 text-sm text-diary-muted">{selectedSettlement.description}</p>
            )}
            <button
              type="button"
              onClick={() => void removeSettlement(selectedSettlement)}
              disabled={isDeletingSettlement}
              className="mt-5 min-h-12 w-full rounded-xl border border-[#D8B3A7] px-4 font-semibold text-[#9A5A45] disabled:opacity-60"
            >
              {isDeletingSettlement ? t.noteSaving : t.deleteEntry}
            </button>
          </section>
        </div>
      )}

      {selectedMoneyEntry !== null && moneyForm === null && (
        <div
          className="dialog-backdrop items-end sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isDeleting) {
              setSelectedMoneyEntry(null)
              setIsConfirmingDelete(false)
              setMoneyError('')
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="entry-detail-title"
            className="dialog-card sheet-card"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="entry-detail-title" className="text-lg font-semibold text-diary-text">
                {selectedMoneyEntry.type === 'IN' ? t.moneyIncome : t.moneyExpense}
              </h2>
              <button
                type="button"
                aria-label={t.close}
                onClick={() => {
                  setSelectedMoneyEntry(null)
                  setIsConfirmingDelete(false)
                  setMoneyError('')
                }}
                disabled={isDeleting}
                className="icon-button -mr-2 -mt-2"
              >
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 text-2xl font-semibold text-diary-text">
              {formatMoney(selectedMoneyEntry.amountPaise)}
            </p>
            <p className="mt-1 text-sm text-diary-muted">
              {selectedMoneyEntry.description ||
                (selectedMoneyEntry.type === 'IN' ? t.moneyIncome : t.moneyExpense)}
              {' · '}
              {new Intl.DateTimeFormat(dateLocales[locale], {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(selectedMoneyEntry.createdAt))}
            </p>
            {selectedMoneyEntry.note && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-diary-muted">
                {selectedMoneyEntry.note}
              </p>
            )}

            {isConfirmingDelete ? (
              <div className="mt-5 rounded-xl border border-[#E8C9BE] bg-[#FBF3F0] p-4">
                <p className="text-sm font-medium text-diary-text">{t.confirmDelete}</p>
                {moneyError !== '' && (
                  <p role="alert" className="mt-2 text-sm text-red-700">{moneyError}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfirmingDelete(false)
                      setMoneyError('')
                    }}
                    disabled={isDeleting}
                    className="min-h-12 rounded-xl border border-diary-border bg-white px-3 font-medium text-diary-text"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmDeleteMoneyEntry()}
                    disabled={isDeleting}
                    className="min-h-12 rounded-xl bg-[#9A5A45] px-3 font-semibold text-white disabled:opacity-60"
                  >
                    {isDeleting ? t.noteSaving : t.deleteConfirm}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMoneyForm({
                      date: selectedMoneyEntry.date,
                      type: selectedMoneyEntry.type,
                      entry: selectedMoneyEntry,
                    })
                    setMoneyError('')
                  }}
                  className="min-h-12 rounded-xl bg-diary-primary px-4 font-semibold text-white"
                >
                  {t.editEntry}
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="min-h-12 rounded-xl border border-[#D8B3A7] px-4 font-semibold text-[#9A5A45]"
                >
                  {t.deleteEntry}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {undoEntry !== null && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(82px+env(safe-area-inset-bottom))] z-50 mx-auto flex min-h-14 max-w-[648px] items-center justify-between gap-3 rounded-2xl bg-diary-text px-4 py-2 text-sm text-white shadow-xl"
        >
          <span className="min-w-0 truncate">
            {undoEntry.description ||
              (undoEntry.type === 'IN' ? t.moneyIncome : t.moneyExpense)}{' '}
            {t.entryDeleted}
            {moneyError !== '' && (
              <span className="block text-xs text-[#FFD8CA]">{moneyError}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void undoDelete()}
            className="min-h-11 shrink-0 rounded-lg px-3 font-semibold text-[#BFE5D3] hover:bg-white/10"
          >
            {t.undo}
          </button>
        </div>
      )}
      {taskUndo !== null && (
        <div
          role="status"
          className={`fixed inset-x-4 z-50 mx-auto flex min-h-14 max-w-[648px] items-center justify-between gap-3 rounded-2xl bg-diary-text px-4 py-2 text-sm text-white shadow-xl ${
            undoEntry !== null
              ? 'bottom-[calc(146px+env(safe-area-inset-bottom))]'
              : 'bottom-[calc(82px+env(safe-area-inset-bottom))]'
          }`}
        >
          <span className="min-w-0 truncate">
            {taskUndo.text} {t.taskDeleted}
            {taskError !== '' && (
              <span className="block text-xs text-[#FFD8CA]">{taskError}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void undoTaskDelete()}
            className="min-h-11 shrink-0 rounded-lg px-3 font-semibold text-[#BFE5D3] hover:bg-white/10"
          >
            {t.undo}
          </button>
        </div>
      )}
      {udharUndo !== null && (
        <div
          role="status"
          className={`fixed inset-x-4 z-50 mx-auto flex min-h-14 max-w-[648px] items-center justify-between gap-3 rounded-2xl bg-diary-text px-4 py-2 text-sm text-white shadow-xl ${
            undoEntry !== null && taskUndo !== null
              ? 'bottom-[calc(210px+env(safe-area-inset-bottom))]'
              : undoEntry !== null || taskUndo !== null
                ? 'bottom-[calc(146px+env(safe-area-inset-bottom))]'
                : 'bottom-[calc(82px+env(safe-area-inset-bottom))]'
          }`}
        >
          <span className="min-w-0 truncate">
            {udharUndo.personName} · {formatMoney(udharUndo.amountPaise)} {t.entryDeleted}
            {udharError !== '' && (
              <span className="block text-xs text-[#FFD8CA]">{udharError}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void undoUdharDelete()}
            className="min-h-11 shrink-0 rounded-lg px-3 font-semibold text-[#BFE5D3] hover:bg-white/10"
          >
            {t.undo}
          </button>
        </div>
      )}
      {settlementUndo !== null && (
        <div
          role="status"
          className={`fixed inset-x-4 z-50 mx-auto flex min-h-14 max-w-[648px] items-center justify-between gap-3 rounded-2xl bg-diary-text px-4 py-2 text-sm text-white shadow-xl ${
            undoEntry !== null && taskUndo !== null && udharUndo !== null
              ? 'bottom-[calc(274px+env(safe-area-inset-bottom))]'
              : undoEntry !== null || taskUndo !== null || udharUndo !== null
                ? 'bottom-[calc(210px+env(safe-area-inset-bottom))]'
                : 'bottom-[calc(146px+env(safe-area-inset-bottom))]'
          }`}
        >
          <span className="min-w-0 truncate">
            {settlementUndo.settlement.personName} · {formatMoney(settlementUndo.settlement.amountPaise)} {t.entryDeleted}
            {udharError !== '' && (
              <span className="block text-xs text-[#FFD8CA]">{udharError}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void undoSettlementDelete()}
            className="min-h-11 shrink-0 rounded-lg px-3 font-semibold text-[#BFE5D3] hover:bg-white/10"
          >
            {t.undo}
          </button>
        </div>
      )}
    </div>
  )
}

export default App
