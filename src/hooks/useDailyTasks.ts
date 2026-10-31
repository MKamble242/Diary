import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  getTasksForDate,
  type Task,
  type TasksForDate,
} from '../services/taskService'

const EMPTY_TASKS: TasksForDate = { current: [], overdue: [] }

export function useDailyTasks(date: string, today: string) {
  const [tasks, setTasks] = useState<TasksForDate>(EMPTY_TASKS)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const currentDate = useRef(date)
  const cache = useRef(new Map<string, TasksForDate>())
  const requestIds = useRef(new Map<string, number>())
  const isViewingToday = date === today

  const nextRequestId = useCallback((key: string) => {
    const requestId = (requestIds.current.get(key) ?? 0) + 1
    requestIds.current.set(key, requestId)
    return requestId
  }, [])

  useLayoutEffect(() => {
    currentDate.current = date
  }, [date])

  const refresh = useCallback(
    (targetDate = date) => {
      const targetIsToday = targetDate === today
      const key = `${targetDate}:${targetIsToday}`
      const requestId = nextRequestId(key)
      if (targetDate === currentDate.current) {
        setIsLoading(true)
        setHasError(false)
      }

      return getTasksForDate(targetDate, targetIsToday).then(
        (records) => {
          cache.current.set(key, records)
          if (
            targetDate === currentDate.current &&
            requestId === requestIds.current.get(key)
          ) {
            setTasks(records)
            setIsLoading(false)
            setHasError(false)
          }
          return records
        },
        (error: unknown) => {
          if (
            targetDate === currentDate.current &&
            requestId === requestIds.current.get(key)
          ) {
            setIsLoading(false)
            setHasError(true)
          }
          throw error
        },
      )
    },
    [date, nextRequestId, today],
  )

  useEffect(() => {
    let active = true
    const key = `${date}:${isViewingToday}`
    const cachedTasks = cache.current.get(key)
    if (cachedTasks !== undefined) {
      setTasks(cachedTasks)
      setIsLoading(false)
      setHasError(false)
    } else {
      setTasks(EMPTY_TASKS)
      setIsLoading(true)
      setHasError(false)
    }

    const requestId = nextRequestId(key)
    void getTasksForDate(date, isViewingToday).then(
      (records) => {
        cache.current.set(key, records)
        if (!active || requestId !== requestIds.current.get(key)) return
        setTasks(records)
        setIsLoading(false)
        setHasError(false)
      },
      () => {
        if (!active || requestId !== requestIds.current.get(key)) return
        setIsLoading(false)
        setHasError(true)
      },
    )
    return () => {
      active = false
    }
  }, [date, isViewingToday, nextRequestId])

  const replaceTasks = useCallback((targetDate: string, records: TasksForDate) => {
    cache.current.set(`${targetDate}:${targetDate === today}`, records)
    if (currentDate.current === targetDate) {
      setTasks(records)
      setIsLoading(false)
      setHasError(false)
    }
  }, [today])

  const allTasks = [...tasks.overdue, ...tasks.current]
  const taskMap = new Map<string, Task>(
    allTasks.map((task) => [task.id, task]),
  )

  return {
    tasks,
    taskMap,
    allTasks,
    isLoading,
    hasError,
    refresh,
    replaceTasks,
  }
}
