import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMoney } from '../services/moneyService'
import { getMonthSummary, type MonthSummaryData } from '../services/summaryService'
import type { Locale } from '../i18n'

type SummaryKey =
  | 'previousMonth'
  | 'nextMonth'
  | 'monthSummaryTitle'
  | 'udharActivityTitle'
  | 'currentOutstanding'
  | 'diaryActivityTitle'
  | 'moneyIn'
  | 'moneyOut'
  | 'net'
  | 'receive'
  | 'pay'
  | 'daysWithNotes'
  | 'totalTransactions'
  | 'tasksCompletedCount'
  | 'tasksScheduledCount'
  | 'udharGivenMonth'
  | 'udharTakenMonth'
  | 'moneyLoading'
  | 'monthSummaryLoadError'
  | 'retry'
type SummaryCopy = { [Key in SummaryKey]: string }

interface SummaryViewProps {
  copy: SummaryCopy
  locale: Locale
  month: Date
  maxDateKey: string
  onMonthChange: (month: Date) => void
}

function monthDate(year: number, month: number) {
  return new Date(year, month - 1, 1)
}

export function SummaryView({
  copy,
  locale,
  month,
  maxDateKey,
  onMonthChange,
}: SummaryViewProps) {
  const year = month.getFullYear()
  const monthNumber = month.getMonth() + 1
  const monthKey = `${year}-${monthNumber}`
  const [loadResult, setLoadResult] = useState<{
    key: string
    data: MonthSummaryData | null
    error: boolean
  } | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const data = loadResult?.key === monthKey ? loadResult.data : null
  const isLoading = loadResult?.key !== monthKey
  const hasError = loadResult?.key === monthKey && loadResult.error

  useEffect(() => {
    let active = true
    getMonthSummary(year, monthNumber).then(
      (nextData) => {
        if (active) setLoadResult({ key: monthKey, data: nextData, error: false })
      },
      () => {
        if (active) setLoadResult({ key: monthKey, data: null, error: true })
      },
    )
    return () => {
      active = false
    }
  }, [year, monthNumber, monthKey, retryCount])

  const dateLocale = locale === 'hi' ? 'hi-IN' : locale === 'mr' ? 'mr-IN' : 'en-IN'
  const title = new Intl.DateTimeFormat(dateLocale, {
    month: 'long',
    year: 'numeric',
  }).format(monthDate(year, monthNumber))
  const nextMonth = new Date(year, monthNumber, 1)
  const maxMonth = maxDateKey.slice(0, 7)
  const nextMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`
  const canGoNext = nextMonthKey <= maxMonth

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-diary-border bg-diary-surface p-2">
        <button
          type="button"
          aria-label={copy.previousMonth}
          onClick={() => onMonthChange(new Date(year, monthNumber - 2, 1))}
          className="icon-button shrink-0"
        >
          <ChevronLeft size={22} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <h1 className="min-w-0 text-center text-base font-semibold capitalize text-diary-text sm:text-lg">
          {title}
        </h1>
        <button
          type="button"
          aria-label={copy.nextMonth}
          onClick={() => onMonthChange(nextMonth)}
          disabled={!canGoNext}
          className="icon-button shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={22} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {isLoading ? (
        <p role="status" className="mt-5 rounded-2xl border border-diary-border bg-diary-surface p-5 text-center text-sm text-diary-muted">
          {copy.moneyLoading}
        </p>
      ) : hasError ? (
        <div role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-diary-border bg-diary-surface p-4 text-sm text-red-700">
          <span>{copy.monthSummaryLoadError}</span>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="min-h-11 shrink-0 rounded-lg px-3 font-semibold underline underline-offset-2"
          >
            {copy.retry}
          </button>
        </div>
      ) : data !== null ? (
        <div className="mt-4 grid gap-4">
          <section className="rounded-2xl border border-diary-border bg-diary-surface p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-diary-text">{copy.monthSummaryTitle}</h2>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Metric label={copy.moneyIn} value={formatMoney(data.incomePaise)} color="text-diary-primary" />
              <Metric label={copy.moneyOut} value={formatMoney(data.expensePaise)} color="text-[#9A5A45]" />
              <Metric label={copy.net} value={formatMoney(data.netPaise)} color="text-diary-text" />
            </div>
          </section>

          <section className="rounded-2xl border border-diary-border bg-diary-surface p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-diary-text">{copy.udharActivityTitle}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label={copy.udharGivenMonth} value={formatMoney(data.udharGivenPaise)} color="text-[#80643B]" />
              <Metric label={copy.udharTakenMonth} value={formatMoney(data.udharTakenPaise)} color="text-[#596579]" />
            </div>
          </section>

          <section className="rounded-2xl border border-diary-border bg-diary-surface p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-diary-text">{copy.currentOutstanding}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label={copy.receive} value={formatMoney(data.totalReceivablePaise)} color="text-diary-primary" />
              <Metric label={copy.pay} value={formatMoney(data.totalPayablePaise)} color="text-[#9A5A45]" />
            </div>
          </section>

          <section className="rounded-2xl border border-diary-border bg-diary-surface p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-diary-text">{copy.diaryActivityTitle}</h2>
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
              <Metric label={copy.daysWithNotes} value={String(data.daysWithNotes)} color="text-diary-text" />
              <Metric label={copy.totalTransactions} value={String(data.totalTransactions)} color="text-diary-text" />
              <Metric label={copy.tasksCompletedCount} value={String(data.tasksCompleted)} color="text-diary-primary" />
              <Metric label={copy.tasksScheduledCount} value={String(data.totalTasks)} color="text-diary-text" />
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function Metric({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs leading-5 text-diary-muted">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold sm:text-base ${color}`}>
        {value}
      </p>
    </div>
  )
}
