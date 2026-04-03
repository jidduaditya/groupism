# Groupism — Version 6: Couple Model + Deadlines + Version Toggle

**Date:** 3 April 2026
**Status:** V5 couple model implemented — couple linking, couple-level voting, travel dates UI, readiness strip, deadline experience, budget validation fix, V4/V5 frontend toggle, dead code cleanup
**Previous:** Draft 4 — Trip Room redesign (4-card layout)

---

## Table of Contents

1. [What Changed Since Draft 4](#1-what-changed-since-draft-4)
2. [Current Architecture](#2-current-architecture)
3. [Database Schema](#3-database-schema)
4. [API Endpoints](#4-api-endpoints)
5. [Frontend Components](#5-frontend-components)
6. [Trip Room Layout](#6-trip-room-layout)
7. [Card Gating Logic](#7-card-gating-logic)
8. [Realtime Subscriptions](#8-realtime-subscriptions)
9. [Gemini AI Functions](#9-gemini-ai-functions)
10. [Auth & Token System](#10-auth--token-system)
11. [V4/V5 Version Toggle](#11-v4v5-version-toggle)
12. [Couple Model](#12-couple-model)
13. [Bugs & Mistakes Log](#13-bugs--mistakes-log)
14. [Complete Code](#14-complete-code)
15. [Git History](#15-git-history)
16. [What Works Today](#16-what-works-today)
17. [Known Issues & Next Steps](#17-known-issues--next-steps)

---

## 1. What Changed Since Draft 4

| Area | Draft 4 | Version 6 |
|------|---------|-----------|
| Decision unit | Individual members | Couples (pair of members as one unit) |
| Member circles | Individual initials | Paired overlapping circles per couple + partner token display |
| Voting | Per-member unique constraint | Per-couple partial unique index (couple_id) |
| Budget preferences | Member-only | Accepts couple_id, validates only provided fields (fix for auto-save 400 bug) |
| Availability | Member-only | Accepts couple_id passthrough |
| Join flow | name → join → TripRoom | name → join → couple linking step (link/solo/skip) → TripRoom |
| Travel dates | Not in UI (only DB) | Organiser date pickers + member read-only display in BudgetDropdowns |
| Deadlines | Not surfaced | Inline text on each card + organiser DeadlineSetterCollapsed |
| Readiness | None | CoupleReadinessStrip (organiser-only, per-couple status grid) |
| Version toggle | None | V4/V5 localStorage switch in Header |
| Debug endpoint | `/debug/env-check` present | Removed |
| Cleanup | DestinationCard, NavLink, v2/ components kept | Removed 5 unused files |

### Files deleted (5)
- `frontend/src/components/DestinationCard.tsx`
- `frontend/src/components/NavLink.tsx`
- `frontend/src/components/v2/AvailabilityInput.tsx`
- `frontend/src/components/v2/BudgetPreferenceForm.tsx`
- Debug endpoint in `backend/src/app.ts`

### Files created (6)
- `backend/src/routes/couples.ts` — 3 endpoints: POST /link, POST /solo, GET /
- `backend/supabase/migration_v5_couples.sql` — couples table + couple_id columns + partial unique index
- `frontend/src/components/CoupleReadinessStrip.tsx` — organiser-only per-couple status grid
- `frontend/src/components/DeadlineSetterCollapsed.tsx` — organiser deadline setter (4 phases)
- `frontend/src/hooks/useAppVersion.ts` — V4/V5 localStorage toggle hook

### Files modified (13)
- `backend/src/app.ts` — removed debug endpoint, added couples router
- `backend/src/routes/availability.ts` — couple_id passthrough
- `backend/src/routes/budget.ts` — fixed validation, couple_id support, dynamic payload
- `backend/src/routes/destinations.ts` — couple_id in vote payload
- `backend/src/routes/trips.ts` — couples fetch, voter_couple_ids, couples in response
- `frontend/src/components/AvailabilityCalendar.tsx` — availabilityDeadline prop + inline deadline
- `frontend/src/components/BudgetDropdowns.tsx` — travel dates UI, deadline prop, inline deadline
- `frontend/src/components/DestinationSearchCard.tsx` — deadline prop + inline deadline
- `frontend/src/components/Header.tsx` — V4/V5 segmented toggle
- `frontend/src/components/MemberCirclesRow.tsx` — couple mode with paired circles + partner token
- `frontend/src/components/PersonalPreferencesCard.tsx` — coupleId prop
- `frontend/src/pages/JoinTrip.tsx` — couple linking step after join
- `frontend/src/pages/TripRoom.tsx` — V5 wiring: couples, deadlines, destinations state, conditional rendering

---

## 2. Current Architecture

```
┌─────────────────┐     REST API     ┌─────────────────┐     SQL      ┌──────────────┐
│   React/Vite    │ ──────────────── │  Express/TS     │ ──────────── │   Supabase   │
│   Vercel        │   fetch + JSON   │  Railway        │  supabase-js │   PostgreSQL │
└────────┬────────┘                  └────────┬────────┘              └──────┬───────┘
         │                                    │                              │
         │ Supabase Realtime (WebSocket)      │ Gemini 2.5 Flash            │ Realtime
         └────────────────────────────────────┴──────────────────────────────┘
```

**Deployment:**
- Frontend: Vercel (`groupism-p9g9.vercel.app`)
- Backend: Railway (`groupism-production.up.railway.app`)
- DB: Supabase (PostgreSQL + Realtime)
- AI: Google Gemini 2.5 Flash

**Auth model:** `x-member-token` + `x-organiser-token` in HTTP headers, stored in localStorage per trip.

---

## 3. Database Schema

### trips table (V4 columns retained)

```sql
id                       uuid primary key default gen_random_uuid()
name                     text not null
join_token               text not null unique
organiser_token          text not null
budget_min               numeric
budget_max               numeric
travel_from              date
travel_to                date
deadline                 date
group_size               integer default 4              -- V4
selected_destination_id  uuid references destination_options(id) on delete set null  -- V4
destination_summary      jsonb                          -- V4
couple_count             integer                        -- V5 NEW
created_at               timestamptz not null default now()
```

### couples table (V5 NEW)

```sql
id           uuid primary key default gen_random_uuid()
trip_id      uuid not null references trips(id) on delete cascade
member_id_1  uuid not null references trip_members(id) on delete cascade
member_id_2  uuid references trip_members(id) on delete set null
couple_name  text
created_at   timestamptz not null default now()
unique (trip_id, member_id_1)
```

### trip_members (V5: added couple_id)

```sql
id, trip_id, display_name, member_token, is_organiser, has_confirmed, confirmed_at, joined_at
couple_id    uuid references couples(id) on delete set null  -- V5 NEW
```

### Other tables (V5: couple_id added)

```sql
-- destination_options
id, trip_id, name, tagline, pros, cons, best_for, estimated_cost_min, estimated_cost_max, source, created_at

-- destination_votes (V5: couple_id + partial unique index)
id, trip_id, destination_id, member_id, couple_id, unique(trip_id, member_id)
-- V5: CREATE UNIQUE INDEX idx_destination_votes_couple ON destination_votes(trip_id, couple_id) WHERE couple_id IS NOT NULL

-- nudge_log
id, trip_id, target_member_id, sent_at

-- budget_preferences (trip_id, member_id unique) (V5: couple_id added)
accommodation_tier, transport_pref, dining_style, activities, daily_budget_min/max, notes, couple_id

-- budget_estimates (trip_id unique)
per_person_min/max, breakdown, divergence_flags, members_included

-- availability_slots (trip_id, member_id, slot_date unique) (V5: couple_id added)
slot_date, tier ('unavailable','free','could_work'), couple_id

-- travel_windows (trip_id unique)
windows jsonb

-- deadlines (trip_id, item_type unique)
item_type, due_date, locked
```

### Migration files
- `backend/supabase/migration.sql` — V1 schema
- `backend/supabase/migration_v2.sql` — V2 tables + Realtime
- `backend/supabase/migration_v3_trips_realtime.sql` — trips Realtime publication
- `backend/supabase/migration_v4_trip_redesign.sql` — 3 new trips columns
- `backend/supabase/migration_v5_couples.sql` — couples table, couple_id columns, partial unique index, Realtime

---

## 4. API Endpoints

### New in V5

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/trips/:joinToken/couples/link` | requireMember | Link two members as a couple |
| `POST /api/trips/:joinToken/couples/solo` | requireMember | Register as solo (creates single-member couple) |
| `GET /api/trips/:joinToken/couples` | loadTrip | Fetch all couples for trip |

**Link endpoint details:**
- Body: `{ partner_member_token: string, couple_name?: string }`
- Validates: partner exists, not self, neither already in a couple
- Creates couple row, updates both members' couple_id
- Returns: `{ couple: { id, trip_id, member_id_1, member_id_2, couple_name } }`

**Solo endpoint details:**
- Body: `{}` (empty)
- Creates couple row with member_id_2 = null
- Returns: `{ couple: { id, ... } }`

### Changed in V5

| Endpoint | Change |
|----------|--------|
| `POST /api/trips/:joinToken/destinations/:destId/vote` | Includes couple_id in vote payload when member has one |
| `POST /api/trips/:joinToken/budget/preferences` | Accepts couple_id, validates only provided fields (fixes auto-save 400) |
| `POST /api/trips/:joinToken/availability` | Accepts couple_id passthrough for slot data |
| `GET /api/trips/:joinToken` | Returns couples array, voter_couple_ids on destinations |

### Removed in V5

| Endpoint | Reason |
|----------|--------|
| `GET /debug/env-check` | Temporary diagnostic, no longer needed |

### All endpoints (complete list)

```
GET    /health

POST   /api/trips                                    Create trip
PATCH  /api/trips/:joinToken                         Update trip (organiser)
GET    /api/trips/:joinToken                         Fetch all trip data

POST   /api/trips/:joinToken/join                    Join trip
POST   /api/trips/:joinToken/confirm                 Confirm participation
POST   /api/trips/:joinToken/nudge                   Nudge unconfirmed (24h cooldown)

GET    /api/trips/:joinToken/destinations             List destinations
POST   /api/trips/:joinToken/destinations             Add destination (organiser)
POST   /api/trips/:joinToken/destinations/summary     AI destination summary
POST   /api/trips/:joinToken/destinations/:destId/vote  Cast vote (V5: includes couple_id)

POST   /api/trips/:joinToken/ai-suggest              AI destination suggestions (legacy)

POST   /api/trips/:joinToken/budget/preferences      Submit budget prefs (V5: couple_id + dynamic payload)
POST   /api/trips/:joinToken/budget/estimate          AI budget estimate
GET    /api/trips/:joinToken/budget                   Fetch prefs + estimate

POST   /api/trips/:joinToken/availability             Submit date slots (batch or single, V5: couple_id)
POST   /api/trips/:joinToken/availability/windows     AI travel windows
GET    /api/trips/:joinToken/availability              Fetch slots + windows

POST   /api/trips/:joinToken/deadlines                Set deadlines
POST   /api/trips/:joinToken/deadlines/lock/:itemType  Lock deadline
GET    /api/trips/:joinToken/deadlines                 Fetch deadlines

POST   /api/trips/:joinToken/couples/link             Link two members as couple   ← V5 NEW
POST   /api/trips/:joinToken/couples/solo             Register as solo traveller   ← V5 NEW
GET    /api/trips/:joinToken/couples                  Fetch couples                ← V5 NEW
```

---

## 5. Frontend Components

### Pages
| File | Purpose |
|------|---------|
| `Index.tsx` | Landing page — animated hero, "Create a Room" + invite code input |
| `CreateTrip.tsx` | 3 fields: trip name, organiser name, group size → POST /api/trips |
| `JoinTrip.tsx` | **V5 rewrite:** Join via invite link → couple linking step (link/solo/skip) → TripRoom |
| `TripRoom.tsx` | **V5 wiring:** 4-card layout + couples + deadlines + version-conditional rendering |
| `NotFound.tsx` | 404 page |

### New V5 Components
| File | Purpose |
|------|---------|
| `CoupleReadinessStrip.tsx` | Organiser-only grid: per-couple status for destination, budget, availability, confirmation |
| `DeadlineSetterCollapsed.tsx` | Collapsible deadline setter with 4 date inputs (destination, budget, availability, confirmation) |
| `useAppVersion.ts` | Hook: reads/writes `groupism:appVersion` in localStorage, defaults to "v5" |

### Modified V5 Components
| File | Change |
|------|--------|
| `Header.tsx` | Added V4/V5 segmented toggle button |
| `MemberCirclesRow.tsx` | Couple mode: paired overlapping circles, partner token display, couple count |
| `DestinationSearchCard.tsx` | `deadline` prop, inline deadline text |
| `BudgetDropdowns.tsx` | Travel dates UI (organiser date pickers / member read-only), `deadline` prop, inline deadline |
| `AvailabilityCalendar.tsx` | `availabilityDeadline` prop, inline deadline text |
| `PersonalPreferencesCard.tsx` | `coupleId` prop, included in save payload |

### Kept from previous versions
| File | Purpose |
|------|---------|
| `MapBackground.tsx` | Leaflet map background with geolocation |

### UI Primitives (`components/ui/`)
- `button.tsx` — Variants: amber, outline-strong, ghost, destructive
- `sonner.tsx` — Sonner toast wrapper
- `toast.tsx` / `toaster.tsx` — Radix UI toast primitives
- `tooltip.tsx` — Radix UI tooltip

---

## 6. Trip Room Layout

```
┌──────────────────────────────────────┐
│ Header (trip name + V4/V5 toggle)    │
│ MemberCirclesRow (couples or indiv)  │
│ CoupleReadinessStrip (V5 org only)   │ ← conditional
│ DeadlineSetterCollapsed (V5 org only)│ ← conditional
│                                      │
│ Card 1: DestinationSearchCard        │ ← always active, deadline text (V5)
│   [budget mismatch warning]          │ ← conditional
│                                      │
│ Card 2: BudgetDropdowns              │ ← disabled until destination selected
│   [travel dates UI]                  │ ← V5: organiser pickers / member readonly
│   [deadline text]                    │ ← V5
│                                      │
│ Card 3: AvailabilityCalendar         │ ← disabled until budget set
│   [deadline text]                    │ ← V5
│                                      │
│ Card 4: PersonalPreferencesCard      │ ← always active, coupleId (V5)
│                                      │
├──────────────────────────────────────┤
│ Sticky "I'm in" / "You're in" bar   │ ← fixed bottom
└──────────────────────────────────────┘
```

---

## 7. Card Gating Logic

```typescript
const card2Enabled = trip.selected_destination_id !== null;
const card3Enabled = trip.budget_min !== null;
```

Disabled cards: `opacity-40 pointer-events-none select-none` with a hint message ("Complete destination first" / "Set a budget first").

---

## 8. Realtime Subscriptions

TripRoom subscribes to 6 Supabase Realtime channels (V5: +couples):

```typescript
channel
  .on('postgres_changes', { table: 'destination_votes', filter: `trip_id=eq.${trip.id}` }, fetchTrip)
  .on('postgres_changes', { table: 'trip_members', filter: `trip_id=eq.${trip.id}` }, fetchTrip)
  .on('postgres_changes', { event: 'UPDATE', table: 'trips', filter: `id=eq.${trip.id}` }, fetchTrip)
  .on('postgres_changes', { table: 'budget_preferences', filter: `trip_id=eq.${trip.id}` }, fetchTrip)
  .on('postgres_changes', { table: 'availability_slots', filter: `trip_id=eq.${trip.id}` }, fetchTrip)
  .on('postgres_changes', { table: 'couples', filter: `trip_id=eq.${trip.id}` }, fetchTrip)  // V5 NEW
```

Also refetches on tab focus (`visibilitychange` event).

---

## 9. Gemini AI Functions

| Function | File | Purpose |
|----------|------|---------|
| `getDestinationSuggestions` | gemini.ts | Legacy: 3 destination cards with pros/cons/cost |
| `estimateBudget` | gemini.ts | Per-person budget breakdown with divergence flags |
| `rankTravelWindows` | gemini.ts | Top 3 travel windows scored 0-100 |
| `getDestinationSummary` | gemini.ts | Two modes — AI suggest (3 names) or search (full summary with cost breakdown) |

Unchanged from Draft 4.

---

## 10. Auth & Token System

Unchanged from Draft 4.

- **Join token:** URL-safe slug from trip name (e.g., `goa-march-26-a3f`)
- **Organiser token:** Random hex, stored in DB `trips.organiser_token`, sent via `x-organiser-token` header
- **Member token:** Random hex, stored in DB `trip_members.member_token`, sent via `x-member-token` header
- **Client storage:** `localStorage('triphaus:<joinToken>')` → `{ memberToken, memberId, organiserToken? }`
- **Timing-safe comparison** for organiser token via `crypto.timingSafeEqual`

---

## 11. V4/V5 Version Toggle

**Hook:** `useAppVersion()` reads/writes `localStorage('groupism:appVersion')`, defaults to `"v5"`.

**Header UI:** Segmented control with V4/V5 buttons. Active version gets amber background.

**TripRoom conditional rendering (V5 only):**
- CoupleReadinessStrip (organiser + couples exist)
- DeadlineSetterCollapsed (organiser)
- Deadline props on Cards 1-3
- coupleId prop on Card 4
- Couple mode on MemberCirclesRow (passes couples + joinToken)
- Header subtitle: "X couples" instead of "X people" when couples exist

**V4 mode:** All V5 features disabled, behaves identically to Draft 4.

---

## 12. Couple Model

### Data model

A "couple" is a row in the `couples` table linking two `trip_members` (or one for solo travellers). Each member's `couple_id` FK points back to the couple row.

- **Linked couple:** `member_id_1` + `member_id_2` both set, both members get `couple_id = couple.id`
- **Solo traveller:** `member_id_1` set, `member_id_2` null, member gets `couple_id = couple.id`
- **Unlinked member:** `couple_id` is null — hasn't gone through the linking step

### Linking flow (JoinTrip.tsx)

1. User enters name and joins (POST /join) — gets member_token
2. Page transitions to couple linking step:
   - **Link with partner:** Enter partner's member_token → POST /couples/link
   - **I'm travelling solo:** → POST /couples/solo
   - **Skip for now:** → Navigate to TripRoom without linking

### Couple-level voting

- `destination_votes` has a partial unique index: `UNIQUE(trip_id, couple_id) WHERE couple_id IS NOT NULL`
- When voting, if member has a `couple_id`, it's included in the vote payload
- This means both partners in a couple share one vote

### Partner token display

MemberCirclesRow in couple mode shows the current user's member_token so their partner can use it to link.

---

## 13. Bugs & Mistakes Log

### V5-specific bugs found and fixed

1. **Budget preferences 400 on auto-save with partial fields**
   - V2 migration had `NOT NULL` constraints on accommodation_tier, transport_pref, dining_style
   - Auto-save sends only the changed field → validation rejected missing required fields
   - Fix: Changed validation to only check fields when provided (`!== undefined`), built dynamic payload

2. **BudgetDropdowns destructuring error — deadline prop not in function signature**
   - Component accepted `deadline` in props interface but didn't destructure it
   - Fix: Added `deadline` to destructured props

### Earlier bugs (from Draft 3/4)
3. **ENV var mismatch on Railway** — `SUPABASE_URL` vs `SUPABASE_PROJECT_URL` → Fixed in supabase.ts with fallback
4. **PersonalPreferencesCard used display labels instead of DB enum values** → Fixed with value/label objects
5. **AvailabilityCalendar misused useMemo for side effects** → Replaced with useEffect
6. **DestinationSearchCard didn't unwrap API response** → Added `const summary = res.destination ?? res`
7. **CostRow expected wrong field shapes** → Changed to accept min/max props directly

---

## 14. Complete Code

### File Map

```
backend/
├── src/
│   ├── app.ts                    Express app setup, CORS, routes (V5: +couples, -debug)
│   ├── index.ts                  Server entrypoint (app.listen)
│   ├── lib/
│   │   ├── gemini.ts             4 AI functions (suggestions, budget, windows, summary)
│   │   ├── supabase.ts           Lazy-init Supabase client with env var fallback
│   │   └── tokens.ts             Token generation (organiser, member, join)
│   ├── middleware/
│   │   └── tokens.ts             loadTrip, requireMember, requireOrganiser
│   └── routes/
│       ├── trips.ts              POST (create), PATCH (update), GET (fetch all + couples)
│       ├── members.ts            join, confirm, nudge
│       ├── destinations.ts       list, add, vote (V5: couple_id), summary
│       ├── ai.ts                 Legacy AI suggestions
│       ├── budget.ts             preferences (V5: couple_id + dynamic), estimate
│       ├── availability.ts       slots (V5: couple_id passthrough), windows
│       ├── deadlines.ts          set, lock, fetch
│       └── couples.ts            V5 NEW: link, solo, fetch
├── supabase/
│   ├── migration.sql
│   ├── migration_v2.sql
│   ├── migration_v3_trips_realtime.sql
│   ├── migration_v4_trip_redesign.sql
│   └── migration_v5_couples.sql

frontend/
├── src/
│   ├── App.tsx                   Router + providers
│   ├── main.tsx                  Entrypoint
│   ├── index.css                 CSS vars, design tokens
│   ├── lib/
│   │   ├── api.ts                HTTP helpers + token storage
│   │   ├── supabase.ts           Client-side Supabase (anon key)
│   │   └── utils.ts              cn() helper
│   ├── hooks/
│   │   ├── use-toast.ts          Toast state management
│   │   └── useAppVersion.ts      V5 NEW: V4/V5 toggle hook
│   ├── pages/
│   │   ├── Index.tsx             Landing page
│   │   ├── CreateTrip.tsx        Create trip form
│   │   ├── JoinTrip.tsx          V5: Join + couple linking step
│   │   ├── TripRoom.tsx          V5: 4-card layout + couples + deadlines
│   │   └── NotFound.tsx          404
│   └── components/
│       ├── Header.tsx            V5: Fixed header + V4/V5 toggle
│       ├── MapBackground.tsx     Leaflet background
│       ├── MemberCirclesRow.tsx  V5: couple mode + partner token
│       ├── CoupleReadinessStrip.tsx  V5 NEW: organiser status grid
│       ├── DeadlineSetterCollapsed.tsx  V5 NEW: deadline setter
│       ├── DestinationSearchCard.tsx  V5: + deadline prop
│       ├── BudgetDropdowns.tsx   V5: + travel dates + deadline
│       ├── AvailabilityCalendar.tsx   V5: + deadline prop
│       ├── PersonalPreferencesCard.tsx V5: + coupleId prop
│       └── ui/
│           ├── button.tsx
│           ├── sonner.tsx
│           ├── toast.tsx
│           ├── toaster.tsx
│           └── tooltip.tsx
```

---

### backend/package.json

```json
{
  "name": "triphaus-backend",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "Triphaus backend API",
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "@supabase/supabase-js": "^2.101.1",
    "cors": "^2.8.6",
    "dotenv": "^17.4.0",
    "express": "^5.2.1"
  },
  "devDependencies": {
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/node": "^25.5.0",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^6.0.2"
  }
}
```

### backend/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### backend/src/app.ts

```typescript
import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import tripsRouter        from './routes/trips';
import membersRouter      from './routes/members';
import destinationsRouter from './routes/destinations';
import aiRouter           from './routes/ai';
import budgetRouter       from './routes/budget';
import availabilityRouter from './routes/availability';
import deadlinesRouter    from './routes/deadlines';
import couplesRouter      from './routes/couples';

const app = express();

// ─── Health endpoint BEFORE any middleware ────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://groupism-p9g9.vercel.app',
  'http://localhost:5173',
  'http://localhost:8080',
  ...(process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean),
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/trips',                         tripsRouter);
app.use('/api/trips/:joinToken',              membersRouter);
app.use('/api/trips/:joinToken/destinations', destinationsRouter);
app.use('/api/trips/:joinToken/ai-suggest',   aiRouter);
app.use('/api/trips/:joinToken/budget',       budgetRouter);
app.use('/api/trips/:joinToken/availability', availabilityRouter);
app.use('/api/trips/:joinToken/deadlines',    deadlinesRouter);
app.use('/api/trips/:joinToken/couples',     couplesRouter);

// ─── 404 fallthrough ─────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Unhandled error:', err.stack || err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Process-level safety net ────────────────────────────────────────────────
process.on('uncaughtException',  err    => console.error('Uncaught exception:', err));
process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));

export default app;
```

### backend/src/index.ts

```typescript
import 'dotenv/config';
import app from './app';

// ─── Startup env var check ────────────────────────────────────────────────────
const supaUrl = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
const supaKey = process.env.SUPABASE_SERVICE_KEY;
console.log('Env check:',
  `SUPABASE_URL=${supaUrl ? 'SET' : 'MISSING'}`,
  `SUPABASE_SERVICE_KEY=${supaKey ? 'SET' : 'MISSING'}`,
  `GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? 'SET' : 'MISSING'}`,
  `FRONTEND_URL=${process.env.FRONTEND_URL ? 'SET' : 'MISSING'}`,
);
if (!supaUrl || !supaKey) console.error('FATAL: Missing required Supabase env vars');

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`Triphaus backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
```

### backend/src/lib/supabase.ts

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

// Lazy init — allows health check to pass before env vars are configured
export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      `Missing Supabase env vars: ${!url ? 'SUPABASE_URL/SUPABASE_PROJECT_URL' : ''} ${!key ? 'SUPABASE_SERVICE_KEY' : ''}`.trim()
    );
  }

  _client = createClient(url, key);
  return _client;
}

// Convenience re-export for existing call sites
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});
```

### backend/src/lib/tokens.ts

```typescript
import { randomBytes } from 'crypto';

// 64-char hex — stored only in organiser's browser, never in URL
export function generateOrganiserToken(): string {
  return randomBytes(32).toString('hex');
}

// 32-char hex — stored in member's browser localStorage
export function generateMemberToken(): string {
  return randomBytes(16).toString('hex');
}

// URL-safe slug: "goa-march-a3f2"
// Used as the trip's permanent URL identifier
export function generateJoinToken(tripName: string): string {
  const slug = tripName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('-')
    .substring(0, 20);

  const suffix = randomBytes(2).toString('hex');
  return slug ? `${slug}-${suffix}` : `trip-${suffix}`;
}
```

### backend/src/lib/gemini.ts

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY not set — AI suggestions will be unavailable');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export interface DestinationSuggestion {
  name: string;
  tagline: string;
  pros: string[];
  cons: string[];
  best_for: string;
  estimated_cost_min: number;
  estimated_cost_max: number;
}

// ─── Budget Estimation ──────────────────────────────────────────────────────

export interface BudgetEstimateResult {
  per_person_min: number;
  per_person_max: number;
  breakdown: Record<string, { min: number; max: number; note: string }>;
  divergence_flags: Array<{ issue: string; gap_description: string }>;
}

export async function estimateBudget(params: {
  destination: string;
  preferences: Array<{
    display_name: string;
    accommodation_tier: string;
    transport_pref: string;
    dining_style: string;
    activities: string[];
    daily_budget_min: number;
    daily_budget_max: number;
  }>;
  travel_from: string;
  travel_to: string;
}): Promise<BudgetEstimateResult> {

  const prompt = `You are a travel budget expert for Indian domestic trips.

Destination: ${params.destination}
Travel dates: ${params.travel_from || 'flexible'} to ${params.travel_to || 'flexible'}
Number of members: ${params.preferences.length}

Member preferences:
${params.preferences.map((p, i) => `${i + 1}. ${p.display_name}: stay=${p.accommodation_tier}, transport=${p.transport_pref}, food=${p.dining_style}, activities=[${p.activities.join(', ')}], daily budget ₹${p.daily_budget_min || '?'}–₹${p.daily_budget_max || '?'}`).join('\n')}

Estimate a realistic per-person budget. Identify any divergence between members (e.g., one wants budget stay but another wants premium).

Return ONLY valid JSON. No markdown fences. No explanation. Exactly this structure:
{
  "per_person_min": number,
  "per_person_max": number,
  "breakdown": {
    "accommodation": { "min": number, "max": number, "note": "string" },
    "transport": { "min": number, "max": number, "note": "string" },
    "food": { "min": number, "max": number, "note": "string" },
    "activities": { "min": number, "max": number, "note": "string" }
  },
  "divergence_flags": [
    { "issue": "string", "gap_description": "string" }
  ]
}

All costs are total per person in INR for the full trip duration. divergence_flags can be empty array if everyone is aligned.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean);

    if (!parsed.per_person_min || !parsed.per_person_max || !parsed.breakdown) {
      throw new Error('Unexpected Gemini response shape');
    }

    return parsed;
  } catch (err) {
    console.error('Gemini budget estimation error:', err);
    throw new Error('AI_UNAVAILABLE');
  }
}

// ─── Travel Window Ranking ──────────────────────────────────────────────────

export interface TravelWindow {
  start_date: string;
  end_date: string;
  nights: number;
  full_availability_count: number;
  stretching_members: string[];
  unavailable_members: string[];
  summary: string;
  score: number;
}

export async function rankTravelWindows(params: {
  members: Array<{ id: string; display_name: string }>;
  slots: Array<{ member_id: string; date: string; tier: string }>;
  trip_duration: number;
}): Promise<TravelWindow[]> {

  const memberMap = Object.fromEntries(params.members.map(m => [m.id, m.display_name]));

  const prompt = `You are a scheduling optimizer for Indian group travel.

Members: ${params.members.map(m => m.display_name).join(', ')}
Desired trip duration: ${params.trip_duration} nights

Availability data (member → date → tier):
${params.slots.map(s => `${memberMap[s.member_id] || s.member_id}: ${s.date} = ${s.tier}`).join('\n')}

Tiers: "free" = fully available, "could_work" = would stretch but possible, "unavailable" = cannot go.

Find the top 3 travel windows (consecutive date ranges of ${params.trip_duration} nights) that maximize group availability. Score each 0-100.

Return ONLY valid JSON. No markdown fences. No explanation. Exactly this structure:
{
  "windows": [
    {
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "nights": number,
      "full_availability_count": number,
      "stretching_members": ["name", ...],
      "unavailable_members": ["name", ...],
      "summary": "string describing the window quality",
      "score": number
    }
  ]
}

Return up to 3 windows sorted by score descending. If fewer than 3 viable windows exist, return fewer.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean);

    if (!parsed.windows || !Array.isArray(parsed.windows)) {
      throw new Error('Unexpected Gemini response shape');
    }

    return parsed.windows.slice(0, 3);
  } catch (err) {
    console.error('Gemini travel windows error:', err);
    throw new Error('AI_UNAVAILABLE');
  }
}

// ─── Destination Summary (search + AI suggest) ─────────────────────────────

export interface DestinationSummaryResult {
  suggestions?: string[];
  destination?: {
    name: string;
    tagline: string;
    highlights: string[];
    watch_out: string[];
    cost_breakdown: {
      flights_min: number;
      flights_max: number;
      hotel_per_night_min: number;
      hotel_per_night_max: number;
      food_per_day_min: number;
      food_per_day_max: number;
      activities_min: number;
      activities_max: number;
      total_min: number;
      total_max: number;
    };
    nights: number;
  };
}

export async function getDestinationSummary(params: {
  query: string | null;
  source: 'search' | 'ai';
  groupSize: number;
  nights: number;
  budgetMin?: number;
  budgetMax?: number;
}): Promise<DestinationSummaryResult> {

  const budgetContext = params.budgetMin && params.budgetMax
    ? `The group's budget is ₹${params.budgetMin.toLocaleString('en-IN')} – ₹${params.budgetMax.toLocaleString('en-IN')} per person.`
    : '';

  if (params.source === 'ai' && !params.query) {
    const prompt = `You are a travel expert for Indian domestic group travel.

Group size: ${params.groupSize} people
Trip duration: ${params.nights} nights
${budgetContext}

Suggest exactly 3 destination names for this group. Just the names, no explanation.

Return ONLY valid JSON, no markdown fences:
{ "suggestions": ["Destination 1", "Destination 2", "Destination 3"] }`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(clean);
    } catch (err) {
      console.error('Gemini destination suggest error:', err);
      throw new Error('AI_UNAVAILABLE');
    }
  }

  const destination = params.query!;

  const prompt = `You are a travel expert for Indian domestic group travel.

Destination: ${destination}
Group size: ${params.groupSize} people
Trip duration: ${params.nights} nights
${budgetContext}

Generate a destination summary AND realistic cost breakdown for this trip.

IMPORTANT for cost breakdown:
- Flights: estimate round-trip economy class per person from a Tier 1 Indian city (Mumbai/Delhi/Bangalore). If destination is driveable (<6hr), flights_min and flights_max can be 0.
- Hotel: per person per night sharing a room (divide room rate by 2). Use mid-range as the baseline.
- Food: per person per day including all meals. Include one nice dinner per trip.
- Activities: total per person for the entire trip, not per day.
- All totals = (flights) + (hotel × ${params.nights}) + (food × ${params.nights}) + activities
- Be realistic. Do not underestimate.

Return ONLY valid JSON, no markdown fences:
{
  "destination": {
    "name": "string",
    "tagline": "one honest, punchy sentence — not a tourism tagline",
    "highlights": ["string", "string", "string"],
    "watch_out": ["string", "string"],
    "cost_breakdown": {
      "flights_min": number,
      "flights_max": number,
      "hotel_per_night_min": number,
      "hotel_per_night_max": number,
      "food_per_day_min": number,
      "food_per_day_max": number,
      "activities_min": number,
      "activities_max": number,
      "total_min": number,
      "total_max": number
    },
    "nights": ${params.nights}
  }
}

All amounts in INR per person.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean);

    if (!parsed.destination || !parsed.destination.cost_breakdown) {
      throw new Error('Unexpected Gemini response shape');
    }

    return parsed;
  } catch (err) {
    console.error('Gemini destination summary error:', err);
    throw new Error('AI_UNAVAILABLE');
  }
}

// ─── Destination Suggestions ────────────────────────────────────────────────

export async function getDestinationSuggestions(params: {
  groupSize: number;
  budgetMin: number;
  budgetMax: number;
  travelFrom: string;
  travelTo: string;
  notes?: string;
}): Promise<DestinationSuggestion[]> {

  const prompt = `You are a travel expert helping an Indian group plan a domestic trip.

Group: ${params.groupSize} people
Budget: ₹${params.budgetMin.toLocaleString('en-IN')} – ₹${params.budgetMax.toLocaleString('en-IN')} per person
Travel window: ${params.travelFrom} to ${params.travelTo}
${params.notes ? `Notes from organiser: ${params.notes}` : ''}

Suggest exactly 3 destination options. Be specific and honest — real tradeoffs, not marketing copy. Vary the destinations meaningfully (don't suggest three beach destinations if one beach is already there).

Return ONLY valid JSON. No markdown fences. No explanation. No preamble. Exactly this structure:
{
  "destinations": [
    {
      "name": "string",
      "tagline": "one punchy sentence that is honest, not promotional",
      "pros": ["string", "string", "string"],
      "cons": ["string", "string"],
      "best_for": "string describing which group type this suits",
      "estimated_cost_min": number,
      "estimated_cost_max": number
    }
  ]
}

Costs are per person in INR: accommodation + food + local transport only. Exclude flights unless the travel window and budget clearly require them.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Strip accidental markdown fences before parsing
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    const parsed = JSON.parse(clean);

    if (!parsed.destinations || !Array.isArray(parsed.destinations)) {
      throw new Error('Unexpected Gemini response shape');
    }

    return parsed.destinations.slice(0, 3);
  } catch (err) {
    console.error('Gemini error:', err);
    throw new Error('AI_UNAVAILABLE');
  }
}
```

### backend/src/middleware/tokens.ts

```typescript
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { supabase } from '../lib/supabase';

// Attach trip to req from join_token URL param
export async function loadTrip(req: Request, res: Response, next: NextFunction) {
  const { joinToken } = req.params;
  if (!joinToken) return res.status(400).json({ error: 'Missing join token' });

  const { data: trip, error } = await supabase
    .from('trips')
    .select('*')
    .eq('join_token', joinToken)
    .single();

  if (error || !trip) return res.status(404).json({ error: 'Trip not found' });

  (req as any).trip = trip;
  next();
}

// Verify x-member-token header belongs to a member of this trip
export async function requireMember(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-member-token'] as string;
  if (!token) return res.status(401).json({ error: 'x-member-token header required' });

  const trip = (req as any).trip;
  const { data: member, error } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', trip.id)
    .eq('member_token', token)
    .single();

  if (error || !member) return res.status(403).json({ error: 'Not a member of this trip' });

  (req as any).member = member;
  next();
}

// Verify x-organiser-token header matches this trip's organiser_token
// Uses constant-time comparison to prevent timing attacks
export async function requireOrganiser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-organiser-token'] as string;
  if (!token) return res.status(401).json({ error: 'x-organiser-token header required' });

  const trip = (req as any).trip;

  const a = Buffer.from(token);
  const b = Buffer.from(trip.organiser_token);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Invalid organiser token' });
  }

  next();
}
```

### backend/src/routes/trips.ts

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { generateOrganiserToken, generateMemberToken, generateJoinToken } from '../lib/tokens';
import { loadTrip, requireOrganiser } from '../middleware/tokens';

const router = Router();

// POST /api/trips — create a new trip
router.post('/', async (req, res) => {
  try {
    const {
      name,
      budget_min,
      budget_max,
      travel_from,
      travel_to,
      deadline,
      organiser_name,
      group_size,
    } = req.body;

    if (!name || !organiser_name) {
      return res.status(400).json({ error: 'name and organiser_name are required' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Trip name must be 100 characters or fewer' });
    }
    if (organiser_name.length > 50) {
      return res.status(400).json({ error: 'Organiser name must be 50 characters or fewer' });
    }
    if (budget_min != null && budget_max != null && Number(budget_min) > Number(budget_max)) {
      return res.status(400).json({ error: 'budget_min must be less than or equal to budget_max' });
    }
    if (travel_from && travel_to && travel_from > travel_to) {
      return res.status(400).json({ error: 'travel_from must be before or equal to travel_to' });
    }
    if (group_size != null && (!Number.isInteger(Number(group_size)) || Number(group_size) < 2 || Number(group_size) > 30)) {
      return res.status(400).json({ error: 'group_size must be an integer between 2 and 30' });
    }

    const organiser_token = generateOrganiserToken();
    const member_token    = generateMemberToken();
    let   join_token      = generateJoinToken(name);

    // Build insert payload — only include optional fields when provided
    const tripData: Record<string, any> = { name, join_token, organiser_token };
    if (budget_min  != null) tripData.budget_min  = budget_min;
    if (budget_max  != null) tripData.budget_max  = budget_max;
    if (travel_from)         tripData.travel_from = travel_from;
    if (travel_to)           tripData.travel_to   = travel_to;
    if (deadline)            tripData.deadline    = deadline;
    if (group_size != null)  tripData.group_size  = Number(group_size);

    // Retry once on join_token collision (extremely rare but possible)
    const { data: trip, error } = await supabase
      .from('trips')
      .insert(tripData)
      .select()
      .single();

    if (error?.code === '23505') {
      join_token = generateJoinToken(name);
      tripData.join_token = join_token;
      const retry = await supabase
        .from('trips')
        .insert(tripData)
        .select()
        .single();

      if (retry.error) return res.status(500).json({ error: 'Failed to create trip', detail: retry.error.message });

      const { data: member, error: memberErr } = await supabase
        .from('trip_members')
        .insert({ trip_id: retry.data.id, display_name: organiser_name, member_token, is_organiser: true })
        .select()
        .single();

      if (memberErr) return res.status(500).json({ error: 'Failed to register organiser', detail: memberErr.message });

      return res.status(201).json({
        trip_id:         retry.data.id,
        join_token:      retry.data.join_token,
        join_url:        `${process.env.FRONTEND_URL}/join/${retry.data.join_token}`,
        organiser_token,
        member_token,
        member_id:       member?.id,
      });
    }

    if (error) return res.status(500).json({ error: 'Failed to create trip', detail: error.message });
    if (!trip) return res.status(500).json({ error: 'Failed to create trip', detail: 'No data returned' });

    // Register organiser as first member
    const { data: member, error: memberErr } = await supabase
      .from('trip_members')
      .insert({ trip_id: trip.id, display_name: organiser_name, member_token, is_organiser: true })
      .select()
      .single();

    if (memberErr) return res.status(500).json({ error: 'Failed to register organiser', detail: memberErr.message });

    res.status(201).json({
      trip_id:         trip.id,
      join_token:      trip.join_token,
      join_url:        `${process.env.FRONTEND_URL}/join/${trip.join_token}`,
      organiser_token,
      member_token,
      member_id:       member?.id,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Trip creation failed', detail: err.message });
  }
});

// PATCH /api/trips/:joinToken — organiser updates trip details (budget, dates, deadline)
router.patch('/:joinToken', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const { budget_min, budget_max, travel_from, travel_to, deadline, selected_destination_id, destination_summary } = req.body;

  const updates: Record<string, any> = {};
  if (budget_min                !== undefined) updates.budget_min                = budget_min;
  if (budget_max                !== undefined) updates.budget_max                = budget_max;
  if (travel_from               !== undefined) updates.travel_from               = travel_from;
  if (travel_to                 !== undefined) updates.travel_to                 = travel_to;
  if (deadline                  !== undefined) updates.deadline                  = deadline;
  if (selected_destination_id   !== undefined) updates.selected_destination_id   = selected_destination_id;
  if (destination_summary       !== undefined) updates.destination_summary       = destination_summary;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const { data, error } = await supabase
    .from('trips')
    .update(updates)
    .eq('id', trip.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update trip' });

  const { organiser_token: _omit, ...safeTrip } = data;
  res.json({ trip: safeTrip });
});

// GET /api/trips/:joinToken — fetch everything for the Trip Room
router.get('/:joinToken', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  // Fetch all data in parallel
  const [
    { data: members },
    { data: destinations },
    { data: budgetPrefs },
    { data: budgetEstimate },
    { data: availSlots },
    { data: travelWindows },
    { data: deadlines },
    { data: couples },
  ] = await Promise.all([
    supabase
      .from('trip_members')
      .select('id, display_name, is_organiser, has_confirmed, confirmed_at, joined_at, couple_id')
      .eq('trip_id', trip.id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('destination_options')
      .select(`
        id, name, tagline, pros, cons, best_for,
        estimated_cost_min, estimated_cost_max, source, created_at,
        destination_votes(member_id, couple_id)
      `)
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('budget_preferences')
      .select('*, trip_members(id, display_name)')
      .eq('trip_id', trip.id),
    supabase
      .from('budget_estimates')
      .select('*')
      .eq('trip_id', trip.id)
      .maybeSingle(),
    supabase
      .from('availability_slots')
      .select('*, trip_members(id, display_name)')
      .eq('trip_id', trip.id),
    supabase
      .from('travel_windows')
      .select('*')
      .eq('trip_id', trip.id)
      .maybeSingle(),
    supabase
      .from('deadlines')
      .select('*')
      .eq('trip_id', trip.id),
    supabase
      .from('couples')
      .select(`
        id, couple_name,
        member_1:trip_members!couples_member_id_1_fkey(id, display_name, has_confirmed),
        member_2:trip_members!couples_member_id_2_fkey(id, display_name, has_confirmed)
      `)
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: true }),
  ]);

  // Auto-lock past-due deadlines
  const now = new Date().toISOString().slice(0, 10);
  const pastDueUnlocked = (deadlines || []).filter(
    (dl: any) => !dl.locked && dl.due_date < now
  );
  if (pastDueUnlocked.length > 0) {
    await Promise.all(
      pastDueUnlocked.map((dl: any) =>
        supabase.from('deadlines').update({ locked: true }).eq('id', dl.id)
      )
    );
    // Mark them as locked in our local copy too
    for (const dl of pastDueUnlocked) {
      dl.locked = true;
    }
  }

  // Flatten vote counts and expose voter_member_ids
  const destinationsWithVotes = (destinations || []).map((d: any) => ({
    ...d,
    votes: d.destination_votes?.length ?? 0,
    voter_member_ids: (d.destination_votes || []).map((v: any) => v.member_id),
    voter_couple_ids: [...new Set((d.destination_votes || []).map((v: any) => v.couple_id).filter(Boolean))],
    destination_votes: undefined,
  }));

  // V1 readiness score: 50% voting + 50% confirmation
  const memberIds = new Set((members || []).map((m: any) => m.id));
  const total = memberIds.size;

  const votedMemberIds = new Set<string>();
  for (const d of destinations || []) {
    for (const v of (d as any).destination_votes || []) {
      if (memberIds.has(v.member_id)) {
        votedMemberIds.add(v.member_id);
      }
    }
  }

  const voted     = votedMemberIds.size;
  const confirmed = (members || []).filter((m: any) => m.has_confirmed).length;
  const readiness = total === 0 ? 0 : Math.round((voted / total) * 50 + (confirmed / total) * 50);

  // V2 readiness: 4 dimensions, 25% each
  const submittedAvailability = new Set(
    (availSlots || []).map((s: any) => s.member_id)
  ).size;
  const submittedBudget = new Set(
    (budgetPrefs || []).map((p: any) => p.member_id)
  ).size;

  const readinessV2 = total === 0
    ? 0
    : Math.round(
        (voted / total) * 25 +
        (submittedAvailability / total) * 25 +
        (submittedBudget / total) * 25 +
        (confirmed / total) * 25
      );

  // Never expose organiser_token in GET response
  const { organiser_token: _omit, ...safeTrip } = trip;

  res.json({
    trip: safeTrip,
    members: members ?? [],
    destinations: destinationsWithVotes,
    readiness_score: readiness,
    members_voted: voted,
    members_confirmed: confirmed,
    budget_preferences: budgetPrefs ?? [],
    budget_estimate: budgetEstimate ?? null,
    availability_slots: availSlots ?? [],
    travel_windows: travelWindows ?? null,
    deadlines: deadlines ?? [],
    readiness_v2: readinessV2,
    couples: couples ?? [],
  });
});

export default router;
```

### backend/src/routes/members.ts

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { loadTrip, requireMember, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

// POST /api/trips/:joinToken/join
router.post('/join', loadTrip, async (req, res) => {
  const { display_name, member_token } = req.body;
  const trip = (req as any).trip;

  if (!display_name || !member_token) {
    return res.status(400).json({ error: 'display_name and member_token required' });
  }
  if (typeof display_name !== 'string' || display_name.trim().length === 0) {
    return res.status(400).json({ error: 'display_name must not be empty' });
  }
  if (display_name.length > 50) {
    return res.status(400).json({ error: 'display_name must be 50 characters or fewer' });
  }

  // Idempotent: if this member_token already exists, return existing record
  const { data: existing } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', trip.id)
    .eq('member_token', member_token)
    .single();

  if (existing) return res.json({ member: existing, already_joined: true });

  const { data: member, error } = await supabase
    .from('trip_members')
    .insert({ trip_id: trip.id, display_name, member_token, is_organiser: false })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to join trip' });

  res.status(201).json({ member, already_joined: false });
});

// POST /api/trips/:joinToken/confirm
router.post('/confirm', loadTrip, requireMember, async (req, res) => {
  const member = (req as any).member;

  const { error } = await supabase
    .from('trip_members')
    .update({ has_confirmed: true, confirmed_at: new Date().toISOString() })
    .eq('id', member.id);

  if (error) return res.status(500).json({ error: 'Failed to confirm' });

  res.json({ confirmed: true });
});

// POST /api/trips/:joinToken/nudge
router.post('/nudge', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;

  const { data: members } = await supabase
    .from('trip_members')
    .select('id')
    .eq('trip_id', trip.id)
    .eq('has_confirmed', false);

  if (!members || members.length === 0) {
    return res.json({ nudged_count: 0, skipped_count: 0, message: 'Everyone has confirmed' });
  }

  // Get nudges sent in last 24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNudges } = await supabase
    .from('nudge_log')
    .select('target_member_id')
    .eq('trip_id', trip.id)
    .gte('sent_at', cutoff);

  const recentlyNudgedIds = new Set((recentNudges || []).map((n: any) => n.target_member_id));

  const toNudge = members.filter((m: any) => !recentlyNudgedIds.has(m.id));
  const toSkip  = members.filter((m: any) => recentlyNudgedIds.has(m.id));

  if (toNudge.length > 0) {
    await supabase.from('nudge_log').insert(
      toNudge.map((m: any) => ({ trip_id: trip.id, target_member_id: m.id }))
    );
  }

  res.json({
    nudged_count:  toNudge.length,
    skipped_count: toSkip.length,
    message: toNudge.length > 0
      ? `Nudge logged for ${toNudge.length} ${toNudge.length === 1 ? 'person' : 'people'}.`
      : 'Everyone was nudged recently — try again tomorrow.',
  });
});

export default router;
```

### backend/src/routes/destinations.ts

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { getDestinationSummary } from '../lib/gemini';
import { loadTrip, requireMember, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

// GET /api/trips/:joinToken/destinations
router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const { data, error } = await supabase
    .from('destination_options')
    .select('*, destination_votes(member_id)')
    .eq('trip_id', trip.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: 'Failed to fetch destinations' });

  const destinations = (data || []).map((d: any) => ({
    id:                  d.id,
    name:                d.name,
    tagline:             d.tagline,
    pros:                d.pros,
    cons:                d.cons,
    best_for:            d.best_for,
    estimated_cost_min:  d.estimated_cost_min,
    estimated_cost_max:  d.estimated_cost_max,
    source:              d.source,
    votes:               d.destination_votes?.length ?? 0,
    voter_member_ids:    (d.destination_votes || []).map((v: any) => v.member_id),
  }));

  res.json({ destinations });
});

// POST /api/trips/:joinToken/destinations
router.post('/', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const { name, tagline, pros, cons, best_for, estimated_cost_min, estimated_cost_max } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await supabase
    .from('destination_options')
    .insert({
      trip_id: trip.id,
      name, tagline, pros, cons, best_for,
      estimated_cost_min, estimated_cost_max,
      source: 'manual',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to add destination' });

  res.status(201).json({ destination: data });
});

// POST /api/trips/:joinToken/destinations/summary
router.post('/summary', loadTrip, async (req, res) => {
  const trip = (req as any).trip;
  const { query, source } = req.body;

  if (!source || !['search', 'ai'].includes(source)) {
    return res.status(400).json({ error: 'source must be "search" or "ai"' });
  }
  if (source === 'search' && !query) {
    return res.status(400).json({ error: 'query is required for search mode' });
  }

  const groupSize = trip.group_size ?? 4;
  const nights = trip.travel_from && trip.travel_to
    ? Math.max(1, Math.ceil((new Date(trip.travel_to).getTime() - new Date(trip.travel_from).getTime()) / 86400000))
    : 3;

  try {
    const result = await getDestinationSummary({
      query: query || null,
      source,
      groupSize,
      nights,
      budgetMin: trip.budget_min ?? undefined,
      budgetMax: trip.budget_max ?? undefined,
    });
    res.json(result);
  } catch {
    res.status(503).json({ error: 'AI unavailable. Try searching manually.' });
  }
});

// POST /api/trips/:joinToken/destinations/:destId/vote
router.post('/:destId/vote', loadTrip, requireMember, async (req, res) => {
  const trip   = (req as any).trip;
  const member = (req as any).member;
  const { destId } = req.params;

  // Verify destination belongs to this trip
  const { data: dest } = await supabase
    .from('destination_options')
    .select('id')
    .eq('id', destId)
    .eq('trip_id', trip.id)
    .single();

  if (!dest) return res.status(404).json({ error: 'Destination not found in this trip' });

  // Upsert: if member already voted, change their vote to this destination
  const votePayload: Record<string, any> = {
    trip_id: trip.id,
    destination_id: destId,
    member_id: member.id,
  };
  if (member.couple_id) {
    votePayload.couple_id = member.couple_id;
  }

  const { error } = await supabase
    .from('destination_votes')
    .upsert(votePayload, { onConflict: 'trip_id,member_id' });

  if (error) return res.status(500).json({ error: 'Failed to cast vote' });

  res.json({ voted: true, destination_id: destId });
});

export default router;
```

### backend/src/routes/ai.ts

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { getDestinationSuggestions } from '../lib/gemini';
import { loadTrip, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

// POST /api/trips/:joinToken/ai-suggest
router.post('/', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const { group_size, budget_min, budget_max, travel_from, travel_to, notes } = req.body;

  if (!group_size || !budget_min || !budget_max) {
    return res.status(400).json({ error: 'group_size, budget_min, budget_max are required' });
  }

  try {
    const suggestions = await getDestinationSuggestions({
      groupSize:  Number(group_size),
      budgetMin:  Number(budget_min),
      budgetMax:  Number(budget_max),
      travelFrom: travel_from || '',
      travelTo:   travel_to   || '',
      notes,
    });

    const { data: saved, error: saveError } = await supabase
      .from('destination_options')
      .insert(
        suggestions.map(s => ({
          trip_id:             trip.id,
          name:                s.name,
          tagline:             s.tagline,
          pros:                s.pros,
          cons:                s.cons,
          best_for:            s.best_for,
          estimated_cost_min:  s.estimated_cost_min,
          estimated_cost_max:  s.estimated_cost_max,
          source:              'ai',
        }))
      )
      .select();

    if (saveError) {
      console.error('Failed to save AI destinations:', saveError);
      return res.json({ destinations: suggestions, saved: false });
    }

    res.json({ destinations: saved, saved: true });

  } catch (err: any) {
    if (err.message === 'AI_UNAVAILABLE') {
      return res.status(503).json({
        error: 'AI suggestions unavailable right now. Add destinations manually to continue.'
      });
    }
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

export default router;
```

### backend/src/routes/budget.ts

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { estimateBudget } from '../lib/gemini';
import { loadTrip, requireMember, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

const ACCOMMODATION_TIERS = ['budget', 'mid', 'premium'];
const TRANSPORT_PREFS = ['bus_train', 'flight', 'self_drive'];
const DINING_STYLES = ['local_cheap', 'mixed', 'restaurants'];

// POST /api/trips/:joinToken/budget/preferences
router.post('/preferences', loadTrip, requireMember, async (req, res) => {
  const trip = (req as any).trip;
  const member = (req as any).member;
  const { accommodation_tier, transport_pref, dining_style, activities, daily_budget_min, daily_budget_max, notes, couple_id } = req.body;

  // Validate only when provided (fields are optional for auto-save)
  if (accommodation_tier !== undefined && !ACCOMMODATION_TIERS.includes(accommodation_tier)) {
    return res.status(400).json({ error: 'accommodation_tier must be budget, mid, or premium' });
  }
  if (transport_pref !== undefined && !TRANSPORT_PREFS.includes(transport_pref)) {
    return res.status(400).json({ error: 'transport_pref must be bus_train, flight, or self_drive' });
  }
  if (dining_style !== undefined && !DINING_STYLES.includes(dining_style)) {
    return res.status(400).json({ error: 'dining_style must be local_cheap, mixed, or restaurants' });
  }
  if (activities && !Array.isArray(activities)) {
    return res.status(400).json({ error: 'activities must be an array' });
  }
  if (daily_budget_min != null && typeof daily_budget_min !== 'number') {
    return res.status(400).json({ error: 'daily_budget_min must be a number' });
  }
  if (daily_budget_max != null && typeof daily_budget_max !== 'number') {
    return res.status(400).json({ error: 'daily_budget_max must be a number' });
  }

  // Build upsert payload — only include provided fields
  const prefData: Record<string, any> = {
    trip_id: trip.id,
    member_id: member.id,
  };
  if (accommodation_tier !== undefined) prefData.accommodation_tier = accommodation_tier;
  if (transport_pref     !== undefined) prefData.transport_pref     = transport_pref;
  if (dining_style       !== undefined) prefData.dining_style       = dining_style;
  if (activities         !== undefined) prefData.activities         = activities || [];
  if (daily_budget_min   !== undefined) prefData.daily_budget_min   = daily_budget_min;
  if (daily_budget_max   !== undefined) prefData.daily_budget_max   = daily_budget_max;
  if (notes              !== undefined) prefData.notes              = notes || null;
  if (couple_id          !== undefined) prefData.couple_id          = couple_id;

  // Require at least one preference field
  if (Object.keys(prefData).length <= 2) {
    return res.status(400).json({ error: 'At least one preference field is required' });
  }

  const { data, error } = await supabase
    .from('budget_preferences')
    .upsert(prefData, { onConflict: 'trip_id,member_id' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to save preferences' });

  res.json({ preference: data });
});

// POST /api/trips/:joinToken/budget/estimate
router.post('/estimate', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;

  // Fetch all preferences for this trip
  const { data: prefs } = await supabase
    .from('budget_preferences')
    .select('*, trip_members(display_name)')
    .eq('trip_id', trip.id);

  if (!prefs || prefs.length === 0) {
    return res.status(400).json({ error: 'No budget preferences submitted yet' });
  }

  // Get top destination (most votes)
  const { data: destinations } = await supabase
    .from('destination_options')
    .select('name, destination_votes(member_id)')
    .eq('trip_id', trip.id);

  let topDestination = 'Unknown destination';
  if (destinations && destinations.length > 0) {
    const sorted = destinations.sort(
      (a: any, b: any) => (b.destination_votes?.length ?? 0) - (a.destination_votes?.length ?? 0)
    );
    topDestination = sorted[0].name;
  }

  try {
    const result = await estimateBudget({
      destination: topDestination,
      preferences: prefs.map((p: any) => ({
        display_name: p.trip_members?.display_name || 'Member',
        accommodation_tier: p.accommodation_tier,
        transport_pref: p.transport_pref,
        dining_style: p.dining_style,
        activities: p.activities,
        daily_budget_min: p.daily_budget_min,
        daily_budget_max: p.daily_budget_max,
      })),
      travel_from: trip.travel_from,
      travel_to: trip.travel_to,
    });

    const { data, error } = await supabase
      .from('budget_estimates')
      .upsert(
        {
          trip_id: trip.id,
          per_person_min: result.per_person_min,
          per_person_max: result.per_person_max,
          breakdown: result.breakdown,
          divergence_flags: result.divergence_flags,
          members_included: prefs.length,
        },
        { onConflict: 'trip_id' }
      )
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to save estimate' });

    res.json({ estimate: data });
  } catch (err: any) {
    if (err.message === 'AI_UNAVAILABLE') {
      return res.status(503).json({ error: 'AI estimation unavailable right now. Try again later.' });
    }
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// GET /api/trips/:joinToken/budget
router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const [{ data: preferences }, { data: estimate }] = await Promise.all([
    supabase.from('budget_preferences').select('*, trip_members(id, display_name)').eq('trip_id', trip.id),
    supabase.from('budget_estimates').select('*').eq('trip_id', trip.id).maybeSingle(),
  ]);

  res.json({ preferences: preferences ?? [], estimate: estimate ?? null });
});

export default router;
```

### backend/src/routes/availability.ts

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { rankTravelWindows } from '../lib/gemini';
import { loadTrip, requireMember, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

const VALID_TIERS = ['unavailable', 'free', 'could_work'];

// POST /api/trips/:joinToken/availability
router.post('/', loadTrip, requireMember, async (req, res) => {
  const trip = (req as any).trip;
  const member = (req as any).member;
  const { slot, slots, couple_id } = req.body;
  const effectiveCoupleId = couple_id ?? member.couple_id ?? null;

  // Single-slot upsert mode
  if (slot) {
    if (!slot.date) {
      return res.status(400).json({ error: 'slot.date is required' });
    }
    if (slot.tier === null) {
      // Clear this date for this member
      const { error } = await supabase
        .from('availability_slots')
        .delete()
        .eq('trip_id', trip.id)
        .eq('member_id', member.id)
        .eq('slot_date', slot.date);
      if (error) return res.status(500).json({ error: 'Failed to clear slot' });
      return res.json({ saved: 1, cleared: true });
    }
    if (!VALID_TIERS.includes(slot.tier)) {
      return res.status(400).json({ error: 'slot.tier must be unavailable, free, or could_work' });
    }
    const { error } = await supabase
      .from('availability_slots')
      .upsert(
        { trip_id: trip.id, member_id: member.id, slot_date: slot.date, tier: slot.tier, ...(effectiveCoupleId ? { couple_id: effectiveCoupleId } : {}) },
        { onConflict: 'trip_id,member_id,slot_date' }
      );
    if (error) return res.status(500).json({ error: 'Failed to save slot' });
    return res.json({ saved: 1 });
  }

  // Batch replacement mode (existing behavior)
  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'slots must be a non-empty array, or provide a single slot object' });
  }

  for (const slot of slots) {
    if (!slot.date || !VALID_TIERS.includes(slot.tier)) {
      return res.status(400).json({ error: 'Each slot must have a date and tier (unavailable, free, or could_work)' });
    }
  }

  // Delete existing slots for this member, then insert new batch
  const { error: deleteError } = await supabase
    .from('availability_slots')
    .delete()
    .eq('trip_id', trip.id)
    .eq('member_id', member.id);

  if (deleteError) return res.status(500).json({ error: 'Failed to clear existing slots' });

  const { data, error } = await supabase
    .from('availability_slots')
    .insert(
      slots.map((s: any) => ({
        trip_id: trip.id,
        member_id: member.id,
        slot_date: s.date,
        tier: s.tier,
        ...(effectiveCoupleId ? { couple_id: effectiveCoupleId } : {}),
      }))
    )
    .select();

  if (error) return res.status(500).json({ error: 'Failed to save availability' });

  res.json({ slots: data });
});

// POST /api/trips/:joinToken/availability/windows
router.post('/windows', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;

  const [{ data: members }, { data: slots }] = await Promise.all([
    supabase.from('trip_members').select('id, display_name').eq('trip_id', trip.id),
    supabase.from('availability_slots').select('*').eq('trip_id', trip.id),
  ]);

  if (!slots || slots.length === 0) {
    return res.status(400).json({ error: 'No availability data submitted yet' });
  }

  // Calculate trip duration from dates
  let tripDuration = 3; // default
  if (trip.travel_from && trip.travel_to) {
    const from = new Date(trip.travel_from);
    const to = new Date(trip.travel_to);
    tripDuration = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  }

  try {
    const windows = await rankTravelWindows({
      members: (members || []).map((m: any) => ({ id: m.id, display_name: m.display_name })),
      slots: slots.map((s: any) => ({
        member_id: s.member_id,
        date: s.slot_date,
        tier: s.tier,
      })),
      trip_duration: tripDuration,
    });

    const { data, error } = await supabase
      .from('travel_windows')
      .upsert(
        { trip_id: trip.id, windows },
        { onConflict: 'trip_id' }
      )
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to save windows' });

    res.json({ windows: data });
  } catch (err: any) {
    if (err.message === 'AI_UNAVAILABLE') {
      return res.status(503).json({ error: 'AI analysis unavailable right now. Try again later.' });
    }
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// GET /api/trips/:joinToken/availability
router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const [{ data: slots }, { data: windows }] = await Promise.all([
    supabase.from('availability_slots').select('*, trip_members(id, display_name)').eq('trip_id', trip.id),
    supabase.from('travel_windows').select('*').eq('trip_id', trip.id).maybeSingle(),
  ]);

  res.json({ slots: slots ?? [], windows: windows ?? null });
});

export default router;
```

### backend/src/routes/deadlines.ts

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { loadTrip, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

const VALID_ITEM_TYPES = ['destination_vote', 'availability', 'budget_input', 'confirmation'];

// POST /api/trips/:joinToken/deadlines
router.post('/', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const { deadlines } = req.body;

  if (!Array.isArray(deadlines) || deadlines.length === 0) {
    return res.status(400).json({ error: 'deadlines must be a non-empty array' });
  }

  for (const dl of deadlines) {
    if (!VALID_ITEM_TYPES.includes(dl.item_type)) {
      return res.status(400).json({ error: `Invalid item_type: ${dl.item_type}` });
    }
    if (!dl.due_date) {
      return res.status(400).json({ error: 'Each deadline must have a due_date' });
    }
  }

  const { data, error } = await supabase
    .from('deadlines')
    .upsert(
      deadlines.map((dl: any) => ({
        trip_id: trip.id,
        item_type: dl.item_type,
        due_date: dl.due_date,
        locked: dl.locked ?? false,
      })),
      { onConflict: 'trip_id,item_type' }
    )
    .select();

  if (error) return res.status(500).json({ error: 'Failed to save deadlines' });

  res.json({ deadlines: data });
});

// GET /api/trips/:joinToken/deadlines
router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const { data } = await supabase
    .from('deadlines')
    .select('*')
    .eq('trip_id', trip.id);

  res.json({ deadlines: data ?? [] });
});

// POST /api/trips/:joinToken/deadlines/lock/:itemType
router.post('/lock/:itemType', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const itemType = req.params.itemType as string;

  if (!VALID_ITEM_TYPES.includes(itemType)) {
    return res.status(400).json({ error: `Invalid item_type: ${itemType}` });
  }

  const { data, error } = await supabase
    .from('deadlines')
    .update({ locked: true })
    .eq('trip_id', trip.id)
    .eq('item_type', itemType)
    .select()
    .single();

  if (error) return res.status(404).json({ error: 'Deadline not found' });

  res.json({ deadline: data });
});

export default router;
```

### backend/src/routes/couples.ts

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { loadTrip, requireMember } from '../middleware/tokens';

const router = Router({ mergeParams: true });

// POST /api/trips/:joinToken/couples/link
router.post('/link', loadTrip, requireMember, async (req, res) => {
  const trip   = (req as any).trip;
  const member = (req as any).member;
  const { partner_member_token, couple_name } = req.body;

  if (!partner_member_token) {
    return res.status(400).json({ error: 'partner_member_token is required' });
  }

  const { data: partner } = await supabase
    .from('trip_members')
    .select('id, display_name, couple_id')
    .eq('trip_id', trip.id)
    .eq('member_token', partner_member_token)
    .single();

  if (!partner) return res.status(404).json({ error: 'Partner not found in this trip' });
  if (partner.id === member.id) return res.status(400).json({ error: 'Cannot link to yourself' });
  if (member.couple_id) return res.status(400).json({ error: 'You are already in a couple' });
  if (partner.couple_id) return res.status(400).json({ error: 'Your partner is already in a couple' });

  const name = couple_name || `${member.display_name} & ${partner.display_name}`;

  const { data: couple, error: coupleErr } = await supabase
    .from('couples')
    .insert({ trip_id: trip.id, member_id_1: member.id, member_id_2: partner.id, couple_name: name })
    .select()
    .single();

  if (coupleErr) return res.status(500).json({ error: 'Failed to create couple', detail: coupleErr.message });

  await supabase
    .from('trip_members')
    .update({ couple_id: couple.id })
    .in('id', [member.id, partner.id]);

  res.status(201).json({ couple });
});

// POST /api/trips/:joinToken/couples/solo
router.post('/solo', loadTrip, requireMember, async (req, res) => {
  const trip   = (req as any).trip;
  const member = (req as any).member;

  if (member.couple_id) return res.status(400).json({ error: 'Already in a couple or registered solo' });

  const { data: couple, error } = await supabase
    .from('couples')
    .insert({ trip_id: trip.id, member_id_1: member.id, couple_name: member.display_name })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to register as solo', detail: error.message });

  await supabase
    .from('trip_members')
    .update({ couple_id: couple.id })
    .eq('id', member.id);

  res.json({ couple });
});

// GET /api/trips/:joinToken/couples
router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const { data: couples } = await supabase
    .from('couples')
    .select(`
      id, couple_name, created_at,
      member_1:trip_members!couples_member_id_1_fkey(id, display_name, has_confirmed, couple_id),
      member_2:trip_members!couples_member_id_2_fkey(id, display_name, has_confirmed, couple_id)
    `)
    .eq('trip_id', trip.id)
    .order('created_at', { ascending: true });

  res.json({ couples: couples ?? [] });
});

export default router;
```

### backend/supabase/migration.sql

```sql
-- Triphaus database schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ─── Trips ───────────────────────────────────────────────────────────────────
create table if not exists trips (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  join_token      text not null unique,
  organiser_token text not null,
  budget_min      numeric,
  budget_max      numeric,
  travel_from     date,
  travel_to       date,
  deadline        date,
  created_at      timestamptz not null default now()
);

-- join_token unique constraint already creates an index

-- ─── Trip Members ────────────────────────────────────────────────────────────
create table if not exists trip_members (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references trips (id) on delete cascade,
  display_name    text not null,
  member_token    text not null,
  is_organiser    boolean not null default false,
  has_confirmed   boolean not null default false,
  confirmed_at    timestamptz,
  joined_at       timestamptz not null default now()
);

create index idx_trip_members_trip on trip_members (trip_id);
create index idx_trip_members_token on trip_members (trip_id, member_token);

-- ─── Destination Options ─────────────────────────────────────────────────────
create table if not exists destination_options (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references trips (id) on delete cascade,
  name                text not null,
  tagline             text,
  pros                jsonb default '[]'::jsonb,
  cons                jsonb default '[]'::jsonb,
  best_for            text,
  estimated_cost_min  numeric,
  estimated_cost_max  numeric,
  source              text not null default 'manual', -- 'manual' or 'ai'
  created_at          timestamptz not null default now()
);

create index idx_destination_options_trip on destination_options (trip_id);

-- ─── Destination Votes ───────────────────────────────────────────────────────
-- One vote per member per trip (they pick one destination)
create table if not exists destination_votes (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references trips (id) on delete cascade,
  destination_id  uuid not null references destination_options (id) on delete cascade,
  member_id       uuid not null references trip_members (id) on delete cascade,
  created_at      timestamptz not null default now(),

  unique (trip_id, member_id)
);

create index idx_destination_votes_dest on destination_votes (destination_id);

-- ─── Nudge Log ───────────────────────────────────────────────────────────────
create table if not exists nudge_log (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references trips (id) on delete cascade,
  target_member_id  uuid not null references trip_members (id) on delete cascade,
  sent_at           timestamptz not null default now()
);

create index idx_nudge_log_trip on nudge_log (trip_id, sent_at);
```

### backend/supabase/migration_v2.sql

```sql
-- V2 migration: budget preferences, availability, deadlines
-- Run this in the Supabase SQL Editor AFTER migration.sql

-- ─── Budget Preferences ─────────────────────────────────────────────────────
create table if not exists budget_preferences (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references trips (id) on delete cascade,
  member_id           uuid not null references trip_members (id) on delete cascade,
  accommodation_tier  text not null check (accommodation_tier in ('budget', 'mid', 'premium')),
  transport_pref      text not null check (transport_pref in ('bus_train', 'flight', 'self_drive')),
  dining_style        text not null check (dining_style in ('local_cheap', 'mixed', 'restaurants')),
  activities          text[] default '{}',
  daily_budget_min    numeric,
  daily_budget_max    numeric,
  notes               text,
  created_at          timestamptz not null default now(),

  unique (trip_id, member_id)
);

create index if not exists idx_budget_preferences_trip on budget_preferences (trip_id);

-- ─── Budget Estimates (AI-generated) ────────────────────────────────────────
create table if not exists budget_estimates (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references trips (id) on delete cascade,
  per_person_min      numeric not null,
  per_person_max      numeric not null,
  breakdown           jsonb not null default '{}'::jsonb,
  divergence_flags    jsonb not null default '[]'::jsonb,
  members_included    int not null default 0,
  created_at          timestamptz not null default now(),

  unique (trip_id)
);

-- ─── Availability Slots ─────────────────────────────────────────────────────
create table if not exists availability_slots (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  member_id   uuid not null references trip_members (id) on delete cascade,
  slot_date   date not null,
  tier        text not null check (tier in ('unavailable', 'free', 'could_work')),
  created_at  timestamptz not null default now(),

  unique (trip_id, member_id, slot_date)
);

create index if not exists idx_availability_slots_trip on availability_slots (trip_id);

-- ─── Travel Windows (AI-generated) ──────────────────────────────────────────
create table if not exists travel_windows (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  windows     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),

  unique (trip_id)
);

-- ─── Deadlines ──────────────────────────────────────────────────────────────
create table if not exists deadlines (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  item_type   text not null check (item_type in ('destination_vote', 'availability', 'budget_input', 'confirmation')),
  due_date    date not null,
  locked      boolean not null default false,
  created_at  timestamptz not null default now(),

  unique (trip_id, item_type)
);

create index if not exists idx_deadlines_trip on deadlines (trip_id);

-- ─── Realtime publications (idempotent) ─────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'budget_preferences'
  ) then
    alter publication supabase_realtime add table budget_preferences;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'availability_slots'
  ) then
    alter publication supabase_realtime add table availability_slots;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'deadlines'
  ) then
    alter publication supabase_realtime add table deadlines;
  end if;
