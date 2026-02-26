# Phase 3 — Family Tree Design

**Date:** 2026-02-26
**Status:** Approved
**Scope:** Interactive family tree visualization

---

## Overview

Build an interactive family tree centered on a single root person (focused view). The tree shows 4 generations: grandparents, parents, root person, and children. Users navigate by clicking nodes or names in the slide-over panel, which re-centers the tree on the selected person.

---

## Library Choice

**Vue Flow (`@vue-flow/core`)** — Vue 3 native graph renderer. Handles pan/zoom/canvas out of the box, supports custom node components, and supports dashed edges for unconfirmed relationships. We provide computed x/y positions via a custom layout composable.

---

## Architecture

| File | Purpose |
|------|---------|
| `src/stores/tree.ts` | Fetches focused subgraph (people + edges) for a root person |
| `src/composables/useTreeLayout.ts` | Converts subgraph data into Vue Flow nodes/edges with x/y positions |
| `src/components/tree/TreeNode.vue` | Custom Vue Flow node — heritage card style |
| `src/components/tree/PersonSlideOver.vue` | Right slide-over panel on node click |
| `src/views/TreeView.vue` | Vue Flow canvas, integrates store + layout + slide-over |

---

## Data Fetching

The tree store fetches 4 parallel queries for a given root person ID:

1. Root person record
2. Parents (via `parent_child` where `child_id = rootId`) + their spouses
3. Grandparents (via `parent_child` where `child_id IN [parentIds]`)
4. Children (via `parent_child` where `parent_id = rootId`) + their spouses
5. All relevant `parent_child` and `marriages` edges between fetched people

**Default root:** `profile.personId` from auth store. If not linked, show a person-picker overlay.

**URL state:** `/tree?root=<personId>` — enables browser back/forward and shareable links.

---

## Layout Algorithm

Generational grid layout computed in `useTreeLayout.ts`:

```
Row -2:  [GP1] [GP2]     [GP3] [GP4]     ← grandparents
Row -1:  [Parent A] ══ [Parent B]         ← parents
Row  0:        [ROOT] ══ [Spouse]         ← root + spouses
Row +1:  [Child1] [Child2] [Child3]       ← children
```

Each person is assigned `{ x, y }` based on generation row and horizontal index. ~60 lines of pure math, no external layout library.

**Edge styles:**
- Parent → child: vertical line, **solid** if `confirmed: true`, **dashed** if `confirmed: false`
- Spouse ↔ spouse: horizontal double-bar marriage connector

---

## TreeNode Card Design

Heritage feel matching the app's existing palette:

```
┌─────────────────────┐
│  [photo circle]     │
│  John Andrikanich   │  ← serif display font, walnut
│  1942 – 2018        │  ← muted small text
└─────────────────────┘
```

- Cream/ivory background, walnut border, subtle shadow
- Unconfirmed relationships: dashed node border
- Hover: slight elevation
- Root person: slightly larger card with accent border
- Deceased: slightly muted appearance

---

## PersonSlideOver Panel

Slides in from the right on node click, overlays the tree:

- Photo, full name, vital dates
- Parents, spouse(s), children — each name is clickable to re-center tree
- "View Full Profile" → navigates to `/people/:id`
- "Edit" button — editors/admins only → navigates to person edit form
- Clicking tree background (outside panel) closes it

---

## Navigation & Interactions

| Interaction | Result |
|-------------|--------|
| Click node | Open slide-over for that person |
| Click name in slide-over | Re-center tree on that person |
| Pan / scroll wheel | Vue Flow pan/zoom |
| Pinch (mobile) | Zoom |
| Browser back | Returns to previous root |
| Share URL | `/tree?root=<id>` links to any person |

---

## Out of Scope (Phase 3)

- Photos (no `media` table yet — placeholder circle shown)
- Descendant view toggle (spec mentions it; deferred to polish pass)
- GEDCOM / bulk imports
