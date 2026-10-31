import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MAX_NOTE_LENGTH, NoteRepository } from '../db/indexedDb'

export type NoteSaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error'

const SAVE_DEBOUNCE_MS = 700

export function useDailyNote(date: string) {
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<NoteSaveStatus>('loading')
  const [readyDate, setReadyDate] = useState<string | null>(null)
  const currentDate = useRef(date)
  const draftByDate = useRef(new Map<string, string>())
  const dirtyDates = useRef(new Set<string>())
  const pendingDates = useRef(new Set<string>())
  const persistedDates = useRef(new Set<string>())
  const errorDates = useRef(new Set<string>())
  const saveVersionByDate = useRef(new Map<string, number>())
  const savePromises = useRef(new Map<string, Promise<unknown>>())
  const debounceTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  )

  useLayoutEffect(() => {
    currentDate.current = date
  }, [date])

  const save = useCallback((targetDate: string, draft: string) => {
    const version = (saveVersionByDate.current.get(targetDate) ?? 0) + 1
    saveVersionByDate.current.set(targetDate, version)
    dirtyDates.current.delete(targetDate)
    pendingDates.current.add(targetDate)
    if (currentDate.current === targetDate) setStatus('saving')

    const savePromise = NoteRepository.saveNote(targetDate, draft)
    savePromises.current.set(targetDate, savePromise)
    void savePromise.then(
      () => {
        if (savePromises.current.get(targetDate) === savePromise) {
          savePromises.current.delete(targetDate)
        }
        if (saveVersionByDate.current.get(targetDate) !== version) return
        pendingDates.current.delete(targetDate)
        dirtyDates.current.delete(targetDate)
        errorDates.current.delete(targetDate)
        persistedDates.current.add(targetDate)
        if (currentDate.current === targetDate) setStatus('saved')
      },
      () => {
        if (savePromises.current.get(targetDate) === savePromise) {
          savePromises.current.delete(targetDate)
        }
        if (saveVersionByDate.current.get(targetDate) !== version) return
        pendingDates.current.delete(targetDate)
        dirtyDates.current.add(targetDate)
        errorDates.current.add(targetDate)
        if (currentDate.current === targetDate) setStatus('error')
      },
    )
    return savePromise
  }, [])

  useEffect(() => {
    let active = true
    const drafts = draftByDate.current
    const dirty = dirtyDates.current
    const timers = debounceTimers.current
    const cachedDraft = draftByDate.current.get(date)

    if (cachedDraft !== undefined) {
      setContent(cachedDraft)
      setReadyDate(date)
      setStatus(
        errorDates.current.has(date)
          ? 'error'
          : dirtyDates.current.has(date) || pendingDates.current.has(date)
            ? 'saving'
            : persistedDates.current.has(date)
              ? 'saved'
              : 'idle',
      )
    } else {
      setContent('')
      setReadyDate(null)
      setStatus('loading')
      void NoteRepository.getNoteByDate(date).then(
        (note) => {
          if (!active) return
          const loadedContent = note?.content ?? ''
          draftByDate.current.set(date, loadedContent)
          if (note === null) persistedDates.current.delete(date)
          else persistedDates.current.add(date)
          setContent(loadedContent)
          setReadyDate(date)
          setStatus(note === null ? 'idle' : 'saved')
        },
        () => {
          if (!active) return
          setStatus('error')
          errorDates.current.add(date)
        },
      )
    }

    return () => {
      active = false
      const timer = timers.get(date)
      if (timer !== undefined) {
        clearTimeout(timer)
        timers.delete(date)
      }
      if (dirty.has(date)) {
        const draft = drafts.get(date)
        if (draft !== undefined) save(date, draft)
      }
    }
  }, [date, save])

  const updateContent = useCallback(
    (nextContent: string) => {
      if (readyDate !== date || nextContent.length > MAX_NOTE_LENGTH) return

      draftByDate.current.set(date, nextContent)
      dirtyDates.current.add(date)
      errorDates.current.delete(date)
      setContent(nextContent)
      setStatus('saving')

      const timers = debounceTimers.current
      const previousTimer = timers.get(date)
      if (previousTimer !== undefined) clearTimeout(previousTimer)
      const timer = setTimeout(() => {
        timers.delete(date)
        save(date, nextContent)
      }, SAVE_DEBOUNCE_MS)
      timers.set(date, timer)
    },
    [date, readyDate, save],
  )

  const flush = useCallback(() => {
    const timer = debounceTimers.current.get(date)
    if (timer !== undefined) {
      clearTimeout(timer)
      debounceTimers.current.delete(date)
    }
    if (dirtyDates.current.has(date)) {
      const draft = draftByDate.current.get(date)
      if (draft !== undefined) save(date, draft)
    }
  }, [date, save])

  const flushAndWait = useCallback(async () => {
    const timer = debounceTimers.current.get(date)
    if (timer !== undefined) {
      clearTimeout(timer)
      debounceTimers.current.delete(date)
    }
    if (dirtyDates.current.has(date)) {
      const draft = draftByDate.current.get(date)
      if (draft !== undefined) {
        await save(date, draft)
        return
      }
    }
    await savePromises.current.get(date)
  }, [date, save])

  const retry = useCallback(() => {
    if (readyDate !== date) {
      setStatus('loading')
      void NoteRepository.getNoteByDate(date).then(
        (note) => {
          if (currentDate.current !== date) return
          const loadedContent = note?.content ?? ''
          draftByDate.current.set(date, loadedContent)
          if (note === null) persistedDates.current.delete(date)
          else persistedDates.current.add(date)
          errorDates.current.delete(date)
          setContent(loadedContent)
          setReadyDate(date)
          setStatus(note === null ? 'idle' : 'saved')
        },
        () => {
          if (currentDate.current === date) setStatus('error')
        },
      )
      return
    }

    const draft = draftByDate.current.get(date) ?? content
    draftByDate.current.set(date, draft)
    dirtyDates.current.add(date)
    errorDates.current.delete(date)
    save(date, draft)
  }, [content, date, readyDate, save])

  const isReady = readyDate === date

  return {
    content: isReady ? content : '',
    status,
    isReady,
    updateContent,
    flush,
    flushAndWait,
    retry,
    characterLimit: MAX_NOTE_LENGTH,
  }
}
