# Phase 5 — Media & Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add photo galleries per person, automatic edit history via DB triggers, and PDF export via print CSS.

**Architecture:** The `media` table and bucket already exist (migration 004). Edit history uses a PostgreSQL trigger function that writes field-level diffs to `edit_history` on any UPDATE to `people`, `marriages`, `parent_child`, `residences`, `education`, `occupations`, and `military_service`. PDF export is purely client-side via `window.print()` with `@media print` CSS rules.

**Tech Stack:** Vue 3, Pinia, Supabase (PostgreSQL triggers, Storage), Vitest, TailwindCSS v4

---

## Task 1: SQL Migration — Edit History Triggers

**Files:**
- Create: `planning/sql/005_edit_history_triggers.sql`

**Step 1: Create the migration file**

```sql
-- ============================================================
-- Genealogy Tracker — Edit History Triggers Migration 005
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Run AFTER 001_schema.sql
-- ============================================================

-- ─── RLS policies for edit_history ───────────────────────────────────────────
-- Triggers run SECURITY DEFINER so they bypass RLS for INSERT.
-- Editors and admins can SELECT; nobody can INSERT/UPDATE/DELETE directly.

ALTER TABLE edit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "edit_history: editors can read" ON edit_history;
CREATE POLICY "edit_history: editors can read"
  ON edit_history FOR SELECT
  USING (is_editor());

-- ─── Trigger function ─────────────────────────────────────────────────────────
-- Records one row per changed field on UPDATE.
-- Records a single _created row on INSERT.
-- Skips metadata fields: id, created_at, updated_at.

CREATE OR REPLACE FUNCTION record_edit_history()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  old_json JSONB;
  new_json JSONB;
  col      TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);

    FOR col IN SELECT jsonb_object_keys(new_json) LOOP
      CONTINUE WHEN col IN ('id', 'created_at', 'updated_at');
      IF old_json->col IS DISTINCT FROM new_json->col THEN
        INSERT INTO edit_history
          (table_name, record_id, field_name, old_value, new_value, changed_by)
        VALUES
          (TG_TABLE_NAME, NEW.id, col, old_json->col, new_json->col, auth.uid());
      END IF;
    END LOOP;

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO edit_history
      (table_name, record_id, field_name, old_value, new_value, changed_by)
    VALUES
      (TG_TABLE_NAME, NEW.id, '_created', NULL, to_jsonb(NEW), auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Attach triggers ──────────────────────────────────────────────────────────
-- Drop first so the file is safe to re-run.

DROP TRIGGER IF EXISTS trg_people_edit_history         ON people;
DROP TRIGGER IF EXISTS trg_marriages_edit_history      ON marriages;
DROP TRIGGER IF EXISTS trg_parent_child_edit_history   ON parent_child;
DROP TRIGGER IF EXISTS trg_residences_edit_history     ON residences;
DROP TRIGGER IF EXISTS trg_education_edit_history      ON education;
DROP TRIGGER IF EXISTS trg_occupations_edit_history    ON occupations;
DROP TRIGGER IF EXISTS trg_military_edit_history       ON military_service;

CREATE TRIGGER trg_people_edit_history
  AFTER INSERT OR UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_marriages_edit_history
  AFTER INSERT OR UPDATE ON marriages
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_parent_child_edit_history
  AFTER INSERT OR UPDATE ON parent_child
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_residences_edit_history
  AFTER INSERT OR UPDATE ON residences
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_education_edit_history
  AFTER INSERT OR UPDATE ON education
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_occupations_edit_history
  AFTER INSERT OR UPDATE ON occupations
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_military_edit_history
  AFTER INSERT OR UPDATE ON military_service
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();
```

**Step 2: Run in Supabase**

Paste into Supabase Dashboard → SQL Editor → New Query → Run.

Expected: no errors, 7 triggers created.

**Step 3: Smoke test**

In the SQL editor, run:
```sql
UPDATE people SET notes = 'test' WHERE id = (SELECT id FROM people LIMIT 1);
SELECT * FROM edit_history ORDER BY changed_at DESC LIMIT 5;
```
Expected: one row in `edit_history` with `field_name = 'notes'`.

Reset: `UPDATE people SET notes = NULL WHERE notes = 'test';`

**Step 4: Commit**

```bash
git add planning/sql/005_edit_history_triggers.sql
git commit -m "feat: add edit history trigger migration (005)"
```

---

## Task 2: `useMedia` Composable

