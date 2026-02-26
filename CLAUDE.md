# CLAUDE.md

Development guidelines for genealogy-tracker project.

## Commands

### Setup
```bash
npm install
```

### Development
```bash
npm run dev           # Start dev server with hot reload
npm run build         # Production build
npm run preview       # Preview production build locally
npm run test          # Run tests in watch mode
npm run test:run      # Run tests once
npm run test:coverage # Run tests with coverage report
```

## Project Architecture

Vue 3 genealogy tracking application with Supabase backend.

### Tech Stack
- Vue 3.4 + TypeScript + Vite
- Pinia for state management
- TailwindCSS for styling
- Supabase (PostgreSQL, Auth, Storage)
- Vitest for testing

### Project Structure
```
src/
├── components/     # Vue components
├── views/         # Page components (Login, Home, Person, etc)
├── stores/        # Pinia stores (auth, family)
├── services/      # Supabase client configuration
├── types/         # TypeScript interfaces
├── composables/   # Reusable Vue composables
├── assets/        # Images, fonts
└── main.ts        # Entry point

tests/
├── unit/          # Unit tests
└── e2e/           # End-to-end tests
```

## Key Features (MVP)

1. **Authentication**: Email/password login with user roles (viewer/editor)
2. **Family Records**: Create, read, update family member information
3. **Documents**: Upload photos and PDFs linked to family members
4. **Edit History**: Track changes with user and timestamp
5. **Family Tree**: Visual tree visualization
6. **Search & Filter**: Find members by name, date, location
7. **PDF Export**: Generate person reports

## Development Practices

- Use TypeScript for type safety
- Component-driven architecture
- Keep stores focused on state management
- Create services for external API calls
- Write tests for new features
- Commit frequently with descriptive messages

## Git Workflow

- Create feature branches for all changes
- Commit frequently with descriptive messages
- Never push directly to main branch
- Use conventional commit format

## Code Quality

- No linting errors or warnings required
- All tests must pass before committing
- TypeScript strict mode enabled

## Implementation Roadmap

### Phase 1: Setup & Infrastructure
1. Create Supabase Account and project
2. Set up database with SQL schema
3. Start development server and verify setup

### Phase 2: Core Features (Priority Order)
4. Build auth views (login/signup)
5. Build person card components
6. Build family tree visualization
7. Build search & filter functionality
8. Build document upload feature
9. Build PDF export feature

## Important

- Store Supabase credentials in `.env.local` (never commit)
- Database schema defined in README.md
- Path alias `@/` configured for imports
