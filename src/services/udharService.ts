import {
  PEOPLE_STORE,
  UDHAR_ENTRIES_STORE,
  UDHAR_ALLOCATIONS_STORE,
  UDHAR_SETTLEMENTS_STORE,
  runDatabaseTransaction,
  runDatabaseTransactionOnStores,
} from '../db/indexedDb'
import { MAX_MONEY_AMOUNT_PAISE } from './moneyService'

export type UdharEntryType = 'GIVEN' | 'TAKEN'

export interface UdharPerson {
  id: string
  name: string
  normalizedName: string
  createdAt: string
  updatedAt: string
}

export interface UdharEntry {
  id: string
  personId: string
  personName: string
  type: UdharEntryType
  amountPaise: number
  date: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface NewUdharEntry {
  personName: string
  type: UdharEntryType
  amountPaise: number
  date: string
  description?: string
}

export interface UdharPersonBalance {
  personId: string
  personName: string
  receivablePaise: number
  payablePaise: number
  principals: UdharPrincipalBalance[]
}

export interface UdharPrincipalBalance {
  entry: UdharEntry
  remainingPaise: number
}

export type UdharSettlementType = 'RECEIVED' | 'PAID'

export interface UdharSettlement {
  id: string
  personId: string
  personName: string
  type: UdharSettlementType
  amountPaise: number
  date: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface UdharAllocation {
  id: string
  settlementId: string
  principalEntryId: string
  amountPaise: number
  createdAt: string
}

export interface DeletedUdharSettlement {
  settlement: UdharSettlement
  allocations: UdharAllocation[]
}

export interface UdharPersonBalanceDetails extends UdharPersonBalance {
  settlements: UdharSettlement[]
}

export interface UdharTotals {
  totalReceivablePaise: number
  totalPayablePaise: number
}

export const MAX_UDHAR_PERSON_NAME_LENGTH = 80
export const MAX_UDHAR_DESCRIPTION_LENGTH = 120
export const MAX_UDHAR_SETTLEMENT_AMOUNT_PAISE = MAX_MONEY_AMOUNT_PAISE
export const UDHAR_PRINCIPAL_ACTIVE_SETTLEMENTS_MESSAGE =
  'इस एंट्री से जुड़े पुनर्भुगतान मौजूद हैं। पहले उन्हें हटाएँ।'

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function createUuidV4() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function validateId(id: string) {
  if (!UUID_V4_PATTERN.test(id)) {
    throw new TypeError('Udhar IDs must be UUID v4 values.')
  }
}

function normalizePersonName(name: string) {
  if (typeof name !== 'string') throw new TypeError('Person name must be a string.')
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_UDHAR_PERSON_NAME_LENGTH) {
    throw new RangeError(
      `Person name must contain 1 to ${MAX_UDHAR_PERSON_NAME_LENGTH} characters.`,
    )
  }
  return { name: trimmed, normalizedName: trimmed.toLowerCase() }
}

function parseLocalDateKey(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (match === null) throw new TypeError('Date must use YYYY-MM-DD format.')

  const [year, month, day] = match.slice(1).map(Number)
  const parsedDate = new Date(0)
  parsedDate.setFullYear(year, month - 1, day)
  parsedDate.setHours(0, 0, 0, 0)
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    throw new TypeError('Date must be a valid calendar date.')
  }
  return parsedDate
}

function validateDate(date: string, enforceFutureLimit = true) {
  const parsedDate = parseLocalDateKey(date)
  if (!enforceFutureLimit) return

  const latestAllowedDate = new Date()
  latestAllowedDate.setHours(0, 0, 0, 0)
  latestAllowedDate.setDate(latestAllowedDate.getDate() + 365)
  if (parsedDate > latestAllowedDate) {
    throw new RangeError('Udhar entries cannot be more than 365 days in the future.')
  }
}

