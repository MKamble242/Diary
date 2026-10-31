# Diary

A lightweight daily diary foundation built with React, TypeScript, Vite, and Tailwind CSS.

## Development

```sh
npm install
npm run dev
```

## Verification

```sh
npm run lint
npm run build
```

## Implemented

- Hindi, English, and Marathi onboarding and Today screen.
- Daily notes, money entries, tasks, people, Udhar entries, settlements, FIFO allocations, and the optional PIN verifier are stored locally in IndexedDB (`diary_local_db`, schema version 7), using device-local dates.
- Notes are limited to 2,000 characters and autosave after a 700 ms debounce. Write failures keep the draft available for retry.
- Direct cash-in and cash-out entries are stored as integer paise, with date-scoped totals, editing, confirmed deletion, and a 10-second undo.
- Tasks support completion, text editing, postponement, quick deletion with a 10-second undo, and Today-only overdue carry-forward without changing their scheduled dates.
- Tasks are limited to 160 characters and can be scheduled up to 365 days ahead. A numeric completion index supports IndexedDB queries while the application-facing completion value remains boolean.
- Udhar entries link to reusable person records and contribute to daily cash in/out and overall receivable/payable balances without creating duplicate money entries.
- Udhar entries support editing, deletion with a 10-second undo, name autocomplete, and dates up to 365 days ahead.
- Repayments are atomically allocated FIFO to eligible Udhar principals. Outstanding balances reflect allocations; principals with repayments cannot be deleted or changed until those repayments are removed. Settlements can be deleted and restored with a 10-second undo.
- The calendar reads month activity for notes, cash, Udhar, repayments, and tasks without modifying stored records. It supports backdated dates and limits future navigation and selection to 365 days ahead.
- Offline search covers notes, money, Udhar, repayments, tasks, and amounts. Monthly summaries show cash movement, monthly Udhar activity, current outstanding balances, note days, semantic transaction counts, and task completion counts.
- Language, text-size, and onboarding preferences are stored in local storage.
- Settings can export all seven IndexedDB stores to a portable JSON backup, restore valid records with duplicate skipping and conflict reporting, and clear only Diary-owned local data after explicit confirmation.
- First-launch users can restore directly from a backup. A dismissible reminder appears when meaningful data has not been backed up for more than seven days; dismissal lasts 30 days.
- An optional six-digit PIN uses a salted PBKDF2-SHA-256 verifier in the separate `app_security` store. It locks on startup and when returning to a suspended tab, rate-limits five failed attempts for 30 seconds, and is never included in portable backups. The PIN is a casual privacy gate, not data encryption; forgotten-PIN reset clears Diary data and verifier together.
- Production builds include an installable web manifest, scalable 192px/512px app icons, and a versioned offline service worker for cached app shell and static assets. Updates are announced with an in-app prompt; service workers are registered only in production on secure contexts or localhost.
- Viewport-fit, dynamic viewport sizing, modal/sheet safe-area padding, minimum-size controls, and reduced-motion behavior are included for mobile accessibility.