**Files:**
- Create: `src/composables/useMedia.ts`
- Create: `tests/unit/composables/useMedia.test.ts`

**Step 1: Write the failing tests**

```ts
// tests/unit/composables/useMedia.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockStorageUpload, mockStorageRemove, mockStorageSignedUrls, mockStorageFrom, mockChain, mockFrom } = vi.hoisted(() => {
  const mockChain = {
    select:   vi.fn().mockReturnThis(),
    insert:   vi.fn().mockReturnThis(),
    update:   vi.fn().mockReturnThis(),
    delete:   vi.fn().mockReturnThis(),
    eq:       vi.fn().mockReturnThis(),
    order:    vi.fn().mockResolvedValue({ data: [], error: null }),
    single:   vi.fn(),
  }
  const mockFrom = vi.fn(() => mockChain)
  const mockStorageUpload       = vi.fn()
  const mockStorageRemove       = vi.fn()
  const mockStorageSignedUrls   = vi.fn()
  const mockStorageFrom         = vi.fn(() => ({
    upload:          mockStorageUpload,
    remove:          mockStorageRemove,
    createSignedUrls: mockStorageSignedUrls,
  }))
  return { mockStorageUpload, mockStorageRemove, mockStorageSignedUrls, mockStorageFrom, mockChain, mockFrom }
})

vi.mock('@/services/supabase', () => ({
  supabase: {
    from:    mockFrom,
    storage: { from: mockStorageFrom },
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({ profile: { id: 'user-1' } })),
}))

import { useMedia } from '@/composables/useMedia'

const MEDIA_ROW = {
  id: 'photo-1', person_id: 'person-1', storage_path: 'person-1/photo-1.jpg',
  caption: 'Wedding', year_approx: 1950, uploaded_by: 'user-1', uploaded_at: '2026-01-01T00:00:00Z',
}

describe('useMedia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('load fetches photos and resolves signed URLs', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [MEDIA_ROW], error: null })
    mockStorageSignedUrls.mockResolvedValueOnce({
      data: [{ path: 'person-1/photo-1.jpg', signedUrl: 'https://cdn.example.com/photo-1.jpg' }],
      error: null,
    })

    const media = useMedia('person-1')
    await media.load()

    expect(media.photos.value).toHaveLength(1)
    expect(media.photos.value[0].id).toBe('photo-1')
    expect(media.urls.value['person-1/photo-1.jpg']).toBe('https://cdn.example.com/photo-1.jpg')
  })

  it('load sets error when db fetch fails', async () => {
    mockChain.order.mockResolvedValueOnce({ data: null, error: { message: 'db error' } })

    const media = useMedia('person-1')
    await expect(media.load()).rejects.toThrow('db error')
    expect(media.error.value).toBe('db error')
  })

  it('upload stores file, inserts row, and reloads', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: null })
    mockChain.single.mockResolvedValueOnce({ data: MEDIA_ROW, error: null })
    // reload
    mockChain.order.mockResolvedValueOnce({ data: [MEDIA_ROW], error: null })
    mockStorageSignedUrls.mockResolvedValueOnce({
      data: [{ path: 'person-1/photo-1.jpg', signedUrl: 'https://cdn.example.com/photo-1.jpg' }],
      error: null,
    })

    const media = useMedia('person-1')
    const file = new File(['data'], 'photo-1.jpg', { type: 'image/jpeg' })
    await media.upload(file, 'Wedding', 1950)

    expect(mockStorageUpload).toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledWith('media')
    expect(media.photos.value).toHaveLength(1)
  })

  it('remove deletes from storage and db then reloads', async () => {
    mockStorageRemove.mockResolvedValueOnce({ error: null })
    mockChain.eq.mockResolvedValueOnce({ error: null })
    mockChain.order.mockResolvedValueOnce({ data: [], error: null })
    mockStorageSignedUrls.mockResolvedValueOnce({ data: [], error: null })

    const media = useMedia('person-1')
    const photo = {
      id: 'photo-1', personId: 'person-1', storagePath: 'person-1/photo-1.jpg',
      caption: null, yearApprox: null, uploadedBy: null, uploadedAt: '',
    }
    await media.remove(photo)

    expect(mockStorageRemove).toHaveBeenCalledWith(['person-1/photo-1.jpg'])
    expect(media.photos.value).toHaveLength(0)
  })

  it('setPrimary updates people.primary_photo_id', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: null })

    const media = useMedia('person-1')
    await media.setPrimary('photo-1')

    expect(mockFrom).toHaveBeenCalledWith('people')
  })
})
```