function validateEntryFields(entry: NewUdharEntry, enforceDateLimit = true) {
  normalizePersonName(entry.personName)
  validateDate(entry.date, enforceDateLimit)
  if (entry.type !== 'GIVEN' && entry.type !== 'TAKEN') {
    throw new TypeError('Udhar entry type must be GIVEN or TAKEN.')
  }
  if (
    !Number.isSafeInteger(entry.amountPaise) ||
    entry.amountPaise <= 0 ||
    entry.amountPaise > MAX_MONEY_AMOUNT_PAISE
  ) {
    throw new RangeError('Udhar amount must be valid positive paise.')
  }
  if (
    entry.description !== undefined &&
    (typeof entry.description !== 'string' ||
      entry.description.length > MAX_UDHAR_DESCRIPTION_LENGTH)
  ) {
    throw new RangeError(
      `Description cannot exceed ${MAX_UDHAR_DESCRIPTION_LENGTH} characters.`,
    )
  }
}

function getOrCreatePersonInTransaction(
  store: IDBObjectStore,
  name: string,
  onFound: (person: UdharPerson) => void,
) {
  const normalized = normalizePersonName(name)
  const request = store.index('by_name').getAll(normalized.normalizedName)
  request.onsuccess = () => {
    const matches = request.result as UdharPerson[]
    const existing = matches.find(
      (person) => person.normalizedName === normalized.normalizedName,
    )
    if (existing !== undefined) {
      onFound(existing)
      return
    }

    const now = new Date().toISOString()
    const person: UdharPerson = {
      id: createUuidV4(),
      ...normalized,
      createdAt: now,
      updatedAt: now,
    }
    const addRequest = store.add(person)
    addRequest.onsuccess = () => onFound(person)
  }
}

export function getOrCreatePerson(name: string): Promise<UdharPerson> {
  const normalized = normalizePersonName(name)
  return runDatabaseTransaction<UdharPerson>(
    PEOPLE_STORE,
    'readwrite',
    (store, _transaction, setResult) => {
      getOrCreatePersonInTransaction(store, normalized.name, setResult)
    },
  )
}

export function searchPeople(query: string): Promise<UdharPerson[]> {
  if (typeof query !== 'string') {
    return Promise.reject(new TypeError('People search query must be a string.'))
  }
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery === '') return Promise.resolve([])
  return runDatabaseTransaction<UdharPerson[]>(
    PEOPLE_STORE,
    'readonly',
    (store, _transaction, setResult) => {
      const request = store
        .index('by_name')
        .getAll(
          IDBKeyRange.bound(normalizedQuery, `${normalizedQuery}\uffff`),
          10,
        )
      request.onsuccess = () => {
        setResult(
          (request.result as UdharPerson[]).sort((first, second) =>
            first.name.localeCompare(second.name),
          ),
        )
      }
    },
  )
}

export function addUdharEntry(entry: NewUdharEntry): Promise<UdharEntry> {
  validateEntryFields(entry)
  const normalized = normalizePersonName(entry.personName)
  const id = createUuidV4()
  const now = new Date().toISOString()
  return runDatabaseTransactionOnStores<UdharEntry>(
    [PEOPLE_STORE, UDHAR_ENTRIES_STORE],
    'readwrite',
    ([people, udharEntries], _transaction, setResult) => {
      getOrCreatePersonInTransaction(people, normalized.name, (person) => {
        const record: UdharEntry = {
          id,
          personId: person.id,
          personName: person.name,
          type: entry.type,
          amountPaise: entry.amountPaise,
          date: entry.date,
          ...(entry.description?.trim()
            ? { description: entry.description.trim() }
            : {}),
          createdAt: now,
          updatedAt: now,
        }
        const request = udharEntries.add(record)
        request.onsuccess = () => setResult(record)
      })
    },
  )
}

