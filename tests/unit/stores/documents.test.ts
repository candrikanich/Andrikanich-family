import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// ── Hoisted mock setup ────────────────────────────────────────────────────────
const { mockStorageUpload, mockFunctionsInvoke, mockChain, mockFrom } = vi.hoisted(() => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(),
  }
  const mockFrom = vi.fn(() => mockChain)
  const mockStorageUpload = vi.fn()
  const mockFunctionsInvoke = vi.fn()
  return { mockStorageUpload, mockFunctionsInvoke, mockChain, mockFrom }
})

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: mockFrom,
    storage: {
      from: vi.fn(() => ({ upload: mockStorageUpload })),
    },
    functions: {
      invoke: mockFunctionsInvoke,
    },
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    profile: { id: 'user-1' },
  })),
}))

import { useDocumentsStore } from '@/stores/documents'
import type { Document, ExtractionResult } from '@/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DOC_ROW = {
  id: 'doc-1',
  person_id: 'person-1',
  storage_path: 'person-1/uuid-test.pdf',
  original_filename: 'test.pdf',
  mime_type: 'application/pdf',
  uploaded_by: 'user-1',
  uploaded_at: '2026-01-01T00:00:00Z',
  extraction_status: 'pending',
}

const DOC: Document = {
  id: 'doc-1',
  personId: 'person-1',
  storagePath: 'person-1/uuid-test.pdf',
  originalFilename: 'test.pdf',
  mimeType: 'application/pdf',
  uploadedBy: 'user-1',
  uploadedAt: '2026-01-01T00:00:00Z',
  extractionStatus: 'pending',
}

const EXTRACTION_RESULT: ExtractionResult = {
  person: {
    firstName: { value: 'John', uncertain: false },
    lastName: { value: 'Doe', uncertain: false },
    birthDate: { value: '1920-05-10', uncertain: true },
    birthPlace: { value: 'Cleveland, OH', uncertain: false },
  },
  residences: [{ location: 'Cleveland, OH', fromDate: '1920', toDate: '1940', isCurrent: false }],
  education: [{ institution: 'Cleveland High', institutionType: 'high_school', startYear: 1934, endYear: 1938, graduated: true }],
  occupations: [{ employer: 'Steel Co', title: 'Foreman', fromDate: '1940', toDate: '1960', isCurrent: false }],
  militaryService: [{ branch: 'Army', rank: 'Private', fromDate: '1942', toDate: '1945', notes: 'WWII' }],
  marriages: [],
  mentionedNames: [],
}

