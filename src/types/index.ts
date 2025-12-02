export interface FamilyMember {
  id: string
  firstName: string
  lastName: string
  birthDate?: string
  deathDate?: string
  location?: string
  bio?: string
  profilePhotoUrl?: string
  fatherId?: string
  motherId?: string
  spouseId?: string
  createdAt: string
  updatedAt: string
  createdBy: string
  lastModifiedBy: string
}

export interface EditHistoryEntry {
  id: string
  memberId: string
  fieldChanged: string
  previousValue: string | null
  newValue: string | null
  changedBy: string
  changedAt: string
}

export interface FamilyDocument {
  id: string
  memberId: string
  fileName: string
  fileUrl: string
  fileType: 'image' | 'pdf' | 'other'
  description?: string
  uploadedAt: string
  uploadedBy: string
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'viewer' | 'editor'
  createdAt: string
}

export interface AppState {
  currentUser: User | null
  isAuthenticated: boolean
  isLoading: boolean
}