export function updateUdharEntry(
  id: string,
  updates: Partial<NewUdharEntry>,
): Promise<UdharEntry> {
  validateId(id)
  return runDatabaseTransactionOnStores<UdharEntry>(
    [PEOPLE_STORE, UDHAR_ENTRIES_STORE, UDHAR_ALLOCATIONS_STORE],
    'readwrite',
    ([people, udharEntries, allocations], _transaction, setResult, fail) => {
      const request = udharEntries.get(id)
      request.onsuccess = () => {
        const existing = request.result as UdharEntry | undefined
        if (existing === undefined) {
          fail(new Error('Udhar entry was not found for update.'))
          return
        }
        const updatedFields: NewUdharEntry = {
          personName: updates.personName ?? existing.personName,
          type: updates.type ?? existing.type,
          amountPaise: updates.amountPaise ?? existing.amountPaise,
          date: updates.date ?? existing.date,
          ...(updates.description !== undefined
            ? { description: updates.description }
            : existing.description !== undefined
              ? { description: existing.description }
              : {}),
        }
        try {
          validateEntryFields(updatedFields)
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Invalid Udhar entry.'))
          return
        }

        const updatePrincipal = () => {
          getOrCreatePersonInTransaction(
            people,
            updatedFields.personName,
            (person) => {
              const updated: UdharEntry = {
                ...existing,
                ...updatedFields,
                personId: person.id,
                personName: person.name,
                ...(updatedFields.description?.trim()
                  ? { description: updatedFields.description.trim() }
                  : {}),
                updatedAt: new Date().toISOString(),
              }
              if (updated.description === undefined) delete updated.description
              const putRequest = udharEntries.put(updated)
              putRequest.onsuccess = () => setResult(updated)
            },
          )
        }
        const changesPrincipal =
          updatedFields.personName.trim() !== existing.personName ||
          updatedFields.type !== existing.type ||
          updatedFields.amountPaise !== existing.amountPaise ||
          updatedFields.date !== existing.date
        if (!changesPrincipal) {
          updatePrincipal()
          return
        }
        const allocationRequest = allocations
          .index('by_principal')
          .getAll(id)
        allocationRequest.onsuccess = () => {
          if (allocationRequest.result.length > 0) {
            fail(new Error(UDHAR_PRINCIPAL_ACTIVE_SETTLEMENTS_MESSAGE))
            return
          }
          updatePrincipal()
        }
      }
    },
  )
}

export function getDailyUdharEntries(date: string): Promise<UdharEntry[]> {
  parseLocalDateKey(date)
  return runDatabaseTransaction<UdharEntry[]>(
    UDHAR_ENTRIES_STORE,
    'readonly',
    (store, _transaction, setResult) => {
      const request = store.index('by_date').getAll(date)
      request.onsuccess = () => {
        setResult(
          (request.result as UdharEntry[]).sort(
            (first, second) =>
              first.createdAt.localeCompare(second.createdAt) ||
              first.id.localeCompare(second.id),
          ),
        )
      }
    },
  )
}

export function getOverallUdharEntries(): Promise<UdharEntry[]> {
  return runDatabaseTransaction<UdharEntry[]>(
    UDHAR_ENTRIES_STORE,
    'readonly',
    (store, _transaction, setResult) => {
      const request = store.getAll()
      request.onsuccess = () => setResult(request.result as UdharEntry[])
    },
  )
}

export async function getOverallUdharTotals(): Promise<UdharTotals> {
  const [entries, allocations] = await Promise.all([
    getOverallUdharEntries(),
    getOverallUdharAllocations(),
  ])
  return calculateBalances(entries, allocations).reduce<UdharTotals>(
    (totals, balance) => {
      totals.totalReceivablePaise += balance.receivablePaise
      totals.totalPayablePaise += balance.payablePaise
      return totals
    },
    { totalReceivablePaise: 0, totalPayablePaise: 0 },
  )
}

export async function getOverallUdharBalances(): Promise<UdharPersonBalanceDetails[]> {
  const [entries, allocations, settlements] = await Promise.all([
    getOverallUdharEntries(),
    getOverallUdharAllocations(),
    getOverallUdharSettlements(),
  ])
  const balances = calculateBalances(entries, allocations)
  const settlementsByPerson = new Map<string, UdharSettlement[]>()
  for (const settlement of settlements) {
    const records = settlementsByPerson.get(settlement.personId) ?? []
    records.push(settlement)
    settlementsByPerson.set(settlement.personId, records)
  }
  return balances
    .map((balance) => ({
      ...balance,
      settlements: settlementsByPerson.get(balance.personId) ?? [],
    }))
    .filter((balance) => balance.receivablePaise > 0 || balance.payablePaise > 0)
    .sort((first, second) => first.personName.localeCompare(second.personName))
}

