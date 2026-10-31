import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import { searchAll, type SearchCategory, type SearchResultItem } from '../services/searchService'

type SearchKey =
  | 'search'
  | 'searchPrompt'
  | 'searchPlaceholder'
  | 'searchClear'
  | 'searchNoResults'
  | 'searchLoading'
  | 'searchError'
  | 'searchCategoryNote'
  | 'searchCategoryMoneyIn'
  | 'searchCategoryMoneyOut'
  | 'searchCategoryUdhar'
  | 'searchCategoryTask'
  | 'retry'
  | 'back'
type SearchCopy = { [Key in SearchKey]: string }

interface SearchViewProps {
  copy: SearchCopy
  locale: 'hi' | 'en' | 'mr'
  query: string
  onQueryChange: (query: string) => void
  onClose: () => void
  onSelectResult: (date: string) => void
}

const categoryKey: Record<SearchCategory, SearchKey> = {
  NOTE: 'searchCategoryNote',
  MONEY_IN: 'searchCategoryMoneyIn',
  MONEY_OUT: 'searchCategoryMoneyOut',
  UDHAR: 'searchCategoryUdhar',
  TASK: 'searchCategoryTask',
}

function highlightSnippet(snippet: string, query: string) {
  const index = snippet
    .normalize('NFC')
    .toLocaleLowerCase()
    .indexOf(query.normalize('NFC').trim().toLocaleLowerCase())
  if (index < 0 || query.trim() === '') return snippet
  return (
    <>
      {snippet.slice(0, index)}
      <mark className="rounded bg-[#F7E7A8] px-0.5 text-diary-text">
        {snippet.slice(index, index + query.trim().length)}
      </mark>
      {snippet.slice(index + query.trim().length)}
    </>
  )
}

function formatResultDate(date: string, locale: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function SearchView({
  copy,
  locale,
  query,
  onQueryChange,
  onClose,
  onSelectResult,
}: SearchViewProps) {
  const [searchState, setSearchState] = useState<{
    query: string
    attempt: number
    status: 'loading' | 'success' | 'error'
    results: SearchResultItem[]
  } | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.normalize('NFC').trim()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (normalizedQuery === '') return
    let active = true
    const timer = setTimeout(() => {
      setSearchState({
        query: normalizedQuery,
        attempt: retryCount,
        status: 'loading',
        results: [],
      })
      void searchAll(normalizedQuery).then(
        (nextResults) => {
          if (!active) return
          setSearchState({
            query: normalizedQuery,
            attempt: retryCount,
            status: 'success',
            results: nextResults,
          })
        },
        () => {
          if (!active) return
          setSearchState({
            query: normalizedQuery,
            attempt: retryCount,
            status: 'error',
            results: [],
          })
        },
      )
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [normalizedQuery, retryCount])
  const isCurrentSearch =
    searchState?.query === normalizedQuery &&
    searchState.attempt === retryCount
  const isLoading =
    normalizedQuery !== '' &&
    (!isCurrentSearch || searchState.status === 'loading')
  const hasError =
    isCurrentSearch && searchState.status === 'error'
  const results =
    isCurrentSearch && searchState.status === 'success'
      ? searchState.results
      : []

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  const dateLocale = locale === 'mr'
    ? 'mr-IN'
    : locale === 'en'
      ? 'en-IN'
      : 'hi-IN'

  return (
    <div
      className="dialog-backdrop items-stretch justify-center p-0 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-title"
        className="flex h-[100dvh] w-full max-w-[680px] flex-col bg-diary-bg p-4 sm:h-[min(90dvh,760px)] sm:rounded-2xl sm:border sm:border-diary-border sm:bg-white sm:p-5"
      >
        <div className="flex min-h-11 items-center gap-2">
          <button
            type="button"
            aria-label={copy.back}
            onClick={onClose}
            className="icon-button shrink-0"
          >
            <ArrowLeft size={21} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <h1 id="search-title" className="text-lg font-semibold text-diary-text">
            {copy.search}
          </h1>
        </div>
        <form onSubmit={submit} className="mt-4">
          <label className="flex min-h-12 items-center gap-2 rounded-xl border border-diary-border bg-white px-3 focus-within:border-diary-primary">
            <Search size={20} className="shrink-0 text-diary-muted" strokeWidth={1.75} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.search}
              className="min-w-0 flex-1 bg-transparent py-2 text-base text-diary-text outline-none"
            />
            {query !== '' && (
              <button
                type="button"
                aria-label={copy.searchClear}
                onClick={() => onQueryChange('')}
                className="icon-button shrink-0"
              >
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </label>
        </form>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {normalizedQuery === '' ? (
            <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-diary-muted">
              {copy.searchPrompt}
            </p>
          ) : isLoading ? (
            <p role="status" className="py-8 text-center text-sm text-diary-muted">
              {copy.searchLoading}
            </p>
          ) : hasError ? (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 text-sm text-red-700">
              <span>{copy.searchError}</span>
              <button
                type="button"
                onClick={() => setRetryCount((count) => count + 1)}
                className="min-h-11 shrink-0 rounded-lg px-3 font-semibold underline underline-offset-2"
              >
                {copy.retry}
              </button>
            </div>
          ) : results.length === 0 ? (
            <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-diary-muted">
              {copy.searchNoResults}
            </p>
          ) : (
            <ul className="divide-y divide-diary-border overflow-hidden rounded-xl border border-diary-border bg-white">
              {results.map((result) => (
                <li key={`${result.category}:${result.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelectResult(result.date)}
                    className="flex min-h-[76px] w-full items-start gap-3 px-3 py-3 text-left hover:bg-diary-bg focus-visible:relative focus-visible:outline"
                  >
                    <span className={`mt-0.5 max-w-24 shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                      result.category === 'NOTE'
                        ? 'bg-diary-selected text-diary-primary'
                        : result.category === 'MONEY_OUT'
                          ? 'bg-[#F7EAE5] text-[#9A5A45]'
                          : result.category === 'MONEY_IN'
                            ? 'bg-diary-selected text-diary-primary'
                            : result.category === 'UDHAR'
                              ? 'bg-[#F7F1E7] text-[#80643B]'
                              : 'bg-[#EEF0F4] text-[#596579]'
                    }`}>
                      {copy[categoryKey[result.category]]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-diary-text">
                        {highlightSnippet(result.title, normalizedQuery)}
                      </span>
                      {result.snippet !== result.title && (
                        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-diary-muted">
                          {highlightSnippet(result.snippet, normalizedQuery)}
                        </span>
                      )}
                    </span>
                    <time className="shrink-0 pt-1 text-[11px] text-diary-muted">
                      {formatResultDate(result.date, dateLocale)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