**Step 2: Run tests — expect 5 failures**

```bash
npm run test:run -- tests/unit/composables/useMedia.test.ts
```
Expected: `Cannot find module '@/composables/useMedia'`

**Step 3: Implement `useMedia`**

```ts
// src/composables/useMedia.ts
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Media } from '@/types'
import type { Database } from '@/types/database'

type MediaRow = Database['public']['Tables']['media']['Row']

function mapMedia(row: MediaRow): Media {
  return {
    id: row.id,
    personId: row.person_id,
    storagePath: row.storage_path,
    caption: row.caption,
    yearApprox: row.year_approx,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  }
}

export function useMedia(personId: string) {
  const photos    = ref<Media[]>([])
  const urls      = ref<Record<string, string>>({})
  const uploading = ref(false)
  const error     = ref<string | null>(null)

  async function load(): Promise<void> {
    error.value = null
    try {
      const { data, error: dbError } = await supabase
        .from('media')
        .select('*')
        .eq('person_id', personId)
        .order('uploaded_at', { ascending: true })
      if (dbError) throw dbError

      photos.value = (data ?? []).map(mapMedia)

      if (photos.value.length > 0) {
        const paths = photos.value.map(p => p.storagePath)
        const { data: signed, error: signError } = await supabase.storage
          .from('media')
          .createSignedUrls(paths, 3600)
        if (signError) throw signError
        const map: Record<string, string> = {}
        for (const entry of signed ?? []) {
          if (entry.signedUrl) map[entry.path] = entry.signedUrl
        }
        urls.value = map
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    }
  }

  async function upload(file: File, caption?: string, yearApprox?: number): Promise<void> {
    uploading.value = true
    error.value = null
    try {
      const auth = useAuthStore()
      const storagePath = `${personId}/${crypto.randomUUID()}-${file.name}`

      const { error: storageError } = await supabase.storage
        .from('media')
        .upload(storagePath, file)
      if (storageError) throw storageError

      const { data: inserted, error: insertError } = await supabase
        .from('media')
        .insert({
          person_id: personId,
          storage_path: storagePath,
          caption: caption ?? null,
          year_approx: yearApprox ?? null,
          uploaded_by: auth.profile?.id ?? null,
        })
        .select()
        .single()
      if (insertError) throw insertError

      // If this is the first photo, set it as primary
      const isFirst = photos.value.length === 0
      if (isFirst) {
        const { error: primaryError } = await supabase
          .from('people')
          .update({ primary_photo_id: inserted.id })
          .eq('id', personId)
        if (primaryError) throw primaryError
      }

      await load()
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      uploading.value = false
    }
  }

  async function remove(photo: Media): Promise<void> {
    error.value = null
    try {
      const { error: storageError } = await supabase.storage
        .from('media')
        .remove([photo.storagePath])
      if (storageError) throw storageError

      const { error: dbError } = await supabase
        .from('media')
        .delete()
        .eq('id', photo.id)
      if (dbError) throw dbError

      await load()
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    }
  }

  async function setPrimary(photoId: string): Promise<void> {
    error.value = null
    try {
      const { error: dbError } = await supabase
        .from('people')
        .update({ primary_photo_id: photoId })
        .eq('id', personId)
      if (dbError) throw dbError
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    }
  }

  return { photos, urls, uploading, error, load, upload, remove, setPrimary }
}
```

**Step 4: Run tests — expect all 5 passing**

```bash
npm run test:run -- tests/unit/composables/useMedia.test.ts
```
Expected: `5 passed`

**Step 5: Commit**

```bash
git add src/composables/useMedia.ts tests/unit/composables/useMedia.test.ts
git commit -m "feat: add useMedia composable (upload, delete, setPrimary, signed URLs)"
```

---

## Task 3: `PhotoGallery.vue` Component

**Files:**
- Create: `src/components/PhotoGallery.vue`
- Create: `tests/unit/components/PhotoGallery.test.ts`

**Step 1: Write the failing tests**

