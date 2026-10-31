import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { translations } from '../i18n'
import {
  formatMoney,
  HIGH_AMOUNT_CONFIRMATION_PAISE,
  MAX_MONEY_AMOUNT_PAISE,
  parseMoneyAmount,
} from '../services/moneyService'
import {
  MAX_UDHAR_DESCRIPTION_LENGTH,
  MAX_UDHAR_PERSON_NAME_LENGTH,
  searchPeople,
  type UdharEntry,
  type UdharEntryType,
  type UdharPerson,
  type NewUdharEntry,
} from '../services/udharService'

type UdharCopy = {
  [Key in keyof Pick<
    (typeof translations)['hi'],
    | 'close'
    | 'loanGiven'
    | 'loanTaken'
    | 'amount'
    | 'optionalDescription'
    | 'cancel'
    | 'save'
    | 'noteSaving'
    | 'highAmountWarning'
    | 'invalidAmount'
    | 'taskDateError'
    | 'udharSaveError'
    | 'personName'
    | 'personPlaceholder'
    | 'personNameError'
    | 'personSuggestions'
    | 'personDate'
  >]: string
}

interface UdharFormProps {
  copy: UdharCopy
  date: string
  maxDate: string
  type: UdharEntryType
  entry?: UdharEntry
  onCancel: () => void
  onSubmit: (entry: NewUdharEntry, id?: string) => Promise<UdharEntry>
}

function amountToInput(amountPaise: number) {
  const rupees = Math.floor(amountPaise / 100)
  const paise = amountPaise % 100
  return paise === 0 ? String(rupees) : `${rupees}.${String(paise).padStart(2, '0')}`
}

export function UdharForm({
  copy,
  date,
  maxDate,
  type,
  entry,
  onCancel,
  onSubmit,
}: UdharFormProps) {
  const [personName, setPersonName] = useState(entry?.personName ?? '')
  const [amount, setAmount] = useState(
    entry === undefined ? '' : amountToInput(entry.amountPaise),
  )
  const [description, setDescription] = useState(entry?.description ?? '')
  const [entryDate, setEntryDate] = useState(entry?.date ?? date)
  const [suggestions, setSuggestions] = useState<UdharPerson[]>([])
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [amountPaise, setAmountPaise] = useState(0)
  const nameInput = useRef<HTMLInputElement>(null)
  const submissionInProgress = useRef(false)
  const searchRequestId = useRef(0)
  const cacheSuggestionSelection = useRef(false)

  useEffect(() => {
    nameInput.current?.focus()
  }, [])

  useEffect(() => {
    const query = personName.trim()
    const currentRequestId = ++searchRequestId.current
    if (query === '' || cacheSuggestionSelection.current) {
      cacheSuggestionSelection.current = false
      setSuggestions([])
      return
    }

    const timer = setTimeout(() => {
      void searchPeople(query).then(
        (people) => {
          if (currentRequestId === searchRequestId.current) setSuggestions(people)
        },
        () => {
          if (currentRequestId === searchRequestId.current) {
            setSuggestions([])
            setError(copy.udharSaveError)
          }
        },
      )
    }, 180)
    return () => clearTimeout(timer)
  }, [copy.udharSaveError, personName])

  function changeAmount(value: string) {
    setAmount(value)
    try {
      setAmountPaise(parseMoneyAmount(value))
    } catch {
      setAmountPaise(0)
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
    if (parsedAmount > MAX_MONEY_AMOUNT_PAISE) {
      setError(copy.invalidAmount)
      return
    }
    if (personName.trim().length === 0 || personName.trim().length > MAX_UDHAR_PERSON_NAME_LENGTH) {
      setError(copy.personNameError)
      return
    }
    if (entryDate > maxDate) {
      setError(copy.taskDateError)
      return
    }

    submissionInProgress.current = true
    setIsSubmitting(true)
    try {
      await onSubmit(
        {
          personName: personName.trim(),
          type,
          amountPaise: parsedAmount,
          date: entryDate,
          ...(description.trim() !== '' ? { description: description.trim() } : {}),
        },
        entry?.id,
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
        aria-labelledby="udhar-form-title"
        className="dialog-card sheet-card money-form-sheet"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="udhar-form-title" className="text-lg font-semibold text-diary-text">
            {type === 'GIVEN' ? copy.loanGiven : copy.loanTaken}
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
          <div className="relative grid gap-2 text-sm font-medium text-diary-text">
            <label htmlFor="udhar-person-name">{copy.personName}</label>
            <input
              ref={nameInput}
              id="udhar-person-name"
              type="text"
              autoComplete="off"
              maxLength={MAX_UDHAR_PERSON_NAME_LENGTH}
              value={personName}
              onChange={(event) => {
                cacheSuggestionSelection.current = false
                setPersonName(event.target.value)
                setError('')
              }}
              placeholder={copy.personPlaceholder}
              aria-autocomplete="list"
              aria-controls="udhar-person-suggestions"
              className="min-h-12 rounded-xl border border-diary-border bg-white px-3 text-base font-normal"
              required
            />
            {suggestions.length > 0 && (
              <ul
                id="udhar-person-suggestions"
                role="listbox"
                aria-label={copy.personSuggestions}
                className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-xl border border-diary-border bg-white py-1 shadow-lg"
              >
                {suggestions.map((person) => (
                  <li key={person.id} role="option" aria-selected="false">
                    <button
                      type="button"
                      onClick={() => {
                        cacheSuggestionSelection.current = true
                        setPersonName(person.name)
                        setSuggestions([])
                      }}
                      className="min-h-11 w-full px-3 text-left text-sm hover:bg-diary-selected"
                    >
                      {person.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="grid gap-2 text-sm font-medium text-diary-text">
            {copy.amount}
            <div className="flex min-h-[62px] items-center gap-2 rounded-xl border border-diary-border bg-diary-bg px-4 focus-within:border-diary-primary">
              <span className="text-2xl text-diary-muted" aria-hidden="true">₹</span>
              <input
                aria-label={copy.amount}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => changeAmount(event.target.value)}
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
              {copy.highAmountWarning} ({formatMoney(amountPaise)})
            </p>
          )}
          <label className="grid gap-2 text-sm font-medium text-diary-text">
            {copy.optionalDescription}
            <input
              type="text"
              maxLength={MAX_UDHAR_DESCRIPTION_LENGTH}
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
