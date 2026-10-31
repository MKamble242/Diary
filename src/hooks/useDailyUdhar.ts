import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDailyUdharEntries,
  getDailyUdharSettlements,
  getOverallUdharBalances,
  getOverallUdharTotals,
  type UdharEntry,
  type UdharSettlement,
  type UdharPersonBalanceDetails,
  type UdharTotals,
} from '../services/udharService'

const EMPTY_TOTALS: UdharTotals = {
  totalReceivablePaise: 0,
  totalPayablePaise: 0,
}

function fetchUdharState(date: string) {
  return Promise.all([
    getDailyUdharEntries(date),
    getDailyUdharSettlements(date),
    getOverallUdharTotals(),
    getOverallUdharBalances(),
  ])
}

export function useDailyUdhar(date: string) {
  const [entries, setEntries] = useState<UdharEntry[]>([])
  const [settlements, setSettlements] = useState<UdharSettlement[]>([])
  const [totals, setTotals] = useState<UdharTotals>(EMPTY_TOTALS)
  const [balances, setBalances] = useState<UdharPersonBalanceDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [loadedDate, setLoadedDate] = useState(date)
  const currentDate = useRef(date)
  const requestId = useRef(0)

  const load = useCallback(
    (targetDate: string, updateLoading: boolean) => {
      const currentRequestId = ++requestId.current
      if (updateLoading) {
        setIsLoading(true)
        setHasError(false)
      }

      return fetchUdharState(targetDate).then(
        ([dailyEntries, dailySettlements, nextTotals, nextBalances]) => {
          if (
            currentDate.current === targetDate &&
            currentRequestId === requestId.current
          ) {
            setEntries(dailyEntries)
            setSettlements(dailySettlements)
            setTotals(nextTotals)
            setBalances(nextBalances)
            setLoadedDate(targetDate)
            setIsLoading(false)
            setHasError(false)
          }
          return dailyEntries
        },
        (error: unknown) => {
          if (
            currentDate.current === targetDate &&
            currentRequestId === requestId.current
          ) {
            setIsLoading(false)
            setHasError(true)
            setLoadedDate(targetDate)
          }
          throw error
        },
      )
    },
    [],
  )

  useEffect(() => {
    currentDate.current = date
    const currentRequestId = ++requestId.current
    void fetchUdharState(date).then(
      ([dailyEntries, dailySettlements, nextTotals, nextBalances]) => {
        if (
          currentDate.current !== date ||
          currentRequestId !== requestId.current
        ) {
          return
        }
        setEntries(dailyEntries)
        setSettlements(dailySettlements)
        setTotals(nextTotals)
        setBalances(nextBalances)
        setLoadedDate(date)
        setIsLoading(false)
        setHasError(false)
      },
      () => {
        if (
          currentDate.current !== date ||
          currentRequestId !== requestId.current
        ) {
          return
        }
        setIsLoading(false)
        setHasError(true)
        setLoadedDate(date)
      },
    )
  }, [date])

  const refresh = useCallback(
    (targetDate = date) => load(targetDate, targetDate === currentDate.current),
    [date, load],
  )

  const isCurrentDateLoaded = loadedDate === date
  return {
    entries: isCurrentDateLoaded ? entries : [],
    settlements: isCurrentDateLoaded ? settlements : [],
    totals,
    balances,
    isLoading: isLoading || !isCurrentDateLoaded,
    hasError: isCurrentDateLoaded && hasError,
    refresh,
  }
}