end $$;
```

### backend/supabase/migration_v3_trips_realtime.sql

```sql
-- Add trips table to Realtime publication (idempotent)
-- Run this in the Supabase SQL Editor

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'trips'
  ) then
    alter publication supabase_realtime add table trips;
  end if;
end $$;
```

### backend/supabase/migration_v4_trip_redesign.sql

```sql
-- V4 migration: Trip Room redesign — new columns on trips table
-- Run this in the Supabase SQL Editor

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS group_size integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS selected_destination_id uuid REFERENCES destination_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_summary jsonb;
```

### backend/supabase/migration_v5_couples.sql

```sql
-- V5 migration: Couple model + missing fields
-- Run this in the Supabase SQL Editor

-- Couples table: links two members of the same trip as a couple unit
CREATE TABLE IF NOT EXISTS couples (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id_1  uuid NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  member_id_2  uuid REFERENCES trip_members(id) ON DELETE SET NULL,
  couple_name  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, member_id_1)
);

-- Add couple_id to tables that need couple-level aggregation
ALTER TABLE trip_members       ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;
ALTER TABLE budget_preferences ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;
ALTER TABLE availability_slots ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;
ALTER TABLE destination_votes  ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;

-- Add couple_count to trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS couple_count integer;

-- Partial unique index for couple-level voting (only when couple_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_destination_votes_couple
  ON destination_votes(trip_id, couple_id) WHERE couple_id IS NOT NULL;

-- Enable Realtime on couples table
ALTER PUBLICATION supabase_realtime ADD TABLE couples;
```

---

### frontend/package.json

```json
{
  "name": "groupism-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:dev": "vite build --mode development",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-progress": "^1.1.7",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-toast": "^1.2.14",
    "@radix-ui/react-tooltip": "^1.2.7",
    "@supabase/supabase-js": "^2.101.1",
    "@tanstack/react-query": "^5.83.0",
    "@types/leaflet": "^1.9.21",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^12.38.0",
    "leaflet": "^1.9.4",
    "lucide-react": "^0.462.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.30.1",
    "sonner": "^1.7.4",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@types/node": "^22.16.5",
    "@types/react": "^18.3.23",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react-swc": "^3.11.0",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.8.3",
    "vite": "^5.4.19"
  }
}
```

### frontend/vite.config.ts

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
```

