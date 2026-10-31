import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Locale } from '../i18n'
import { getMonthActivity, type DayActivity } from '../services/calendarService'

type CalendarKey =
  | 'calendar'
  | 'previousMonth'
  | 'nextMonth'
  | 'jumpToToday'
  | 'calendarWeekdays'
  | 'calendarNoActivity'
  | 'calendarNoteActivity'
  | 'calendarMoneyActivity'
  | 'calendarUdharActivity'
  | 'calendarTaskActivity'
  | 'calendarTasksCompleted'
  | 'calendarLegend'
  | 'calendarLoadError'
  | 'calendarRetry'
type CalendarCopy = {
  [Key in CalendarKey]: Key extends 'calendarWeekdays'
    ? readonly string[]
    : string
}

interface CalendarViewProps {
  copy: CalendarCopy
  locale: Locale
  month: Date
  selectedDateKey: string
  todayDateKey: string
  maxDateKey: string
  onMonthChange: (month: Date) => void
  onSelectDate: (date: string) => void
}

function getDateKey(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function toMonthDate(year: number, month: number) {
  return new Date(year, month - 1, 1)
}

function activityDescription(activity: DayActivity | undefined, copy: CalendarCopy) {
  if (activity === undefined) return copy.calendarNoActivity
  const labels = [
    activity.hasNote ? copy.calendarNoteActivity : '',
    activity.hasMoney ? copy.calendarMoneyActivity : '',
    activity.hasUdhar ? copy.calendarUdharActivity : '',
    activity.hasTask
      ? activity.isAllTasksCompleted
        ? copy.calendarTasksCompleted
        : copy.calendarTaskActivity
      : '',
  ].filter(Boolean)
  return labels.length === 0 ? copy.calendarNoActivity : labels.join(', ')
}

export function CalendarView({
  copy,
  locale,
  month,
  selectedDateKey,
  todayDateKey,
  maxDateKey,
  onMonthChange,
  onSelectDate,
}: CalendarViewProps) {
  const year = month.getFullYear()
  const monthNumber = month.getMonth() + 1
  const [loadResult, setLoadResult] = useState<{
    key: string
    activity: Record<string, DayActivity>
    error: boolean
  } | null>(null)
  const [requestNumber, setRequestNumber] = useState(0)
  const monthKey = `${year}-${monthNumber}`
  const isLoading = loadResult?.key !== monthKey
  const hasError = loadResult?.key === monthKey && loadResult.error
  const activityByDate =
    loadResult?.key === monthKey ? loadResult.activity : {}

  useEffect(() => {
    let active = true
    getMonthActivity(year, monthNumber).then(
      (activity) => {
        if (!active) return
        setLoadResult({ key: monthKey, activity, error: false })
      },
      () => {
        if (!active) return
        setLoadResult({ key: monthKey, activity: {}, error: true })
      },
    )
    return () => {
      active = false
    }
  }, [year, monthNumber, monthKey, requestNumber])

  const firstDayOffset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const monthTitle = new Intl.DateTimeFormat(
    locale === 'hi' ? 'hi-IN' : locale === 'mr' ? 'mr-IN' : 'en-IN',
    { month: 'long', year: 'numeric' },
  ).format(toMonthDate(year, monthNumber))
  const dateLocale = locale === 'hi' ? 'hi-IN' : locale === 'mr' ? 'mr-IN' : 'en-IN'
  const maxMonthStart = maxDateKey.slice(0, 7)
  const nextMonthStart = new Date(year, monthNumber, 1)
  const canGoNext = getDateKey(
    nextMonthStart.getFullYear(),
    nextMonthStart.getMonth() + 1,
    1,
  ) <= `${maxMonthStart}-01`
  const canGoPrevious = year > 1 || monthNumber > 1

  function moveMonth(offset: number) {
    onMonthChange(new Date(year, monthNumber - 1 + offset, 1))
  }

  function makeDateLabel(dateKey: string, activity?: DayActivity) {
    const [dateYear, dateMonth, day] = dateKey.split('-').map(Number)
    const formatted = new Intl.DateTimeFormat(dateLocale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(dateYear, dateMonth - 1, day))
    return `${formatted}, ${activityDescription(activity, copy)}`
  }

  const cells = [
    ...Array.from({ length: firstDayOffset }, (_, index) => ({
      key: `blank-${index}`,
      day: null as number | null,
    })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({
      key: `day-${index + 1}`,
      day: index + 1,
    })),
  ]

  return (
    <section
      aria-label={`${copy.calendar}: ${monthTitle}`}
      className="mt-6 rounded-2xl border border-diary-border bg-diary-surface p-3 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={copy.previousMonth}
          onClick={() => moveMonth(-1)}
          disabled={!canGoPrevious}
          className="icon-button shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={22} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <h1 className="min-w-0 text-center text-base font-semibold capitalize text-diary-text sm:text-lg">
          {monthTitle}
        </h1>
        <button
          type="button"
          aria-label={copy.nextMonth}
          onClick={() => moveMonth(1)}
          disabled={!canGoNext}
          className="icon-button shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={22} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onSelectDate(todayDateKey)}
        className="mx-auto mt-1 flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-diary-primary underline underline-offset-2 hover:bg-diary-selected"
      >
        {copy.jumpToToday}
      </button>

      <div className="mt-3 grid grid-cols-7 border-b border-diary-border pb-2">
        {copy.calendarWeekdays.map((weekday, index) => (
          <span
            key={`${weekday}-${index}`}
            className="flex min-h-8 items-center justify-center text-[11px] font-medium text-diary-muted sm:text-xs"
          >
            {weekday}
          </span>
        ))}
      </div>

      <div
        role="grid"
        aria-label={monthTitle}
        aria-busy={isLoading}
        className="grid grid-cols-7"
      >
        {cells.map(({ key, day }) => {
          if (day === null) {
            return <span key={key} aria-hidden="true" className="min-h-12" />
          }
          const dateKey = getDateKey(year, monthNumber, day)
          const activity = activityByDate[dateKey]
          const isToday = dateKey === todayDateKey
          const isSelected = dateKey === selectedDateKey
          const isDisabled = dateKey > maxDateKey
          const ariaLabel = makeDateLabel(dateKey, activity)
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              aria-label={ariaLabel}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => onSelectDate(dateKey)}
              className={`relative flex min-h-12 min-w-0 flex-col items-center justify-center rounded-xl text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                isSelected
                  ? 'bg-diary-primary font-semibold text-white'
                  : isToday
                    ? 'bg-diary-selected font-semibold text-diary-primary ring-2 ring-inset ring-diary-primary'
                    : 'text-diary-text hover:bg-diary-bg'
              }`}
            >
              <span>{day}</span>
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-1.5 items-center justify-center gap-[3px]"
              >
                {activity?.hasNote && (
                  <span className={`h-1 w-1 rounded-full ${isSelected ? 'bg-white' : 'bg-diary-primary'}`} />
                )}
                {activity?.hasMoney && (
                  <span className={`h-1 w-1 ${isSelected ? 'bg-white' : 'bg-[#9A5A45]'}`} />
                )}
                {activity?.hasUdhar && (
                  <span className={`h-1 w-1 rotate-45 ${isSelected ? 'bg-white' : 'bg-[#80643B]'}`} />
                )}
                {activity?.hasTask && (
                  <span className={`h-[2px] w-1.5 ${isSelected ? 'bg-white' : 'bg-[#596579]'}`} />
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div
        aria-label={copy.calendarLegend}
        className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-diary-border pt-3 text-[11px] text-diary-muted"
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-diary-primary" />
          {copy.calendarNoteActivity}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 bg-[#9A5A45]" />
          {copy.calendarMoneyActivity}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rotate-45 bg-[#80643B]" />
          {copy.calendarUdharActivity}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-[2px] w-2 bg-[#596579]" />
          {copy.calendarTaskActivity}
        </span>
      </div>

      {hasError && (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 text-sm text-red-700">
          <span>{copy.calendarLoadError}</span>
          <button
            type="button"
            onClick={() => setRequestNumber((number) => number + 1)}
            className="min-h-11 shrink-0 rounded-lg px-3 font-semibold underline underline-offset-2"
          >
            {copy.calendarRetry}
          </button>
        </div>
      )}
    </section>
  )
}
