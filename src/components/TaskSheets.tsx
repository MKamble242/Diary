import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { translations } from '../i18n'
import {
  MAX_TASK_TEXT_LENGTH,
  validateTaskDate,
} from '../services/taskService'

type TaskCopy = {
  [Key in keyof Pick<
    (typeof translations)['hi'],
    | 'taskTextError'
    | 'taskDateError'
    | 'taskSaveError'
    | 'close'
    | 'taskSave'
    | 'taskLabel'
    | 'taskPlaceholder'
    | 'taskCounter'
    | 'scheduledDate'
    | 'cancel'
    | 'taskSaving'
    | 'taskEditTitle'
    | 'postpone'
    | 'updateTask'
    | 'deleteTask'
  >]: string
}

interface TaskFormProps {
  copy: TaskCopy
  selectedDate: string
  maxDate: string
  onCancel: () => void
  onSubmit: (text: string, scheduledDate: string) => Promise<unknown>
}

interface TaskEditorProps {
  copy: TaskCopy
  task: { text: string; scheduledDate: string }
  maxDate: string
  onCancel: () => void
  onSave: (text: string, scheduledDate: string) => Promise<void>
  onDelete: () => Promise<void>
}

export function TaskForm({
  copy,
  selectedDate,
  maxDate,
  onCancel,
  onSubmit,
}: TaskFormProps) {
  const [text, setText] = useState('')
  const [scheduledDate, setScheduledDate] = useState(selectedDate)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const taskInput = useRef<HTMLInputElement>(null)
  const submissionInProgress = useRef(false)

  useEffect(() => {
    taskInput.current?.focus()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionInProgress.current) return
    const trimmedText = text.trim()
    if (trimmedText.length === 0 || trimmedText.length > MAX_TASK_TEXT_LENGTH) {
      setError(copy.taskTextError)
      return
    }
    try {
      validateTaskDate(scheduledDate)
    } catch {
      setError(copy.taskDateError)
      return
    }

    submissionInProgress.current = true
    setIsSubmitting(true)
    setError('')
    try {
      await onSubmit(trimmedText, scheduledDate)
    } catch {
      setError(copy.taskSaveError)
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
        aria-labelledby="task-form-title"
        className="dialog-card sheet-card"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="task-form-title" className="text-lg font-semibold text-diary-text">
            {copy.taskSave}
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
            {copy.taskLabel}
            <input
              ref={taskInput}
              type="text"
              maxLength={MAX_TASK_TEXT_LENGTH}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={copy.taskPlaceholder}
              className="min-h-12 rounded-xl border border-diary-border bg-white px-3 text-base font-normal"
              required
            />
          </label>
          <p className="-mt-3 text-right text-xs text-diary-muted">
            {text.length}/{MAX_TASK_TEXT_LENGTH} {copy.taskCounter}
          </p>
          <label className="grid gap-2 text-sm font-medium text-diary-text">
            {copy.scheduledDate}
            <input
              type="date"
              value={scheduledDate}
              max={maxDate}
              onChange={(event) => setScheduledDate(event.target.value)}
              className="min-h-12 rounded-xl border border-diary-border bg-white px-3 text-base font-normal"
              required
            />
          </label>
          {error !== '' && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="min-h-12 rounded-xl border border-diary-border px-4 font-medium text-diary-text"
            >
              {copy.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-12 rounded-xl bg-diary-primary px-4 font-semibold text-white disabled:opacity-60"
            >
              {isSubmitting ? copy.taskSaving : copy.taskSave}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function TaskEditor({
  copy,
  task,
  maxDate,
  onCancel,
  onSave,
  onDelete,
}: TaskEditorProps) {
  const [text, setText] = useState(task.text)
  const [scheduledDate, setScheduledDate] = useState(task.scheduledDate)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const taskInput = useRef<HTMLInputElement>(null)
  const submissionInProgress = useRef(false)

  useEffect(() => {
    taskInput.current?.focus()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionInProgress.current) return
    const trimmedText = text.trim()
    if (trimmedText.length === 0 || trimmedText.length > MAX_TASK_TEXT_LENGTH) {
      setError(copy.taskTextError)
      return
    }
    try {
      validateTaskDate(scheduledDate)
    } catch {
      setError(copy.taskDateError)
      return
    }

    submissionInProgress.current = true
    setIsSubmitting(true)
    try {
      await onSave(trimmedText, scheduledDate)
    } catch {
      setError(copy.taskSaveError)
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
        aria-labelledby="task-editor-title"
        className="dialog-card sheet-card"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="task-editor-title" className="text-lg font-semibold text-diary-text">
            {copy.taskEditTitle}
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
            {copy.taskLabel}
            <input
              ref={taskInput}
              type="text"
              maxLength={MAX_TASK_TEXT_LENGTH}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-12 rounded-xl border border-diary-border bg-white px-3 text-base font-normal"
              required
            />
          </label>
          <p className="-mt-3 text-right text-xs text-diary-muted">
            {text.length}/{MAX_TASK_TEXT_LENGTH} {copy.taskCounter}
          </p>
          <label className="grid gap-2 text-sm font-medium text-diary-text">
            {copy.postpone}
            <input
              type="date"
              value={scheduledDate}
              max={maxDate}
              onChange={(event) => setScheduledDate(event.target.value)}
              className="min-h-12 rounded-xl border border-diary-border bg-white px-3 text-base font-normal"
              required
            />
          </label>
          {error !== '' && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-12 rounded-xl bg-diary-primary px-4 font-semibold text-white disabled:opacity-60"
          >
            {isSubmitting ? copy.taskSaving : copy.updateTask}
          </button>
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={isSubmitting}
            className="min-h-12 rounded-xl border border-[#D8B3A7] px-4 font-semibold text-[#9A5A45] disabled:opacity-60"
          >
            {copy.deleteTask}
          </button>
        </form>
      </section>
    </div>
  )
}
