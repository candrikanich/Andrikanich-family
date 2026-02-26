import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

// ── Hoisted mock setup ─────────────────────────────────────────────────────────
const { mockDocumentsStore, mockPeopleStore } = vi.hoisted(() => {
  const mockDocumentsStore = {
    uploading: false,
    extracting: false,
    error: null as string | null,
    uploadDocument: vi.fn(),
  }
  const mockPeopleStore = {
    list: [] as { id: string; firstName: string; lastName: string; birthDate: string | null }[],
    fetchPeople: vi.fn(),
  }
  return { mockDocumentsStore, mockPeopleStore }
})

vi.mock('@/stores/documents', () => ({
  useDocumentsStore: vi.fn(() => mockDocumentsStore),
}))

vi.mock('@/stores/people', () => ({
  usePeopleStore: vi.fn(() => mockPeopleStore),
}))

import UploadView from '@/views/UploadView.vue'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/upload', component: UploadView },
      { path: '/document-review/:id', name: 'document-review', component: { template: '<div />' } },
    ],
  })
}

function makePdf(name = 'doc.pdf', sizeBytes = 1024): File {
  const content = 'x'.repeat(sizeBytes)
  return new File([content], name, { type: 'application/pdf' })
}

function makeDocx(name = 'doc.docx', sizeBytes = 1024): File {
  const content = 'x'.repeat(sizeBytes)
  return new File(
    [content],
    name,
    { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  )
}

function makeDoc(name = 'doc.doc', sizeBytes = 1024): File {
  return new File(['x'.repeat(sizeBytes)], name, { type: 'application/msword' })
}

function makeTxt(name = 'doc.txt', sizeBytes = 1024): File {
  return new File(['x'.repeat(sizeBytes)], name, { type: 'text/plain' })
}

function makeOversizedPdf(): File {
  const FIFTY_ONE_MB = 51 * 1024 * 1024
  // Build a File with .size reflecting the desired byte count via Blob
  const blob = new Blob([new Uint8Array(FIFTY_ONE_MB)], { type: 'application/pdf' })
  return new File([blob], 'huge.pdf', { type: 'application/pdf' })
}

async function mountView() {
  const router = makeRouter()
  await router.push('/upload')
  const wrapper = mount(UploadView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
  return wrapper
}

async function triggerFileInput(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.find('input[type="file"]')
  // @vue/test-utils does not support files via setValue, trigger Object.defineProperty
  Object.defineProperty(input.element, 'files', {
    value: [file],
    writable: false,
    configurable: true,
  })
  await input.trigger('change')
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('UploadView — file validation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockDocumentsStore.uploading = false
    mockDocumentsStore.extracting = false
    mockDocumentsStore.error = null
  })

  it('accepts a .pdf file with correct MIME type', async () => {
    const wrapper = await mountView()
    await triggerFileInput(wrapper, makePdf())
    expect(wrapper.find('.error-text').exists()).toBe(false)
  })

  it('accepts a .docx file with correct MIME type', async () => {
    const wrapper = await mountView()
    await triggerFileInput(wrapper, makeDocx())
    expect(wrapper.find('.error-text').exists()).toBe(false)
  })

  it('rejects a .doc file (unsupported extension)', async () => {
    const wrapper = await mountView()
    await triggerFileInput(wrapper, makeDoc())
    const error = wrapper.find('.error-text')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('.docx and .pdf')
  })

  it('rejects a .txt file (unsupported type)', async () => {
    const wrapper = await mountView()
    await triggerFileInput(wrapper, makeTxt())
    const error = wrapper.find('.error-text')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('.docx and .pdf')
  })

  it('rejects a file larger than 50 MB', async () => {
    const wrapper = await mountView()
    await triggerFileInput(wrapper, makeOversizedPdf())
    const error = wrapper.find('.error-text')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('50 MB')
  })

  it('accepts a file exactly at 50 MB', async () => {
    const wrapper = await mountView()
    const fiftyMb = new File([new Uint8Array(50 * 1024 * 1024)], 'max.pdf', { type: 'application/pdf' })
    await triggerFileInput(wrapper, fiftyMb)
    expect(wrapper.find('.error-text').exists()).toBe(false)
  })
})

describe('UploadView — form state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockDocumentsStore.uploading = false
    mockDocumentsStore.extracting = false
    mockDocumentsStore.error = null
    mockPeopleStore.list = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('upload button is disabled when no file is selected', async () => {
    const wrapper = await mountView()
    const button = wrapper.find('button[type="button"]:last-of-type')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('upload button is disabled when no person is selected (even with file)', async () => {
    const wrapper = await mountView()
    await triggerFileInput(wrapper, makePdf())
    const button = wrapper.find('button[type="button"]:last-of-type')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('upload button is enabled when both file and person are selected', async () => {
    mockPeopleStore.list = [
      { id: 'p1', firstName: 'John', lastName: 'Doe', birthDate: null },
    ]
    mockPeopleStore.fetchPeople.mockResolvedValue(undefined)

    const wrapper = await mountView()

    // Type in the search field to trigger person search
    const input = wrapper.find('input[type="text"]')
    await input.setValue('John')
    await input.trigger('input')

    // Advance the 300ms debounce timer
    await vi.advanceTimersByTimeAsync(350)
    await wrapper.vm.$nextTick()

    // Click the first dropdown result to select the person
    const listItem = wrapper.find('ul li')
    expect(listItem.exists()).toBe(true)
    await listItem.trigger('mousedown')
    await wrapper.vm.$nextTick()

    // Select the file
    await triggerFileInput(wrapper, makePdf())
    await wrapper.vm.$nextTick()

    const button = wrapper.find('button[type="button"]:last-of-type')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('UploadView — progress state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows "Uploading file…" when documentsStore.uploading is true', async () => {
    mockDocumentsStore.uploading = true
    mockDocumentsStore.extracting = false
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Uploading file…')
  })

  it('shows "Extracting data with AI…" when documentsStore.extracting is true', async () => {
    mockDocumentsStore.uploading = false
    mockDocumentsStore.extracting = true
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Extracting data with AI…')
  })

  it('shows no progress text when both uploading and extracting are false', async () => {
    mockDocumentsStore.uploading = false
    mockDocumentsStore.extracting = false
    const wrapper = await mountView()
    expect(wrapper.text()).not.toContain('Uploading file…')
    expect(wrapper.text()).not.toContain('Extracting data with AI…')
  })
})
