// ─── Auth & Users ─────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'editor' | 'viewer'
export type UserStatus = 'pending' | 'approved' | 'denied'

export interface Profile {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  status: UserStatus
  personId: string | null
  createdAt: string
  updatedAt: string
}

// ─── People ───────────────────────────────────────────────────────────────────

export interface Person {
  id: string
  firstName: string
  lastName: string
  birthSurname: string | null
  nickname: string | null
  nameVariants: string[]
  suffix: string | null
  birthDate: string | null
  birthPlace: string | null
  deathDate: string | null
  deathPlace: string | null
  burialPlace: string | null
  notes: string | null
  biography: string | null
  primaryPhotoId: string | null
  userId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PersonSummary {
  id: string
  firstName: string
  lastName: string
  birthSurname: string | null
  nickname: string | null
  birthDate: string | null
  deathDate: string | null
  primaryPhotoId: string | null
}

// ─── Relationships ────────────────────────────────────────────────────────────

export type RelationshipType = 'biological' | 'adopted' | 'step' | 'half'
export type MarriageEndReason = 'divorced' | 'widowed' | 'annulled'

export interface ParentChild {
  id: string
  parentId: string
  childId: string
  relationshipType: RelationshipType
  confirmed: boolean
  createdAt: string
}

export interface Marriage {
  id: string
  personAId: string
  personBId: string
  marriageDate: string | null
  marriagePlace: string | null
  endDate: string | null
  endReason: MarriageEndReason | null
  createdAt: string
}

// ─── Extended Person Info ─────────────────────────────────────────────────────

export interface Residence {
  id: string
  personId: string
  location: string
  fromDate: string | null
  toDate: string | null
  isCurrent: boolean
  sortOrder: number
}

export type EducationType = 'high_school' | 'college' | 'university' | 'vocational' | 'other'

export interface Education {
  id: string
  personId: string
  institution: string
  institutionType: EducationType
  location: string | null
  startYear: number | null
  endYear: number | null
  graduated: boolean | null
  notes: string | null
}

export interface Occupation {
  id: string
  personId: string
  employer: string | null
  title: string | null
  fromDate: string | null
  toDate: string | null
  isCurrent: boolean
}

export interface MilitaryService {
  id: string
  personId: string
  branch: string | null
  rank: string | null
  fromDate: string | null
  toDate: string | null
  notes: string | null
}

// ─── Documents & Media ───────────────────────────────────────────────────────

export type DocumentExtractionStatus = 'pending' | 'reviewed' | 'committed'

export interface Document {
  id: string
  personId: string
  storagePath: string
  originalFilename: string
  mimeType: string
  uploadedBy: string | null
  uploadedAt: string
  extractionStatus: DocumentExtractionStatus
}

export interface Media {
  id: string
  personId: string
  storagePath: string
  caption: string | null
  yearApprox: number | null
  uploadedBy: string | null
  uploadedAt: string
}

// ─── Edit History ────────────────────────────────────────────────────────────

export interface EditHistoryEntry {
  id: string
  tableName: string
  recordId: string
  fieldName: string
  oldValue: unknown
  newValue: unknown
  changedBy: string | null
  changedAt: string
}

// ─── Sources ─────────────────────────────────────────────────────────────────

export interface Source {
  id: string
  personId: string
  title: string
  citation: string
  url: string | null
  documentId: string | null
  createdAt: string
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface NameMatchCandidate {
  person: PersonSummary
  score: number
}

// ─── People Input ─────────────────────────────────────────────────────────────

export interface PersonInput {
  firstName: string
  lastName: string
  birthSurname?: string | null
  nickname?: string | null
  nameVariants?: string[]
  suffix?: string | null
  birthDate?: string | null
  birthPlace?: string | null
  deathDate?: string | null
  deathPlace?: string | null
  burialPlace?: string | null
  notes?: string | null
  biography?: string | null
}

export interface PeopleSearchParams {
  query?: string
  birthYearMin?: number
  birthYearMax?: number
  location?: string
}

// ─── Tree ─────────────────────────────────────────────────────────────────────

export interface TreePerson {
  id: string
  firstName: string
  lastName: string
  birthSurname: string | null
  nickname: string | null
  birthDate: string | null
  deathDate: string | null
  primaryPhotoId: string | null
}

export interface TreeParentChildEdge {
  id: string
  parentId: string
  childId: string
  confirmed: boolean
}

export interface TreeMarriageEdge {
  id: string
  personAId: string
  personBId: string
  marriageDate: string | null
}

export interface TreeSubgraph {
  rootId: string
  people: TreePerson[]                 // all people in the subgraph (deduplicated)
  parentChildEdges: TreeParentChildEdge[]
  marriageEdges: TreeMarriageEdge[]
}

// ─── Phase 4 — Document AI Pipeline ──────────────────────────────────────────

export interface ExtractedField<T = string> {
  value: T
  uncertain: boolean
}

export interface ExtractionResult {
  person: {
    firstName: ExtractedField
    lastName: ExtractedField
    birthSurname?: ExtractedField
    nickname?: ExtractedField
    suffix?: ExtractedField
    nameVariants?: string[]
    birthDate?: ExtractedField
    birthPlace?: ExtractedField
    deathDate?: ExtractedField
    deathPlace?: ExtractedField
    burialPlace?: ExtractedField
    biography?: string
    notes?: string
  }
  residences: Array<{
    location: string
    fromDate?: string
    toDate?: string
    isCurrent: boolean
  }>
  education: Array<{
    institution: string
    institutionType: EducationType
    startYear?: number
    endYear?: number
    graduated?: boolean
  }>
  occupations: Array<{
    employer?: string
    title?: string
    fromDate?: string
    toDate?: string
    isCurrent: boolean
  }>
  militaryService: Array<{
    branch: string
    rank?: string
    fromDate?: string
    toDate?: string
    notes?: string
  }>
  marriages: Array<{
    spouseName: string
    marriageDate?: ExtractedField
    marriagePlace?: ExtractedField
    endDate?: string
    endReason?: MarriageEndReason
  }>
  mentionedNames: Array<{
    name: string
    relationshipType: 'parent' | 'child' | 'sibling' | 'spouse'
    mentionContext: string
    uncertain: boolean
  }>
}

export interface RelationshipSuggestion {
  mentionedName: string
  relationshipType: 'parent' | 'child' | 'sibling' | 'spouse'
  mentionContext: string
  uncertain: boolean
  matchedPerson?: PersonSummary
}