function calculateBalances(
  entries: UdharEntry[],
  allocations: UdharAllocation[],
): UdharPersonBalance[] {
  const allocatedByPrincipal = new Map<string, number>()
  for (const allocation of allocations) {
    allocatedByPrincipal.set(
      allocation.principalEntryId,
      (allocatedByPrincipal.get(allocation.principalEntryId) ?? 0) +
        allocation.amountPaise,
    )
  }

  const balances = new Map<string, UdharPersonBalance>()
  for (const entry of entries) {
    const remainingPaise =
      entry.amountPaise - (allocatedByPrincipal.get(entry.id) ?? 0)
    if (remainingPaise <= 0) continue
    let balance = balances.get(entry.personId)
    if (balance === undefined) {
      balance = {
        personId: entry.personId,
        personName: entry.personName,
        receivablePaise: 0,
        payablePaise: 0,
        principals: [],
      }
      balances.set(entry.personId, balance)
    }
    if (entry.type === 'GIVEN') {
      balance.receivablePaise += remainingPaise
    } else {
      balance.payablePaise += remainingPaise
    }
    balance.principals.push({ entry, remainingPaise })
  }
  for (const balance of balances.values()) {
    balance.principals.sort(
      (first, second) =>
        first.entry.date.localeCompare(second.entry.date) ||
        first.entry.createdAt.localeCompare(second.entry.createdAt),
    )
  }
  return [...balances.values()]
}

export function getPersonBalanceDetails(
  personId: string,
): Promise<UdharPersonBalanceDetails> {
  validateId(personId)
  return Promise.all([
    runDatabaseTransaction<UdharEntry[]>(
      UDHAR_ENTRIES_STORE,
      'readonly',
      (store, _transaction, setResult) => {
        const request = store.index('by_person').getAll(personId)
        request.onsuccess = () => setResult(request.result as UdharEntry[])
      },
    ),
    runDatabaseTransaction<UdharAllocation[]>(
      UDHAR_ALLOCATIONS_STORE,
      'readonly',
      (store, _transaction, setResult) => {
        const request = store.getAll()
        request.onsuccess = () => setResult(request.result as UdharAllocation[])
      },
    ),
    runDatabaseTransaction<UdharSettlement[]>(
      UDHAR_SETTLEMENTS_STORE,
      'readonly',
      (store, _transaction, setResult) => {
        const request = store.index('by_person').getAll(personId)
        request.onsuccess = () => setResult(request.result as UdharSettlement[])
      },
    ),
  ]).then(([entries, allocations, settlements]) => {
    const [balance] = calculateBalances(entries, allocations)
    return {
      personId,
      personName:
        entries[0]?.personName ??
        settlements[0]?.personName ??
        '',
      receivablePaise: balance?.receivablePaise ?? 0,
      payablePaise: balance?.payablePaise ?? 0,
      principals: balance?.principals ?? [],
      settlements: settlements.sort(
        (first, second) =>
          second.date.localeCompare(first.date) ||
          second.createdAt.localeCompare(first.createdAt),
      ),
    }
  })
}

export function getDailyUdharSettlements(
  date: string,
): Promise<UdharSettlement[]> {
  parseLocalDateKey(date)
  return runDatabaseTransaction<UdharSettlement[]>(
    UDHAR_SETTLEMENTS_STORE,
    'readonly',
    (store, _transaction, setResult) => {
      const request = store.index('by_date').getAll(date)
      request.onsuccess = () => {
        setResult(
          (request.result as UdharSettlement[]).sort(
            (first, second) =>
              first.createdAt.localeCompare(second.createdAt) ||
              first.id.localeCompare(second.id),
          ),
        )
      }
    },
  )
}

export function getOverallUdharSettlements(): Promise<UdharSettlement[]> {
  return runDatabaseTransaction<UdharSettlement[]>(
    UDHAR_SETTLEMENTS_STORE,
    'readonly',
    (store, _transaction, setResult) => {
      const request = store.getAll()
      request.onsuccess = () => setResult(request.result as UdharSettlement[])
    },
  )
}

function getOverallUdharAllocations(): Promise<UdharAllocation[]> {
  return runDatabaseTransaction<UdharAllocation[]>(
    UDHAR_ALLOCATIONS_STORE,
    'readonly',
    (store, _transaction, setResult) => {
      const request = store.getAll()
      request.onsuccess = () => setResult(request.result as UdharAllocation[])
    },
  )
}

