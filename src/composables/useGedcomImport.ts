import { ref } from 'vue'
import { parse } from 'parse-gedcom'
import { supabase } from '@/services/supabase'
import type {
  GedcomImportPerson,
  GedcomImportFamily,
  GedcomImportPreview,
  GedcomImportResult,
  GedcomConflict,
  PersonSummary,
} from '@/types'

// ─── Internal GEDCOM record shape ─────────────────────────────────────────────

interface GedcomRecord {
  tag: string
  pointer: string
  data: string
  tree: GedcomRecord[]
}

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export function parseName(raw: string): { firstName: string; lastName: string } {
  // Standard format: "First Middle /Surname/" (trailing slash optional)
  const match = raw.match(/^([^/]*)\s*\/([^/]*)\/?\s*(.*)$/)
  if (match) {
    const before  = match[1].trim()
    const surname = match[2].trim()
    // If nothing before the slash, the first name may be after the closing slash
    return { firstName: before || match[3].trim(), lastName: surname }
  }
  const parts = raw.trim().split(/\s+/)
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

export function parseGedcomDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Strip leading qualifiers (ABT, EST, BEF, AFT, CAL)
  const cleaned = raw.replace(/^(ABT|EST|BEF|AFT|CAL)\s+/i, '').trim()

  // "D MON YYYY" or "DD MON YYYY"
  const full = cleaned.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/i)
  if (full) {
    const month = MONTH_MAP[full[2].toUpperCase()] ?? '01'
    return `${full[3]}-${month}-${full[1].padStart(2, '0')}`
  }

  // "MON YYYY"
  const monthYear = cleaned.match(/^([A-Z]{3})\s+(\d{4})$/i)
  if (monthYear) {
    const month = MONTH_MAP[monthYear[1].toUpperCase()] ?? '01'
    return `${monthYear[2]}-${month}-01`
  }

  // "YYYY"
  const year = cleaned.match(/^(\d{4})$/)
  if (year) return `${year[1]}-01-01`

  return null
}

function child(record: GedcomRecord, tag: string): GedcomRecord | undefined {
  return record.tree.find(r => r.tag === tag)
}

function children(record: GedcomRecord, tag: string): GedcomRecord[] {
  return record.tree.filter(r => r.tag === tag)
}

const EMPTY: GedcomRecord = { tag: '', pointer: '', data: '', tree: [] }

export function gedcomRecordsToPeople(records: GedcomRecord[]): GedcomImportPerson[] {
  return records
    .filter(r => r.tag === 'INDI')
    .map(indi => {
      const nameRec = child(indi, 'NAME')
      const birt = child(indi, 'BIRT') ?? EMPTY
      const deat = child(indi, 'DEAT') ?? EMPTY
      const buri = child(indi, 'BURI') ?? EMPTY
      const { firstName, lastName } = parseName(nameRec?.data ?? '')
      return {
        gedcomId:    indi.pointer,
        firstName,
        lastName,
        birthDate:   parseGedcomDate(child(birt, 'DATE')?.data),
        birthPlace:  child(birt, 'PLAC')?.data ?? null,
        deathDate:   parseGedcomDate(child(deat, 'DATE')?.data),
        deathPlace:  child(deat, 'PLAC')?.data ?? null,
        burialPlace: child(buri, 'PLAC')?.data ?? null,
        notes:       child(indi, 'NOTE')?.data ?? null,
      }
    })
}

export function gedcomRecordsToFamilies(records: GedcomRecord[]): GedcomImportFamily[] {
  return records
    .filter(r => r.tag === 'FAM')
    .map(fam => {
      const marr = child(fam, 'MARR') ?? EMPTY
      return {
        gedcomId:        fam.pointer,
        husbandGedcomId: child(fam, 'HUSB')?.data ?? null,
        wifeGedcomId:    child(fam, 'WIFE')?.data ?? null,
        childGedcomIds:  children(fam, 'CHIL').map(c => c.data),
        marriageDate:    parseGedcomDate(child(marr, 'DATE')?.data),
        marriagePlace:   child(marr, 'PLAC')?.data ?? null,
      }
    })
}