### frontend/tsconfig.json

```json
{
  "compilerOptions": {
    "allowJs": true,
    "noImplicitAny": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "paths": {
      "@/*": [
        "./src/*"
      ]
    },
    "skipLibCheck": true,
    "strictNullChecks": false
  },
  "files": [],
  "references": [
    {
      "path": "./tsconfig.app.json"
    },
    {
      "path": "./tsconfig.node.json"
    }
  ]
}
```

### frontend/tailwind.config.ts

```typescript
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ['Fraunces', 'serif'],
        ui: ['Geist', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        confirmed: {
          DEFAULT: "hsl(var(--confirmed))",
          light: "hsl(var(--confirmed-light))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        hover: "var(--bg-hover)",
        amber: {
          DEFAULT: "var(--accent-amber)",
          light: "var(--accent-amber-light)",
          glow: "var(--amber-glow)",
        },
        terra: "var(--accent-terra)",
        green: {
          DEFAULT: "var(--accent-green)",
          light: "var(--accent-green-light)",
        },
        "t-primary": "var(--text-primary)",
        "t-secondary": "var(--text-secondary)",
        "t-tertiary": "var(--text-tertiary)",
        "b-subtle": "var(--border-subtle)",
        "b-mid": "rgba(28, 26, 21, 0.10)",
        "b-strong": "rgba(28, 26, 21, 0.20)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

### frontend/src/main.tsx

```typescript
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

