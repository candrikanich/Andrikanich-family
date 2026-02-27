import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock (needed for composable import) ─────────────────────────────
const { mockChain, mockFrom } = vi.hoisted(() => {
  const mockChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'new-uuid' }, error: null }),
  }
  const mockFrom = vi.fn(() => mockChain)
  return { mockChain, mockFrom }
})

vi.mock('@/services/supabase', () => ({
  supabase: { from: mockFrom },
}))

import {
  parseName,
  parseGedcomDate,
  gedcomRecordsToPeople,
  gedcomRecordsToFamilies,
  detectConflicts,
} from '@/composables/useGedcomImport'
import type { PersonSummary } from '@/types'

// ─── parseName ────────────────────────────────────────────────────────────────

describe('parseName', () => {
  it('splits standard "First /Last/" format', () => {
    expect(parseName('John /Smith/')).toEqual({ firstName: 'John', lastName: 'Smith' })
  })

  it('handles "First Middle /Last/"', () => {
    expect(parseName('John William /Smith/')).toEqual({ firstName: 'John William', lastName: 'Smith' })
  })

  it('handles name with only surname "/Unknown/"', () => {
    expect(parseName('/Unknown/')).toEqual({ firstName: '', lastName: 'Unknown' })
  })

  it('handles no-slash format (fallback)', () => {
    expect(parseName('Mary')).toEqual({ firstName: 'Mary', lastName: '' })
  })

  it('handles empty string', () => {
    expect(parseName('')).toEqual({ firstName: '', lastName: '' })
  })
})

// ─── parseGedcomDate ──────────────────────────────────────────────────────────