export function recordSettlement(
  personId: string,
  type: UdharSettlementType,
  amountPaise: number,
  date: string,
  description?: string,
): Promise<DeletedUdharSettlement> {
  validateId(personId)
  validateDate(date)
  if (type !== 'RECEIVED' && type !== 'PAID') {
    return Promise.reject(new TypeError('Settlement type must be RECEIVED or PAID.'))
  }
  if (
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0 ||
    amountPaise > MAX_UDHAR_SETTLEMENT_AMOUNT_PAISE
  ) {
    return Promise.reject(new RangeError('Settlement amount must be valid positive paise.'))
  }
  if (
    description !== undefined &&
    (typeof description !== 'string' ||
      description.length > MAX_UDHAR_DESCRIPTION_LENGTH)
  ) {
    return Promise.reject(new RangeError('Settlement description is too long.'))
  }

  const settlementId = createUuidV4()
  const now = new Date().toISOString()
  return runDatabaseTransactionOnStores<DeletedUdharSettlement>(
    [
      PEOPLE_STORE,
      UDHAR_ENTRIES_STORE,
      UDHAR_SETTLEMENTS_STORE,
      UDHAR_ALLOCATIONS_STORE,
    ],
    'readwrite',
    ([people, entries, settlements, allocations], _transaction, setResult, fail) => {
      const personRequest = people.get(personId)
      const entryRequest = entries.index('by_person').getAll(personId)
      const allocationRequest = allocations.getAll()
      let person: UdharPerson | undefined
      let principals: UdharEntry[] | undefined
      let allAllocations: UdharAllocation[] | undefined
      const allocate = () => {
        if (person === undefined || principals === undefined || allAllocations === undefined) return
        const allocatedByPrincipal = new Map<string, number>()
        for (const allocation of allAllocations) {
          allocatedByPrincipal.set(
            allocation.principalEntryId,
            (allocatedByPrincipal.get(allocation.principalEntryId) ?? 0) +
              allocation.amountPaise,
          )
        }
        const eligibleType = type === 'RECEIVED' ? 'GIVEN' : 'TAKEN'
        const eligible = principals
          .filter(
            (principal) =>
              principal.type === eligibleType &&
              principal.date <= date &&
              principal.amountPaise - (allocatedByPrincipal.get(principal.id) ?? 0) > 0,
          )
          .sort(
            (first, second) =>
              first.date.localeCompare(second.date) ||
              first.createdAt.localeCompare(second.createdAt),
          )
        const availablePaise = eligible.reduce(
          (sum, principal) =>
            sum +
            principal.amountPaise -
            (allocatedByPrincipal.get(principal.id) ?? 0),
          0,
        )
        if (availablePaise < amountPaise) {
          fail(new RangeError('Settlement exceeds this person’s eligible outstanding balance.'))
          return
        }

        const settlement: UdharSettlement = {
          id: settlementId,
          personId,
          personName: person.name,
          type,
          amountPaise,
          date,
          ...(description?.trim() ? { description: description.trim() } : {}),
          createdAt: now,
          updatedAt: now,
        }
        const newAllocations: UdharAllocation[] = []
        let remainingPaise = amountPaise
        for (const principal of eligible) {
          if (remainingPaise === 0) break
          const outstanding =
            principal.amountPaise -
            (allocatedByPrincipal.get(principal.id) ?? 0)
          const allocatedPaise = Math.min(outstanding, remainingPaise)
          newAllocations.push({
            id: createUuidV4(),
            settlementId,
            principalEntryId: principal.id,
            amountPaise: allocatedPaise,
            createdAt: now,
          })
          remainingPaise -= allocatedPaise
        }
        settlements.add(settlement)
        for (const allocation of newAllocations) allocations.add(allocation)
        setResult({ settlement, allocations: newAllocations })
      }

      personRequest.onsuccess = () => {
        person = personRequest.result as UdharPerson | undefined
        if (person === undefined) {
          fail(new Error('Person was not found.'))
          return
        }
        allocate()
      }
      entryRequest.onsuccess = () => {
        principals = entryRequest.result as UdharEntry[]
        allocate()
      }
      allocationRequest.onsuccess = () => {
        allAllocations = allocationRequest.result as UdharAllocation[]
        allocate()
      }
    },
  )
}

