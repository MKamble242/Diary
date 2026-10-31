import { useRef, useState } from 'react'
import { ChevronLeft, Download, FileUp, RotateCcw, X } from 'lucide-react'
import type { Locale } from '../i18n'
import type { BackupStatus, ImportResult, TextSize } from '../services/backupService'

const languageNames: Record<Locale, string> = {
  hi: 'हिंदी',
  en: 'English',
  mr: 'मराठी',
}

interface SettingsCopy {
  settings: string
  settingsLanguage: string
  settingsTextSize: string
  textNormal: string
  textLarge: string
  textVeryLarge: string
  backupSecurity: string
  lastBackup: string
  noBackup: string
  backupNow: string
  restoreBackup: string
  privacyAbout: string
  privacyStatement: string
  accountingDisclaimer: string
  resetData: string
  backupBeforeReset: string
  resetContinue: string
  resetConfirmTitle: string
  resetConfirm: string
  backupImportResult: string
  importAdded: string
  importSkipped: string
  importConflicts: string
  importTotal: string
  backupError: string
  importError: string
  resetError: string
  backupStatusError: string
  pinSection: string
  pinEnabled: string
  pinDisabled: string
  pinSet: string
  pinChange: string
  pinRemove: string
  pinCurrent: string
  pinNew: string
  pinConfirm: string
  pinMismatch: string
  pinInvalid: string
  pinIncorrect: string
  pinPrivacyDisclaimer: string
  pinSetSuccess: string
  pinChangeSuccess: string
  pinRemoved: string
  save: string
  close: string
  cancel: string
}

type PinDialogMode = 'set' | 'change' | 'remove'

interface SettingsViewProps {
  copy: SettingsCopy
  locale: Locale
  textSize: TextSize
  backupStatus: BackupStatus | null
  statusError: boolean
  pinEnabled: boolean
  onLocaleChange: (locale: Locale) => void
  onTextSizeChange: (size: TextSize) => void
  onCreateBackup: () => Promise<unknown>
  onRestoreBackup: (file: File) => Promise<ImportResult>
  onImportDismiss: () => void
  onReset: () => Promise<void>
  onPinSetup: (pin: string) => Promise<void>
  onPinChange: (currentPin: string, newPin: string) => Promise<boolean>
  onPinRemove: (currentPin: string) => Promise<boolean>
  onPinEnabledChange: (enabled: boolean) => void
  onClose: () => void
}

const textSizes: { value: TextSize; label: keyof SettingsCopy }[] = [
  { value: '100', label: 'textNormal' },
  { value: '115', label: 'textLarge' },
  { value: '130', label: 'textVeryLarge' },
]

function formatBackupDate(timestamp: string, locale: Locale) {
  return new Intl.DateTimeFormat(
    locale === 'hi' ? 'hi-IN' : locale === 'mr' ? 'mr-IN' : 'en-IN',
    { day: 'numeric', month: 'long', year: 'numeric' },
  ).format(new Date(timestamp))
}

