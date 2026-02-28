# Genealogy Tracker

A Vue 3 web application for organizing, tracking, and sharing family genealogy records with edit history and document management.

## Features

- **Family Records**: Store information about family members (birth dates, locations, bios)
- **Profile Photos & Documents**: Upload and organize family photos and PDF documents per person
- **Document AI Extraction**: Upload Word/PDF documents; AI extracts structured data with a review screen
- **Visual Family Tree**: Interactive tree visualization to see relationships
- **GEDCOM Import**: Bulk-import people and relationships from standard genealogy files
- **Search & Filter**: Find family members by name, date range, or location
- **Edit History**: Track changes with admin restore; automatic triggers on related tables
- **User Authentication**: Invite-gated registration with Admin, Editor, and Viewer roles
- **PDF Export**: Generate reports via print CSS

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **State Management**: Pinia
- **Styling**: TailwindCSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Testing**: Vitest + Vue Test Utils
- **Deployment**: Vercel

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables by creating a `.env.local` file:

```bash
cp .env.example .env.local
```

3. Add your Supabase credentials (see Supabase Setup below):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### Development

Run the development server with hot reload:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

Create an optimized production build:

```bash
npm run build
```

### Testing

Run tests in watch mode:

```bash
npm run test
```

Run tests once:

```bash
npm run test:run
```

Generate coverage report:

```bash
npm run test:coverage
```

## Supabase Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy your project URL and anon key to `.env.local`

### 2. Create Database Tables

Run the following SQL in your Supabase SQL editor:

```sql
-- Users table
CREATE TABLE users (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Family members table
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date DATE,
  death_date DATE,
  location TEXT,
  bio TEXT,
  profile_photo_url TEXT,
  father_id UUID REFERENCES family_members(id),
  mother_id UUID REFERENCES family_members(id),
  spouse_id UUID REFERENCES family_members(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  last_modified_by UUID REFERENCES users(id)
);

-- Edit history table
CREATE TABLE edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  changed_by UUID NOT NULL REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW()
);

-- Family documents table
CREATE TABLE family_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT CHECK (file_type IN ('image', 'pdf', 'other')),
  description TEXT,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  uploaded_by UUID NOT NULL REFERENCES users(id)
);

-- Create indexes for performance
CREATE INDEX idx_family_members_last_name ON family_members(last_name);
CREATE INDEX idx_family_members_father_id ON family_members(father_id);
CREATE INDEX idx_family_members_mother_id ON family_members(mother_id);
CREATE INDEX idx_edit_history_member_id ON edit_history(member_id);
CREATE INDEX idx_family_documents_member_id ON family_documents(member_id);
```

### 3. Enable Auth

1. In Supabase dashboard → Authentication → Providers
2. Enable Email authentication (enabled by default)
3. Set Email Confirmation to "Confirm email" or "Allow unconfirmed sign-ups"

### 4. Configure Storage

1. In Supabase dashboard → Storage
2. Create a new bucket called `family-documents`
3. Set policies to allow authenticated users to upload and view documents

## Project Structure

```
src/
├── components/          # Vue components
├── views/              # Page components
├── stores/             # Pinia stores (auth, family data)
├── services/           # Supabase client and API functions
├── composables/        # Reusable Vue composables
├── types/              # TypeScript interfaces
├── assets/             # Images, fonts
└── main.ts             # App entry point

tests/
├── unit/               # Unit tests
└── e2e/                # End-to-end tests
```

## Available Scripts

```bash
npm run dev           # Start dev server
npm run build         # Production build
npm run preview       # Preview production build locally
npm run test          # Run tests in watch mode
npm run test:run      # Run tests once
npm run test:coverage # Generate coverage report
```

## Next Steps

- [x] Create login/signup views
- [x] Build person card components
- [x] Implement family tree visualization
- [x] Add search and filter functionality
- [x] Create edit form for family records
- [x] Implement document upload (AI extraction, review screen)
- [x] Add PDF export feature
- [x] Photo gallery and edit history
- [x] GEDCOM import
- [ ] Deploy to Vercel

## Contributing

Create feature branches for all changes and commit frequently with descriptive messages.

```bash
git checkout -b feature/my-feature
# Make changes
git add .
git commit -m "feat: description of changes"
git push origin feature/my-feature
```

## License

MIT
