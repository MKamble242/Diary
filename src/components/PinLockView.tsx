import { useEffect, useRef, useState, type FormEvent } from 'react'

interface PinLockCopy {
  appName: string
  pinUnlockInstruction: string
  pinForgot: string
  pinForgotWarning: string
  pinForgotConfirm: string
  pinResetConfirm: string
  pinInvalid: string
  pinIncorrect: string
  pinLockout: string
  pinStatusError: string
  pinUnlock: string
  pinKeypad: string
  pinBackspace: string
  pinClear: string
  noteSaving: string
  resetError: string
  cancel: string
}

interface PinLockViewProps {
  copy: PinLockCopy
  lockoutRemainingMs: number
  onVerify: (pin: string) => Promise<boolean>
  onForgotReset: () => Promise<void>
  onLockoutExpired: () => void
}

export function PinLockView({
  copy,
  lockoutRemainingMs,
  onVerify,
  onForgotReset,
  onLockoutExpired,
}: PinLockViewProps) {
  const [pin, setPin] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(lockoutRemainingMs)
  const [forgotStep, setForgotStep] = useState<0 | 1 | 2>(0)
  const [resetError, setResetError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (lockoutRemainingMs <= 0) return
    let remainingMs = lockoutRemainingMs
    const timer = window.setInterval(() => {
      remainingMs = Math.max(0, remainingMs - 1000)
      setRemaining(remainingMs)
      if (remainingMs === 0) {
        window.clearInterval(timer)
        onLockoutExpired()
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [lockoutRemainingMs, onLockoutExpired])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit(event?: FormEvent<HTMLFormElement>, submittedPin = pin) {
    event?.preventDefault()
    if (isSubmitting || remaining > 0) return
    if (!/^\d{6}$/.test(submittedPin)) {
      setError(copy.pinInvalid)
      return
    }
    setError('')
    setIsSubmitting(true)
    try {
      const valid = await onVerify(submittedPin)
      if (!valid) {
        setPin('')
        setError(copy.pinIncorrect)
        inputRef.current?.focus()
      }
    } catch {
      setError(copy.pinStatusError)
    } finally {
      setIsSubmitting(false)
    }
  }

  function updatePin(value: string) {
    const nextPin = value.replace(/\D/g, '').slice(0, 6)
    setPin(nextPin)
    setError('')
    if (nextPin.length === 6) void submit(undefined, nextPin)
  }

  async function resetFromForgottenPin() {
    setResetError('')
    setIsSubmitting(true)
    try {
      await onForgotReset()
    } catch (failure) {
      setResetError(failure instanceof Error ? failure.message : copy.resetError)
      setIsSubmitting(false)
      setForgotStep(0)
    }
  }

  return (
    <main className="pin-lock-screen">
      <section className="pin-lock-card">
        <div className="pin-lock-brand-mark" aria-hidden="true">D</div>
        <h1 className="font-brand text-[34px] font-semibold tracking-[-0.04em] text-diary-text">
          {copy.appName}
        </h1>
        <p className="mt-3 text-center text-base leading-7 text-diary-muted">
          {copy.pinUnlockInstruction}
        </p>

        <form className="mt-7 w-full" onSubmit={(event) => void submit(event)}>
          <div
            className={`pin-digits${error !== '' ? ' pin-error-shake' : ''}`}
            onClick={() => inputRef.current?.focus()}
          >
            {Array.from({ length: 6 }, (_value, index) => (
              <span
                key={index}
                className={`pin-digit${pin.length === index ? ' pin-digit-active' : ''}${pin.length > index ? ' pin-digit-filled' : ''}`}
                aria-hidden="true"
              >
                {pin.length > index ? '●' : ''}
              </span>
            ))}
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              aria-label={copy.pinUnlockInstruction}
              value={pin}
              disabled={isSubmitting || remaining > 0}
              onChange={(event) => updatePin(event.currentTarget.value)}
              className="pin-hidden-input"
            />
          </div>
          {remaining > 0 ? (
            <p role="status" className="mt-4 text-center text-sm font-medium text-amber-800">
              {copy.pinLockout.replace('{seconds}', String(Math.ceil(remaining / 1000)))}
            </p>
          ) : error !== '' ? (
            <p role="alert" className="mt-4 min-h-5 text-center text-sm font-medium text-red-700">
              {error}
            </p>
          ) : (
            <p aria-live="polite" className="mt-4 min-h-5 text-center text-sm text-diary-muted">
              {isSubmitting ? copy.noteSaving : ' '}
            </p>
          )}

          <div className="pin-keypad mt-5" aria-label={copy.pinKeypad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'backspace'].map((key) => (
              <button
                key={key}
                type="button"
                disabled={isSubmitting || remaining > 0}
                aria-label={
                  key === 'backspace'
                    ? copy.pinBackspace
                    : key === 'clear'
                      ? copy.pinClear
                      : `${key}`
                }
                onClick={() => {
                  if (key === 'backspace') updatePin(pin.slice(0, -1))
                  else if (key === 'clear') updatePin('')
                  else updatePin(`${pin}${key}`)
                }}
                className={`pin-key${key === 'clear' || key === 'backspace' ? ' pin-key-action' : ''}`}
              >
                {key === 'backspace' ? '⌫' : key === 'clear' ? copy.pinClear : key}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={isSubmitting || remaining > 0 || pin.length !== 6}
            className="mt-5 min-h-12 w-full rounded-xl bg-diary-primary px-4 font-semibold text-white hover:bg-diary-pressed disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copy.pinUnlock}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setForgotStep(1)}
          className="mt-3 min-h-11 rounded-lg px-3 text-sm font-semibold text-diary-primary underline underline-offset-2"
        >
          {copy.pinForgot}
        </button>
      </section>

      {forgotStep !== 0 && (
        <div className="dialog-backdrop !z-[70]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pin-forgot-title"
            className="dialog-card"
          >
            <h2 id="pin-forgot-title" className="text-lg font-semibold text-diary-text">
              {copy.pinForgot}
            </h2>
            <p className="mt-3 text-sm leading-6 text-diary-muted">
              {copy.pinForgotWarning}
            </p>
            {resetError !== '' && (
              <p role="alert" className="mt-3 text-sm text-red-700">{resetError}</p>
            )}
            <div className="mt-5 grid gap-2">
              {forgotStep === 1 ? (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setForgotStep(2)}
                    className="min-h-12 rounded-xl bg-diary-primary px-4 font-semibold text-white"
                  >
                    {copy.pinForgotConfirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotStep(0)}
                    className="min-h-11 rounded-xl border border-diary-border px-4 font-semibold text-diary-text"
                  >
                    {copy.cancel}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void resetFromForgottenPin()}
                    className="min-h-12 rounded-xl bg-red-700 px-4 font-semibold text-white disabled:opacity-60"
                  >
                    {copy.pinResetConfirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotStep(0)}
                    className="min-h-11 rounded-xl border border-diary-border px-4 font-semibold text-diary-text"
                  >
                    {copy.cancel}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
