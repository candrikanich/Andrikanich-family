# Phase 1: Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up the full infrastructure for the genealogy tracker — Supabase schema, RLS, auth with admin-approval flow, email notifications, Vue Router, heritage UI theme, and the login/register/pending/onboarding views.

**Architecture:** Supabase handles auth (email+password) and PostgreSQL. Row-Level Security enforces that pending users see nothing; approved viewers read; editors write. Email notifications go via a Supabase Edge Function calling the Resend API. Vue Router guards redirect unauthenticated and pending users appropriately.

**Tech Stack:** Vue 3.4, TypeScript, Pinia, Vue Router 4, TailwindCSS v4, Supabase JS v2, Vitest, Resend

---

## MANUAL SETUP STEPS (Do these before writing any code)

These require clicking in browser dashboards — not code tasks.

### M1: Create Supabase Project
1. Go to https://supabase.com → New Project
2. Name it `andrikanich-family`, choose a strong DB password, pick region closest to Ohio (US East)
3. Wait for provisioning (~2 minutes)
4. Settings → API → copy `Project URL` and `anon public` key
5. Create `.env.local` in project root:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_APP_TITLE=Andrikanich Family
```

### M2: Create Resend Account
1. Go to https://resend.com → sign up with your email
2. Domains → Add Domain → add `andrikanichfamily.com` → follow DNS instructions
3. API Keys → Create API Key → name it `andrikanich-family-prod`
4. Copy the key (shown once only)

### M3: Create Storage Buckets in Supabase
1. Storage → New bucket → Name: `documents`, Private (not public)
2. Storage → New bucket → Name: `media`, Private

### M4: Configure Supabase Email (use Resend SMTP)
1. Auth → Settings → SMTP Settings → enable Custom SMTP
2. Host: `smtp.resend.com`, Port: `465`, Username: `resend`, Password: your Resend API key
3. Sender email: `noreply@andrikanichfamily.com`, Sender name: `Andrikanich Family`

---

## CODE TASKS

---

### Task 1: Install Vue Router and update scripts

**Files:**
- Modify: `package.json`

**Step 1: Install vue-router**
```bash
npm install vue-router@4
npm install --save-dev @vitest/coverage-v8
```

**Step 2: Verify install**
```bash
npm list vue-router
```
Expected: `vue-router@4.x.x`

**Step 3: Add test scripts to package.json**

Add to the `scripts` block:
```json
"test": "vitest",
"test:run": "vitest run",
"test:coverage": "vitest run --coverage"
```

**Step 4: Commit**
```bash
git add package.json package-lock.json
git commit -m "chore: add vue-router and vitest coverage"
```

---

### Task 2: Vitest configuration

**Files:**
- Create: `vitest.config.ts`

**Step 1: Create vitest.config.ts**
```typescript
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules/', 'src/main.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Step 2: Run tests to verify setup works (no tests yet = passing)**
```bash
npm run test:run
```
Expected: `No test files found` (not an error crash)

**Step 3: Commit**
```bash
git add vitest.config.ts
git commit -m "chore: configure vitest with jsdom and coverage"
```

---

### Task 3: Heritage color theme

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/style.css`

**Step 1: Update tailwind.config.js**

Replace the entire file:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Heritage palette
        cream:    { DEFAULT: '#F5F0E8', dark: '#EDE6D6' },
        walnut:   { DEFAULT: '#3D2B1F', light: '#5C3D2E', muted: '#8B6F5E' },
        sage:     { DEFAULT: '#6B7C6B', light: '#8FA08F', muted: '#B5C4B5' },
        dusty:    { DEFAULT: '#C4856A', light: '#D9A089', muted: '#E8C4B0' },
        parchment: { DEFAULT: '#D4C5A9', light: '#E8DDC9' },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

**Step 2: Update src/style.css**

Replace the entire file:
```css
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-cream text-walnut font-body;
  }
  h1, h2, h3 {
    @apply font-display;
  }
}

