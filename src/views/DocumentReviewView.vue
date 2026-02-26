<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useDocumentsStore } from '@/stores/documents'
import { supabase } from '@/services/supabase'
import type { ExtractionResult, EducationType } from '@/types'
import RelationshipSuggestions from '@/components/RelationshipSuggestions.vue'

const route = useRoute()
const router = useRouter()
const documentsStore = useDocumentsStore()

const documentId = route.params.id as string
const routeState = history.state as { result?: ExtractionResult; personId?: string } | null
const result = routeState?.result ?? null
const personId = routeState?.personId ?? null

const committed = ref(false)
const committing = ref(false)
const commitError = ref<string | null>(null)

// ─── Document preview ─────────────────────────────────────────────────────────

type PreviewState = 'loading' | 'ready' | 'unavailable' | 'error'

const previewState = ref<PreviewState>('loading')
const previewUrl = ref<string | null>(null)
const previewMimeType = ref<string | null>(null)

onMounted(async () => {
  if (!personId) { previewState.value = 'unavailable'; return }
  try {
    await documentsStore.fetchDocuments(personId)
    const doc = documentsStore.documents.find(d => d.id === documentId)
    if (!doc) { previewState.value = 'unavailable'; return }
    previewMimeType.value = doc.mimeType
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storagePath, 3600)
    if (error || !data?.signedUrl) { previewState.value = 'error'; return }
    previewUrl.value = data.signedUrl
    previewState.value = 'ready'
  } catch {
    previewState.value = 'error'
  }
})

// ─── Editable state initialised from extraction result ────────────────────────

const person = reactive({
  firstName:    result?.person.firstName?.value    ?? '',
  lastName:     result?.person.lastName?.value     ?? '',
  birthSurname: result?.person.birthSurname?.value ?? '',
  nickname:     result?.person.nickname?.value     ?? '',
  suffix:       result?.person.suffix?.value       ?? '',
  nameVariants: (result?.person.nameVariants ?? []).join(', '),
  birthDate:    result?.person.birthDate?.value    ?? '',
  birthPlace:   result?.person.birthPlace?.value   ?? '',
  deathDate:    result?.person.deathDate?.value    ?? '',
  deathPlace:   result?.person.deathPlace?.value   ?? '',
  burialPlace:  result?.person.burialPlace?.value  ?? '',
  biography:    result?.person.biography            ?? '',
  notes:        result?.person.notes                ?? '',
})

// Track which scalar ExtractedField values are uncertain so we can highlight
const uncertainFields = new Set<string>([
  result?.person.firstName?.uncertain     ? 'firstName'    : '',
  result?.person.lastName?.uncertain      ? 'lastName'     : '',
  result?.person.birthSurname?.uncertain  ? 'birthSurname' : '',
  result?.person.nickname?.uncertain      ? 'nickname'     : '',
  result?.person.suffix?.uncertain        ? 'suffix'       : '',
  result?.person.birthDate?.uncertain     ? 'birthDate'    : '',
  result?.person.birthPlace?.uncertain    ? 'birthPlace'   : '',
  result?.person.deathDate?.uncertain     ? 'deathDate'    : '',
  result?.person.deathPlace?.uncertain    ? 'deathPlace'   : '',
  result?.person.burialPlace?.uncertain   ? 'burialPlace'  : '',
].filter(Boolean))

function inputClass(field: string): string {
  return [
    'form-input',
    uncertainFields.has(field) ? 'bg-yellow-50 border-yellow-300' : '',
  ].filter(Boolean).join(' ')
}

// ─── List sections ────────────────────────────────────────────────────────────

type EditableResidence = { location: string; fromDate: string; toDate: string; isCurrent: boolean }
type EditableEducation = { institution: string; institutionType: EducationType; startYear: string; endYear: string; graduated: boolean }
type EditableOccupation = { employer: string; title: string; fromDate: string; toDate: string; isCurrent: boolean }
type EditableMilitary   = { branch: string; rank: string; fromDate: string; toDate: string; notes: string }

const residences = ref<EditableResidence[]>(
  (result?.residences ?? []).map(r => ({
    location:  r.location,
    fromDate:  r.fromDate  ?? '',
    toDate:    r.toDate    ?? '',
    isCurrent: r.isCurrent,
  }))
)