```ts
// tests/unit/components/PhotoGallery.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mockLoad    = vi.fn().mockResolvedValue(undefined)
const mockUpload  = vi.fn().mockResolvedValue(undefined)
const mockRemove  = vi.fn().mockResolvedValue(undefined)
const mockSetPrimary = vi.fn().mockResolvedValue(undefined)
const mockPhotos  = vi.fn(() => [])
const mockUrls    = vi.fn(() => ({}))
const mockError   = vi.fn(() => null)
const mockUploading = vi.fn(() => false)

vi.mock('@/composables/useMedia', () => ({
  useMedia: vi.fn(() => ({
    photos:    { value: mockPhotos() },
    urls:      { value: mockUrls() },
    error:     { value: mockError() },
    uploading: { value: mockUploading() },
    load:      mockLoad,
    upload:    mockUpload,
    remove:    mockRemove,
    setPrimary: mockSetPrimary,
  })),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({ isEditor: true })),
}))

import PhotoGallery from '@/components/PhotoGallery.vue'

const PHOTO = {
  id: 'photo-1', personId: 'p1', storagePath: 'p1/photo-1.jpg',
  caption: 'Wedding', yearApprox: 1950, uploadedBy: null, uploadedAt: '',
}

describe('PhotoGallery', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('calls load on mount', () => {
    mount(PhotoGallery, { props: { personId: 'p1', primaryPhotoId: null } })
    expect(mockLoad).toHaveBeenCalledOnce()
  })

  it('renders empty state when no photos', () => {
    const wrapper = mount(PhotoGallery, { props: { personId: 'p1', primaryPhotoId: null } })
    expect(wrapper.text()).toContain('No photos yet')
  })

  it('renders photo thumbnails', () => {
    mockPhotos.mockReturnValueOnce([PHOTO])
    mockUrls.mockReturnValueOnce({ 'p1/photo-1.jpg': 'https://cdn.example.com/photo-1.jpg' })

    const wrapper = mount(PhotoGallery, { props: { personId: 'p1', primaryPhotoId: null } })
    expect(wrapper.find('img').attributes('src')).toBe('https://cdn.example.com/photo-1.jpg')
  })

  it('shows Set as primary button when photo is not primary', () => {
    mockPhotos.mockReturnValueOnce([PHOTO])
    mockUrls.mockReturnValueOnce({ 'p1/photo-1.jpg': 'https://cdn.example.com/photo-1.jpg' })

    const wrapper = mount(PhotoGallery, { props: { personId: 'p1', primaryPhotoId: null } })
    expect(wrapper.text()).toContain('Set as primary')
  })

  it('does not show Set as primary when photo is already primary', () => {
    mockPhotos.mockReturnValueOnce([PHOTO])
    mockUrls.mockReturnValueOnce({ 'p1/photo-1.jpg': 'https://cdn.example.com/photo-1.jpg' })

    const wrapper = mount(PhotoGallery, { props: { personId: 'p1', primaryPhotoId: 'photo-1' } })
    expect(wrapper.text()).not.toContain('Set as primary')
  })
})
```

**Step 2: Run tests — expect failures**

```bash
npm run test:run -- tests/unit/components/PhotoGallery.test.ts
```
Expected: `Cannot find module '@/components/PhotoGallery.vue'`

**Step 3: Implement `PhotoGallery.vue`**