@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-walnut text-cream rounded font-medium hover:bg-walnut-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
  }
  .btn-secondary {
    @apply px-4 py-2 border border-walnut text-walnut rounded font-medium hover:bg-walnut hover:text-cream transition-colors;
  }
  .btn-ghost {
    @apply px-4 py-2 text-walnut-muted hover:text-walnut transition-colors;
  }
  .card {
    @apply bg-white border border-parchment rounded-lg shadow-sm;
  }
  .form-input {
    @apply w-full px-3 py-2 border border-parchment rounded bg-white text-walnut placeholder-walnut-muted focus:outline-none focus:ring-2 focus:ring-walnut-muted focus:border-walnut transition-colors;
  }
  .form-label {
    @apply block text-sm font-medium text-walnut mb-1;
  }
  .error-text {
    @apply text-sm text-red-700 mt-1;
  }
}
```

**Step 3: Commit**
```bash
git add tailwind.config.js src/style.css
git commit -m "style: apply heritage color palette and typography"
```

---

### Task 4: TypeScript types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Replace src/types/index.ts with spec-aligned types**

```typescript
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
```

**Step 2: Verify TypeScript compiles**
```bash
npx vue-tsc --noEmit
```
Expected: no errors

**Step 3: Commit**
```bash
git add src/types/index.ts
git commit -m "feat: define TypeScript types aligned to spec data model"
```

---

### Task 5: Supabase typed client

**Files:**
- Modify: `src/services/supabase.ts`
- Create: `src/types/database.ts`

**Step 1: Create src/types/database.ts**

This file mirrors the Supabase DB schema exactly (snake_case, raw types). The `src/types/index.ts` types are the camelCase app-layer types.

```typescript
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          first_name: string
          last_name: string
          role: 'admin' | 'editor' | 'viewer'
          status: 'pending' | 'approved' | 'denied'
          person_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      people: {
        Row: {
          id: string
          first_name: string
          last_name: string
          birth_surname: string | null
          nickname: string | null
          name_variants: string[]
          suffix: string | null
          birth_date: string | null
          birth_place: string | null
          death_date: string | null
          death_place: string | null
          burial_place: string | null
          notes: string | null
          biography: string | null
          primary_photo_id: string | null
          user_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['people']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['people']['Insert']>
      }
      marriages: {
        Row: {
          id: string
          person_a_id: string
          person_b_id: string
          marriage_date: string | null
          marriage_place: string | null
          end_date: string | null
          end_reason: 'divorced' | 'widowed' | 'annulled' | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['marriages']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['marriages']['Insert']>
      }
      parent_child: {
        Row: {
          id: string
          parent_id: string
          child_id: string
          relationship_type: 'biological' | 'adopted' | 'step' | 'half'
          confirmed: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['parent_child']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['parent_child']['Insert']>
      }
      residences: {
        Row: {
          id: string
          person_id: string
          location: string
          from_date: string | null
          to_date: string | null
          is_current: boolean
          sort_order: number
        }
        Insert: Omit<Database['public']['Tables']['residences']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['residences']['Insert']>
      }
      education: {
        Row: {
          id: string
          person_id: string
          institution: string
          institution_type: 'high_school' | 'college' | 'university' | 'vocational' | 'other'
          location: string | null
          start_year: number | null
          end_year: number | null
          graduated: boolean | null
          notes: string | null
        }
        Insert: Omit<Database['public']['Tables']['education']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['education']['Insert']>
      }
      occupations: {
        Row: {
          id: string
          person_id: string
          employer: string | null
          title: string | null
          from_date: string | null
          to_date: string | null
          is_current: boolean
        }
        Insert: Omit<Database['public']['Tables']['occupations']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['occupations']['Insert']>
      }
      military_service: {
        Row: {
          id: string
          person_id: string
          branch: string | null
          rank: string | null
          from_date: string | null
          to_date: string | null
          notes: string | null
        }
        Insert: Omit<Database['public']['Tables']['military_service']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['military_service']['Insert']>
      }
      documents: {
        Row: {
          id: string
          person_id: string
          storage_path: string
          original_filename: string
          mime_type: string
          uploaded_by: string | null
          uploaded_at: string
          extraction_status: 'pending' | 'reviewed' | 'committed'
        }
        Insert: Omit<Database['public']['Tables']['documents']['Row'], 'id' | 'uploaded_at'>
        Update: Partial<Database['public']['Tables']['documents']['Insert']>
      }
      media: {
        Row: {
          id: string
          person_id: string
          storage_path: string
          caption: string | null
          year_approx: number | null
          uploaded_by: string | null
          uploaded_at: string
        }
        Insert: Omit<Database['public']['Tables']['media']['Row'], 'id' | 'uploaded_at'>
        Update: Partial<Database['public']['Tables']['media']['Insert']>
      }
      edit_history: {
        Row: {
          id: string
          table_name: string
          record_id: string
          field_name: string
          old_value: unknown
          new_value: unknown
          changed_by: string | null
          changed_at: string
        }
        Insert: Omit<Database['public']['Tables']['edit_history']['Row'], 'id' | 'changed_at'>
        Update: never
      }
      sources: {
        Row: {
          id: string
          person_id: string
          title: string
          citation: string
          url: string | null
          document_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['sources']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['sources']['Insert']>
      }
    }
  }
}
```

**Step 2: Update src/services/supabase.ts**

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing required environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

**Step 3: Verify TypeScript**
```bash
npx vue-tsc --noEmit
```
Expected: no errors

**Step 4: Commit**
```bash
git add src/types/database.ts src/services/supabase.ts
git commit -m "feat: add typed Supabase client with full database schema types"
```

---

### Task 6: Database SQL schema

**Files:**
- Create: `planning/sql/001_schema.sql`

> This file is not run by the app — you paste it into the Supabase SQL Editor.

**Step 1: Create planning/sql/001_schema.sql**

```sql
-- ============================================================
-- Genealogy Tracker — Schema Migration 001
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Fuzzy search extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Profiles (extends auth.users) ───────────────────────────────────────────
CREATE TABLE profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'editor', 'viewer')),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'denied')),
  person_id   UUID,   -- FK added after people table
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── People ──────────────────────────────────────────────────────────────────
CREATE TABLE people (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  birth_surname    TEXT,
  nickname         TEXT,
  name_variants    TEXT[] NOT NULL DEFAULT '{}',
  suffix           TEXT,
  birth_date       DATE,
  birth_place      TEXT,
  death_date       DATE,
  death_place      TEXT,
  burial_place     TEXT,
  notes            TEXT,
  biography        TEXT,
  primary_photo_id UUID,   -- FK added after media table
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add person_id FK to profiles
ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_person
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL;

-- ─── Marriages ────────────────────────────────────────────────────────────────
CREATE TABLE marriages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a_id     UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  person_b_id     UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  marriage_date   DATE,
  marriage_place  TEXT,
  end_date        DATE,
  end_reason      TEXT CHECK (end_reason IN ('divorced', 'widowed', 'annulled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Parent-Child ─────────────────────────────────────────────────────────────
CREATE TABLE parent_child (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id         UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  child_id          UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'biological'
                      CHECK (relationship_type IN ('biological', 'adopted', 'step', 'half')),
  confirmed         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, child_id)
);

-- ─── Residences ───────────────────────────────────────────────────────────────
CREATE TABLE residences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  location   TEXT NOT NULL,
  from_date  DATE,
  to_date    DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ─── Education ────────────────────────────────────────────────────────────────
CREATE TABLE education (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  institution      TEXT NOT NULL,
  institution_type TEXT NOT NULL DEFAULT 'other'
                     CHECK (institution_type IN ('high_school', 'college', 'university', 'vocational', 'other')),
  location         TEXT,
  start_year       INTEGER,
  end_year         INTEGER,
  graduated        BOOLEAN,
  notes            TEXT
);

-- ─── Occupations ──────────────────────────────────────────────────────────────
CREATE TABLE occupations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  employer   TEXT,
  title      TEXT,
  from_date  DATE,
  to_date    DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE
);

-- ─── Military Service ─────────────────────────────────────────────────────────
CREATE TABLE military_service (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  branch     TEXT,
  rank       TEXT,
  from_date  DATE,
  to_date    DATE,
  notes      TEXT
);

-- ─── Documents ────────────────────────────────────────────────────────────────
CREATE TABLE documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id          UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  storage_path       TEXT NOT NULL,
  original_filename  TEXT NOT NULL,
  mime_type          TEXT NOT NULL,
  uploaded_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  extraction_status  TEXT NOT NULL DEFAULT 'pending'
                       CHECK (extraction_status IN ('pending', 'reviewed', 'committed'))
);