const makeFile = () => new File(['content'], 'test.pdf', { type: 'application/pdf' })

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetChain() {
  Object.keys(mockChain).forEach(k => {
    const fn = (mockChain as Record<string, ReturnType<typeof vi.fn>>)[k]
    if (k !== 'single') fn.mockReturnThis()
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDocumentsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    resetChain()
  })

  // ── Initial state ────────────────────────────────────────────────────────

  it('initialises with empty state', () => {
    const store = useDocumentsStore()
    expect(store.documents).toEqual([])
    expect(store.uploading).toBe(false)
    expect(store.extracting).toBe(false)
    expect(store.error).toBeNull()
    expect(store.currentResult).toBeNull()
  })

  // ── fetchDocuments ───────────────────────────────────────────────────────

  it('fetchDocuments populates documents and maps snake_case → camelCase', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [DOC_ROW], error: null })
    const store = useDocumentsStore()
    await store.fetchDocuments('person-1')
    expect(store.documents).toEqual([DOC])
    expect(mockChain.eq).toHaveBeenCalledWith('person_id', 'person-1')
    expect(mockChain.order).toHaveBeenCalledWith('uploaded_at', { ascending: false })
  })

  it('fetchDocuments sets error and rethrows on DB failure', async () => {
    mockChain.order.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    const store = useDocumentsStore()
    await expect(store.fetchDocuments('person-1')).rejects.toMatchObject({ message: 'DB error' })
    expect(store.error).toBe('DB error')
  })

  // ── uploadDocument ───────────────────────────────────────────────────────

  it('uploadDocument uploads to storage, inserts document row, calls Edge Function, returns result', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: null })
    mockChain.single.mockResolvedValueOnce({ data: DOC_ROW, error: null })
    mockFunctionsInvoke.mockResolvedValueOnce({ data: EXTRACTION_RESULT, error: null })

    const store = useDocumentsStore()
    const result = await store.uploadDocument('person-1', makeFile())

    expect(mockStorageUpload).toHaveBeenCalledOnce()
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        person_id: 'person-1',
        original_filename: 'test.pdf',
        mime_type: 'application/pdf',
        uploaded_by: 'user-1',
        extraction_status: 'pending',
      }),
    )
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('extract-document', { body: { documentId: 'doc-1' } })
    expect(result).toEqual(EXTRACTION_RESULT)
    expect(store.currentResult).toEqual(EXTRACTION_RESULT)
    expect(store.uploading).toBe(false)
    expect(store.extracting).toBe(false)
  })

  it('uploadDocument sets error and clears flags when storage upload fails', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: { message: 'Storage error' } })

    const store = useDocumentsStore()
    await expect(store.uploadDocument('person-1', makeFile())).rejects.toMatchObject({ message: 'Storage error' })
    expect(store.error).toBe('Storage error')
    expect(store.uploading).toBe(false)
    expect(store.extracting).toBe(false)
  })

  it('uploadDocument sets error and clears flags when DB insert fails', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: null })
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'Insert failed' } })

    const store = useDocumentsStore()
    await expect(store.uploadDocument('person-1', makeFile())).rejects.toMatchObject({ message: 'Insert failed' })
    expect(store.error).toBe('Insert failed')
    expect(store.uploading).toBe(false)
    expect(store.extracting).toBe(false)
  })

  it('uploadDocument sets error and clears flags when Edge Function fails', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: null })
    mockChain.single.mockResolvedValueOnce({ data: DOC_ROW, error: null })
    mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: { message: 'Function error' } })

    const store = useDocumentsStore()
    await expect(store.uploadDocument('person-1', makeFile())).rejects.toMatchObject({ message: 'Function error' })
    expect(store.error).toBe('Function error')
    expect(store.uploading).toBe(false)
    expect(store.extracting).toBe(false)
  })

  // ── commitExtraction ─────────────────────────────────────────────────────

  it('commitExtraction patches people, inserts related rows, marks document committed', async () => {
    // people update, residences insert, education insert, occupations insert, military_service insert, documents update
    mockChain.eq
      .mockResolvedValueOnce({ error: null }) // people update
      .mockResolvedValueOnce({ error: null }) // documents update (committed)
    mockChain.insert
      .mockResolvedValueOnce({ error: null }) // residences
      .mockResolvedValueOnce({ error: null }) // education
      .mockResolvedValueOnce({ error: null }) // occupations
      .mockResolvedValueOnce({ error: null }) // military_service

    const store = useDocumentsStore()
    store.documents = [DOC]
    store.currentResult = EXTRACTION_RESULT
    await store.commitExtraction('doc-1', EXTRACTION_RESULT, 'person-1')

    // people patch with snake_case fields
    const updateCalls = (mockChain.update as ReturnType<typeof vi.fn>).mock.calls
    expect(updateCalls[0][0]).toMatchObject({
      first_name: 'John',
      last_name: 'Doe',
      birth_date: '1920-05-10',
      birth_place: 'Cleveland, OH',
    })

    // documents status update
    expect(updateCalls[1][0]).toEqual({ extraction_status: 'committed' })

    // currentResult cleared
    expect(store.currentResult).toBeNull()
    // document status updated locally
    expect(store.documents[0].extractionStatus).toBe('committed')
  })

  it('commitExtraction maps residences to snake_case columns', async () => {
    const resultWithResidences: ExtractionResult = {
      ...EXTRACTION_RESULT,
      education: [],
      occupations: [],
      militaryService: [],
    }
    mockChain.eq
      .mockResolvedValueOnce({ error: null }) // people update
      .mockResolvedValueOnce({ error: null }) // documents update
    mockChain.insert
      .mockResolvedValueOnce({ error: null }) // residences

    const store = useDocumentsStore()
    await store.commitExtraction('doc-1', resultWithResidences, 'person-1')

    const insertCalls = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls
    expect(insertCalls[0][0][0]).toMatchObject({
      person_id: 'person-1',
      location: 'Cleveland, OH',
      from_date: '1920',
      to_date: '1940',
      is_current: false,
    })
  })

  it('commitExtraction maps education to snake_case columns', async () => {
    const resultWithEdu: ExtractionResult = {
      ...EXTRACTION_RESULT,
      residences: [],
      occupations: [],
      militaryService: [],
    }
    mockChain.eq
      .mockResolvedValueOnce({ error: null }) // people update
      .mockResolvedValueOnce({ error: null }) // documents update
    mockChain.insert
      .mockResolvedValueOnce({ error: null }) // education

    const store = useDocumentsStore()
    await store.commitExtraction('doc-1', resultWithEdu, 'person-1')

    const insertCalls = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls
    expect(insertCalls[0][0][0]).toMatchObject({
      person_id: 'person-1',
      institution: 'Cleveland High',
      institution_type: 'high_school',
      start_year: 1934,
      end_year: 1938,
      graduated: true,
    })
  })

  it('commitExtraction maps military_service to snake_case columns', async () => {
    const resultWithMil: ExtractionResult = {
      ...EXTRACTION_RESULT,
      residences: [],
      education: [],
      occupations: [],
    }
    mockChain.eq
      .mockResolvedValueOnce({ error: null }) // people update
      .mockResolvedValueOnce({ error: null }) // documents update
    mockChain.insert
      .mockResolvedValueOnce({ error: null }) // military_service

    const store = useDocumentsStore()
    await store.commitExtraction('doc-1', resultWithMil, 'person-1')

    const insertCalls = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls
    expect(insertCalls[0][0][0]).toMatchObject({
      person_id: 'person-1',
      branch: 'Army',
      rank: 'Private',
      from_date: '1942',
      to_date: '1945',
      notes: 'WWII',
    })
  })

  it('commitExtraction skips people patch when all fields are empty', async () => {
    const emptyPersonResult: ExtractionResult = {
      ...EXTRACTION_RESULT,
      person: {
        firstName: { value: '', uncertain: false },
        lastName: { value: '', uncertain: false },
      },
      residences: [],
      education: [],
      occupations: [],
      militaryService: [],
    }
    mockChain.eq.mockResolvedValueOnce({ error: null }) // documents update only

    const store = useDocumentsStore()
    await store.commitExtraction('doc-1', emptyPersonResult, 'person-1')

    // update called once — only for documents status, not people
    const updateCalls = (mockChain.update as ReturnType<typeof vi.fn>).mock.calls
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0][0]).toEqual({ extraction_status: 'committed' })
  })

  it('commitExtraction sets error and rethrows on DB failure', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: { message: 'Commit failed' } })

    const store = useDocumentsStore()
    await expect(
      store.commitExtraction('doc-1', EXTRACTION_RESULT, 'person-1'),
    ).rejects.toMatchObject({ message: 'Commit failed' })
    expect(store.error).toBe('Commit failed')
  })

  // ── dismissDocument ──────────────────────────────────────────────────────

  it('dismissDocument sets extraction_status to reviewed and removes from local list', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: null })

    const store = useDocumentsStore()
    store.documents = [DOC]
    await store.dismissDocument('doc-1')

    expect(mockChain.update).toHaveBeenCalledWith({ extraction_status: 'reviewed' })
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'doc-1')
    expect(store.documents).toEqual([])
  })

  it('dismissDocument sets error and rethrows on DB failure', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: { message: 'Dismiss failed' } })

    const store = useDocumentsStore()
    store.documents = [DOC]
    await expect(store.dismissDocument('doc-1')).rejects.toMatchObject({ message: 'Dismiss failed' })
    expect(store.error).toBe('Dismiss failed')
    // local list unchanged on failure
    expect(store.documents).toHaveLength(1)
  })
})