describe('parseGedcomDate', () => {
  it('parses full date "15 JAN 1920"', () => {
    expect(parseGedcomDate('15 JAN 1920')).toBe('1920-01-15')
  })

  it('parses single-digit day "5 MAR 1945"', () => {
    expect(parseGedcomDate('5 MAR 1945')).toBe('1945-03-05')
  })

  it('parses month-year "JAN 1920"', () => {
    expect(parseGedcomDate('JAN 1920')).toBe('1920-01-01')
  })

  it('parses year-only "1920"', () => {
    expect(parseGedcomDate('1920')).toBe('1920-01-01')
  })

  it('strips ABT qualifier from year', () => {
    expect(parseGedcomDate('ABT 1920')).toBe('1920-01-01')
  })

  it('strips BEF qualifier from full date', () => {
    expect(parseGedcomDate('BEF 15 JAN 1920')).toBe('1920-01-15')
  })

  it('strips EST qualifier', () => {
    expect(parseGedcomDate('EST 1905')).toBe('1905-01-01')
  })

  it('returns null for empty string', () => {
    expect(parseGedcomDate('')).toBeNull()
  })

  it('returns null for null', () => {
    expect(parseGedcomDate(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(parseGedcomDate(undefined)).toBeNull()
  })
})

// ─── Sample GEDCOM records ────────────────────────────────────────────────────

const SAMPLE_RECORDS = [
  {
    tag: 'INDI', pointer: '@I1@', data: '', tree: [
      { tag: 'NAME', pointer: '', data: 'John /Smith/', tree: [] },
      { tag: 'BIRT', pointer: '', data: '', tree: [
        { tag: 'DATE', pointer: '', data: '15 JAN 1920', tree: [] },
        { tag: 'PLAC', pointer: '', data: 'New York, NY', tree: [] },
      ]},
      { tag: 'DEAT', pointer: '', data: '', tree: [
        { tag: 'DATE', pointer: '', data: '20 DEC 1990', tree: [] },
        { tag: 'PLAC', pointer: '', data: 'Boston, MA', tree: [] },
      ]},
    ],
  },
  {
    tag: 'INDI', pointer: '@I2@', data: '', tree: [
      { tag: 'NAME', pointer: '', data: 'Mary /Jones/', tree: [] },
    ],
  },
  {
    tag: 'INDI', pointer: '@I3@', data: '', tree: [
      { tag: 'NAME', pointer: '', data: 'Billy /Smith/', tree: [] },
      { tag: 'BIRT', pointer: '', data: '', tree: [
        { tag: 'DATE', pointer: '', data: '1950', tree: [] },
      ]},
    ],
  },
  {
    tag: 'FAM', pointer: '@F1@', data: '', tree: [
      { tag: 'HUSB', pointer: '', data: '@I1@', tree: [] },
      { tag: 'WIFE', pointer: '', data: '@I2@', tree: [] },
      { tag: 'CHIL', pointer: '', data: '@I3@', tree: [] },
      { tag: 'MARR', pointer: '', data: '', tree: [
        { tag: 'DATE', pointer: '', data: '10 JUN 1945', tree: [] },
        { tag: 'PLAC', pointer: '', data: 'Boston, MA', tree: [] },
      ]},
    ],
  },
  {
    tag: 'HEAD', pointer: '', data: '', tree: [],  // non-INDI/FAM record, should be ignored
  },
]

// ─── gedcomRecordsToPeople ────────────────────────────────────────────────────

describe('gedcomRecordsToPeople', () => {
  it('maps INDI records and ignores other tags', () => {
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    expect(people).toHaveLength(3)
    expect(people.every(p => p.gedcomId.startsWith('@I'))).toBe(true)
  })

  it('maps name, birth, death correctly', () => {
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    expect(people[0]).toMatchObject({
      gedcomId: '@I1@',
      firstName: 'John',
      lastName: 'Smith',
      birthDate: '1920-01-15',
      birthPlace: 'New York, NY',
      deathDate: '1990-12-20',
      deathPlace: 'Boston, MA',
    })
  })

  it('handles missing birth/death fields gracefully (null)', () => {
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    expect(people[1]).toMatchObject({
      gedcomId: '@I2@',
      firstName: 'Mary',
      lastName: 'Jones',
      birthDate: null,
      birthPlace: null,
      deathDate: null,
    })
  })
})

// ─── gedcomRecordsToFamilies ──────────────────────────────────────────────────

describe('gedcomRecordsToFamilies', () => {
  it('maps FAM records and ignores non-FAM tags', () => {
    const families = gedcomRecordsToFamilies(SAMPLE_RECORDS)
    expect(families).toHaveLength(1)
  })

  it('maps husband, wife, children, and marriage details', () => {
    const families = gedcomRecordsToFamilies(SAMPLE_RECORDS)
    expect(families[0]).toMatchObject({
      gedcomId: '@F1@',
      husbandGedcomId: '@I1@',
      wifeGedcomId: '@I2@',
      childGedcomIds: ['@I3@'],
      marriageDate: '1945-06-10',
      marriagePlace: 'Boston, MA',
    })
  })

  it('handles FAM without MARR (null dates)', () => {
    const noMarrRecord = [{
      tag: 'FAM', pointer: '@F2@', data: '', tree: [
        { tag: 'HUSB', pointer: '', data: '@I1@', tree: [] },
      ],
    }]
    const families = gedcomRecordsToFamilies(noMarrRecord)
    expect(families[0].marriageDate).toBeNull()
    expect(families[0].marriagePlace).toBeNull()
  })
})

// ─── detectConflicts ──────────────────────────────────────────────────────────

describe('detectConflicts', () => {
  const existing: PersonSummary[] = [
    {
      id: 'p1', firstName: 'John', lastName: 'Smith',
      birthSurname: null, nickname: null,
      birthDate: '1920-03-01', deathDate: null, primaryPhotoId: null,
    },
  ]

  it('flags same name + same birth year as conflict', () => {
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    const { conflicts, nonConflicts } = detectConflicts(people, existing)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].gedcomPerson.firstName).toBe('John')
    expect(conflicts[0].existingPersonId).toBe('p1')
    expect(nonConflicts).toHaveLength(2)
  })

  it('does not flag when birth years differ', () => {
    const diffYear: PersonSummary[] = [{
      id: 'p2', firstName: 'John', lastName: 'Smith',
      birthSurname: null, nickname: null,
      birthDate: '1925-01-01', deathDate: null, primaryPhotoId: null,
    }]
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    const { conflicts } = detectConflicts(people, diffYear)
    expect(conflicts).toHaveLength(0)
  })

  it('does not flag when last name differs', () => {
    const diffName: PersonSummary[] = [{
      id: 'p3', firstName: 'John', lastName: 'Johnson',
      birthSurname: null, nickname: null,
      birthDate: '1920-01-01', deathDate: null, primaryPhotoId: null,
    }]
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    const { conflicts } = detectConflicts(people, diffName)
    expect(conflicts).toHaveLength(0)
  })

  it('flags same name with both birth dates null as conflict', () => {
    const existingMary: PersonSummary[] = [{
      id: 'p4', firstName: 'Mary', lastName: 'Jones',
      birthSurname: null, nickname: null,
      birthDate: null, deathDate: null, primaryPhotoId: null,
    }]
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    const { conflicts } = detectConflicts(people, existingMary)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].gedcomPerson.firstName).toBe('Mary')
  })

  it('returns all people as nonConflicts when existing is empty', () => {
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    const { conflicts, nonConflicts } = detectConflicts(people, [])
    expect(conflicts).toHaveLength(0)
    expect(nonConflicts).toHaveLength(3)
  })
})