export function deleteUdharEntry(id: string): Promise<UdharEntry> {
  validateId(id)
  return runDatabaseTransactionOnStores<UdharEntry>(
    [UDHAR_ENTRIES_STORE, UDHAR_ALLOCATIONS_STORE],
    'readwrite',
    ([entries, allocations], _transaction, setResult, fail) => {
      const request = entries.get(id)
      request.onsuccess = () => {
        const entry = request.result as UdharEntry | undefined
        if (entry === undefined) {
          fail(new Error('Udhar entry was not found for deletion.'))
          return
        }
        const allocationRequest = allocations
          .index('by_principal')
          .getAll(id)
        allocationRequest.onsuccess = () => {
          if (allocationRequest.result.length > 0) {
            fail(new Error(UDHAR_PRINCIPAL_ACTIVE_SETTLEMENTS_MESSAGE))
            return
          }
          entries.delete(id)
          setResult(entry)
        }
      }
    },
  )
}

export function deleteSettlement(
  id: string,
): Promise<DeletedUdharSettlement> {
  validateId(id)
  return runDatabaseTransactionOnStores<DeletedUdharSettlement>(
    [UDHAR_SETTLEMENTS_STORE, UDHAR_ALLOCATIONS_STORE],
    'readwrite',
    ([settlements, allocations], _transaction, setResult, fail) => {
      const request = settlements.get(id)
      request.onsuccess = () => {
        const settlement = request.result as UdharSettlement | undefined
        if (settlement === undefined) {
          fail(new Error('Settlement was not found for deletion.'))
          return
        }
        const allocationRequest = allocations
          .index('by_settlement')
          .getAll(id)
        allocationRequest.onsuccess = () => {
          const linkedAllocations =
            allocationRequest.result as UdharAllocation[]
          for (const allocation of linkedAllocations) {
            allocations.delete(allocation.id)
          }
          settlements.delete(id)
          setResult({ settlement, allocations: linkedAllocations })
        }
      }
    },
  )
}

export function restoreSettlement(
  deleted: DeletedUdharSettlement,
): Promise<void> {
  validateSettlement(deleted.settlement, false)
  let totalAllocatedPaise = 0
  for (const allocation of deleted.allocations) {
    validateAllocation(allocation)
    if (allocation.settlementId !== deleted.settlement.id) {
      return Promise.reject(
        new TypeError('Allocation must belong to the settlement being restored.'),
      )
    }
    totalAllocatedPaise += allocation.amountPaise
  }
  if (totalAllocatedPaise !== deleted.settlement.amountPaise) {
    return Promise.reject(
      new RangeError('Restored allocation total must equal the settlement amount.'),
    )
  }
  return runDatabaseTransactionOnStores<void>(
    [UDHAR_SETTLEMENTS_STORE, UDHAR_ALLOCATIONS_STORE, UDHAR_ENTRIES_STORE],
    'readwrite',
    ([settlements, allocations, principals], _transaction, setResult, fail) => {
      const request = settlements.get(deleted.settlement.id)
      request.onsuccess = () => {
        if (request.result !== undefined) {
          fail(new Error('This settlement already exists.'))
          return
        }
        const allocationRequest = allocations
          .index('by_settlement')
          .getAll(deleted.settlement.id)
        allocationRequest.onsuccess = () => {
          if (allocationRequest.result.length > 0) {
            fail(new Error('Settlement allocations already exist.'))
            return
          }
          const principalRequest = principals.getAll()
          const allAllocationRequest = allocations.getAll()
          let currentPrincipals: UdharEntry[] | undefined
          let currentAllocations: UdharAllocation[] | undefined
          const restore = () => {
            if (currentPrincipals === undefined || currentAllocations === undefined) return
            const principalById = new Map(
              currentPrincipals.map((principal) => [principal.id, principal]),
            )
            const allocatedByPrincipal = new Map<string, number>()
            for (const allocation of currentAllocations) {
              allocatedByPrincipal.set(
                allocation.principalEntryId,
                (allocatedByPrincipal.get(allocation.principalEntryId) ?? 0) +
                  allocation.amountPaise,
              )
            }
            for (const allocation of deleted.allocations) {
              const principal = principalById.get(allocation.principalEntryId)
              const requiredType =
                deleted.settlement.type === 'RECEIVED' ? 'GIVEN' : 'TAKEN'
              if (
                principal === undefined ||
                principal.personId !== deleted.settlement.personId ||
                principal.type !== requiredType ||
                principal.date > deleted.settlement.date
              ) {
                fail(new Error('The principal for this settlement is no longer eligible.'))
                return
              }
              const alreadyAllocated =
                allocatedByPrincipal.get(principal.id) ?? 0
              if (alreadyAllocated + allocation.amountPaise > principal.amountPaise) {
                fail(new Error('Restoring this settlement would exceed principal balance.'))
                return
              }
              allocatedByPrincipal.set(
                principal.id,
                alreadyAllocated + allocation.amountPaise,
              )
            }
            settlements.add(deleted.settlement)
            for (const allocation of deleted.allocations) {
              allocations.add(allocation)
            }
            setResult(undefined)
          }
          principalRequest.onsuccess = () => {
            currentPrincipals = principalRequest.result as UdharEntry[]
            restore()
          }
          allAllocationRequest.onsuccess = () => {
            currentAllocations = allAllocationRequest.result as UdharAllocation[]
            restore()
          }
        }
      }
    },
  )
}