```vue
<!-- src/components/PhotoGallery.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMedia } from '@/composables/useMedia'
import { useAuthStore } from '@/stores/auth'
import type { Media } from '@/types'

const props = defineProps<{
  personId: string
  primaryPhotoId: string | null
}>()

const emit = defineEmits<{
  primaryChanged: [photoId: string]
}>()

const auth    = useAuthStore()
const media   = useMedia(props.personId)
const lightbox = ref<Media | null>(null)

const showUpload  = ref(false)
const caption     = ref('')
const yearApprox  = ref<number | ''>('')
const uploadError = ref<string | null>(null)

onMounted(() => media.load())

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadError.value = null
  try {
    await media.upload(file, caption.value || undefined, yearApprox.value !== '' ? Number(yearApprox.value) : undefined)
    showUpload.value = false
    caption.value    = ''
    yearApprox.value = ''
    if (media.photos.value.length === 1) {
      emit('primaryChanged', media.photos.value[0].id)
    }
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Upload failed'
  }
}

async function handleSetPrimary(photo: Media) {
  await media.setPrimary(photo.id)
  emit('primaryChanged', photo.id)
}

async function handleRemove(photo: Media) {
  if (!confirm(`Delete this photo?`)) return
  await media.remove(photo)
  if (props.primaryPhotoId === photo.id && media.photos.value.length > 0) {
    emit('primaryChanged', media.photos.value[0].id)
  }
}
</script>

<template>
  <div class="card p-6 mb-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-display text-xl text-walnut">Photos</h2>
      <button v-if="auth.isEditor" @click="showUpload = !showUpload" class="btn-secondary text-sm">
        + Add Photo
      </button>
    </div>

    <!-- Upload form -->
    <div v-if="showUpload && auth.isEditor" class="mb-4 p-4 border border-parchment rounded bg-cream/50 space-y-3">
      <div>
        <label class="form-label">Photo</label>
        <input type="file" accept="image/jpeg,image/png,image/webp"
               class="form-input text-sm" @change="handleFileSelected" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="form-label">Caption (optional)</label>
          <input v-model="caption" type="text" placeholder="e.g. Wedding day" class="form-input text-sm" />
        </div>
        <div>
          <label class="form-label">Approx. year</label>
          <input v-model="yearApprox" type="number" placeholder="e.g. 1950" class="form-input text-sm" />
        </div>
      </div>
      <p v-if="uploadError" class="error-text">{{ uploadError }}</p>
      <p v-if="media.uploading.value" class="text-sm text-walnut-muted">Uploading…</p>
    </div>

    <!-- Empty state -->
    <p v-if="!media.photos.value.length" class="text-sm text-walnut-muted text-center py-6">
      No photos yet.
      <span v-if="auth.isEditor"> Click "Add Photo" to upload one.</span>
    </p>

    <!-- Photo grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div
        v-for="photo in media.photos.value"
        :key="photo.id"
        class="relative group aspect-square overflow-hidden rounded-lg border border-parchment bg-cream cursor-pointer"
        @click="lightbox = photo"
      >
        <img
          v-if="media.urls.value[photo.storagePath]"
          :src="media.urls.value[photo.storagePath]"
          :alt="photo.caption ?? 'Family photo'"
          class="w-full h-full object-cover"
        />
        <div class="absolute inset-0 bg-walnut/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
          <span v-if="photo.caption" class="text-cream text-xs text-center truncate w-full">{{ photo.caption }}</span>
          <span v-if="photo.yearApprox" class="text-cream/80 text-xs">{{ photo.yearApprox }}</span>
          <div v-if="auth.isEditor" class="flex gap-2 mt-1" @click.stop>
            <button
              v-if="primaryPhotoId !== photo.id"
              @click="handleSetPrimary(photo)"
              class="text-xs bg-cream/20 text-cream px-2 py-1 rounded hover:bg-cream/30 transition-colors"
            >
              Set as primary
            </button>
            <span v-else class="text-xs text-dusty-light font-medium">Primary</span>
            <button
              @click="handleRemove(photo)"
              class="text-xs bg-red-600/70 text-cream px-2 py-1 rounded hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
        <!-- Primary badge -->
        <div v-if="primaryPhotoId === photo.id"
             class="absolute top-1 left-1 bg-dusty text-cream text-xs px-1.5 py-0.5 rounded">
          Primary
        </div>
      </div>
    </div>

    <p v-if="media.error.value" class="error-text mt-3">{{ media.error.value }}</p>

    <!-- Lightbox -->
    <div
      v-if="lightbox"
      class="fixed inset-0 bg-walnut/90 z-50 flex items-center justify-center p-4"
      @click="lightbox = null"
    >
      <div class="max-w-3xl max-h-full" @click.stop>
        <img
          v-if="media.urls.value[lightbox.storagePath]"
          :src="media.urls.value[lightbox.storagePath]"
          :alt="lightbox.caption ?? 'Family photo'"
          class="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"
        />
        <p v-if="lightbox.caption" class="text-cream text-center mt-3 text-sm">
          {{ lightbox.caption }}<span v-if="lightbox.yearApprox"> · {{ lightbox.yearApprox }}</span>
        </p>
        <button @click="lightbox = null" class="absolute top-4 right-4 text-cream text-2xl leading-none">×</button>
      </div>
    </div>
  </div>
</template>
```

**Step 4: Run tests — expect all 5 passing**

```bash
npm run test:run -- tests/unit/components/PhotoGallery.test.ts
```
Expected: `5 passed`

**Step 5: Commit**

```bash
git add src/components/PhotoGallery.vue tests/unit/components/PhotoGallery.test.ts
git commit -m "feat: add PhotoGallery component with upload, lightbox, and primary photo selection"
```

---

## Task 4: Wire PhotoGallery into PersonView

**Files:**
- Modify: `src/views/PersonView.vue`

**Step 1: Add PhotoGallery import and primary photo state**

In `<script setup>`, add after existing imports:

```ts
import PhotoGallery from '@/components/PhotoGallery.vue'

const primaryPhotoId = ref<string | null>(null)

// Sync primaryPhotoId from loaded person
watch(() => detail.person.value, (p) => {
  if (p) primaryPhotoId.value = p.primaryPhotoId
}, { immediate: true })

// Also import watch at top if not already present
```