-- ─── Media (photos) ───────────────────────────────────────────────────────────
CREATE TABLE media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption     TEXT,
  year_approx INTEGER,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add primary_photo_id FK to people
ALTER TABLE people
  ADD CONSTRAINT fk_people_primary_photo
  FOREIGN KEY (primary_photo_id) REFERENCES media(id) ON DELETE SET NULL;

-- ─── Edit History ─────────────────────────────────────────────────────────────
CREATE TABLE edit_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  field_name  TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  changed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Sources ──────────────────────────────────────────────────────────────────
CREATE TABLE sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  citation    TEXT NOT NULL,
  url         TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_people_last_name    ON people USING gin(last_name gin_trgm_ops);
CREATE INDEX idx_people_first_name   ON people USING gin(first_name gin_trgm_ops);
CREATE INDEX idx_people_birth_surname ON people USING gin(birth_surname gin_trgm_ops);
CREATE INDEX idx_people_user_id      ON people(user_id);
CREATE INDEX idx_parent_child_parent ON parent_child(parent_id);
CREATE INDEX idx_parent_child_child  ON parent_child(child_id);
CREATE INDEX idx_marriages_a         ON marriages(person_a_id);
CREATE INDEX idx_marriages_b         ON marriages(person_b_id);
CREATE INDEX idx_edit_history_record ON edit_history(record_id, changed_at DESC);
CREATE INDEX idx_documents_person    ON documents(person_id);
CREATE INDEX idx_media_person        ON media(person_id);
CREATE INDEX idx_residences_person   ON residences(person_id, sort_order);

-- ─── Updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_people_updated_at
  BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Step 2: Commit SQL file**
```bash
git add planning/sql/001_schema.sql
git commit -m "docs: add database schema SQL migration"
```

**Step 3: Run in Supabase (MANUAL)**
1. Supabase Dashboard → SQL Editor → New Query
2. Paste the entire contents of `planning/sql/001_schema.sql`
3. Click Run
4. Verify all tables appear in Table Editor

---

### Task 7: RLS policies SQL

**Files:**
- Create: `planning/sql/002_rls_policies.sql`

**Step 1: Create planning/sql/002_rls_policies.sql**