### frontend/src/App.tsx

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MapBackground from "@/components/MapBackground";
import Index from "./pages/Index.tsx";
import CreateTrip from "./pages/CreateTrip.tsx";
import TripRoom from "./pages/TripRoom.tsx";
import JoinTrip from "./pages/JoinTrip.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <MapBackground />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/create" element={<CreateTrip />} />
          <Route path="/trip/:id" element={<TripRoom />} />
          <Route path="/join/:code" element={<JoinTrip />} />
          <Route path="/t/:code" element={<JoinTrip />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
```

### frontend/src/index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 45 30% 96%;
    --foreground: 30 10% 15%;

    --card: 45 25% 93%;
    --card-foreground: 30 10% 15%;

    --popover: 45 25% 91%;
    --popover-foreground: 30 10% 15%;

    --primary: 36 90% 42%;
    --primary-foreground: 45 30% 96%;

    --secondary: 45 15% 90%;
    --secondary-foreground: 30 10% 25%;

    --muted: 45 15% 90%;
    --muted-foreground: 30 8% 45%;

    --accent: 36 90% 42%;
    --accent-foreground: 45 30% 96%;

    --destructive: 12 55% 48%;
    --destructive-foreground: 45 30% 96%;

    --confirmed: 152 36% 36%;
    --confirmed-light: 146 36% 49%;

    --border: 30 10% 15% / 0.10;
    --border-subtle: 30 10% 15% / 0.06;
    --border-strong: 30 10% 15% / 0.20;
    --input: 30 10% 15% / 0.10;
    --ring: 36 90% 42%;

    --radius: 4px;

    --bg-base: #F5F0E8;
    --bg-surface: #EDE8DF;
    --bg-elevated: #E5E0D6;
    --bg-hover: #DDD8CE;

    --accent-amber: #B87A08;
    --accent-amber-light: #D4900A;
    --accent-terra: #B5503A;
    --accent-green: #2E6B4A;
    --accent-green-light: #3A7D5C;

    --text-primary: #1C1A15;
    --text-secondary: #6B6560;
    --text-tertiary: #9A9490;

    --amber-glow: rgba(184, 122, 8, 0.12);

    --sidebar-background: 45 25% 94%;
    --sidebar-foreground: 30 10% 15%;
    --sidebar-primary: 36 90% 42%;
    --sidebar-primary-foreground: 45 30% 96%;
    --sidebar-accent: 45 15% 90%;
    --sidebar-accent-foreground: 30 10% 15%;
    --sidebar-border: 30 10% 15% / 0.10;
    --sidebar-ring: 36 90% 42%;
  }
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    background-color: var(--bg-base);
    color: var(--text-primary);
    font-family: 'Geist', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body::after {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
    opacity: 0.025;
    pointer-events: none;
    z-index: 9999;
  }
}

@layer utilities {
  .font-display {
    font-family: 'Fraunces', serif;
  }

  .font-ui {
    font-family: 'Geist', sans-serif;
  }

  .font-mono-code {
    font-family: 'JetBrains Mono', monospace;
  }

  .eyebrow {
    font-family: 'Geist', sans-serif;
    font-weight: 500;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .section-divider {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 2rem 0 1.5rem;
  }
  .section-divider::before,
  .section-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-subtle);
  }
  .section-divider span {
    font-family: 'Geist', sans-serif;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    white-space: nowrap;
  }
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

@keyframes voteScale {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.animate-shimmer {
  animation: shimmer 1.5s infinite;
}

.animate-vote-scale {
  animation: voteScale 0.2s ease-out;
}

/* Native date input styling */
input[type="date"] {
  color-scheme: light;
}
```

### frontend/src/lib/api.ts

```typescript
const BASE = import.meta.env.VITE_API_URL || "https://groupism-production.up.railway.app";

// ─── Token storage ───────────────────────────────────────────────────────────
interface Tokens {
  memberToken: string;
  memberId: string;
  organiserToken?: string;
}

export function setTokens(joinToken: string, tokens: Tokens) {
  localStorage.setItem(`triphaus:${joinToken}`, JSON.stringify(tokens));
}

export function getTokens(joinToken: string): Tokens | null {
  const raw = localStorage.getItem(`triphaus:${joinToken}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────
function headers(joinToken?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (!joinToken) return h;

  const tokens = getTokens(joinToken);
  if (tokens?.memberToken) h["x-member-token"] = tokens.memberToken;
  if (tokens?.organiserToken) h["x-organiser-token"] = tokens.organiserToken;
  return h;
}

async function handleRes(res: Response) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (path: string, joinToken?: string) =>
    fetch(`${BASE}${path}`, { headers: headers(joinToken) }).then(handleRes),

  post: (path: string, body: unknown, joinToken?: string) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: headers(joinToken),
      body: JSON.stringify(body),
    }).then(handleRes),

  patch: (path: string, body: unknown, joinToken?: string) =>
    fetch(`${BASE}${path}`, {
      method: "PATCH",
      headers: headers(joinToken),
      body: JSON.stringify(body),
    }).then(handleRes),
};
```

### frontend/src/lib/supabase.ts

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
```