Make sure `watch` is imported from `'vue'` alongside `ref` and `onMounted`.

**Step 2: Add primary photo display in header**

Replace the header `<div>` that currently has just text, to include a photo. Find the header card block:

```html
<!-- Header card -->
<div class="card p-8 mb-6">
  <div class="flex items-start justify-between gap-4">
    <div>
```

Change `<div class="flex items-start justify-between gap-4">` to:

```html
<div class="flex items-start gap-6 justify-between">
  <!-- Primary photo -->
  <div class="flex-shrink-0">
    <img
      v-if="primaryPhotoId && detail.person.value?.primaryPhotoId"
      :src="`/api/photo-placeholder`"
      class="w-24 h-24 rounded-full object-cover border-2 border-parchment"
      alt="Profile photo"
    />
    <div v-else class="w-24 h-24 rounded-full bg-parchment/40 border-2 border-parchment flex items-center justify-center">
      <span class="text-3xl text-walnut-muted">👤</span>
    </div>
  </div>
```

> **Note:** The primary photo URL for the header comes from the `useMedia` composable after `PhotoGallery` loads. Pass the url via a prop or lift `useMedia` up into `PersonView`. Simplest approach: use `useMedia` in `PersonView` and pass `urls` down as a prop, OR just let `PhotoGallery` emit `primaryChanged` and store the signed URL. For Phase 5, keep it simple — just show the placeholder avatar with a "set photo" CTA. The primary photo in the tree node and full gallery display is the priority.

**Simpler approach for header:** Skip the avatar image for now — just show a placeholder div. The photo gallery below already shows the primary badge. This avoids lifting media state into PersonView.

Replace the placeholder `<div>` in the header if a photo section with primary is desired — but for the scope of Phase 5, the gallery itself is the feature. Leave the header with the existing layout and no photo.

**Step 3: Add PhotoGallery section before RelationshipPanel**

In the template, add before `<RelationshipPanel`:

```html
<!-- Photo gallery -->
<PhotoGallery
  :person-id="id"
  :primary-photo-id="primaryPhotoId"
  class="mb-6"
  @primary-changed="primaryPhotoId = $event"
/>
```

**Step 4: Add Export PDF button**

In the header card, add a "Export PDF" button alongside the existing "Edit" button:

```html
<div class="flex gap-2 flex-shrink-0">
  <button @click="window.print()" class="btn-secondary text-sm print:hidden">
    Export PDF
  </button>
  <button v-if="auth.isEditor" @click="showEditForm = true" class="btn-secondary text-sm print:hidden">
    Edit
  </button>
</div>
```

Note: `window.print()` needs to be accessible in the template. Add a helper in `<script setup>`:
```ts
function exportPdf() { window.print() }
```
And use `@click="exportPdf"` in the template instead.

**Step 5: Run full test suite**

```bash
npm run test:run
npm run build
```
Expected: all tests pass, build succeeds.

**Step 6: Commit**

```bash
git add src/views/PersonView.vue
git commit -m "feat: integrate PhotoGallery and Export PDF button into PersonView"
```

---

## Task 5: `useEditHistory` Composable

**Files:**
- Create: `src/composables/useEditHistory.ts`
- Create: `tests/unit/composables/useEditHistory.test.ts`

**Step 1: Write the failing tests**