```sql
-- ============================================================
-- Genealogy Tracker — RLS Policies Migration 002
-- Run AFTER 001_schema.sql
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE people         ENABLE ROW LEVEL SECURITY;
ALTER TABLE marriages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_child   ENABLE ROW LEVEL SECURITY;
ALTER TABLE residences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE education      ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE military_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE media          ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources        ENABLE ROW LEVEL SECURITY;

-- ─── Helper functions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_approved()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND status = 'approved'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_editor()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND status = 'approved'
      AND role IN ('editor', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND status = 'approved'
      AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── profiles policies ───────────────────────────────────────────────────────
-- Users can always read and update their own profile (even if pending — so they can see their status)
CREATE POLICY "profiles: own read"   ON profiles FOR SELECT USING (id = auth.uid() OR is_admin());
CREATE POLICY "profiles: own insert" ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles: own update" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles: admin update" ON profiles FOR UPDATE USING (is_admin());

-- ─── people policies ─────────────────────────────────────────────────────────
CREATE POLICY "people: approved read"   ON people FOR SELECT USING (is_approved());
CREATE POLICY "people: editor insert"   ON people FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "people: editor update"   ON people FOR UPDATE USING (is_editor());
CREATE POLICY "people: admin delete"    ON people FOR DELETE USING (is_admin());

-- ─── marriages policies ───────────────────────────────────────────────────────
CREATE POLICY "marriages: approved read" ON marriages FOR SELECT USING (is_approved());
CREATE POLICY "marriages: editor write"  ON marriages FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "marriages: editor update" ON marriages FOR UPDATE USING (is_editor());
CREATE POLICY "marriages: editor delete" ON marriages FOR DELETE USING (is_editor());

-- ─── parent_child policies ────────────────────────────────────────────────────
CREATE POLICY "parent_child: approved read" ON parent_child FOR SELECT USING (is_approved());
CREATE POLICY "parent_child: editor write"  ON parent_child FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "parent_child: editor update" ON parent_child FOR UPDATE USING (is_editor());
CREATE POLICY "parent_child: editor delete" ON parent_child FOR DELETE USING (is_editor());

-- ─── residences, education, occupations, military_service (same pattern) ─────
CREATE POLICY "residences: approved read" ON residences FOR SELECT USING (is_approved());
CREATE POLICY "residences: editor write"  ON residences FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "residences: editor update" ON residences FOR UPDATE USING (is_editor());
CREATE POLICY "residences: editor delete" ON residences FOR DELETE USING (is_editor());

CREATE POLICY "education: approved read" ON education FOR SELECT USING (is_approved());
CREATE POLICY "education: editor write"  ON education FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "education: editor update" ON education FOR UPDATE USING (is_editor());
CREATE POLICY "education: editor delete" ON education FOR DELETE USING (is_editor());

CREATE POLICY "occupations: approved read" ON occupations FOR SELECT USING (is_approved());
CREATE POLICY "occupations: editor write"  ON occupations FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "occupations: editor update" ON occupations FOR UPDATE USING (is_editor());
CREATE POLICY "occupations: editor delete" ON occupations FOR DELETE USING (is_editor());

CREATE POLICY "military_service: approved read" ON military_service FOR SELECT USING (is_approved());
CREATE POLICY "military_service: editor write"  ON military_service FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "military_service: editor update" ON military_service FOR UPDATE USING (is_editor());
CREATE POLICY "military_service: editor delete" ON military_service FOR DELETE USING (is_editor());

-- ─── documents & media ───────────────────────────────────────────────────────
CREATE POLICY "documents: approved read" ON documents FOR SELECT USING (is_approved());
CREATE POLICY "documents: editor write"  ON documents FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "documents: editor update" ON documents FOR UPDATE USING (is_editor());
CREATE POLICY "documents: editor delete" ON documents FOR DELETE USING (is_editor());

CREATE POLICY "media: approved read" ON media FOR SELECT USING (is_approved());
CREATE POLICY "media: editor write"  ON media FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "media: editor update" ON media FOR UPDATE USING (is_editor());
CREATE POLICY "media: editor delete" ON media FOR DELETE USING (is_editor());

-- ─── edit_history (append-only) ───────────────────────────────────────────────
CREATE POLICY "edit_history: approved read"  ON edit_history FOR SELECT USING (is_approved());
CREATE POLICY "edit_history: editor insert"  ON edit_history FOR INSERT WITH CHECK (is_editor());

-- ─── sources ─────────────────────────────────────────────────────────────────
CREATE POLICY "sources: approved read" ON sources FOR SELECT USING (is_approved());
CREATE POLICY "sources: editor write"  ON sources FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "sources: editor update" ON sources FOR UPDATE USING (is_editor());
CREATE POLICY "sources: editor delete" ON sources FOR DELETE USING (is_editor());

-- ─── Storage bucket policies ─────────────────────────────────────────────────
-- Run these in the Supabase SQL Editor after creating the buckets in Storage UI

INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', false);

CREATE POLICY "documents: approved read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND is_approved());

CREATE POLICY "documents: editor upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND is_editor());

CREATE POLICY "documents: editor delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND is_editor());

CREATE POLICY "media: approved read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media' AND is_approved());

CREATE POLICY "media: editor upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media' AND is_editor());

CREATE POLICY "media: editor delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media' AND is_editor());
```

**Step 2: Commit SQL file**
```bash
git add planning/sql/002_rls_policies.sql
git commit -m "docs: add RLS policies SQL migration"
```

**Step 3: Run in Supabase (MANUAL)**
1. Supabase Dashboard → SQL Editor → New Query
2. Paste contents of `002_rls_policies.sql`
3. Run

> Note: If the storage bucket INSERT lines fail (buckets already created via UI), comment them out and re-run.

---

### Task 8: Auth store

**Files:**
- Modify: `src/stores/auth.ts`
- Create: `tests/unit/stores/auth.test.ts`

**Step 1: Write the failing tests first**

Create `tests/unit/stores/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock supabase before importing the store
vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
}))

import { useAuthStore } from '@/stores/auth'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initialises with null user and unauthenticated state', () => {
    const store = useAuthStore()
    expect(store.profile).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('isPending returns true when status is pending', () => {
    const store = useAuthStore()
    store.profile = {
      id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B',
      role: 'viewer', status: 'pending', personId: null,
      createdAt: '', updatedAt: ''
    }
    expect(store.isPending).toBe(true)
    expect(store.isApproved).toBe(false)
  })

  it('isApproved returns true when status is approved', () => {
    const store = useAuthStore()
    store.profile = {
      id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B',
      role: 'viewer', status: 'approved', personId: null,
      createdAt: '', updatedAt: ''
    }
    expect(store.isApproved).toBe(true)
    expect(store.isPending).toBe(false)
  })

  it('isAdmin returns true only for admin role with approved status', () => {
    const store = useAuthStore()
    store.profile = {
      id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B',
      role: 'admin', status: 'approved', personId: null,
      createdAt: '', updatedAt: ''
    }
    expect(store.isAdmin).toBe(true)
    expect(store.isEditor).toBe(true)
  })

  it('isEditor returns false for viewer role', () => {
    const store = useAuthStore()
    store.profile = {
      id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B',
      role: 'viewer', status: 'approved', personId: null,
      createdAt: '', updatedAt: ''
    }
    expect(store.isEditor).toBe(false)
    expect(store.isAdmin).toBe(false)
  })
})
```

**Step 2: Run tests to verify they fail**
```bash
npm run test:run -- tests/unit/stores/auth.test.ts
```
Expected: FAIL — `useAuthStore` not found / missing properties

**Step 3: Implement the auth store**