const education = ref<EditableEducation[]>(
  (result?.education ?? []).map(e => ({
    institution:     e.institution,
    institutionType: e.institutionType,
    startYear:       e.startYear != null ? String(e.startYear) : '',
    endYear:         e.endYear   != null ? String(e.endYear)   : '',
    graduated:       e.graduated ?? false,
  }))
)

const occupations = ref<EditableOccupation[]>(
  (result?.occupations ?? []).map(o => ({
    employer:  o.employer  ?? '',
    title:     o.title     ?? '',
    fromDate:  o.fromDate  ?? '',
    toDate:    o.toDate    ?? '',
    isCurrent: o.isCurrent,
  }))
)

const militaryService = ref<EditableMilitary[]>(
  (result?.militaryService ?? []).map(m => ({
    branch:   m.branch,
    rank:     m.rank     ?? '',
    fromDate: m.fromDate ?? '',
    toDate:   m.toDate   ?? '',
    notes:    m.notes    ?? '',
  }))
)

function addResidence()   { residences.value.push({ location: '', fromDate: '', toDate: '', isCurrent: false }) }
function addEducation()   { education.value.push({ institution: '', institutionType: 'other', startYear: '', endYear: '', graduated: false }) }
function addOccupation()  { occupations.value.push({ employer: '', title: '', fromDate: '', toDate: '', isCurrent: false }) }
function addMilitary()    { militaryService.value.push({ branch: '', rank: '', fromDate: '', toDate: '', notes: '' }) }

function removeResidence(i: number)  { residences.value.splice(i, 1) }
function removeEducation(i: number)  { education.value.splice(i, 1) }
function removeOccupation(i: number) { occupations.value.splice(i, 1) }
function removeMilitary(i: number)   { militaryService.value.splice(i, 1) }

// ─── Relationship suggestions derived from mentionedNames ────────────────────

const suggestionsFromResult = computed(() =>
  (result?.mentionedNames ?? []).map(m => ({
    mentionedName:    m.name,
    relationshipType: m.relationshipType,
    mentionContext:   m.mentionContext,
    uncertain:        m.uncertain,
  }))
)

// ─── Commit ───────────────────────────────────────────────────────────────────

async function handleCommit() {
  if (!result || !personId) return
  committing.value = true
  commitError.value = null
  try {
    const editedResult: ExtractionResult = {
      ...result,
      person: {
        ...result.person,
        firstName:    { value: person.firstName,    uncertain: result.person.firstName.uncertain },
        lastName:     { value: person.lastName,     uncertain: result.person.lastName.uncertain },
        birthSurname: person.birthSurname ? { value: person.birthSurname, uncertain: result.person.birthSurname?.uncertain ?? false } : undefined,
        nickname:     person.nickname     ? { value: person.nickname,     uncertain: result.person.nickname?.uncertain     ?? false } : undefined,
        suffix:       person.suffix       ? { value: person.suffix,       uncertain: result.person.suffix?.uncertain       ?? false } : undefined,
        nameVariants: person.nameVariants ? person.nameVariants.split(',').map(s => s.trim()).filter(Boolean) : [],
        birthDate:    person.birthDate    ? { value: person.birthDate,    uncertain: result.person.birthDate?.uncertain    ?? false } : undefined,
        birthPlace:   person.birthPlace   ? { value: person.birthPlace,   uncertain: result.person.birthPlace?.uncertain   ?? false } : undefined,
        deathDate:    person.deathDate    ? { value: person.deathDate,    uncertain: result.person.deathDate?.uncertain    ?? false } : undefined,
        deathPlace:   person.deathPlace   ? { value: person.deathPlace,   uncertain: result.person.deathPlace?.uncertain   ?? false } : undefined,
        burialPlace:  person.burialPlace  ? { value: person.burialPlace,  uncertain: result.person.burialPlace?.uncertain  ?? false } : undefined,
        biography: person.biography || undefined,
        notes:     person.notes     || undefined,
      },
      residences: residences.value
        .filter(r => r.location.trim())
        .map(r => ({
          location:  r.location,
          fromDate:  r.fromDate  || undefined,
          toDate:    r.toDate    || undefined,
          isCurrent: r.isCurrent,
        })),
      education: education.value
        .filter(e => e.institution.trim())
        .map(e => ({
          institution:     e.institution,
          institutionType: e.institutionType,
          startYear:  e.startYear ? Number(e.startYear) : undefined,
          endYear:    e.endYear   ? Number(e.endYear)   : undefined,
          graduated:  e.graduated || undefined,
        })),
      occupations: occupations.value
        .filter(o => o.employer.trim() || o.title.trim())
        .map(o => ({
          employer:  o.employer  || undefined,
          title:     o.title     || undefined,
          fromDate:  o.fromDate  || undefined,
          toDate:    o.toDate    || undefined,
          isCurrent: o.isCurrent,
        })),
      militaryService: militaryService.value
        .filter(m => m.branch.trim())
        .map(m => ({
          branch:   m.branch,
          rank:     m.rank     || undefined,
          fromDate: m.fromDate || undefined,
          toDate:   m.toDate   || undefined,
          notes:    m.notes    || undefined,
        })),
    }
    await documentsStore.commitExtraction(documentId, editedResult, personId)
    committed.value = true
    router.push({ name: 'person', params: { id: personId } })
  } catch (err) {
    commitError.value = err instanceof Error ? err.message : 'Failed to commit extraction'
  } finally {
    committing.value = false
  }
}

