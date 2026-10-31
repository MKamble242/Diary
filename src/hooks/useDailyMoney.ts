import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  getMoneyEntriesByDate,
  type MoneyEntry,
} from '../services/moneyService'

export function useDailyMoney(date: string) {
  const [entries, setEntries] = useState<MoneyEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const currentDate = useRef(date)
  const entriesByDate = useRef(new Map<string, MoneyEntry[]>())
  const requestIds = useRef(new Map<string, number>())

  const nextRequestId = useCallback((targetDate: string) => {
    const request = (requestIds.current.get(targetDate) ?? 0) + 1
    requestIds.current.set(targetDate, request)
    return request
  }, [])

  useLayoutEffect(() => {
    currentDate.current = date
  }, [date])

  const refresh = useCallback((targetDate = date) => {
    const request = nextRequestId(targetDate)
    if (targetDate === currentDate.current) {
      setIsLoading(true)
      setHasError(false)
    }

    return getMoneyEntriesByDate(targetDate).then(
      (records) => {
        entriesByDate.current.set(targetDate, records)
        if (
          currentDate.current === targetDate &&
          request === requestIds.current.get(targetDate)
        ) {
          setEntries(records)
          setIsLoading(false)
          setHasError(false)
        }
        return records
      },
      (error: unknown) => {
        if (
          currentDate.current === targetDate &&
          request === requestIds.current.get(targetDate)
        ) {
          setIsLoading(false)
          setHasError(true)
        }
        throw error
      },
    )
  }, [date, nextRequestId])

  useEffect(() => {
    let active = true
    const cachedEntries = entriesByDate.current.get(date)
    if (cachedEntries !== undefined) {
      setEntries(cachedEntries)
      setIsLoading(false)
      setHasError(false)
    } else {
      setEntries([])
      setIsLoading(true)
      setHasError(false)
    }

    const request = nextRequestId(date)
    void getMoneyEntriesByDate(date).then(
      (records) => {
        entriesByDate.current.set(date, records)
        if (!active || request !== requestIds.current.get(date)) return
        setEntries(records)
        setIsLoading(false)
        setHasError(false)
      },
      () => {
        if (!active || request !== requestIds.current.get(date)) return
        setIsLoading(false)
        setHasError(true)
      },
    )
    return () => {
      active = false
    }
  }, [date, nextRequestId])

  const replaceForDate = useCallback((targetDate: string, records: MoneyEntry[]) => {
    entriesByDate.current.set(targetDate, records)
    if (currentDate.current === targetDate) {
      setEntries(records)
      setHasError(false)
      setIsLoading(false)
    }
  }, [])

  return {
    entries,
    isLoading,
    hasError,
    refresh,
    replaceForDate,
  }
}