Replace `src/stores/auth.ts` entirely:

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/services/supabase'
import type { Profile } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const profile = ref<Profile | null>(null)
  const isAuthenticated = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // ─── Computed ───────────────────────────────────────────────────────────────
  const isPending  = computed(() => profile.value?.status === 'pending')
  const isApproved = computed(() => profile.value?.status === 'approved')
  const isAdmin    = computed(() => isApproved.value && profile.value?.role === 'admin')
  const isEditor   = computed(() => isApproved.value && (profile.value?.role === 'editor' || profile.value?.role === 'admin'))
  const needsOnboarding = computed(() => isApproved.value && profile.value?.personId === null)

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function mapProfile(row: {
    id: string; email: string; first_name: string; last_name: string
    role: string; status: string; person_id: string | null
    created_at: string; updated_at: string
  }): Profile {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role as Profile['role'],
      status: row.status as Profile['status'],
      personId: row.person_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  // ─── Actions ────────────────────────────────────────────────────────────────
  async function register(email: string, password: string, firstName: string, lastName: string) {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('No user returned from signup')

      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        role: 'viewer',
        status: 'pending',
        person_id: null,
      })
      if (profileError) throw profileError

      return data.user
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Registration failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function login(email: string, password: string) {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })
      if (loginError) throw loginError
      if (!data.user) throw new Error('Login failed')

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (profileError) throw profileError

      profile.value = mapProfile(profileRow)
      isAuthenticated.value = true
      return profile.value
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      await supabase.auth.signOut()
    } finally {
      profile.value = null
      isAuthenticated.value = false
      error.value = null
    }
  }

  async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profileRow) {
        profile.value = mapProfile(profileRow)
        isAuthenticated.value = true
      }
    } catch {
      // Silent fail — user will be redirected to login by router guard
    }
  }

  async function refreshProfile() {
    if (!profile.value) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profile.value.id)
      .single()
    if (data) profile.value = mapProfile(data)
  }

  return {
    profile,
    isAuthenticated,
    isLoading,
    error,
    isPending,
    isApproved,
    isAdmin,
    isEditor,
    needsOnboarding,
    register,
    login,
    logout,
    checkAuth,
    refreshProfile,
  }
})
```

**Step 4: Run tests to verify they pass**
```bash
npm run test:run -- tests/unit/stores/auth.test.ts
```
Expected: all 5 tests PASS

**Step 5: Commit**
```bash
git add src/stores/auth.ts tests/unit/stores/auth.test.ts
git commit -m "feat: rebuild auth store with role/status model and TDD tests"
```

---

### Task 9: Vue Router

**Files:**
- Create: `src/router/index.ts`
- Modify: `src/main.ts`

**Step 1: Create src/router/index.ts**

```typescript
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ─── Public ────────────────────────────────────────────────────────────
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresGuest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { requiresGuest: true },
    },

    // ─── Auth required (any status) ───────────────────────────────────────
    {
      path: '/pending',
      name: 'pending',
      component: () => import('@/views/PendingView.vue'),
      meta: { requiresAuth: true },
    },

    // ─── Approved users only ──────────────────────────────────────────────
    {
      path: '/',
      redirect: '/tree',
    },
    {
      path: '/tree',
      name: 'tree',
      component: () => import('@/views/TreeView.vue'),
      meta: { requiresApproved: true },
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/OnboardingView.vue'),
      meta: { requiresApproved: true },
    },
    {
      path: '/people',
      name: 'people',
      component: () => import('@/views/PeopleView.vue'),
      meta: { requiresApproved: true },
    },
    {
      path: '/people/:id',
      name: 'person',
      component: () => import('@/views/PersonView.vue'),
      meta: { requiresApproved: true },
    },

    // ─── Admin only ───────────────────────────────────────────────────────
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/admin/AdminView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/approvals',
      name: 'admin-approvals',
      component: () => import('@/views/admin/ApprovalsView.vue'),
      meta: { requiresAdmin: true },
    },

    // ─── Catch-all ────────────────────────────────────────────────────────
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // On first load, check existing session
  if (!auth.isAuthenticated) {
    await auth.checkAuth()
  }

  // Guest-only routes (login/register) — redirect authenticated users
  if (to.meta.requiresGuest && auth.isAuthenticated) {
    if (auth.isPending) return { name: 'pending' }
    if (auth.needsOnboarding) return { name: 'onboarding' }
    return { name: 'tree' }
  }

  // Any authenticated route
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Approved-only routes
  if (to.meta.requiresApproved) {
    if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
    if (auth.isPending) return { name: 'pending' }
    if (auth.needsOnboarding) return { name: 'onboarding' }
  }

  // Admin-only routes
  if (to.meta.requiresAdmin) {
    if (!auth.isAuthenticated) return { name: 'login' }
    if (!auth.isAdmin) return { name: 'tree' }
  }
})

export default router
```

**Step 2: Update src/main.ts**
```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from '@/router'
import './style.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

**Step 3: Commit**
```bash
git add src/router/index.ts src/main.ts
git commit -m "feat: add Vue Router with auth guards for role/status-based routing"
```

---

### Task 10: App.vue shell

**Files:**
- Modify: `src/App.vue`

**Step 1: Replace src/App.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const showNav = computed(() => auth.isAuthenticated && auth.isApproved)

async function handleLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div id="app" class="min-h-screen flex flex-col bg-cream">
    <header v-if="showNav" class="bg-white border-b border-parchment shadow-sm">
      <nav class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <RouterLink to="/tree" class="font-display text-xl text-walnut font-semibold tracking-wide">
          Andrikanich Family
        </RouterLink>

        <div class="flex items-center gap-6">
          <RouterLink to="/tree"    class="text-sm text-walnut-muted hover:text-walnut transition-colors">Tree</RouterLink>
          <RouterLink to="/people"  class="text-sm text-walnut-muted hover:text-walnut transition-colors">People</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin" class="text-sm text-walnut-muted hover:text-walnut transition-colors">Admin</RouterLink>

          <div class="flex items-center gap-3 pl-4 border-l border-parchment">
            <span class="text-sm text-walnut-muted">
              {{ auth.profile?.firstName }}
            </span>
            <button @click="handleLogout" class="btn-ghost text-sm">
              Sign out
            </button>
          </div>
        </div>
      </nav>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>