### frontend/src/lib/utils.ts

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### frontend/src/hooks/useAppVersion.ts

```typescript
import { useState } from "react";

export type AppVersion = "v4" | "v5";

export function useAppVersion(): [AppVersion, (v: AppVersion) => void] {
  const [version, setVersionState] = useState<AppVersion>(
    () => (localStorage.getItem("groupism:appVersion") as AppVersion) || "v5"
  );

  const setVersion = (v: AppVersion) => {
    localStorage.setItem("groupism:appVersion", v);
    setVersionState(v);
  };

  return [version, setVersion];
}
```

### frontend/src/hooks/use-toast.ts

```typescript
import * as React from "react";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType["ADD_TOAST"];
      toast: ToasterToast;
    }
  | {
      type: ActionType["UPDATE_TOAST"];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType["DISMISS_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | {
      type: ActionType["REMOVE_TOAST"];
      toastId?: ToasterToast["id"];
    };

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case "DISMISS_TOAST": {
      const { toastId } = action;

      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type Toast = Omit<ToasterToast, "id">;

function toast({ ...props }: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

export { useToast, toast };
```

### frontend/src/pages/Index.tsx

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { motion } from "framer-motion";
import { ArrowRight, Plane } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState("");

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="min-h-screen flex flex-col justify-center px-6 md:px-16 lg:pl-[12vw] lg:pr-[20vw] pt-24 pb-16">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2 mb-6"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber/10 text-amber text-xs font-ui font-medium tracking-wide uppercase">
              <Plane className="w-3 h-3" />
              Group Travel
            </span>
          </motion.div>

          {/* Headline */}
          <h1>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="block font-display font-black italic text-[48px] md:text-[64px] lg:text-[80px] leading-[0.95] text-t-primary"
            >
              every group trip.
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="block font-display font-light text-[48px] md:text-[64px] lg:text-[80px] leading-[0.95] text-t-secondary"
            >
              the same five people.
            </motion.span>
          </h1>

          {/* Accent line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="origin-left w-[100px] h-[2px] mt-8 bg-t-primary/20"
          />

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="font-ui font-medium text-t-primary text-[16px] mt-6 max-w-md leading-relaxed"
          >
            the organiser who's done it alone for the last time.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="space-y-3 max-w-md mt-10"
          >
            <button
              onClick={() => navigate("/create")}
              className="group w-full h-14 px-8 flex items-center justify-between rounded-lg font-ui font-semibold text-sm bg-amber text-[var(--bg-base)] transition-all duration-300 hover:bg-amber-light hover:shadow-lg hover:shadow-amber/20 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <span>Create a Room</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="enter invite code"
                  className="w-full h-14 px-4 bg-t-primary text-[var(--bg-base)] border-none rounded-lg font-mono text-sm placeholder:text-[var(--bg-base)]/40 focus:outline-none focus:ring-2 focus:ring-t-primary/40 transition-all duration-200"
                />
              </div>
              <button
                onClick={() => inviteCode && navigate(`/join/${inviteCode}`)}
                className="h-14 px-6 bg-t-primary text-[var(--bg-base)] rounded-lg font-ui font-semibold text-sm hover:bg-t-primary/85 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
              >
                Join
              </button>
            </div>
          </motion.div>

          {/* Bottom decorative dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="flex gap-1.5 mt-12"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-amber" />
            <div className="w-1.5 h-1.5 rounded-full bg-terra" />
            <div className="w-1.5 h-1.5 rounded-full bg-green" />
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Home;
```

### frontend/src/pages/CreateTrip.tsx

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { api, setTokens } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const CreateTrip = () => {
  const navigate = useNavigate();
  const [tripName, setTripName] = useState("");
  const [organiserName, setOrganiserName] = useState("");
  const [groupSize, setGroupSize] = useState(6);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const trip = await api.post("/api/trips", {
        name: tripName,
        organiser_name: organiserName || "Organiser",
        group_size: groupSize,
      });

      setTokens(trip.join_token, {
        memberToken: trip.member_token,
        memberId: trip.member_id,
        organiserToken: trip.organiser_token,
      });
      localStorage.setItem(
        `triphaus:${trip.join_token}:group_size`,
        String(groupSize)
      );

      navigate(`/trip/${trip.join_token}`);
    } catch (err: any) {
      toast({
        title: "Failed to create trip",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="max-w-xl mx-auto px-6 pt-24 pb-20">
        <section>
          <h2 className="font-display text-[36px] md:text-[40px] font-bold leading-[1.05] text-t-primary mb-8">
            Name the trip
          </h2>

          <div className="space-y-8">
            <input
              type="text"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              placeholder="Goa March '26"
              className="w-full text-[20px] md:text-[24px] font-ui font-medium bg-transparent border-b border-b-mid pb-3 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
            />

            <div>
              <label className="eyebrow block mb-3">YOUR NAME</label>
              <input
                type="text"
                value={organiserName}
                onChange={(e) => setOrganiserName(e.target.value)}
                placeholder="Aditya"
                className="w-full text-lg font-ui bg-transparent border-b border-b-mid pb-2 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
              />
            </div>

            <div>
              <label className="eyebrow block mb-4">HOW MANY PEOPLE</label>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setGroupSize(Math.max(2, groupSize - 1))}
                  className="text-t-secondary text-2xl font-ui font-light hover:text-t-primary transition-colors h-11 w-11 flex items-center justify-center"
                >
                  −
                </button>
                <span className="font-mono text-[32px] text-t-primary w-12 text-center">
                  {groupSize}
                </span>
                <button
                  onClick={() => setGroupSize(groupSize + 1)}
                  className="text-t-secondary text-2xl font-ui font-light hover:text-t-primary transition-colors h-11 w-11 flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            <Button
              variant="amber"
              className="w-full h-12 text-sm"
              disabled={!tripName || !organiserName || loading}
              onClick={handleCreate}
            >
              {loading ? "Creating..." : "Create Trip Room →"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CreateTrip;
```

### frontend/src/pages/JoinTrip.tsx

```typescript
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { api, setTokens } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

function generateMemberToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

const JoinTrip = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tripInfo, setTripInfo] = useState<{
    name: string;
    budget: string;
    dates: string;
    memberCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Couple linking state
  const [joinedStep, setJoinedStep] = useState(false);
  const [partnerToken, setPartnerToken] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!code) return;
    api
      .get(`/api/trips/${code}`)
      .then((data) => {
        const t = data.trip;
        const budgetMin = (t.budget_min || 0).toLocaleString("en-IN");
        const budgetMax = (t.budget_max || 0).toLocaleString("en-IN");
        const from = t.travel_from
          ? new Date(t.travel_from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : "";
        const to = t.travel_to
          ? new Date(t.travel_to).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : "";
        setTripInfo({
          name: t.name,
          budget: `₹${budgetMin} – ₹${budgetMax}`,
          dates: from && to ? `${from}–${to}` : "",
          memberCount: data.members?.length || 0,
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [code]);

  const handleJoin = async () => {
    if (!code || !displayName.trim()) return;
    setJoining(true);
    try {
      const memberToken = generateMemberToken();
      const data = await api.post(`/api/trips/${code}/join`, {
        display_name: displayName.trim(),
        member_token: memberToken,
      });
      setTokens(code, { memberToken, memberId: data.member.id });
      setJoinedStep(true);
    } catch (err: any) {
      toast({ title: "Failed to join", description: err.message, variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const handleLink = async () => {
    if (!code || !partnerToken.trim()) return;
    setLinking(true);
    try {
      await api.post(
        `/api/trips/${code}/couples/link`,
        { partner_member_token: partnerToken.trim() },
        code
      );
      toast({ title: "Linked with partner!" });
      navigate(`/trip/${code}`);
    } catch (err: any) {
      toast({ title: "Failed to link", description: err.message, variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const handleSolo = async () => {
    if (!code) return;
    try {
      await api.post(`/api/trips/${code}/couples/solo`, {}, code);
    } catch {
      // Silent — solo registration is best-effort
    }
    navigate(`/trip/${code}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen relative z-10">
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <p className="font-ui text-t-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !tripInfo) {
    return (
      <div className="min-h-screen relative z-10">
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="font-display text-[32px] font-bold text-t-primary mb-2">Trip not found</h1>
            <p className="font-ui text-t-secondary">{error || "This invite link may be invalid."}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Left — trip context */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:pl-[12vw] lg:pr-12 pt-24 lg:pt-0 pb-8 lg:pb-0">
          <p className="eyebrow mb-4">YOU'VE BEEN INVITED TO</p>
          <h1 className="font-display text-[40px] md:text-[56px] lg:text-[72px] font-black leading-[0.95] text-t-primary mb-4">
            {tripInfo.name}
          </h1>
          <p className="font-mono text-[13px] text-t-secondary">
            {tripInfo.budget}  ·  {tripInfo.dates}
          </p>
          <p className="font-ui font-light text-sm text-t-secondary mt-2">
            {tripInfo.memberCount} {tripInfo.memberCount === 1 ? "person is" : "people are"} planning this trip
          </p>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px bg-b-subtle self-stretch my-20" />
        <div className="lg:hidden h-px bg-b-subtle mx-6" />

        {/* Right — join action or couple linking */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:pr-[12vw] lg:pl-12 pt-8 lg:pt-0 pb-24 lg:pb-0 max-w-lg lg:max-w-none">
          {!joinedStep ? (
            <>
              <p className="font-mono text-xs text-t-tertiary mb-6">
                Code: {code}
              </p>
              <div className="space-y-4">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full text-lg font-ui bg-transparent border-b border-b-mid pb-3 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
                <Button
                  variant="amber"
                  className="w-full h-[52px] text-sm font-ui font-medium"
                  disabled={!displayName.trim() || joining}
                  onClick={handleJoin}
                >
                  {joining ? "Joining..." : "Join"}
                </Button>
              </div>
            </>
          ) : (
            <div>
              <p className="font-display text-xl text-t-primary mb-1">
                Are you travelling as a couple?
              </p>
              <p className="font-ui font-light text-sm text-t-secondary mb-6">
                Link with your partner so your responses count as one.
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Partner's link token"
                  value={partnerToken}
                  onChange={(e) => setPartnerToken(e.target.value)}
                  className="w-full text-sm font-mono bg-transparent border-b border-b-mid pb-2 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-amber transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleLink()}
                />
                <Button
                  variant="amber"
                  className="w-full h-11 text-sm font-ui font-medium"
                  disabled={!partnerToken.trim() || linking}
                  onClick={handleLink}
                >
                  {linking ? "Linking..." : "Link with partner"}
                </Button>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSolo}
                    className="flex-1 font-ui text-sm text-t-secondary hover:text-t-primary transition-colors"
                  >
                    I'm travelling solo
                  </button>
                  <button
                    onClick={() => navigate(`/trip/${code}`)}
                    className="flex-1 font-ui text-sm text-t-tertiary hover:text-t-secondary transition-colors"
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JoinTrip;
```

### frontend/src/pages/TripRoom.tsx

```typescript
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import Header from "@/components/Header";
import MemberCirclesRow from "@/components/MemberCirclesRow";
import CoupleReadinessStrip from "@/components/CoupleReadinessStrip";
import DeadlineSetterCollapsed from "@/components/DeadlineSetterCollapsed";
import DestinationSearchCard from "@/components/DestinationSearchCard";
import BudgetDropdowns from "@/components/BudgetDropdowns";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import PersonalPreferencesCard from "@/components/PersonalPreferencesCard";
import { api, getTokens } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useAppVersion } from "@/hooks/useAppVersion";

interface Member {
  id: string;
  display_name: string;
  is_organiser: boolean;
  has_confirmed: boolean;
  confirmed_at: string | null;
  joined_at: string;
  couple_id?: string | null;
}

interface Couple {
  id: string;
  couple_name: string | null;
  member_1: { id: string; display_name: string; has_confirmed: boolean } | null;
  member_2: { id: string; display_name: string; has_confirmed: boolean } | null;
}

interface Deadline {
  item_type: string;
  due_date: string;
  locked: boolean;
}

interface Destination {
  id: string;
  name: string;
  votes: number;
  voter_member_ids: string[];
  voter_couple_ids: string[];
}

interface TripData {
  id: string;
  name: string;
  join_token: string;
  budget_min: number | null;
  budget_max: number | null;
  travel_from: string | null;
  travel_to: string | null;
  deadline: string | null;
  group_size: number;
  selected_destination_id: string | null;
  destination_summary: any | null;
}

function formatCost(min: number | null, max: number | null): string {
  if (min === null || max === null) return "";
  return `₹${min.toLocaleString("en-IN")} – ₹${max.toLocaleString("en-IN")}`;
}

function formatDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const TripRoom = () => {
  const { id: joinToken } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<TripData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [budgetPrefs, setBudgetPrefs] = useState<any[]>([]);
  const [availSlots, setAvailSlots] = useState<any[]>([]);
  const [couples, setCouples] = useState<Couple[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [appVersion] = useAppVersion();
  const isV5 = appVersion === "v5";

  const tokens = joinToken ? getTokens(joinToken) : null;
  const isOrganiser = !!tokens?.organiserToken;
  const currentMemberId = tokens?.memberId ?? null;

  const fetchTrip = useCallback(async () => {
    if (!joinToken) return;
    try {
      const data = await api.get(`/api/trips/${joinToken}`);
      setTrip(data.trip);
      setMembers(data.members);
      setBudgetPrefs(data.budget_preferences ?? []);
      setAvailSlots(data.availability_slots ?? []);
      setCouples(data.couples ?? []);
      setDeadlines(data.deadlines ?? []);
      setDestinations(data.destinations ?? []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Trip not found");
    } finally {
      setLoading(false);
    }
  }, [joinToken]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  // Supabase Realtime
  useEffect(() => {
    if (!supabase || !trip?.id) return;

    const channel = supabase
      .channel(`trip-${trip.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "destination_votes", filter: `trip_id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budget_preferences", filter: `trip_id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability_slots", filter: `trip_id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "couples", filter: `trip_id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, trip?.id, fetchTrip]);

  // Refetch on tab focus
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchTrip();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchTrip]);

  const handleConfirm = async () => {
    if (!joinToken) return;
    try {
      await api.post(`/api/trips/${joinToken}/confirm`, {}, joinToken);
      await fetchTrip();
      toast({ title: "You're in!" });
    } catch (err: any) {
      toast({ title: "Confirm failed", description: err.message, variant: "destructive" });
    }
  };

  const handleCopyInvite = () => {
    const link = `${window.location.origin}/join/${joinToken}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen relative z-10">
        <Header />
        <div className="max-w-2xl mx-auto px-6 pt-24">
          <p className="font-ui text-t-secondary">Loading trip...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !trip) {
    return (
      <div className="min-h-screen relative z-10">
        <Header />
        <div className="max-w-2xl mx-auto px-6 pt-24">
          <h1 className="font-display text-[32px] font-bold text-t-primary mb-2">Trip not found</h1>
          <p className="font-ui text-t-secondary">{error}</p>
        </div>
      </div>
    );
  }

  // Derived state
  const myMember = members.find((m) => m.id === currentMemberId);
  const hasConfirmed = myMember?.has_confirmed || false;
  const myCoupleId = myMember?.couple_id ?? null;

  const card2Enabled = trip.selected_destination_id !== null;
  const card3Enabled = trip.budget_min !== null;

  // Current user's existing budget preferences
  const myPrefs = budgetPrefs.find((p: any) => p.member_id === currentMemberId) ?? null;

  // Deadline lookups by item_type
  const destDeadline = deadlines.find((d) => d.item_type === "destination_vote") ?? null;
  const budgetDeadline = deadlines.find((d) => d.item_type === "budget_input") ?? null;
  const availDeadline = deadlines.find((d) => d.item_type === "availability") ?? null;

  // Header subtitle
  const headerParts: string[] = [];
  if (trip.budget_min !== null && trip.budget_max !== null) {
    headerParts.push(formatCost(trip.budget_min, trip.budget_max));
  }
  if (trip.travel_from && trip.travel_to) {
    headerParts.push(`${formatDate(trip.travel_from)}–${formatDate(trip.travel_to)}`);
  }
  if (isV5 && couples.length > 0) {
    headerParts.push(`${couples.length} couples`);
  } else {
    headerParts.push(`${members.length} people`);
  }

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="max-w-2xl mx-auto px-6 pt-24 pb-32">
        {/* Trip header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-6">
          <div>
            <h1 className="font-display text-[32px] md:text-[36px] font-bold leading-[1.05] text-t-primary">
              {trip.name}
            </h1>
            {headerParts.length > 0 && (
              <p className="font-mono text-[13px] text-t-secondary mt-1.5">
                {headerParts.join("  ·  ")}
              </p>
            )}
          </div>
          <button
            onClick={handleCopyInvite}
            className="mt-4 md:mt-0 h-9 px-4 rounded-[4px] border border-b-mid font-ui text-sm text-t-secondary hover:bg-hover transition-all"
          >
            {copied ? "Copied!" : "Share link"}
          </button>
        </div>

        {/* Member circles */}
        <MemberCirclesRow
          members={members}
          groupSize={trip.group_size || members.length}
          currentMemberId={currentMemberId}
          {...(isV5 ? { couples, joinToken: joinToken! } : {})}
        />

        {/* Couple readiness strip — V5 organiser only */}
        {isV5 && isOrganiser && couples.length > 0 && (
          <div className="mt-4">
            <CoupleReadinessStrip
              couples={couples}
              destinations={destinations}
              budgetPrefs={budgetPrefs}
              availSlots={availSlots}
            />
          </div>
        )}

        {/* Deadline setter — V5 organiser only */}
        {isV5 && isOrganiser && (
          <div className="mt-4">
            <DeadlineSetterCollapsed
              joinToken={joinToken!}
              deadlines={deadlines}
              onUpdated={fetchTrip}
            />
          </div>
        )}

        {/* Card 1 — Destination */}
        <div className="mt-8">
          <DestinationSearchCard
            joinToken={joinToken!}
            trip={trip}
            isOrganiser={isOrganiser}
            onTripUpdated={fetchTrip}
            deadline={isV5 ? destDeadline : undefined}
          />
        </div>

        {/* Budget mismatch warning */}
        {trip.destination_summary?.cost_breakdown && trip.budget_max !== null &&
          trip.budget_max < trip.destination_summary.cost_breakdown.total_min && (
          <div className="mt-4 bg-[rgba(181,80,58,0.12)] border border-terra rounded-[4px] p-4">
            <p className="font-ui text-sm text-terra">
              ⚠ Your budget (₹{trip.budget_max.toLocaleString("en-IN")}) may be tight for{" "}
              {trip.destination_summary.name || "this destination"} (est. from ₹
              {trip.destination_summary.cost_breakdown.total_min.toLocaleString("en-IN")}). Consider
              adjusting your budget or choosing a different destination.
            </p>
          </div>
        )}

        {/* Card 2 — Budget */}
        <div className="mt-6">
          <BudgetDropdowns
            joinToken={joinToken!}
            trip={trip}
            isOrganiser={isOrganiser}
            onTripUpdated={fetchTrip}
            disabled={!card2Enabled}
            deadline={isV5 ? budgetDeadline : undefined}
          />
        </div>

        {/* Card 3 — Availability */}
        <div className="mt-6">
          <AvailabilityCalendar
            joinToken={joinToken!}
            trip={trip}
            members={members}
            availSlots={availSlots}
            currentMemberId={currentMemberId}
            isOrganiser={isOrganiser}
            onTripUpdated={fetchTrip}
            disabled={!card3Enabled}
            availabilityDeadline={isV5 ? availDeadline : undefined}
          />
        </div>

        {/* Card 4 — Personal Preferences */}
        <div className="mt-6">
          <PersonalPreferencesCard
            joinToken={joinToken!}
            existingPrefs={myPrefs}
            onRefresh={fetchTrip}
            coupleId={isV5 ? myCoupleId : undefined}
          />
        </div>
      </div>

      {/* Sticky "I'm in" button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[var(--bg-base)]/90 backdrop-blur-sm border-t border-b-subtle z-20">
        <div className="max-w-2xl mx-auto">
          {!hasConfirmed ? (
            <button
              onClick={handleConfirm}
              className="w-full h-16 bg-amber text-[#1c1a15] font-display font-bold text-2xl rounded-[4px] tracking-tight hover:bg-amber-light active:scale-[0.98] transition-transform"
            >
              I'm in
            </button>
          ) : (
            <div className="w-full h-16 flex items-center justify-center gap-3 border border-green rounded-[4px]">
              <span className="text-green font-mono text-lg">✓</span>
              <span className="font-display text-xl text-green">You're in</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TripRoom;
```

### frontend/src/pages/NotFound.tsx

```typescript
const NotFound = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
```

### frontend/src/components/Header.tsx

```typescript
import { Link } from "react-router-dom";
import { useAppVersion } from "@/hooks/useAppVersion";
import { cn } from "@/lib/utils";

const Header = () => {
  const [appVersion, setAppVersion] = useAppVersion();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-10">
      <Link to="/" className="font-display font-medium text-lg text-t-primary tracking-wide">
        Groupism
      </Link>

      <div className="flex items-center gap-0 bg-elevated border border-b-mid rounded-[4px] overflow-hidden">
        {(["v4", "v5"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setAppVersion(v)}
            className={cn(
              "px-3 py-1 font-mono text-xs transition-colors",
              appVersion === v
                ? "bg-amber text-[#1c1a15] font-medium"
                : "text-t-secondary hover:bg-hover"
            )}
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  );
};

export default Header;
```

### frontend/src/components/MapBackground.tsx

```typescript
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

const MapBackground = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCenter([pos.coords.latitude, pos.coords.longitude]),
        () => setCenter(DEFAULT_CENTER)
      );
    } else {
      setCenter(DEFAULT_CENTER);
    }
  }, []);

  useEffect(() => {
    if (!center || !mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png").addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [center]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <div ref={mapRef} className="w-full h-full" style={{ background: "var(--bg-base)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(245,240,232,0.55) 0%, rgba(245,240,232,0.75) 60%, rgba(245,240,232,0.92) 100%)" }} />
    </div>
  );
};

export default MapBackground;
```

### frontend/src/components/MemberCirclesRow.tsx

```typescript
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { getTokens } from "@/lib/api";

interface MemberCirclesRowProps {
  members: Array<{ id: string; display_name: string; couple_id?: string | null }>;
  groupSize: number;
  currentMemberId: string | null;
  couples?: Array<{
    id: string;
    couple_name: string | null;
    member_1: { id: string; display_name: string; has_confirmed: boolean } | null;
    member_2: { id: string; display_name: string; has_confirmed: boolean } | null;
  }>;
  joinToken?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function MemberCircle({
  name,
  isCurrentUser,
}: {
  name: string;
  isCurrentUser: boolean;
}) {
  return (
    <div
      className={cn(
        "w-10 h-10 rounded-full bg-elevated border border-[var(--border-mid)] flex items-center justify-center font-mono text-xs text-t-primary",
        isCurrentUser && "ring-2 ring-amber"
      )}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

function EmptyCircle() {
  return (
    <div className="w-10 h-10 rounded-full border border-dashed border-[var(--border-mid)] bg-transparent" />
  );
}

function CoupleGroup({
  couple,
  currentMemberId,
}: {
  couple: MemberCirclesRowProps["couples"] extends (infer T)[] | undefined ? NonNullable<T> : never;
  currentMemberId: string | null;
}) {
  const { member_1, member_2, couple_name } = couple;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex -space-x-2">
        {member_1 && (
          <MemberCircle
            name={member_1.display_name}
            isCurrentUser={member_1.id === currentMemberId}
          />
        )}
        {member_2 && (
          <MemberCircle
            name={member_2.display_name}
            isCurrentUser={member_2.id === currentMemberId}
          />
        )}
      </div>
      {couple_name && (
        <span className="font-ui text-[10px] text-t-secondary max-w-[5rem] truncate">
          {couple_name}
        </span>
      )}
    </div>
  );
}

function PartnerTokenDisplay({ joinToken }: { joinToken: string }) {
  const [copied, setCopied] = useState(false);
  const tokens = getTokens(joinToken);
  const memberToken = tokens?.memberToken;

  if (!memberToken) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(memberToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may fail in some contexts
    }
  };

  return (
    <div className="mt-3">
      <p className="font-ui font-light text-xs text-t-secondary mb-1">
        Your partner link token
      </p>
      <div className="flex items-center gap-2">
        <code className="font-mono text-xs text-t-primary bg-elevated border border-[var(--border-mid)] rounded px-2 py-1 select-all">
          {memberToken}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="font-ui text-xs text-t-secondary hover:text-t-primary transition-colors px-2 py-1 rounded border border-[var(--border-mid)] min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function MemberCirclesRow({
  members,
  groupSize,
  currentMemberId,
  couples,
  joinToken,
}: MemberCirclesRowProps) {
  // V5 couple mode
  if (couples) {
    const coupleSlots = Math.ceil(groupSize / 2);

    const coupledMemberIds = new Set<string>();
    for (const c of couples) {
      if (c.member_1) coupledMemberIds.add(c.member_1.id);
      if (c.member_2) coupledMemberIds.add(c.member_2.id);
    }

    const unlinkedMembers = members.filter(
      (m) => !m.couple_id && !coupledMemberIds.has(m.id)
    );

    const emptyCount = Math.max(0, coupleSlots - couples.length - unlinkedMembers.length);

    return (
      <div>
        <div className="flex gap-3 flex-wrap">
          {couples.map((c) => (
            <CoupleGroup
              key={c.id}
              couple={c}
              currentMemberId={currentMemberId}
            />
          ))}

          {unlinkedMembers.map((m) => (
            <div key={m.id} className="flex flex-col items-center gap-1">
              <MemberCircle
                name={m.display_name}
                isCurrentUser={m.id === currentMemberId}
              />
            </div>
          ))}

          {Array.from({ length: emptyCount }).map((_, i) => (
            <div key={`empty-couple-${i}`} className="flex flex-col items-center gap-1">
              <div className="flex -space-x-2">
                <EmptyCircle />
                <EmptyCircle />
              </div>
            </div>
          ))}
        </div>

        <p className="font-ui font-light text-xs text-t-secondary mt-2">
          {couples.length} of {coupleSlots} couples joined
        </p>

        {joinToken && <PartnerTokenDisplay joinToken={joinToken} />}
      </div>
    );
  }

  // V4 mode (unchanged)
  const total =
    groupSize <= 0 || groupSize < members.length
      ? members.length
      : groupSize;
  const emptyCount = total - members.length;

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {members.map((m) => (
          <div
            key={m.id}
            className={cn(
              "w-10 h-10 rounded-full bg-elevated border border-[var(--border-mid)] flex items-center justify-center font-mono text-xs text-t-primary",
              m.id === currentMemberId && "ring-2 ring-amber"
            )}
            title={m.display_name}
          >
            {getInitials(m.display_name)}
          </div>
        ))}

        {Array.from({ length: emptyCount }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-10 h-10 rounded-full border border-dashed border-[var(--border-mid)] bg-transparent"
          />
        ))}
      </div>

      <p className="font-ui font-light text-xs text-t-secondary mt-2">
        {members.length} of {total} joined
      </p>
    </div>
  );
}
```

### frontend/src/components/CoupleReadinessStrip.tsx

```typescript
"use client";

interface CoupleReadinessStripProps {
  couples: Array<{
    id: string;
    couple_name: string | null;
    member_1: { id: string; display_name: string; has_confirmed: boolean } | null;
    member_2: { id: string; display_name: string; has_confirmed: boolean } | null;
  }>;
  destinations: Array<{ voter_member_ids: string[] }>;
  budgetPrefs: Array<{ member_id: string }>;
  availSlots: Array<{ member_id: string }>;
}

function memberIds(
  member_1: CoupleReadinessStripProps["couples"][number]["member_1"],
  member_2: CoupleReadinessStripProps["couples"][number]["member_2"]
): string[] {
  const ids: string[] = [];
  if (member_1) ids.push(member_1.id);
  if (member_2) ids.push(member_2.id);
  return ids;
}

function StatusCell({ done }: { done: boolean }) {
  return (
    <span
      className={`font-mono text-sm ${done ? "text-green" : "text-t-tertiary"}`}
    >
      {done ? "\u2713" : "\u2014"}
    </span>
  );
}

export default function CoupleReadinessStrip({
  couples,
  destinations,
  budgetPrefs,
  availSlots,
}: CoupleReadinessStripProps) {
  const budgetMemberIds = new Set(budgetPrefs.map((b) => b.member_id));
  const availMemberIds = new Set(availSlots.map((a) => a.member_id));

  function hasDestination(ids: string[]): boolean {
    return destinations.some((d) =>
      ids.some((id) => d.voter_member_ids.includes(id))
    );
  }

  function hasBudget(ids: string[]): boolean {
    return ids.some((id) => budgetMemberIds.has(id));
  }

  function hasAvail(ids: string[]): boolean {
    return ids.some((id) => availMemberIds.has(id));
  }

  function hasConfirmed(
    m1: CoupleReadinessStripProps["couples"][number]["member_1"],
    m2: CoupleReadinessStripProps["couples"][number]["member_2"]
  ): boolean {
    return (m1?.has_confirmed ?? false) || (m2?.has_confirmed ?? false);
  }

  return (
    <div className="bg-surface border border-b-subtle rounded-[4px] p-4">
      <h3 className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
        Couple readiness
      </h3>

      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 gap-y-1 items-center">
        {/* Column headers */}
        <span />
        <span className="font-mono text-[10px] text-t-tertiary text-center">
          Dest
        </span>
        <span className="font-mono text-[10px] text-t-tertiary text-center">
          Budget
        </span>
        <span className="font-mono text-[10px] text-t-tertiary text-center">
          Avail
        </span>
        <span className="font-mono text-[10px] text-t-tertiary text-center">
          In
        </span>

        {/* Couple rows */}
        {couples.map((couple) => {
          const ids = memberIds(couple.member_1, couple.member_2);
          const name =
            couple.couple_name ??
            [couple.member_1?.display_name, couple.member_2?.display_name]
              .filter(Boolean)
              .join(" & ");

          return (
            <div key={couple.id} className="contents">
              <span className="font-ui text-sm text-t-primary truncate">
                {name}
              </span>
              <span className="text-center">
                <StatusCell done={hasDestination(ids)} />
              </span>
              <span className="text-center">
                <StatusCell done={hasBudget(ids)} />
              </span>
              <span className="text-center">
                <StatusCell done={hasAvail(ids)} />
              </span>
              <span className="text-center">
                <StatusCell done={hasConfirmed(couple.member_1, couple.member_2)} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### frontend/src/components/DeadlineSetterCollapsed.tsx

```typescript
"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface DeadlineSetterCollapsedProps {
  joinToken: string;
  deadlines: Array<{ item_type: string; due_date: string; locked: boolean }>;
  onUpdated: () => void;
}

const ITEM_TYPES = [
  { item_type: "destination_vote", label: "Choose destination by" },
  { item_type: "budget_input", label: "Submit budget by" },
  { item_type: "availability", label: "Submit availability by" },
  { item_type: "confirmation", label: "Confirm trip by" },
] as const;

export default function DeadlineSetterCollapsed({
  joinToken,
  deadlines,
  onUpdated,
}: DeadlineSetterCollapsedProps) {
  const [collapsed, setCollapsed] = useState(true);

  const deadlineMap = new Map(
    deadlines.map((d) => [d.item_type, { due_date: d.due_date, locked: d.locked }])
  );

  const [localDates, setLocalDates] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const { item_type } of ITEM_TYPES) {
      initial[item_type] = deadlineMap.get(item_type)?.due_date ?? "";
    }
    return initial;
  });

  async function handleDateChange(itemType: string, value: string) {
    setLocalDates((prev) => ({ ...prev, [itemType]: value }));

    try {
      await api.post(
        `/api/trips/${joinToken}/deadlines`,
        { deadlines: [{ item_type: itemType, due_date: value }] },
        joinToken
      );
      toast({ title: "Deadline updated" });
      onUpdated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update deadline";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }

  if (collapsed) {
    return (
      <span
        className="font-ui text-xs text-t-tertiary underline cursor-pointer"
        onClick={() => setCollapsed(false)}
      >
        + Set response deadlines
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-ui text-xs text-t-tertiary underline cursor-pointer"
        onClick={() => setCollapsed(true)}
      >
        − Hide deadlines
      </span>

      {ITEM_TYPES.map(({ item_type, label }) => {
        const entry = deadlineMap.get(item_type);
        const isLocked = entry?.locked ?? false;

        return (
          <div key={item_type} className="flex items-center gap-2">
            <span className="font-ui text-xs text-t-secondary w-44 shrink-0">
              {label}
            </span>

            <input
              type="date"
              className="font-mono text-xs bg-surface border border-b-subtle rounded px-2 py-1 disabled:opacity-50"
              value={localDates[item_type] ?? ""}
              disabled={isLocked}
              onChange={(e) => handleDateChange(item_type, e.target.value)}
            />

            {isLocked && (
              <span className="font-ui text-xs text-terra">Locked</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### frontend/src/components/DestinationSearchCard.tsx

```typescript
"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface DestinationSearchCardProps {
  joinToken: string;
  trip: {
    id: string;
    selected_destination_id: string | null;
    destination_summary: any | null;
    group_size: number;
    budget_min: number | null;
    budget_max: number | null;
    travel_from: string | null;
    travel_to: string | null;
  };
  isOrganiser: boolean;
  onTripUpdated: () => void;
  deadline?: { due_date: string; locked: boolean } | null;
}

type ViewState =
  | { mode: "search" }
  | { mode: "loading"; loadingText: string }
  | { mode: "suggestions"; suggestions: string[] }
  | { mode: "summary"; summary: any }
  | { mode: "selected" }
  | { mode: "error"; message: string };

export default function DestinationSearchCard({
  joinToken,
  trip,
  isOrganiser,
  onTripUpdated,
  deadline,
}: DestinationSearchCardProps) {
  const hasExistingDestination =
    trip.selected_destination_id !== null && trip.destination_summary !== null;

  const [view, setView] = useState<ViewState>(
    hasExistingDestination ? { mode: "selected" } : { mode: "search" }
  );
  const [searchValue, setSearchValue] = useState("");
  const [selecting, setSelecting] = useState(false);

  async function handleSearch() {
    const query = searchValue.trim();
    if (!query) return;

    setView({ mode: "loading", loadingText: "Searching..." });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query, source: "search" },
        joinToken
      );
      // Unwrap the { destination: { ... } } wrapper if present
      const summary = res.destination ?? res;
      setView({ mode: "summary", summary });
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status === 503) {
        setView({
          mode: "error",
          message:
            "AI is unavailable right now. Try searching a destination manually.",
        });
      } else {
        setView({
          mode: "error",
          message:
            "AI is unavailable right now. Try searching a destination manually.",
        });
      }
    }
  }

  async function handleAiSuggest() {
    setView({ mode: "loading", loadingText: "Thinking about your group..." });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query: null, source: "ai" },
        joinToken
      );

      if (res.suggestions && Array.isArray(res.suggestions)) {
        setView({ mode: "suggestions", suggestions: res.suggestions });
      } else {
        setView({ mode: "summary", summary: res });
      }
    } catch {
      setView({
        mode: "error",
        message:
          "AI is unavailable right now. Try searching a destination manually.",
      });
    }
  }

  async function handleChipClick(chipName: string) {
    setView({ mode: "loading", loadingText: "Searching..." });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query: chipName, source: "search" },
        joinToken
      );
      const summary = res.destination ?? res;
      setView({ mode: "summary", summary });
    } catch {
      setView({
        mode: "error",
        message:
          "AI is unavailable right now. Try searching a destination manually.",
      });
    }
  }

  async function handleSelect(summary: any) {
    setSelecting(true);

    try {
      const destRes = await api.post(
        `/api/trips/${joinToken}/destinations`,
        {
          name: summary.name,
          tagline: summary.tagline,
          pros: summary.highlights,
          cons: summary.watch_out,
          estimated_cost_min: summary.cost_breakdown?.total_min,
          estimated_cost_max: summary.cost_breakdown?.total_max,
          source: "ai",
        },
        joinToken
      );

      const destinationId = destRes.destination?.id;

      await api.patch(
        `/api/trips/${joinToken}`,
        {
          selected_destination_id: destinationId,
          destination_summary: summary,
        },
        joinToken
      );

      onTripUpdated();
    } catch {
      toast({
        title: "Failed to select destination",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSelecting(false);
    }
  }

  function handleChangeDestination() {
    setView({ mode: "search" });
    setSearchValue("");
  }

  return (
    <div className="bg-surface border border-b-subtle rounded-[4px] p-6">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-6">
        Where are you going?
      </h2>

      {/* Already selected state */}
      {view.mode === "selected" && trip.destination_summary && (
        <div>
          {isOrganiser && (
            <button
              onClick={handleChangeDestination}
              className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors mb-4"
            >
              &larr; Change destination
            </button>
          )}
          <PlaceSummaryCard
            summary={trip.destination_summary}
            trip={trip}
            readOnly
          />
        </div>
      )}

      {/* Search mode */}
      {view.mode === "search" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-t-tertiary text-base pointer-events-none">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Search a destination..."
                className="w-full h-11 pl-10 pr-4 bg-elevated border border-b-mid rounded-[4px] font-ui text-sm text-t-primary placeholder:text-t-tertiary outline-none focus:border-amber transition-colors"
              />
            </div>
            <button
              onClick={handleAiSuggest}
              className="h-11 px-5 rounded-[4px] border border-b-mid bg-transparent font-ui text-sm text-t-primary hover:bg-hover transition-all cursor-pointer whitespace-nowrap"
            >
              Let AI suggest
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {view.mode === "loading" && (
        <LoadingShimmer text={view.loadingText} />
      )}

      {/* AI suggestions */}
      {view.mode === "suggestions" && (
        <div className="space-y-4">
          <p className="font-ui text-sm text-t-secondary">
            Pick a destination to explore:
          </p>
          <div className="flex flex-wrap gap-3">
            {view.suggestions.map((name) => (
              <button
                key={name}
                onClick={() => handleChipClick(name)}
                className="h-11 px-5 rounded-[4px] bg-surface border border-b-mid font-ui text-sm text-t-primary hover:bg-hover transition-all cursor-pointer"
              >
                {name}
              </button>
            ))}
          </div>
          <button
            onClick={handleChangeDestination}
            className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
          >
            &larr; Back to search
          </button>
        </div>
      )}

      {/* Summary view */}
      {view.mode === "summary" && (
        <div className="space-y-6">
          <button
            onClick={handleChangeDestination}
            className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
          >
            &larr; Back to search
          </button>
          <PlaceSummaryCard
            summary={view.summary}
            trip={trip}
          />
          <button
            onClick={() => handleSelect(view.summary)}
            disabled={selecting}
            className={cn(
              "w-full h-14 bg-amber text-[#1c1a15] font-display font-bold text-lg rounded-[4px] transition-opacity",
              selecting ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90"
            )}
          >
            {selecting
              ? "Selecting..."
              : `Select ${view.summary.name || "destination"} \u2192`}
          </button>
        </div>
      )}

      {/* Error state */}
      {view.mode === "error" && (
        <div className="space-y-4">
          <p className="font-ui text-sm text-terra">{view.message}</p>
          <button
            onClick={handleChangeDestination}
            className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
          >
            &larr; Back to search
          </button>
        </div>
      )}

      {/* Inline deadline */}
      {deadline && !deadline.locked && (() => {
        const now = new Date(); now.setHours(0,0,0,0);
        const days = Math.ceil((new Date(deadline.due_date).getTime() - now.getTime()) / 86400000);
        return (
          <p className={cn("font-ui text-xs mt-4", days <= 2 ? "text-terra" : "text-t-tertiary")}>
            {days <= 0
              ? "⚠ Deadline passed"
              : `Choose destination by ${new Date(deadline.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
          </p>
        );
      })()}
    </div>
  );
}

/* ─── Sub-components ─── */

function LoadingShimmer({ text }: { text: string }) {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-12 bg-surface rounded-[4px] overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.06)] to-transparent animate-shimmer" />
        </div>
      ))}
      <p className="font-ui font-light text-sm text-t-secondary">{text}</p>
    </div>
  );
}

function PlaceSummaryCard({
  summary,
  trip,
  readOnly = false,
}: {
  summary: any;
  trip: { group_size: number; travel_from: string | null; travel_to: string | null };
  readOnly?: boolean;
}) {
  const highlights: string[] = summary.highlights ?? summary.pros ?? [];
  const watchOuts: string[] = summary.watch_out ?? summary.cons ?? [];
  const costBreakdown = summary.cost_breakdown ?? summary.estimated_costs ?? null;

  const nightCount =
    trip.travel_from && trip.travel_to
      ? Math.max(
          1,
          Math.round(
            (new Date(trip.travel_to).getTime() -
              new Date(trip.travel_from).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <h3 className="font-display text-4xl font-bold text-t-primary">
          {summary.name}
        </h3>
        <div className="border-t border-b-mid mt-3" />
      </div>

      {/* Tagline */}
      {summary.tagline && (
        <p className="font-ui font-light text-t-secondary mt-2">
          {summary.tagline}
        </p>
      )}

      {/* Highlights & watch-outs */}
      {(highlights.length > 0 || watchOuts.length > 0) && (
        <div className="space-y-1.5">
          {highlights.map((h, i) => (
            <p key={`h-${i}`} className="text-green font-ui text-sm">
              &#10003; {h}
            </p>
          ))}
          {watchOuts.map((w, i) => (
            <p key={`w-${i}`} className="text-terra font-ui text-sm">
              &#10007; {w}
            </p>
          ))}
        </div>
      )}

      {/* Cost breakdown */}
      {costBreakdown && (
        <div className="space-y-3">
          <div>
            <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider font-medium">
              Estimated cost
              {nightCount !== null && trip.group_size > 0
                ? ` (${nightCount} night${nightCount !== 1 ? "s" : ""}, ${trip.group_size} ${trip.group_size === 1 ? "person" : "people"})`
                : ""}
            </p>
            <div className="border-t border-b-mid mt-2" />
          </div>

          <div className="space-y-2">
            <CostRow
              label="Flights"
              min={costBreakdown.flights_min}
              max={costBreakdown.flights_max}
              suffix="pp"
            />
            <CostRow
              label="Hotel"
              min={costBreakdown.hotel_per_night_min}
              max={costBreakdown.hotel_per_night_max}
              suffix="pp/night"
            />
            <CostRow
              label="Food"
              min={costBreakdown.food_per_day_min}
              max={costBreakdown.food_per_day_max}
              suffix="pp/day"
            />
            <CostRow
              label="Activities"
              min={costBreakdown.activities_min}
              max={costBreakdown.activities_max}
              suffix="pp"
            />
          </div>

          {(costBreakdown.total_min != null ||
            costBreakdown.total_max != null) && (
            <div>
              <div className="border-t border-b-subtle" />
              <div className="flex justify-between items-center pt-2">
                <span className="font-ui text-sm text-t-secondary">
                  Total estimate
                </span>
                <span className="font-mono font-medium text-sm text-t-primary">
                  {formatRange(
                    costBreakdown.total_min,
                    costBreakdown.total_max
                  )}{" "}
                  pp
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CostRow({
  label,
  min,
  max,
  suffix,
}: {
  label: string;
  min: number | null | undefined;
  max: number | null | undefined;
  suffix: string;
}) {
  if (min == null && max == null) return null;

  return (
    <div className="flex justify-between items-center">
      <span className="font-ui text-sm text-t-secondary">{label}</span>
      <span className="font-mono text-sm text-t-primary">
        {formatRange(min ?? null, max ?? null)} {suffix}
      </span>
    </div>
  );
}

function formatRange(min: number | null, max: number | null): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);

  if (min != null && max != null) return `${fmt(min)} \u2013 ${fmt(max)}`;
  if (min != null) return fmt(min);
  if (max != null) return fmt(max);
  return "\u2014";
}
```

### frontend/src/components/BudgetDropdowns.tsx

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface BudgetDropdownsProps {
  joinToken: string;
  trip: {
    budget_min: number | null;
    budget_max: number | null;
    travel_from: string | null;
    travel_to: string | null;
    destination_summary: any;
  };
  isOrganiser: boolean;
  onTripUpdated: () => void;
  disabled: boolean;
  deadline?: { due_date: string; locked: boolean } | null;
}

const BUDGET_OPTIONS = [
  { label: "₹2,000", value: 2000 },
  { label: "₹3,000", value: 3000 },
  { label: "₹5,000", value: 5000 },
  { label: "₹8,000", value: 8000 },
  { label: "₹10,000", value: 10000 },
  { label: "₹12,000", value: 12000 },
  { label: "₹15,000", value: 15000 },
  { label: "₹20,000", value: 20000 },
  { label: "₹25,000", value: 25000 },
  { label: "₹30,000+", value: 30000 },
];

export default function BudgetDropdowns({
  joinToken,
  trip,
  isOrganiser,
  onTripUpdated,
  disabled,
  deadline,
}: BudgetDropdownsProps) {
  const [budgetMin, setBudgetMin] = useState<number | null>(
    trip.budget_min ?? null
  );
  const [budgetMax, setBudgetMax] = useState<number | null>(
    trip.budget_max ?? null
  );
  const [travelFrom, setTravelFrom] = useState<string>(trip.travel_from ?? "");
  const [travelTo, setTravelTo] = useState<string>(trip.travel_to ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validationError =
    budgetMin !== null && budgetMax !== null && budgetMin > budgetMax
      ? "Minimum can't be more than maximum."
      : null;

  const destSummary = trip.destination_summary;
  const totalMin = destSummary?.cost_breakdown?.total_min;
  const destName =
    destSummary?.destination || destSummary?.name || "this destination";

  const showMismatchWarning =
    budgetMax !== null &&
    totalMin !== undefined &&
    totalMin !== null &&
    budgetMax < totalMin;

  const save = useCallback(
    async (min: number, max: number) => {
      if (!isOrganiser) return;
      try {
        await api.patch(
          `/api/trips/${joinToken}`,
          { budget_min: min, budget_max: max },
          joinToken
        );
        onTripUpdated();
      } catch {
        toast({
          title: "Failed to save budget",
          variant: "destructive",
        });
      }
    },
    [isOrganiser, joinToken, onTripUpdated]
  );

  useEffect(() => {
    if (budgetMin === null || budgetMax === null) return;
    if (budgetMin > budgetMax) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      save(budgetMin, budgetMax);
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [budgetMin, budgetMax, save]);

  const saveDate = useCallback(
    async (from: string, to: string) => {
      if (!isOrganiser) return;
      try {
        await api.patch(
          `/api/trips/${joinToken}`,
          { travel_from: from || null, travel_to: to || null },
          joinToken
        );
        onTripUpdated();
      } catch {
        toast({ title: "Failed to save dates", variant: "destructive" });
      }
    },
    [isOrganiser, joinToken, onTripUpdated]
  );

  const handleDateChange = (field: "from" | "to", value: string) => {
    const newFrom = field === "from" ? value : travelFrom;
    const newTo = field === "to" ? value : travelTo;
    if (field === "from") setTravelFrom(value);
    else setTravelTo(value);

    if (dateDebounceRef.current) clearTimeout(dateDebounceRef.current);
    dateDebounceRef.current = setTimeout(() => {
      saveDate(newFrom, newTo);
    }, 800);
  };

  useEffect(() => {
    return () => {
      if (dateDebounceRef.current) clearTimeout(dateDebounceRef.current);
    };
  }, []);

  function formatDateDisplay(d: string): string {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function daysUntilDeadline(dueDate: string): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    return Math.ceil((due.getTime() - now.getTime()) / 86400000);
  }

  return (
    <div
      className={cn(
        "rounded-[4px] border border-b-mid bg-surface p-6",
        disabled && "opacity-40 pointer-events-none select-none"
      )}
    >
      <h2 className="font-display text-2xl font-bold text-t-primary mb-4">
        What&apos;s the budget?
      </h2>

      {disabled && (
        <p className="font-ui text-sm text-t-tertiary mb-4">
          Complete destination first
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="font-ui text-xs text-t-tertiary uppercase tracking-wider block mb-2">
            Minimum per person
          </label>
          <select
            className="w-full h-12 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm appearance-none cursor-pointer focus:outline-none focus:border-t-secondary"
            value={budgetMin ?? ""}
            onChange={(e) =>
              setBudgetMin(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Select</option>
            {BUDGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-ui text-xs text-t-tertiary uppercase tracking-wider block mb-2">
            Maximum per person
          </label>
          <select
            className="w-full h-12 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm appearance-none cursor-pointer focus:outline-none focus:border-t-secondary"
            value={budgetMax ?? ""}
            onChange={(e) =>
              setBudgetMax(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Select</option>
            {BUDGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {validationError && (
        <p className="font-ui text-sm text-terra mt-3">{validationError}</p>
      )}

      {showMismatchWarning && !validationError && (
        <div className="bg-[rgba(181,80,58,0.12)] border border-terra rounded-[4px] p-4 font-ui text-sm text-terra mt-4">
          ⚠ Your budget (₹{budgetMax?.toLocaleString("en-IN")}) may be tight
          for {destName} (est. from ₹{totalMin?.toLocaleString("en-IN")}).
          Consider adjusting your budget or choosing a different destination.
        </div>
      )}

      {/* Travel dates */}
      <div className="mt-6 border-t border-b-subtle pt-4">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
          When are you travelling?
        </p>

        {isOrganiser ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="font-ui text-xs text-t-secondary block mb-1">From</label>
              <input
                type="date"
                value={travelFrom}
                onChange={(e) => handleDateChange("from", e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-b-mid rounded-[4px] font-mono text-sm text-t-primary focus:outline-none focus:border-t-secondary"
              />
            </div>
            <div className="flex-1">
              <label className="font-ui text-xs text-t-secondary block mb-1">To</label>
              <input
                type="date"
                value={travelTo}
                onChange={(e) => handleDateChange("to", e.target.value)}
                min={travelFrom}
                className="w-full h-10 px-3 bg-surface border border-b-mid rounded-[4px] font-mono text-sm text-t-primary focus:outline-none focus:border-t-secondary"
              />
            </div>
          </div>
        ) : (
          <p className="font-mono text-sm text-t-primary">
            {trip.travel_from && trip.travel_to
              ? `${formatDateDisplay(trip.travel_from)} → ${formatDateDisplay(trip.travel_to)}`
              : "Dates not set yet"}
          </p>
        )}
      </div>

      {/* Inline deadline */}
      {deadline && !deadline.locked && (() => {
        const days = daysUntilDeadline(deadline.due_date);
        return (
          <p className={cn("font-ui text-xs mt-4", days <= 2 ? "text-terra" : "text-t-tertiary")}>
            {days <= 0 ? "⚠ Deadline passed" : `Submit budget by ${formatDateDisplay(deadline.due_date)}`}
          </p>
        );
      })()}
    </div>
  );
}
```

### frontend/src/components/AvailabilityCalendar.tsx

```typescript
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface AvailabilityCalendarProps {
  joinToken: string;
  trip: {
    id: string;
    travel_from: string | null;
    travel_to: string | null;
    deadline: string | null;
    budget_min: number | null;
  };
  members: Array<{ id: string; display_name: string }>;
  availSlots: Array<{ member_id: string; slot_date: string; tier: string }>;
  currentMemberId: string | null;
  isOrganiser: boolean;
  onTripUpdated: () => void;
  disabled: boolean;
  availabilityDeadline?: { due_date: string; locked: boolean } | null;
}

type Tier = "free" | "could_work" | "unavailable";

const TIER_CYCLE: Array<Tier | null> = ["free", "could_work", "unavailable", null];

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AvailabilityCalendar({
  joinToken,
  trip,
  members,
  availSlots,
  currentMemberId,
  isOrganiser,
  onTripUpdated,
  disabled,
  availabilityDeadline,
}: AvailabilityCalendarProps) {
  const [localSlots, setLocalSlots] = useState<
    Array<{ member_id: string; slot_date: string; tier: string }>
  >(availSlots);

  const [deadlineValue, setDeadlineValue] = useState<string>(
    trip.deadline ?? ""
  );

  // Keep local slots in sync with prop updates from parent
  useEffect(() => {
    setLocalSlots(availSlots);
  }, [availSlots]);

  // Build the 42-day grid
  const calendarDays = useMemo(() => {
    const anchor = trip.travel_from
      ? new Date(trip.travel_from + "T00:00:00")
      : new Date();
    const weekStart = getWeekStart(anchor);
    // Go back 1 week for context
    weekStart.setDate(weekStart.getDate() - 7);

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [trip.travel_from]);

  // Build lookup: date string -> array of { member_id, tier }
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Array<{ member_id: string; tier: string }>>();
    for (const slot of localSlots) {
      const key = slot.slot_date;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push({ member_id: slot.member_id, tier: slot.tier });
    }
    return map;
  }, [localSlots]);

  // Submitted member IDs
  const submittedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of localSlots) {
      ids.add(slot.member_id);
    }
    return ids;
  }, [localSlots]);

  const submittedCount = submittedMemberIds.size;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const handleCellTap = useCallback(
    async (date: Date) => {
      if (!currentMemberId) return;

      const key = dateKey(date);
      const existing = localSlots.find(
        (s) => s.member_id === currentMemberId && s.slot_date === key
      );

      const currentTier: Tier | null = existing
        ? (existing.tier as Tier)
        : null;
      const currentIndex = TIER_CYCLE.indexOf(currentTier);
      const nextTier = TIER_CYCLE[(currentIndex + 1) % TIER_CYCLE.length];

      // Optimistic update
      const previousSlots = [...localSlots];

      if (nextTier === null) {
        // Remove the entry
        setLocalSlots((prev) =>
          prev.filter(
            (s) => !(s.member_id === currentMemberId && s.slot_date === key)
          )
        );
      } else if (existing) {
        // Update existing
        setLocalSlots((prev) =>
          prev.map((s) =>
            s.member_id === currentMemberId && s.slot_date === key
              ? { ...s, tier: nextTier }
              : s
          )
        );
      } else {
        // Add new
        setLocalSlots((prev) => [
          ...prev,
          { member_id: currentMemberId, slot_date: key, tier: nextTier },
        ]);
      }

      try {
        await api.post(
          `/api/trips/${joinToken}/availability`,
          { slot: { date: key, tier: nextTier } },
          joinToken
        );
      } catch {
        // Revert on error
        setLocalSlots(previousSlots);
        toast({
          title: "Failed to update availability",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [currentMemberId, localSlots, joinToken]
  );

  const handleDeadlineChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDate = e.target.value;
      setDeadlineValue(newDate);

      try {
        await api.patch(
          `/api/trips/${joinToken}`,
          { deadline: newDate || null },
          joinToken
        );
        onTripUpdated();
      } catch {
        setDeadlineValue(trip.deadline ?? "");
        toast({
          title: "Failed to update deadline",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [joinToken, onTripUpdated, trip.deadline]
  );

  function getCellBg(date: Date): string {
    if (!currentMemberId) return "bg-transparent";
    const key = dateKey(date);
    const entry = localSlots.find(
      (s) => s.member_id === currentMemberId && s.slot_date === key
    );
    if (!entry) return "bg-transparent";
    switch (entry.tier) {
      case "free":
        return "bg-green/5";
      case "could_work":
        return "bg-amber/5";
      case "unavailable":
        return "bg-terra/5";
      default:
        return "bg-transparent";
    }
  }

  function renderDots(date: Date) {
    const key = dateKey(date);
    const entries = slotsByDate.get(key);
    if (!entries || entries.length === 0) return null;

    const visible = entries.slice(0, 4);
    const overflow = entries.length - 4;

    return (
      <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
        {visible.map((entry, i) => {
          const dotColor =
            entry.tier === "free"
              ? "bg-green"
              : entry.tier === "could_work"
                ? "bg-amber"
                : "bg-terra";

          const isCurrentUser = entry.member_id === currentMemberId;

          return (
            <div
              key={`${entry.member_id}-${i}`}
              className={cn(
                "w-2 h-2 rounded-full",
                dotColor,
                isCurrentUser && "ring-1 ring-t-primary"
              )}
            />
          );
        })}
        {overflow > 0 && (
          <span className="font-mono text-[10px] text-t-tertiary leading-none">
            +{overflow}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-surface border border-b-subtle rounded-[4px] p-6 transition-opacity",
        disabled && "opacity-40 pointer-events-none select-none"
      )}
    >
      <h2 className="font-display text-2xl font-bold text-t-primary mb-1">
        When can everyone go?
      </h2>
      {disabled && (
        <p className="font-ui text-sm text-t-tertiary mb-4">
          Set a budget first
        </p>
      )}

      {!disabled && (
        <>
          {/* Tap instruction */}
          <p className="font-ui text-xs text-t-tertiary mb-4">
            Tap to cycle:{" "}
            <span className="text-green">free</span>
            {" / "}
            <span className="text-amber">could work</span>
            {" / "}
            <span className="text-terra">unavailable</span>
            {" / "}
            <span>clear</span>
          </p>

          {/* Day headers */}
          <div className="grid grid-cols-7">
            {DAY_HEADERS.map((day) => (
              <div
                key={day}
                className="font-ui text-xs text-t-tertiary text-center py-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((date) => {
              const key = dateKey(date);
              const isPast = date < today;
              const isFirstOfMonth = date.getDate() === 1;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={isPast}
                  onClick={() => {
                    if (!isPast) handleCellTap(date);
                  }}
                  className={cn(
                    "min-h-[44px] min-w-[44px] p-1 border border-b-subtle/50 flex flex-col items-center",
                    "transition-colors rounded-[4px]",
                    getCellBg(date),
                    isPast
                      ? "opacity-30 cursor-not-allowed"
                      : "cursor-pointer hover:bg-hover"
                  )}
                >
                  <span className="font-mono text-xs text-t-primary">
                    {date.getDate()}
                  </span>
                  {isFirstOfMonth && (
                    <span className="text-[10px] opacity-60 font-ui leading-none">
                      {MONTH_NAMES[date.getMonth()]}
                    </span>
                  )}
                  {renderDots(date)}
                </button>
              );
            })}
          </div>

          {/* ConfirmByBar */}
          <div className="mt-6 pt-6 border-t border-b-subtle">
            {isOrganiser ? (
              <div className="flex items-center gap-3 mb-3">
                <span className="font-ui text-sm text-t-secondary">
                  Confirm availability by
                </span>
                <input
                  type="date"
                  value={deadlineValue}
                  onChange={handleDeadlineChange}
                  className="h-9 px-3 bg-surface border border-b-mid rounded-[4px] font-mono text-sm text-t-primary focus:outline-none focus:border-t-secondary"
                />
              </div>
            ) : trip.deadline ? (
              <p className="font-ui text-sm text-t-secondary mb-3">
                Deadline: {formatDate(trip.deadline)}
              </p>
            ) : null}

            {/* Progress bar */}
            <div className="flex gap-1 mb-2">
              {members.map((m) => {
                const hasSubmitted = submittedMemberIds.has(m.id);
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "h-2 flex-1 rounded-full transition-all",
                      hasSubmitted ? "bg-amber" : "border border-b-mid"
                    )}
                  />
                );
              })}
            </div>
            <p className="font-ui text-xs text-t-tertiary">
              {submittedCount} of {members.length} submitted availability
            </p>
          </div>
        </>
      )}

      {/* Inline deadline */}
      {availabilityDeadline && !availabilityDeadline.locked && (() => {
        const now = new Date(); now.setHours(0,0,0,0);
        const days = Math.ceil((new Date(availabilityDeadline.due_date).getTime() - now.getTime()) / 86400000);
        return (
          <p className={cn("font-ui text-xs mt-4", days <= 2 ? "text-terra" : "text-t-tertiary")}>
            {days <= 0
              ? "⚠ Deadline passed"
              : `Submit availability by ${new Date(availabilityDeadline.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
          </p>
        );
      })()}
    </div>
  );
}
```

### frontend/src/components/PersonalPreferencesCard.tsx

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface PersonalPreferencesCardProps {
  joinToken: string;
  existingPrefs: {
    accommodation_tier?: string;
    transport_pref?: string;
    dining_style?: string;
    activities?: string[];
    daily_budget_min?: number;
    daily_budget_max?: number;
    notes?: string;
  } | null;
  onRefresh: () => void;
  coupleId?: string | null;
}

const ACCOMMODATION_OPTIONS = [
  { value: "budget", label: "Budget" },
  { value: "mid", label: "Mid-range" },
  { value: "premium", label: "Premium" },
];
const TRANSPORT_OPTIONS = [
  { value: "bus_train", label: "Bus / Train" },
  { value: "flight", label: "Fly" },
  { value: "self_drive", label: "Self-drive" },
];
const DINING_OPTIONS = [
  { value: "local_cheap", label: "Local dhabas" },
  { value: "mixed", label: "Mix" },
  { value: "restaurants", label: "Restaurants" },
];
const ACTIVITY_OPTIONS = [
  "Trekking",
  "Beach",
  "Nightlife",
  "Sightseeing",
  "Food tours",
  "Spa",
  "Adventure sports",
  "None specific",
];

export default function PersonalPreferencesCard({
  joinToken,
  existingPrefs,
  onRefresh,
  coupleId,
}: PersonalPreferencesCardProps) {
  const [accommodation, setAccommodation] = useState<string>(
    existingPrefs?.accommodation_tier ?? ""
  );
  const [transport, setTransport] = useState<string>(
    existingPrefs?.transport_pref ?? ""
  );
  const [dining, setDining] = useState<string>(
    existingPrefs?.dining_style ?? ""
  );
  const [activities, setActivities] = useState<string[]>(
    existingPrefs?.activities ?? []
  );
  const [dailyMin, setDailyMin] = useState<number | undefined>(
    existingPrefs?.daily_budget_min
  );
  const [dailyMax, setDailyMax] = useState<number | undefined>(
    existingPrefs?.daily_budget_max
  );
  const [notes, setNotes] = useState<string>(existingPrefs?.notes ?? "");
  const [savedVisible, setSavedVisible] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  const toggleActivity = (activity: string) => {
    setActivities((prev) =>
      prev.includes(activity)
        ? prev.filter((a) => a !== activity)
        : [...prev, activity]
    );
  };

  const save = useCallback(async () => {
    const payload: Record<string, unknown> = {
      accommodation_tier: accommodation || undefined,
      transport_pref: transport || undefined,
      dining_style: dining || undefined,
      activities: activities.length > 0 ? activities : undefined,
      daily_budget_min: dailyMin,
      daily_budget_max: dailyMax,
      notes: notes || undefined,
      ...(coupleId ? { couple_id: coupleId } : {}),
    };

    try {
      await api.post(
        `/api/trips/${joinToken}/budget/preferences`,
        payload,
        joinToken
      );
      setSavedVisible(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedVisible(false), 2000);
      onRefresh();
    } catch {
      // silent fail — auto-save is best-effort
    }
  }, [
    accommodation,
    transport,
    dining,
    activities,
    dailyMin,
    dailyMax,
    notes,
    joinToken,
    onRefresh,
    coupleId,
  ]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      save();
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [accommodation, transport, dining, activities, dailyMin, dailyMax, notes, save]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const labelClass =
    "font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2 block";

  const segmentedBtn = (
    selected: boolean
  ) =>
    cn(
      "h-[44px] px-4 rounded-[4px] text-sm transition-colors",
      selected
        ? "bg-amber text-[#1c1a15] font-medium"
        : "bg-elevated text-t-secondary hover:bg-hover"
    );

  const pillBtn = (selected: boolean) =>
    cn(
      "rounded-full h-[36px] px-3 text-sm transition-colors",
      selected
        ? "bg-amber text-[#1c1a15] font-medium"
        : "bg-elevated text-t-secondary hover:bg-hover"
    );

  return (
    <div className="rounded-[4px] border border-b-mid bg-surface p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-2xl font-bold text-t-primary">
          Personal preferences
        </h2>
        {savedVisible && (
          <span className="font-ui text-xs text-green">Saved ✓</span>
        )}
      </div>
      <p className="font-ui font-light text-sm text-t-secondary mb-6">
        Tell us what you care about. This helps with planning.
      </p>

      {/* Accommodation */}
      <div className="mb-5">
        <label className={labelClass}>Accommodation</label>
        <div className="flex gap-2 flex-wrap">
          {ACCOMMODATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={segmentedBtn(accommodation === opt.value)}
              onClick={() =>
                setAccommodation(accommodation === opt.value ? "" : opt.value)
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Getting around */}
      <div className="mb-5">
        <label className={labelClass}>Getting around</label>
        <div className="flex gap-2 flex-wrap">
          {TRANSPORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={segmentedBtn(transport === opt.value)}
              onClick={() => setTransport(transport === opt.value ? "" : opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Food */}
      <div className="mb-5">
        <label className={labelClass}>Food</label>
        <div className="flex gap-2 flex-wrap">
          {DINING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={segmentedBtn(dining === opt.value)}
              onClick={() => setDining(dining === opt.value ? "" : opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activities */}
      <div className="mb-5">
        <label className={labelClass}>Activities</label>
        <div className="flex gap-2 flex-wrap">
          {ACTIVITY_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={pillBtn(activities.includes(opt))}
              onClick={() => toggleActivity(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Daily budget range */}
      <div className="mb-5">
        <label className={labelClass}>Daily budget range</label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm text-t-secondary">₹</span>
            <input
              type="number"
              placeholder="Min"
              className="w-28 h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm focus:outline-none focus:border-t-secondary transition-colors"
              value={dailyMin ?? ""}
              onChange={(e) =>
                setDailyMin(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
            />
          </div>
          <span className="text-t-tertiary text-sm">–</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm text-t-secondary">₹</span>
            <input
              type="number"
              placeholder="Max"
              className="w-28 h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm focus:outline-none focus:border-t-secondary transition-colors"
              value={dailyMax ?? ""}
              onChange={(e) =>
                setDailyMax(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={labelClass}>Anything else?</label>
        <input
          type="text"
          placeholder="Optional notes..."
          className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </div>
  );
}
```

### frontend/src/components/ui/button.tsx

```typescript
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        "outline-strong":
          "border border-b-strong bg-transparent text-t-primary hover:bg-hover font-ui text-sm",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        amber:
          "bg-amber text-[var(--bg-base)] hover:bg-amber-light font-ui font-medium",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

### frontend/src/components/ui/sonner.tsx

```typescript
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
```

### frontend/src/components/ui/toast.tsx

```typescript
import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
      className
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
```

### frontend/src/components/ui/toaster.tsx

```typescript
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
```

### frontend/src/components/ui/tooltip.tsx

```typescript
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
```

---

## 15. Git History

```
4724b19 Fix: destructure deadline prop in BudgetDropdowns
823fde1 V5: Add couple model, deadlines, travel dates, version toggle
8f1e949 Redesign Trip Room: 4-card layout with destination search, budget dropdowns, availability calendar
2bba6bd Fix env var name mismatch: accept SUPABASE_PROJECT_URL as fallback
83384a9 Add startup env var check and /debug/env-check endpoint
e8df5c1 Add diagnostic error detail to POST /api/trips 500 response
465fa9a Fix POST /api/trips 500: filter undefined optional fields from insert payload
e576c65 Restructure create trip flow: move budget, dates, AI to TripRoom setup panel
3a6a695 Fix CORS: hardcode Vercel origin and stop throwing on rejected origins
2827dbd Add V2 features: budget estimation, availability mapping, deadlines, group readiness with version toggle
ae569ee Fix 9 delta bugs, add Supabase Realtime, Vercel experimentalServices
68640af Add complete backend and frontend for Triphaus
ed04962 first commit
```

---

## 16. What Works Today

- **Create trip:** Name + organiser name + group size -> unique invite link
- **Join trip:** Invite link -> name input -> couple linking (link/solo/skip) -> TripRoom
- **Couple linking:** Partner token exchange to pair two members as one decision unit
- **Destination search:** AI suggest (3 names) or search (full summary with cost breakdown)
- **Destination selection:** Organiser selects -> saved to trip
- **Budget dropdowns:** Min/max per person with auto-save (800ms debounce)
- **Travel dates:** Organiser date pickers with auto-save, member read-only display
- **Availability calendar:** 42-day grid, single-slot upsert, colored dots per member
- **Personal preferences:** Accommodation/transport/dining/activities with auto-save (1s debounce)
- **Deadlines:** Organiser sets per-phase deadlines, inline display on each card
- **Couple readiness strip:** Organiser-only grid showing per-couple completion status
- **Confirm:** "I'm in" sticky bottom button
- **Version toggle:** V4/V5 switch in header
- **Realtime:** 6 channels (destination_votes, trip_members, trips, budget_preferences, availability_slots, couples)
- **Share link:** Copy invite URL to clipboard

---

## 17. Known Issues & Next Steps

### Known issues
1. **No RLS on Supabase** — all tables use service key only, no row-level security policies
2. **Realtime publication gap** — `destination_options` and `trip_members` may not be in the Realtime publication (V1 migration predates Realtime setup)
3. **Bundle size** — leaflet + framer-motion add significant weight
4. **budget_preferences NOT NULL constraints** — V2 migration has `NOT NULL` on accommodation_tier, transport_pref, dining_style, but V5 backend works around this with dynamic payload. A migration to drop these constraints would be cleaner.
5. **Couple voting partial index** — the partial unique index on `destination_votes(trip_id, couple_id) WHERE couple_id IS NOT NULL` means unlinked members can still double-vote if they later get a couple_id

### Next steps
- Add RLS policies for all tables
- Drop NOT NULL constraints on budget_preferences optional fields
- Add couple unlinking / re-linking
- Push notifications for deadlines
- Dark mode support
- Mobile-optimised calendar
- Trip summary / export