function validateSettlement(settlement: UdharSettlement, enforceDateLimit = true) {
  validateId(settlement.id)
  validateId(settlement.personId)
  validateDate(settlement.date, enforceDateLimit)
  if (settlement.type !== 'RECEIVED' && settlement.type !== 'PAID') {
    throw new TypeError('Settlement type must be RECEIVED or PAID.')
  }
  if (
    !Number.isSafeInteger(settlement.amountPaise) ||
    settlement.amountPaise <= 0 ||
    settlement.amountPaise > MAX_UDHAR_SETTLEMENT_AMOUNT_PAISE
  ) {
    throw new RangeError('Settlement amount must be valid positive paise.')
  }
  if (
    settlement.description !== undefined &&
    settlement.description.length > MAX_UDHAR_DESCRIPTION_LENGTH
  ) {
    throw new RangeError('Settlement description is too long.')
  }
  if (
    Number.isNaN(Date.parse(settlement.createdAt)) ||
    Number.isNaN(Date.parse(settlement.updatedAt))
  ) {
    throw new TypeError('Settlement timestamps must be valid ISO dates.')
  }
}

function validateAllocation(allocation: UdharAllocation) {
  validateId(allocation.id)
  validateId(allocation.settlementId)
  validateId(allocation.principalEntryId)
  if (!Number.isSafeInteger(allocation.amountPaise) || allocation.amountPaise <= 0) {
    throw new RangeError('Allocation must contain positive integer paise.')
  }
  if (Number.isNaN(Date.parse(allocation.createdAt))) {
    throw new TypeError('Allocation timestamp must be a valid ISO date.')
  }
}

export function restoreUdharEntry(entry: UdharEntry): Promise<void> {
  validateId(entry.id)
  validateId(entry.personId)
  validateEntryFields({
    personName: entry.personName,
    type: entry.type,
    amountPaise: entry.amountPaise,
    date: entry.date,
    ...(entry.description !== undefined
      ? { description: entry.description }
      : {}),
  }, false)
  if (
    Number.isNaN(Date.parse(entry.createdAt)) ||
    Number.isNaN(Date.parse(entry.updatedAt))
  ) {
    return Promise.reject(new TypeError('Udhar timestamps must be valid ISO dates.'))
  }
  return runDatabaseTransaction<UdharEntry | undefined>(
    UDHAR_ENTRIES_STORE,
    'readwrite',
    (store, _transaction, setResult, fail) => {
      const request = store.get(entry.id)
      request.onsuccess = () => {
        const existing = request.result as UdharEntry | undefined
        if (existing === undefined) {
          store.add(entry)
        } else if (JSON.stringify(existing) !== JSON.stringify(entry)) {
          fail(new Error('A different Udhar entry already uses this ID.'))
          return
        }
        setResult(undefined)
      }
    },
  ).then(() => undefined)
}