```

**Step 2: Commit**
```bash
git add src/App.vue
git commit -m "feat: rebuild App.vue with heritage nav and router-view"
```

---

### Task 11: LoginView

**Files:**
- Create: `src/views/LoginView.vue`

**Step 1: Create src/views/LoginView.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email    = ref('')
const password = ref('')

async function handleLogin() {
  try {
    const profile = await auth.login(email.value, password.value)
    if (profile.status === 'pending') {
      router.push({ name: 'pending' })
    } else if (!profile.personId) {
      router.push({ name: 'onboarding' })
    } else {
      const redirect = route.query.redirect as string | undefined
      router.push(redirect ?? { name: 'tree' })
    }
  } catch {
    // error is set on auth.error
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-16 bg-cream">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="font-display text-4xl text-walnut mb-2">Andrikanich Family</h1>
        <p class="text-walnut-muted text-sm">Family history, preserved together</p>
      </div>

      <div class="card p-8">
        <h2 class="font-display text-2xl text-walnut mb-6">Sign in</h2>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label for="email" class="form-label">Email address</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              class="form-input"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label for="password" class="form-label">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              class="form-input"
              placeholder="••••••••"
            />
          </div>

          <p v-if="auth.error" class="error-text">{{ auth.error }}</p>

          <button type="submit" :disabled="auth.isLoading" class="btn-primary w-full mt-2">
            {{ auth.isLoading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <p class="text-center text-sm text-walnut-muted mt-6">
          New family member?
          <RouterLink to="/register" class="text-walnut hover:underline font-medium">
            Create account
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
```

**Step 2: Commit**
```bash
git add src/views/LoginView.vue
git commit -m "feat: add login view with heritage styling"
```

---

### Task 12: RegisterView

**Files:**
- Create: `src/views/RegisterView.vue`

**Step 1: Create src/views/RegisterView.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const firstName = ref('')
const lastName  = ref('')
const email     = ref('')
const password  = ref('')
const confirm   = ref('')
const registered = ref(false)

const passwordMismatch = ref(false)

async function handleRegister() {
  passwordMismatch.value = false
  if (password.value !== confirm.value) {
    passwordMismatch.value = true
    return
  }
  try {
    await auth.register(email.value, password.value, firstName.value, lastName.value)
    registered.value = true
  } catch {
    // auth.error is set
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-16 bg-cream">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="font-display text-4xl text-walnut mb-2">Andrikanich Family</h1>
        <p class="text-walnut-muted text-sm">Family history, preserved together</p>
      </div>

      <!-- Post-registration message -->
      <div v-if="registered" class="card p-8 text-center">
        <div class="text-4xl mb-4">📬</div>
        <h2 class="font-display text-2xl text-walnut mb-3">Request received</h2>
        <p class="text-walnut-muted text-sm leading-relaxed">
          Your account is pending approval. The site admin will review your request
          and you'll be able to sign in once approved.
        </p>
        <RouterLink to="/login" class="btn-secondary inline-block mt-6">
          Back to sign in
        </RouterLink>
      </div>

      <!-- Registration form -->
      <div v-else class="card p-8">
        <h2 class="font-display text-2xl text-walnut mb-2">Create account</h2>
        <p class="text-sm text-walnut-muted mb-6">
          Already have a link to this site? Register below — the admin will approve your access.
        </p>

        <form @submit.prevent="handleRegister" class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="firstName" class="form-label">First name</label>
              <input id="firstName" v-model="firstName" type="text" required class="form-input" />
            </div>
            <div>
              <label for="lastName" class="form-label">Last name</label>
              <input id="lastName" v-model="lastName" type="text" required class="form-input" />
            </div>
          </div>

          <div>
            <label for="email" class="form-label">Email address</label>
            <input id="email" v-model="email" type="email" required autocomplete="email" class="form-input" />
          </div>

          <div>
            <label for="password" class="form-label">Password</label>
            <input id="password" v-model="password" type="password" required minlength="8" class="form-input" />
          </div>

          <div>
            <label for="confirm" class="form-label">Confirm password</label>
            <input id="confirm" v-model="confirm" type="password" required class="form-input" />
            <p v-if="passwordMismatch" class="error-text">Passwords do not match</p>
          </div>

          <p v-if="auth.error" class="error-text">{{ auth.error }}</p>

          <button type="submit" :disabled="auth.isLoading" class="btn-primary w-full mt-2">
            {{ auth.isLoading ? 'Creating account…' : 'Create account' }}
          </button>
        </form>

        <p class="text-center text-sm text-walnut-muted mt-6">
          Already have an account?
          <RouterLink to="/login" class="text-walnut hover:underline font-medium">Sign in</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
```

**Step 2: Commit**
```bash
git add src/views/RegisterView.vue
git commit -m "feat: add register view with pending-confirmation state"
```

---

### Task 13: PendingView

**Files:**
- Create: `src/views/PendingView.vue`

**Step 1: Create src/views/PendingView.vue**

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-16 bg-cream">
    <div class="w-full max-w-md text-center">
      <div class="card p-10">
        <div class="text-5xl mb-5">⏳</div>
        <h2 class="font-display text-2xl text-walnut mb-3">Awaiting approval</h2>
        <p class="text-walnut-muted text-sm leading-relaxed">
          Hi <strong>{{ auth.profile?.firstName }}</strong> — your account is pending review.
          The site admin will approve your access shortly. You'll be able to sign in once approved.
        </p>
        <button @click="auth.logout()" class="btn-secondary mt-8">
          Sign out
        </button>
      </div>
    </div>
  </div>
</template>
```

**Step 2: Commit**
```bash
git add src/views/PendingView.vue
git commit -m "feat: add pending approval view"
```

---

### Task 14: Admin ApprovalsView

**Files:**
- Create: `src/views/admin/ApprovalsView.vue`
- Create: `src/views/admin/AdminView.vue`
- Create: `src/stores/admin.ts`

**Step 1: Create src/stores/admin.ts**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { Profile } from '@/types'

export const useAdminStore = defineStore('admin', () => {
  const pendingProfiles = ref<Profile[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  function mapProfile(row: {
    id: string; email: string; first_name: string; last_name: string
    role: string; status: string; person_id: string | null
    created_at: string; updated_at: string
  }): Profile {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role as Profile['role'],
      status: row.status as Profile['status'],
      personId: row.person_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async function fetchPending() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (fetchError) throw fetchError
      pendingProfiles.value = (data ?? []).map(mapProfile)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load pending users'
    } finally {
      isLoading.value = false
    }
  }

  async function approve(profileId: string) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ status: 'approved' })
      .eq('id', profileId)
    if (updateError) throw updateError
    pendingProfiles.value = pendingProfiles.value.filter(p => p.id !== profileId)
  }

  async function deny(profileId: string) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ status: 'denied' })
      .eq('id', profileId)
    if (updateError) throw updateError
    pendingProfiles.value = pendingProfiles.value.filter(p => p.id !== profileId)
  }

  return { pendingProfiles, isLoading, error, fetchPending, approve, deny }
})
```

**Step 2: Create src/views/admin/AdminView.vue**

```vue
<script setup lang="ts">
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-10">
    <h1 class="font-display text-3xl text-walnut mb-8">Admin Panel</h1>
    <div class="grid gap-4 sm:grid-cols-2">
      <RouterLink to="/admin/approvals" class="card p-6 hover:border-walnut-muted transition-colors">
        <h2 class="font-display text-lg text-walnut mb-1">Pending Approvals</h2>
        <p class="text-sm text-walnut-muted">Review and approve new family member registrations</p>
      </RouterLink>
    </div>
  </div>