export function detectConflicts(
  people: GedcomImportPerson[],
  existing: PersonSummary[],
): { nonConflicts: GedcomImportPerson[]; conflicts: GedcomConflict[] } {
  const conflicts: GedcomConflict[]        = []
  const nonConflicts: GedcomImportPerson[] = []

  for (const person of people) {
    const birthYear = person.birthDate?.slice(0, 4) ?? null

    const match = existing.find(e => {
      const eBirthYear = e.birthDate?.slice(0, 4) ?? null
      const nameMatch =
        e.firstName.toLowerCase() === person.firstName.toLowerCase() &&
        e.lastName.toLowerCase()  === person.lastName.toLowerCase()
      // Conflict: same name AND same birth year (null === null counts as same)
      return nameMatch && birthYear === eBirthYear
    })

    if (match) {
      conflicts.push({
        gedcomPerson:       person,
        existingPersonId:   match.id,
        existingPersonName: `${match.firstName} ${match.lastName}`,
      })
    } else {
      nonConflicts.push(person)
    }
  }

  return { nonConflicts, conflicts }
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useGedcomImport() {
  const preview   = ref<GedcomImportPreview | null>(null)
  const isLoading = ref(false)
  const progress  = ref(0)
  const total     = ref(0)
  const error     = ref<string | null>(null)

  async function parseFile(file: File, existing: PersonSummary[]): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const text     = await file.text()
      const records  = parse(text) as GedcomRecord[]
      const people   = gedcomRecordsToPeople(records)
      const families = gedcomRecordsToFamilies(records)
      const { nonConflicts, conflicts } = detectConflicts(people, existing)
      preview.value = { people: nonConflicts, families, conflicts }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to parse GEDCOM file'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function runImport(currentUserId: string): Promise<GedcomImportResult> {
    if (!preview.value) throw new Error('No preview to import')
    isLoading.value = true
    progress.value  = 0
    total.value     = preview.value.people.length
    error.value     = null

    const { people, families, conflicts } = preview.value
    const gedcomIdToDbId = new Map<string, string>()

    try {
      // 1. Insert people — one at a time to capture returned IDs
      for (const person of people) {
        const { data, error: dbError } = await supabase
          .from('people')
          .insert({
            first_name:    person.firstName,
            last_name:     person.lastName,
            birth_date:    person.birthDate,
            birth_place:   person.birthPlace,
            death_date:    person.deathDate,
            death_place:   person.deathPlace,
            burial_place:  person.burialPlace,
            notes:         person.notes,
            created_by:    currentUserId,
            name_variants: [],
          })
          .select('id')
          .single()
        if (dbError) throw dbError
        gedcomIdToDbId.set(person.gedcomId, data.id)
        progress.value++
      }

      // 2. Insert marriages and parent-child relationships
      for (const family of families) {
        const husbDbId = family.husbandGedcomId ? gedcomIdToDbId.get(family.husbandGedcomId) : null
        const wifeDbId = family.wifeGedcomId    ? gedcomIdToDbId.get(family.wifeGedcomId)    : null

        if (husbDbId && wifeDbId) {
          await supabase.from('marriages').insert({
            person_a_id:    husbDbId,
            person_b_id:    wifeDbId,
            marriage_date:  family.marriageDate,
            marriage_place: family.marriagePlace,
          })
        }

        const parentIds = [husbDbId, wifeDbId].filter((id): id is string => id !== null)
        for (const childGedcomId of family.childGedcomIds) {
          const childDbId = gedcomIdToDbId.get(childGedcomId)
          if (!childDbId) continue
          for (const parentId of parentIds) {
            await supabase.from('parent_child').insert({
              parent_id:         parentId,
              child_id:          childDbId,
              relationship_type: 'biological',
              confirmed:         true,
            })
          }
        }
      }

      preview.value = null
      return { created: people.length, skipped: conflicts.length, conflicts }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Import failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function reset(): void {
    preview.value  = null
    error.value    = null
    progress.value = 0
    total.value    = 0
  }

  return { preview, isLoading, progress, total, error, parseFile, runImport, reset }
}