// ─── Navigation guard ─────────────────────────────────────────────────────────

onBeforeRouteLeave(() => {
  if (committed.value) return true
  return window.confirm('You have uncommitted changes. Leave without committing?')
})
</script>

<template>
  <div class="min-h-screen bg-cream px-4 py-10">
    <!-- Missing state error -->
    <div v-if="!result" class="max-w-xl mx-auto text-center py-20">
      <p class="text-walnut text-lg mb-4">No extraction data found. Please upload a document first.</p>
      <RouterLink to="/upload" class="btn-primary">Back to Upload</RouterLink>
    </div>

    <template v-else>
      <div class="max-w-7xl mx-auto">
        <!-- Page header -->
        <div class="mb-8">
          <h1 class="font-display text-3xl text-walnut">Review Extracted Data</h1>
          <p class="text-walnut-muted text-sm mt-1">
            Review and edit the extracted data below. Existing values will only be overwritten for fields you keep filled in.
          </p>
        </div>

        <!-- Two-column layout on desktop, stacked on mobile -->
        <div class="lg:grid lg:grid-cols-2 lg:gap-8 space-y-8 lg:space-y-0">

          <!-- ── Left column: editable fields ──────────────────────────────── -->
          <div class="space-y-6">

            <!-- Core person -->
            <section class="card p-6">
              <h2 class="font-display text-xl text-walnut mb-4">Core Person</h2>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="form-label">
                    First Name
                    <span v-if="uncertainFields.has('firstName')" class="ml-1 text-yellow-600 text-xs font-semibold">?</span>
                  </label>
                  <input v-model="person.firstName" type="text" :class="inputClass('firstName')" />
                </div>
                <div>
                  <label class="form-label">
                    Last Name
                    <span v-if="uncertainFields.has('lastName')" class="ml-1 text-yellow-600 text-xs font-semibold">?</span>
                  </label>
                  <input v-model="person.lastName" type="text" :class="inputClass('lastName')" />
                </div>
                <div>
                  <label class="form-label">
                    Birth Surname
                    <span v-if="uncertainFields.has('birthSurname')" class="ml-1 text-yellow-600 text-xs font-semibold">?</span>
                  </label>
                  <input v-model="person.birthSurname" type="text" :class="inputClass('birthSurname')" />
                </div>
                <div>
                  <label class="form-label">
                    Nickname
                    <span v-if="uncertainFields.has('nickname')" class="ml-1 text-yellow-600 text-xs font-semibold">?</span>
                  </label>
                  <input v-model="person.nickname" type="text" :class="inputClass('nickname')" />
                </div>
                <div>
                  <label class="form-label">
                    Suffix
                    <span v-if="uncertainFields.has('suffix')" class="ml-1 text-yellow-600 text-xs font-semibold">?</span>
                  </label>
                  <input v-model="person.suffix" type="text" :class="inputClass('suffix')" />
                </div>
                <div>
                  <label class="form-label">Name Variants (comma-separated)</label>
                  <input v-model="person.nameVariants" type="text" class="form-input" placeholder="e.g. Joe, Joey" />
                </div>
              </div>
            </section>

            <!-- Vital dates -->
            <section class="card p-6">
              <h2 class="font-display text-xl text-walnut mb-4">Vital Dates</h2>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="form-label">
                    Birth Date
                    <span v-if="uncertainFields.has('birthDate')" class="ml-1 text-yellow-600 text-xs font-semibold">?</span>
                  </label>
                  <input v-model="person.birthDate" type="text" :class="inputClass('birthDate')" placeholder="YYYY-MM-DD" />
                </div>
                <div>
                  <label class="form-label">
                    Birth Place
                    <span v-if="uncertainFields.has('birthPlace')" class="ml-1 text-yellow-600 text-xs font-semibold">?</span>
                  </label>
                  <input v-model="person.birthPlace" type="text" :class="inputClass('birthPlace')" />
                </div>
                <div>
                  <label class="form-label">
                    Death Date
                    <span v-if="uncertainFields.has('deathDate')" class="ml-1 text-yellow-600 text-xs font-semibold">?</span>
                  </label>
                  <input v-model="person.deathDate" type="text" :class="inputClass('deathDate')" placeholder="YYYY-MM-DD" />
                </div>
                <div>
                  <label class="form-label">
                    Death Place
                    <span v-if="uncertainFields.has('deathPlace')" class="ml-1 text-yellow-600 text-xs font-semibold">?</span>
                  </label>
                  <input v-model="person.deathPlace" type="text" :class="inputClass('deathPlace')" />
                </div>
                <div class="col-span-2">
                  <label class="form-label">
                    Burial Place
                    <span v-if="uncertainFields.has('burialPlace')" class="ml-1 text-yellow-600 text-xs font-semibold">?</span>
                  </label>
                  <input v-model="person.burialPlace" type="text" :class="inputClass('burialPlace')" />
                </div>
              </div>
            </section>

            <!-- Biography -->
            <section class="card p-6">
              <h2 class="font-display text-xl text-walnut mb-4">Biography</h2>
              <textarea v-model="person.biography" class="form-input min-h-32 resize-y" rows="5" />
            </section>

            <!-- Notes -->
            <section class="card p-6">
              <h2 class="font-display text-xl text-walnut mb-4">Notes</h2>
              <textarea v-model="person.notes" class="form-input min-h-24 resize-y" rows="3" placeholder="Cross-references, source notes…" />
            </section>

            <!-- Residences -->
            <section class="card p-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="font-display text-xl text-walnut">Residences</h2>
                <button type="button" class="btn-secondary text-xs" @click="addResidence">+ Add</button>
              </div>
              <div v-if="residences.length === 0" class="text-walnut-muted text-sm italic">No residences extracted.</div>
              <div v-for="(r, i) in residences" :key="i" class="border border-parchment rounded-lg p-4 mb-3 last:mb-0">
                <div class="grid grid-cols-2 gap-3">
                  <div class="col-span-2">
                    <label class="form-label">Location</label>
                    <input v-model="r.location" type="text" class="form-input" />
                  </div>
                  <div>
                    <label class="form-label">From</label>
                    <input v-model="r.fromDate" type="text" class="form-input" placeholder="YYYY-MM-DD" />
                  </div>
                  <div>
                    <label class="form-label">To</label>
                    <input v-model="r.toDate" type="text" class="form-input" placeholder="YYYY-MM-DD" />
                  </div>
                  <div class="col-span-2 flex items-center justify-between">
                    <label class="flex items-center gap-2 text-sm text-walnut cursor-pointer">
                      <input v-model="r.isCurrent" type="checkbox" class="rounded" />
                      Current residence
                    </label>
                    <button type="button" class="text-xs text-red-500 hover:text-red-700" @click="removeResidence(i)">Remove</button>
                  </div>
                </div>
              </div>
            </section>

            <!-- Education -->
            <section class="card p-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="font-display text-xl text-walnut">Education</h2>
                <button type="button" class="btn-secondary text-xs" @click="addEducation">+ Add</button>
              </div>
              <div v-if="education.length === 0" class="text-walnut-muted text-sm italic">No education extracted.</div>
              <div v-for="(e, i) in education" :key="i" class="border border-parchment rounded-lg p-4 mb-3 last:mb-0">
                <div class="grid grid-cols-2 gap-3">
                  <div class="col-span-2">
                    <label class="form-label">Institution</label>
                    <input v-model="e.institution" type="text" class="form-input" />
                  </div>
                  <div>
                    <label class="form-label">Type</label>
                    <select v-model="e.institutionType" class="form-input">
                      <option value="high_school">High School</option>
                      <option value="college">College</option>
                      <option value="university">University</option>
                      <option value="vocational">Vocational</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label class="form-label">Start Year</label>
                      <input v-model="e.startYear" type="text" class="form-input" placeholder="YYYY" />
                    </div>
                    <div>
                      <label class="form-label">End Year</label>
                      <input v-model="e.endYear" type="text" class="form-input" placeholder="YYYY" />
                    </div>
                  </div>
                  <div class="col-span-2 flex items-center justify-between">
                    <label class="flex items-center gap-2 text-sm text-walnut cursor-pointer">
                      <input v-model="e.graduated" type="checkbox" class="rounded" />
                      Graduated
                    </label>
                    <button type="button" class="text-xs text-red-500 hover:text-red-700" @click="removeEducation(i)">Remove</button>
                  </div>
                </div>
              </div>
            </section>

            <!-- Occupations -->
            <section class="card p-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="font-display text-xl text-walnut">Occupations</h2>
                <button type="button" class="btn-secondary text-xs" @click="addOccupation">+ Add</button>
              </div>
              <div v-if="occupations.length === 0" class="text-walnut-muted text-sm italic">No occupations extracted.</div>
              <div v-for="(o, i) in occupations" :key="i" class="border border-parchment rounded-lg p-4 mb-3 last:mb-0">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="form-label">Employer</label>
                    <input v-model="o.employer" type="text" class="form-input" />
                  </div>
                  <div>
                    <label class="form-label">Title</label>
                    <input v-model="o.title" type="text" class="form-input" />
                  </div>
                  <div>
                    <label class="form-label">From</label>
                    <input v-model="o.fromDate" type="text" class="form-input" placeholder="YYYY-MM-DD" />
                  </div>
                  <div>
                    <label class="form-label">To</label>
                    <input v-model="o.toDate" type="text" class="form-input" placeholder="YYYY-MM-DD" />
                  </div>
                  <div class="col-span-2 flex items-center justify-between">
                    <label class="flex items-center gap-2 text-sm text-walnut cursor-pointer">
                      <input v-model="o.isCurrent" type="checkbox" class="rounded" />
                      Current position
                    </label>
                    <button type="button" class="text-xs text-red-500 hover:text-red-700" @click="removeOccupation(i)">Remove</button>
                  </div>
                </div>
              </div>
            </section>

            <!-- Military Service -->
            <section class="card p-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="font-display text-xl text-walnut">Military Service</h2>
                <button type="button" class="btn-secondary text-xs" @click="addMilitary">+ Add</button>
              </div>
              <div v-if="militaryService.length === 0" class="text-walnut-muted text-sm italic">No military service extracted.</div>
              <div v-for="(m, i) in militaryService" :key="i" class="border border-parchment rounded-lg p-4 mb-3 last:mb-0">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="form-label">Branch</label>
                    <input v-model="m.branch" type="text" class="form-input" />
                  </div>
                  <div>
                    <label class="form-label">Rank</label>
                    <input v-model="m.rank" type="text" class="form-input" />
                  </div>
                  <div>
                    <label class="form-label">From</label>
                    <input v-model="m.fromDate" type="text" class="form-input" placeholder="YYYY-MM-DD" />
                  </div>
                  <div>
                    <label class="form-label">To</label>
                    <input v-model="m.toDate" type="text" class="form-input" placeholder="YYYY-MM-DD" />
                  </div>
                  <div class="col-span-2">
                    <label class="form-label">Notes</label>
                    <input v-model="m.notes" type="text" class="form-input" />
                  </div>
                  <div class="col-span-2 flex justify-end">
                    <button type="button" class="text-xs text-red-500 hover:text-red-700" @click="removeMilitary(i)">Remove</button>
                  </div>
                </div>
              </div>
            </section>

            <!-- Marriages (read-only) -->
            <section class="card p-6">
              <h2 class="font-display text-xl text-walnut mb-2">Marriages</h2>
              <p class="text-xs text-walnut-muted mb-4 italic">
                Marriages will be reviewed in the Relationships section below.
              </p>
              <div v-if="!result.marriages.length" class="text-walnut-muted text-sm italic">No marriages extracted.</div>
              <div v-for="(m, i) in result.marriages" :key="i" class="border border-parchment rounded-lg p-4 mb-3 last:mb-0 bg-parchment/20">
                <p class="text-sm font-medium text-walnut">{{ m.spouseName }}</p>
                <div class="mt-1 text-xs text-walnut-muted space-y-0.5">
                  <p v-if="m.marriageDate?.value">Married: {{ m.marriageDate.value }}</p>
                  <p v-if="m.marriagePlace?.value">Place: {{ m.marriagePlace.value }}</p>
                  <p v-if="m.endDate">Ended: {{ m.endDate }}<span v-if="m.endReason"> ({{ m.endReason }})</span></p>
                </div>
              </div>
            </section>

          </div>

          <!-- ── Right column ────────────────────────────────────────────────── -->
          <div class="space-y-6">

            <!-- Document Preview -->
            <div class="card p-6">
              <h2 class="font-display text-xl text-walnut mb-4">Document Preview</h2>

              <div v-if="previewState === 'loading'" class="text-sm text-walnut-muted italic">
                Loading preview…
              </div>

              <div v-else-if="previewState === 'error'" class="text-sm text-walnut-muted italic">
                Preview unavailable.
              </div>

              <div v-else-if="previewState === 'unavailable'" class="text-sm text-walnut-muted italic">
                Preview unavailable.
              </div>

              <template v-else-if="previewState === 'ready' && previewUrl">
                <!-- PDF: inline iframe -->
                <template v-if="previewMimeType === 'application/pdf'">
                  <iframe
                    :src="previewUrl"
                    class="w-full h-96 rounded border border-parchment"
                    title="Document preview"
                  />
                </template>

                <!-- Word doc: download link only -->
                <template v-else>
                  <p class="text-sm text-walnut-muted mb-3">
                    Document preview not available for Word files. Open the original document for reference.
                  </p>
                  <a
                    :href="previewUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn-secondary text-sm inline-block"
                  >
                    Download Original Document
                  </a>
                </template>
              </template>
            </div>

            <div class="card p-6 lg:sticky lg:top-8">
              <h2 class="font-display text-xl text-walnut mb-4">Commit Changes</h2>

              <p class="text-sm text-walnut-muted mb-6">
                Once you commit, all filled-in fields will be written to the person's record.
                Marriages are handled separately in the Relationships section.
              </p>

              <p v-if="commitError" class="error-text mb-4">{{ commitError }}</p>

              <button
                type="button"
                class="btn-primary w-full"
                :disabled="committing"
                @click="handleCommit"
              >
                <span v-if="committing" class="flex items-center justify-center gap-2">
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Committing…
                </span>
                <span v-else>Commit Extraction</span>
              </button>

              <RouterLink
                to="/upload"
                class="block text-center text-sm text-walnut-muted hover:text-walnut mt-4 underline"
              >
                Cancel &amp; return to upload
              </RouterLink>
            </div>

            <!-- Relationship Suggestions -->
            <div class="card p-6">
              <h2 class="font-display text-xl text-walnut mb-4">Relationship Suggestions</h2>
              <RelationshipSuggestions
                v-if="personId"
                :suggestions="suggestionsFromResult"
                :personId="personId"
              />
              <p v-else class="text-sm text-walnut-muted italic">
                No person linked — relationship suggestions unavailable.
              </p>
            </div>
          </div>

        </div>
      </div>
    </template>
  </div>
</template>
