import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { translations } from '../i18n'
import { formatMoney, parseMoneyAmount } from '../services/moneyService'
import type { UdharSettlementType } from '../services/udharService'

type SettlementCopy = {
  [Key in keyof Pick<
    (typeof translations)['hi'],
    | 'close'
    | 'amount'
    | 'optionalDescription'
    | 'cancel'
    | 'save'
    | 'noteSaving'
    | 'invalidAmount'
    | 'taskDateError'
    | 'udharSaveError'
    | 'personDate'
    | 'settlementReceived'
    | 'settlementPaid'
    | 'settlementFor'
    | 'settlementOutstanding'
  >]: string
}

interface SettlementFormProps {
  copy: SettlementCopy
  personName: string
  personId: string
  type: UdharSettlementType
  date: string
  maxDate: string
  outstandingPaise: number
  onCancel: () => void
  onSubmit: (
    personId: string,
    type: UdharSettlementType,
    amountPaise: number,
    date: string,
    description?: string,
  ) => Promise<void>
}

function amountToInput(amountPaise: number) {
  const rupees = Math.floor(amountPaise / 100)
  const paise = amountPaise % 100
  return paise === 0 ? String(rupees) : `${rupees}.${String(paise).padStart(2, '0')}`
}

export function SettlementForm({
  copy,
  personName,
  personId,
  type,
  date,
  maxDate,
  outstandingPaise,
  onCancel,
  onSubmit,
}: SettlementFormProps) {
  const [amount, setAmount] = useState(() => amountToInput(outstandingPaise))
  const [description, setDescription] = useState('')
  const [entryDate, setEntryDate] = useState(date)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const amountInput = useRef<HTMLInputElement>(null)
  const submissionInProgress = useRef(false)

  useEffect(() => {
    amountInput.current?.focus()
    amountInput.current?.select()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionInProgress.current) return
    let amountPaise: number
    try {
      amountPaise = parseMoneyAmount(amount)
    } catch {
      setError(copy.invalidAmount)
      return
    }
    if (amountPaise > outstandingPaise) {
      setError(copy.settlementOutstanding.replace('{amount}', formatMoney(outstandingPaise)))
      return
    }
    if (entryDate > maxDate) {
      setError(copy.taskDateError)
      return
    }

    submissionInProgress.current = true
    setIsSubmitting(true)
    setError('')
    try {
      await onSubmit(
        personId,
        type,
        amountPaise,
        entryDate,
        description.trim() || undefined,
      )
    } catch {
      setError(copy.udharSaveError)
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
        aria-labelledby="settlement-form-title"
        className="dialog-card sheet-card money-form-sheet"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="settlement-form-title" className="text-lg font-semibold text-diary-text">
              {type === 'RECEIVED'
                ? copy.settlementReceived
                : copy.settlementPaid}
            </h2>
            <p className="mt-1 text-sm text-diary-muted">
              {copy.settlementFor}: {personName}
            </p>
            <p className="mt-1 text-xs text-diary-muted">
              {copy.settlementOutstanding.replace('{amount}', formatMoney(outstandingPaise))}
            </p>
          </div>
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
                className="min-w-0 flex-1 bg-transparent text-2xl font-semibold text-diary-text outline-none"
                required
              />
            </div>
          </label>
          <label className="grid gap-2 text-sm font-medium text-diary-text">
            {copy.optionalDescription}
            <input
              type="text"
              maxLength={120}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-11 rounded-xl border border-diary-border bg-white px-3 text-base font-normal"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-diary-text">
            {copy.personDate}
            <input
              type="date"
              value={entryDate}
              max={maxDate}
              onChange={(event) => setEntryDate(event.target.value)}
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
              className="min-h-12 rounded-xl border border-diary-border px-4 font-medium text-diary-text disabled:opacity-60"
            >
              {copy.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-12 rounded-xl bg-diary-primary px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? copy.noteSaving : copy.save}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