```ts
// tests/unit/composables/useEditHistory.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockChain, mockFrom } = vi.hoisted(() => {
  const mockChain = {
    select:  vi.fn().mockReturnThis(),
    update:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    order:   vi.fn().mockReturnThis(),
    limit:   vi.fn().mockResolvedValue({ data: [], error: null }),
    single:  vi.fn(),
  }
  const mockFrom = vi.fn(() => mockChain)
  return { mockChain, mockFrom }
})

vi.mock('@/services/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { useEditHistory } from '@/composables/useEditHistory'

const HISTORY_ROW = {
  id: 'h1', table_name: 'people', record_id: 'p1',
  field_name: 'biography', old_value: '"old bio"', new_value: '"new bio"',
  changed_by: 'user-1', changed_at: '2026-01-01T00:00:00Z',
}

describe('useEditHistory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('load fetches history entries for a person', async () => {
    mockChain.limit.mockResolvedValueOnce({ data: [HISTORY_ROW], error: null })

    const eh = useEditHistory('p1')
    await eh.load()

    expect(eh.entries.value).toHaveLength(1)
    expect(eh.entries.value[0].fieldName).toBe('biography')
    expect(eh.entries.value[0].tableName).toBe('people')
    expect(eh.isLoading.value).toBe(false)
  })

  it('load sets error on db failure', async () => {
    mockChain.limit.mockResolvedValueOnce({ data: null, error: { message: 'access denied' } })

    const eh = useEditHistory('p1')
    await expect(eh.load()).rejects.toThrow('access denied')
    expect(eh.error.value).toBe('access denied')
  })

  it('restore updates the record and reloads', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: null })
    mockChain.limit.mockResolvedValueOnce({ data: [], error: null })

    const eh = useEditHistory('p1')
    await eh.restore({
      id: 'h1', tableName: 'people', recordId: 'p1',
      fieldName: 'biography', oldValue: 'old bio', newValue: 'new bio',
      changedBy: 'user-1', changedAt: '2026-01-01T00:00:00Z',
    })

    expect(mockFrom).toHaveBeenCalledWith('people')
  })
})
```

**Step 2: Run tests — expect failures**

```bash
npm run test:run -- tests/unit/composables/useEditHistory.test.ts
```
Expected: `Cannot find module '@/composables/useEditHistory'`

**Step 3: Implement `useEditHistory`**

```ts
// src/composables/useEditHistory.ts
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { EditHistoryEntry } from '@/types'
import type { Database } from '@/types/database'

type HistoryRow = Database['public']['Tables']['edit_history']['Row']

function mapEntry(row: HistoryRow): EditHistoryEntry {
  return {
    id: row.id,
    tableName: row.table_name,
    recordId: row.record_id,
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }
}

export function useEditHistory(personId: string) {
  const entries   = ref<EditHistoryEntry[]>([])
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  async function load(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: dbError } = await supabase
        .from('edit_history')
        .select('*')
        .eq('record_id', personId)
        .order('changed_at', { ascending: false })
        .limit(50)
      if (dbError) throw dbError
      entries.value = (data ?? []).map(mapEntry)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function restore(entry: EditHistoryEntry): Promise<void> {
    error.value = null
    try {
      const { error: dbError } = await supabase
        .from(entry.tableName as 'people')
        .update({ [entry.fieldName]: entry.oldValue })
        .eq('id', entry.recordId)
      if (dbError) throw dbError
      await load()
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    }
  }

  return { entries, isLoading, error, load, restore }
}
```

**Step 4: Run tests — expect all 3 passing**

```bash
npm run test:run -- tests/unit/composables/useEditHistory.test.ts
```
Expected: `3 passed`

**Step 5: Commit**

```bash
git add src/composables/useEditHistory.ts tests/unit/composables/useEditHistory.test.ts
git commit -m "feat: add useEditHistory composable (fetch last 50 entries, restore)"
```

---

## Task 6: Edit History Section in PersonView

**Files:**
- Modify: `src/views/PersonView.vue`

**Step 1: Add import and composable**

In `<script setup>`, add:

```ts
import { useEditHistory } from '@/composables/useEditHistory'

const editHistory = useEditHistory(id)
const showHistory = ref(false)

async function loadHistory() {
  if (!showHistory.value) return
  await editHistory.load()
}
```

**Step 2: Add history section at the bottom of the template**

Add after `<RelationshipPanel>` and before the edit modal:

```html
<!-- Edit History -->
<div v-if="auth.isEditor" class="card p-6 mb-6 print:hidden">
  <button
    class="flex items-center justify-between w-full text-left"
    @click="showHistory = !showHistory; loadHistory()"
  >
    <h2 class="font-display text-xl text-walnut">Edit History</h2>
    <span class="text-walnut-muted text-sm">{{ showHistory ? '▲ Hide' : '▼ Show' }}</span>
  </button>

  <div v-if="showHistory" class="mt-4">
    <p v-if="editHistory.isLoading.value" class="text-sm text-walnut-muted">Loading…</p>
    <p v-else-if="editHistory.error.value" class="error-text">{{ editHistory.error.value }}</p>
    <p v-else-if="!editHistory.entries.value.length" class="text-sm text-walnut-muted">No edit history yet.</p>

    <div v-else class="divide-y divide-parchment text-sm">
      <div
        v-for="entry in editHistory.entries.value"
        :key="entry.id"
        class="py-3 flex items-start justify-between gap-4"
      >
        <div class="flex-1 min-w-0">
          <span class="font-medium text-walnut capitalize">{{ entry.fieldName.replace(/_/g, ' ') }}</span>
          <div class="text-walnut-muted mt-0.5 space-y-0.5">
            <div v-if="entry.oldValue !== null">
              <span class="text-xs bg-red-50 text-red-700 px-1 rounded line-through">{{ formatHistoryValue(entry.oldValue) }}</span>
              →
              <span class="text-xs bg-green-50 text-green-700 px-1 rounded">{{ formatHistoryValue(entry.newValue) }}</span>
            </div>
            <div v-else class="text-xs text-walnut-muted italic">Record created</div>
          </div>
          <p class="text-xs text-walnut-muted mt-1">
            {{ new Date(entry.changedAt).toLocaleString('en-US') }}
          </p>
        </div>
        <button
          v-if="auth.isAdmin && entry.oldValue !== null"
          @click="handleRestore(entry)"
          class="text-xs btn-secondary flex-shrink-0"
        >
          Restore
        </button>
      </div>
    </div>
  </div>
</div>
```