export function SettingsView({
  copy,
  locale,
  textSize,
  backupStatus,
  statusError,
  pinEnabled,
  onLocaleChange,
  onTextSizeChange,
  onCreateBackup,
  onRestoreBackup,
  onImportDismiss,
  onReset,
  onPinSetup,
  onPinChange,
  onPinRemove,
  onPinEnabledChange,
  onClose,
}: SettingsViewProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0)
  const [pinDialog, setPinDialog] = useState<PinDialogMode | null>(null)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinMessage, setPinMessage] = useState('')

  async function createBackup() {
    setError('')
    setIsWorking(true)
    try {
      await onCreateBackup()
    } catch (error) {
      setError(error instanceof Error ? error.message : copy.backupError)
    } finally {
      setIsWorking(false)
    }
  }

  async function importBackup(file: File | undefined) {
    if (file === undefined) return
    setError('')
    setIsWorking(true)
    try {
      setImportResult(await onRestoreBackup(file))
    } catch (error) {
      setError(error instanceof Error ? error.message : copy.importError)
    } finally {
      setIsWorking(false)
      if (fileInput.current !== null) fileInput.current.value = ''
    }
  }

  async function resetData() {
    setError('')
    setIsWorking(true)
    try {
      await onReset()
    } catch (error) {
      setError(error instanceof Error ? error.message : copy.resetError)
      setResetStep(0)
    } finally {
      setIsWorking(false)
    }
  }

  function closePinDialog() {
    setPinDialog(null)
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setPinError('')
  }

  async function submitPinDialog() {
    setPinError('')
    setPinMessage('')
    if (pinDialog === null) return
    if (pinDialog !== 'remove' && !/^\d{6}$/.test(newPin)) {
      setPinError(copy.pinInvalid)
      return
    }
    if (pinDialog !== 'remove' && confirmPin !== newPin) {
      setPinError(copy.pinMismatch)
      return
    }
    if (pinDialog !== 'set' && !/^\d{6}$/.test(currentPin)) {
      setPinError(copy.pinInvalid)
      return
    }

    setIsWorking(true)
    try {
      if (pinDialog === 'set') {
        await onPinSetup(newPin)
        onPinEnabledChange(true)
        closePinDialog()
        return
      }
      if (pinDialog === 'change') {
        const changed = await onPinChange(currentPin, newPin)
        if (!changed) {
          setPinError(copy.pinIncorrect)
          return
        }
        setPinMessage(copy.pinChangeSuccess)
      } else {
        const removed = await onPinRemove(currentPin)
        if (!removed) {
          setPinError(copy.pinIncorrect)
          return
        }
        onPinEnabledChange(false)
        setPinMessage(copy.pinRemoved)
      }
      closePinDialog()
    } catch (failure) {
      setPinError(failure instanceof Error ? failure.message : copy.pinIncorrect)
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <div className="dialog-backdrop !items-stretch !p-0">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="flex h-full w-full max-w-[680px] flex-col overflow-hidden bg-diary-bg shadow-xl sm:my-6 sm:h-[min(90dvh,820px)] sm:rounded-2xl"
      >
        <header className="flex items-center gap-3 border-b border-diary-border bg-diary-surface px-4 py-3">
          <button
            type="button"
            aria-label={copy.close}
            onClick={onClose}
            className="icon-button"
          >
            <ChevronLeft size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <h2 id="settings-title" className="flex-1 text-lg font-semibold text-diary-text">
            {copy.settings}
          </h2>
          <button
            type="button"
            aria-label={copy.close}
            onClick={onClose}
            className="icon-button"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto grid max-w-[560px] gap-5">
            <section className="rounded-2xl border border-diary-border bg-diary-surface p-4">
              <h3 className="font-semibold text-diary-text">{copy.settingsLanguage}</h3>
              <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={copy.settingsLanguage}>
                {(['hi', 'en', 'mr'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={locale === option}
                    onClick={() => onLocaleChange(option)}
                    className={`min-h-11 rounded-xl border px-2 text-sm font-medium ${
                      locale === option
                        ? 'border-diary-primary bg-diary-selected text-diary-primary'
                        : 'border-diary-border text-diary-muted'
                    }`}
                  >
                    {languageNames[option]}
                  </button>
                ))}
              </div>

              <h3 className="mt-5 font-semibold text-diary-text">{copy.settingsTextSize}</h3>
              <div className="mt-3 grid gap-2">
                {textSizes.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={textSize === value}
                    onClick={() => onTextSizeChange(value)}
                    className={`flex min-h-11 items-center justify-between rounded-xl border px-3 text-left text-sm ${
                      textSize === value
                        ? 'border-diary-primary bg-diary-selected text-diary-primary'
                        : 'border-diary-border text-diary-text'
                    }`}
                  >
                    <span>{copy[label]}</span>
                    <span aria-hidden="true">{textSize === value ? '●' : '○'}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-diary-border bg-diary-surface p-4">
              <h3 className="font-semibold text-diary-text">{copy.backupSecurity}</h3>
              <p className="mt-3 text-sm text-diary-muted">
                {copy.lastBackup}:{' '}
                {statusError
                  ? copy.backupStatusError
                  : backupStatus?.lastBackupTimestamp
                    ? formatBackupDate(backupStatus.lastBackupTimestamp, locale)
                    : copy.noBackup}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => void createBackup()}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-diary-primary px-4 text-sm font-semibold text-white hover:bg-diary-primary-pressed disabled:opacity-60"
                >
                  <Download size={18} strokeWidth={1.75} aria-hidden="true" />
                  {copy.backupNow}
                </button>
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => fileInput.current?.click()}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-diary-border px-4 text-sm font-semibold text-diary-text hover:bg-diary-selected disabled:opacity-60"
                >
                  <FileUp size={18} strokeWidth={1.75} aria-hidden="true" />
                  {copy.restoreBackup}
                </button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label={copy.restoreBackup}
                onChange={(event) => void importBackup(event.currentTarget.files?.[0])}
              />
            </section>

            <section className="rounded-2xl border border-diary-border bg-diary-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-diary-text">{copy.pinSection}</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    pinEnabled
                      ? 'bg-diary-selected text-diary-primary'
                      : 'bg-diary-bg text-diary-muted'
                  }`}
                >
                  {pinEnabled ? copy.pinEnabled : copy.pinDisabled}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-diary-muted">
                {copy.pinPrivacyDisclaimer}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPinDialog(pinEnabled ? 'change' : 'set')}
                  className="min-h-11 rounded-xl border border-diary-border px-3 text-sm font-semibold text-diary-text hover:bg-diary-selected"
                >
                  {pinEnabled ? copy.pinChange : copy.pinSet}
                </button>
                {pinEnabled && (
                  <button
                    type="button"
                    onClick={() => setPinDialog('remove')}
                    className="min-h-11 rounded-xl border border-diary-border px-3 text-sm font-semibold text-diary-text hover:bg-diary-selected"
                  >
                    {copy.pinRemove}
                  </button>
                )}
              </div>
              {pinMessage !== '' && (
                <p role="status" className="mt-3 text-sm text-diary-primary">{pinMessage}</p>
              )}
            </section>

            <section className="rounded-2xl border border-diary-border bg-diary-surface p-4">
              <h3 className="font-semibold text-diary-text">{copy.privacyAbout}</h3>
              <p className="mt-2 text-sm leading-6 text-diary-muted">{copy.privacyStatement}</p>
              <p className="mt-2 text-sm leading-6 text-diary-muted">{copy.accountingDisclaimer}</p>
            </section>

            <section className="rounded-2xl border border-red-200 bg-white p-4">
              <h3 className="font-semibold text-diary-text">{copy.resetData}</h3>
              <button
                type="button"
                onClick={() => setResetStep(1)}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                <RotateCcw size={17} strokeWidth={1.75} aria-hidden="true" />
                {copy.resetData}
              </button>
            </section>

            {(error || statusError) && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {error || copy.backupStatusError}
              </p>
            )}
          </div>
        </div>
      </section>

      {importResult !== null && (
        <div className="dialog-backdrop !z-[60]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-result-title"
            className="dialog-card"
          >
            <h2 id="backup-result-title" className="text-lg font-semibold text-diary-text">
              {copy.backupImportResult}
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                [copy.importAdded, importResult.added],
                [copy.importSkipped, importResult.skipped],
                [copy.importConflicts, importResult.conflicts],
                [copy.importTotal, importResult.total],
              ].map(([label, count]) => (
                <div key={String(label)} className="rounded-xl bg-diary-bg p-3">
                  <dt className="text-diary-muted">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-diary-text">{count}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              onClick={() => {
                setImportResult(null)
                onImportDismiss()
              }}
              className="mt-5 min-h-11 w-full rounded-xl bg-diary-primary px-4 font-semibold text-white"
            >
              {copy.close}
            </button>
          </section>
        </div>
      )}

      {resetStep !== 0 && (
        <div className="dialog-backdrop !z-[60]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            className="dialog-card"
          >
            <h2 id="reset-title" className="text-lg font-semibold text-diary-text">
              {resetStep === 1 ? copy.resetData : copy.resetConfirmTitle}
            </h2>
            <p className="mt-3 text-sm leading-6 text-diary-muted">
              {copy.backupBeforeReset}
            </p>
            <div className="mt-5 grid gap-2">
              {resetStep === 1 ? (
                <>
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => setResetStep(2)}
                    className="min-h-11 rounded-xl bg-diary-primary px-4 font-semibold text-white"
                  >
                    {copy.resetContinue}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetStep(0)}
                    className="min-h-11 rounded-xl border border-diary-border px-4 font-semibold text-diary-text"
                  >
                    {copy.cancel}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => void resetData()}
                    className="min-h-11 rounded-xl bg-red-700 px-4 font-semibold text-white disabled:opacity-60"
                  >
                    {copy.resetConfirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetStep(0)}
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

      {pinDialog !== null && (
        <div className="dialog-backdrop !z-[60]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pin-settings-title"
            className="dialog-card"
          >
            <h2 id="pin-settings-title" className="text-lg font-semibold text-diary-text">
              {pinDialog === 'set'
                ? copy.pinSet
                : pinDialog === 'change'
                  ? copy.pinChange
                  : copy.pinRemove}
            </h2>
            <div className="mt-4 grid gap-3">
              {pinDialog !== 'set' && (
                <label className="grid gap-2 text-sm font-medium text-diary-text">
                  {copy.pinCurrent}
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    maxLength={6}
                    value={currentPin}
                    onChange={(event) =>
                      setCurrentPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="min-h-12 rounded-xl border border-diary-border bg-diary-bg px-3 text-center text-xl tracking-[0.4em]"
                  />
                </label>
              )}
              {pinDialog !== 'remove' && (
                <>
                  <label className="grid gap-2 text-sm font-medium text-diary-text">
                    {copy.pinNew}
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={6}
                      value={newPin}
                      onChange={(event) =>
                        setNewPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))
                      }
                      className="min-h-12 rounded-xl border border-diary-border bg-diary-bg px-3 text-center text-xl tracking-[0.4em]"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-diary-text">
                    {copy.pinConfirm}
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={6}
                      value={confirmPin}
                      onChange={(event) =>
                        setConfirmPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))
                      }
                      className="min-h-12 rounded-xl border border-diary-border bg-diary-bg px-3 text-center text-xl tracking-[0.4em]"
                    />
                  </label>
                </>
              )}
            </div>
            {pinError !== '' && (
              <p role="alert" className="mt-3 text-sm text-red-700">{pinError}</p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isWorking}
                onClick={closePinDialog}
                className="min-h-12 rounded-xl border border-diary-border px-3 font-semibold text-diary-text"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={isWorking}
                onClick={() => void submitPinDialog()}
                className={`min-h-12 rounded-xl px-3 font-semibold text-white disabled:opacity-60 ${
                  pinDialog === 'remove' ? 'bg-red-700' : 'bg-diary-primary'
                }`}
              >
                {pinDialog === 'remove' ? copy.pinRemove : copy.save}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