</template>
```

**Step 3: Create src/views/admin/ApprovalsView.vue**

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()

onMounted(() => admin.fetchPending())

async function approve(id: string) {
  try { await admin.approve(id) } catch { /* admin.error set */ }
}
async function deny(id: string) {
  try { await admin.deny(id) } catch { /* admin.error set */ }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-10">
    <div class="flex items-center gap-4 mb-8">
      <RouterLink to="/admin" class="btn-ghost text-sm">← Admin</RouterLink>
      <h1 class="font-display text-3xl text-walnut">Pending Approvals</h1>
    </div>

    <div v-if="admin.isLoading" class="text-walnut-muted">Loading…</div>
    <p v-else-if="admin.error" class="error-text">{{ admin.error }}</p>

    <div v-else-if="admin.pendingProfiles.length === 0" class="card p-8 text-center text-walnut-muted">
      No pending registrations
    </div>

    <ul v-else class="space-y-3">
      <li
        v-for="p in admin.pendingProfiles"
        :key="p.id"
        class="card p-5 flex items-center justify-between gap-4"
      >
        <div>
          <p class="font-medium text-walnut">{{ p.firstName }} {{ p.lastName }}</p>
          <p class="text-sm text-walnut-muted">{{ p.email }}</p>
          <p class="text-xs text-walnut-muted mt-0.5">
            Registered {{ new Date(p.createdAt).toLocaleDateString() }}
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button @click="approve(p.id)" class="btn-primary text-sm py-1.5 px-4">Approve</button>
          <button @click="deny(p.id)"   class="btn-secondary text-sm py-1.5 px-4">Deny</button>
        </div>
      </li>
    </ul>
  </div>
</template>
```

**Step 4: Commit**
```bash
git add src/stores/admin.ts src/views/admin/
git commit -m "feat: add admin panel with pending user approvals"
```

---

### Task 15: Onboarding self-link shell

**Files:**
- Create: `src/views/OnboardingView.vue`

> Phase 1 builds the shell and routing. The name-search against `people` becomes functional in Phase 2 once person records exist.

**Step 1: Create src/views/OnboardingView.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const skipped = ref(false)