**Step 3: Add helper functions in `<script setup>`**

```ts
function formatHistoryValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string') return val
  return JSON.stringify(val)
}

async function handleRestore(entry: EditHistoryEntry) {
  if (!confirm(`Restore "${entry.fieldName}" to its previous value?`)) return
  await editHistory.restore(entry)
  await detail.load()
}
```

Import `EditHistoryEntry` from `'@/types'` at the top.

**Step 4: Run full test suite**

```bash
npm run test:run
npm run build
```
Expected: all pass, build clean.

**Step 5: Commit**

```bash
git add src/views/PersonView.vue
git commit -m "feat: add collapsible Edit History section to PersonView with admin restore"
```

---

## Task 7: Print CSS for PDF Export

**Files:**
- Modify: `src/style.css`

**Step 1: Append print styles to `src/style.css`**

Add at the bottom of the file:

```css
/* ─── Print / PDF Export ──────────────────────────────────────────────────── */
@media print {
  /* Hide interactive chrome */
  header,
  nav,
  .print\:hidden {
    display: none !important;
  }

  /* Reset page background */
  body {
    background: white !important;
    color: #3D2B1F !important;
    font-size: 11pt;
  }

  /* Full-width content, no padding */
  .max-w-3xl {
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Cards print flat */
  .card {
    border: 1px solid #D4C5A9;
    box-shadow: none !important;
    break-inside: avoid;
    margin-bottom: 12pt;
    page-break-inside: avoid;
  }

  /* Don't break headings from their content */
  h1, h2, h3 {
    break-after: avoid;
    page-break-after: avoid;
  }

  /* Lighbox and modals must not print */
  .fixed {
    display: none !important;
  }

  /* Ensure photos print */
  img {
    max-width: 100%;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
```

**Step 2: Test print output manually**

```bash
npm run dev
```
Navigate to a person's profile page. Click "Export PDF". Verify:
- Navigation bar is hidden
- "Export PDF" and "Edit" buttons are hidden
- All sections (biography, residences, education, etc.) are visible
- Cards have borders but no shadows
- Photo gallery thumbnails appear

**Step 3: Run full test suite**

```bash
npm run test:run
npm run build
```
Expected: all pass (CSS change doesn't affect tests), build clean.

**Step 4: Commit**

```bash
git add src/style.css
git commit -m "feat: add print CSS for PDF export via window.print()"
```

---

## Task 8: Final Verification

**Step 1: Run all tests**

```bash
npm run test:run
```
Expected: all tests pass (was 65 before Phase 5; now should be ~82+ with new tests).

**Step 2: Type check**

```bash
npx vue-tsc --noEmit
```
Expected: 0 errors.

**Step 3: Build**

```bash
npm run build
```
Expected: build succeeds.

**Step 4: Final commit if any loose ends**

```bash
git status
```
If clean: Phase 5 complete.

---

## Summary

| Task | Deliverable |
|------|-------------|
| 1 | SQL migration 005 — edit history triggers + RLS |
| 2 | `useMedia` composable — upload, delete, setPrimary, signed URLs |
| 3 | `PhotoGallery.vue` — grid, lightbox, upload form, primary badge |
| 4 | PersonView — PhotoGallery integrated, Export PDF button |
| 5 | `useEditHistory` composable — fetch + restore |
| 6 | PersonView — collapsible Edit History section with admin restore |
| 7 | Print CSS — `@media print` rules in style.css |
| 8 | Final verification — tests, types, build |