function skip() {
  skipped.value = true
  // Person-link search will be implemented in Phase 2.
  // For now, route to tree so admin can manually link later.
  router.push({ name: 'tree' })
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-16 bg-cream">
    <div class="w-full max-w-lg">
      <div class="card p-8">
        <h2 class="font-display text-2xl text-walnut mb-2">
          Welcome, {{ auth.profile?.firstName }}!
        </h2>
        <p class="text-walnut-muted text-sm mb-6 leading-relaxed">
          Let's find your record in the family tree so we can personalise your experience.
          This step will be fully functional once family records have been added.
        </p>

        <!-- Phase 2: name-matching search goes here -->
        <div class="bg-cream-dark border border-parchment rounded p-4 text-sm text-walnut-muted mb-6">
          Person matching coming in Phase 2 — family records need to be added first.
        </div>

        <button @click="skip" class="btn-primary w-full">
          Continue to family tree
        </button>
      </div>
    </div>
  </div>
</template>
```

**Step 2: Commit**
```bash
git add src/views/OnboardingView.vue
git commit -m "feat: add onboarding shell (name-match activates in Phase 2)"
```

---

### Task 16: Tree/People placeholder views

These views are needed so the router doesn't 404 during Phase 1 testing. They'll be replaced in Phase 2/3.

**Files:**
- Create: `src/views/TreeView.vue`
- Create: `src/views/PeopleView.vue`
- Create: `src/views/PersonView.vue`

**Step 1: Create all three placeholder views**

`src/views/TreeView.vue`:
```vue
<template>
  <div class="max-w-4xl mx-auto px-4 py-16 text-center">
    <h1 class="font-display text-4xl text-walnut mb-4">Family Tree</h1>
    <p class="text-walnut-muted">The interactive tree will be built in Phase 3.</p>
  </div>
</template>
```

`src/views/PeopleView.vue`:
```vue
<template>
  <div class="max-w-4xl mx-auto px-4 py-16 text-center">
    <h1 class="font-display text-4xl text-walnut mb-4">People</h1>
    <p class="text-walnut-muted">People list and search will be built in Phase 2.</p>
  </div>
</template>
```

`src/views/PersonView.vue`:
```vue
<template>
  <div class="max-w-4xl mx-auto px-4 py-16 text-center">
    <h1 class="font-display text-4xl text-walnut mb-4">Person Profile</h1>
    <p class="text-walnut-muted">Person profiles will be built in Phase 2.</p>
  </div>
</template>
```

**Step 2: Commit**
```bash
git add src/views/TreeView.vue src/views/PeopleView.vue src/views/PersonView.vue
git commit -m "feat: add placeholder views for Phase 2/3 routes"
```

---

### Task 17: Admin email notification (Supabase Edge Function)

**Files:**
- Create: `supabase/functions/notify-admin/index.ts`

> Requires: Supabase CLI installed (`npm install -g supabase`) and Resend API key set as a Supabase secret.

**Step 1: Create the edge function**

```typescript
// supabase/functions/notify-admin/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const ADMIN_EMAIL    = Deno.env.get('ADMIN_EMAIL') ?? ''

interface WebhookPayload {
  type: 'INSERT'
  table: string
  record: {
    id: string
    email: string
    first_name: string
    last_name: string
    status: string
    created_at: string
  }
}

serve(async (req) => {
  const payload: WebhookPayload = await req.json()

  // Only fire on INSERT into profiles with status=pending
  if (payload.type !== 'INSERT' || payload.table !== 'profiles') {
    return new Response('ignored', { status: 200 })
  }

  const { first_name, last_name, email } = payload.record

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'noreply@andrikanichfamily.com',
      to: ADMIN_EMAIL,
      subject: `New registration: ${first_name} ${last_name}`,
      html: `
        <p>A new family member has registered and is awaiting approval:</p>
        <ul>
          <li><strong>Name:</strong> ${first_name} ${last_name}</li>
          <li><strong>Email:</strong> ${email}</li>
        </ul>
        <p><a href="https://andrikanichfamily.com/admin/approvals">Review pending approvals →</a></p>
      `,
    }),
  })

  if (!response.ok) {
    return new Response('Email failed', { status: 500 })
  }

  return new Response('OK', { status: 200 })
})
```

**Step 2: Deploy the function**
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set RESEND_API_KEY=re_your_key_here
npx supabase secrets set ADMIN_EMAIL=your@email.com
npx supabase functions deploy notify-admin
```

**Step 3: Create the Database Webhook in Supabase (MANUAL)**
1. Supabase Dashboard → Database → Webhooks → Create Webhook
2. Name: `on-profile-insert`
3. Table: `profiles`
4. Events: `INSERT`
5. HTTP Request: POST → your Edge Function URL
   (format: `https://[project-ref].supabase.co/functions/v1/notify-admin`)
6. HTTP Headers: `Authorization: Bearer [your supabase service role key]`
7. Save

**Step 4: Commit**
```bash
git add supabase/
git commit -m "feat: add Supabase Edge Function for admin registration notification"
```

---

### Task 18: First admin account (MANUAL)

After running all SQL and deploying the function, create your admin account:

1. Register at `/register` with your name and email
2. In Supabase Dashboard → Table Editor → `profiles`
3. Find your record → Edit → set `status = 'approved'` and `role = 'admin'`
4. Now you can log in and approve other family members via `/admin/approvals`

---

### Task 19: Smoke test the full flow

**Step 1: Start dev server**
```bash
npm run dev
```

**Step 2: Verify these flows work end to end**

| Flow | Steps | Expected |
|------|-------|----------|
| Register | Go to `/register`, fill form, submit | Sees "Request received" page |
| Pending login | Log in with pending account | Redirected to `/pending` |
| Admin approval | Log in as admin, go to `/admin/approvals` | Sees the pending user |
| Approve user | Click Approve | User disappears from list |
| Approved login | Log in as approved user | Redirected to `/onboarding` then `/tree` |
| Nav visible | Logged in as approved user | Nav shows Tree, People links |
| Admin-only nav | Logged in as admin | Nav shows Admin link |
| Guest redirect | Go to `/tree` while logged out | Redirected to `/login` |

**Step 3: Run tests**
```bash
npm run test:run
```
Expected: all tests pass

**Step 4: Final commit**
```bash
git add -A
git commit -m "chore: Phase 1 complete — foundation, auth, admin approval flow"
```

---

## Phase 1 Complete

After Task 19, you have:
- Full database schema with RLS running in Supabase
- Email/password auth with pending → approved flow
- Admin email notification via Resend + Supabase Edge Function
- Vue Router with role/status-aware guards
- Login, Register, Pending, Onboarding shell, Admin approval views
- Heritage visual theme (Playfair Display + Inter, cream/walnut palette)
- Typed Supabase client
- Vitest configured and running

**Next: Phase 2 — Person Records (CRUD, relationships, profile pages, search)**
