# Groupism — Draft 4: Trip Room Redesign (4-Card Layout)

**Date:** 2 April 2026
**Status:** Trip Room fully redesigned — single scrollable page with 4 sequential cards, destination search with AI cost breakdown, multi-member availability calendar, 9 unused files deleted
**Previous:** Draft3 — Env var fix, diagnostic infrastructure

---

## Table of Contents

1. [What Changed Since Draft 3](#1-what-changed-since-draft-3)
2. [Current Architecture](#2-current-architecture)
3. [Database Schema](#3-database-schema)
4. [API Endpoints](#4-api-endpoints)
5. [Frontend Components](#5-frontend-components)
6. [Trip Room Layout](#6-trip-room-layout)
7. [Card Gating Logic](#7-card-gating-logic)
8. [Realtime Subscriptions](#8-realtime-subscriptions)
9. [Gemini AI Functions](#9-gemini-ai-functions)
10. [Auth & Token System](#10-auth--token-system)
11. [Bugs & Mistakes Log](#11-bugs--mistakes-log)
12. [Complete Code](#12-complete-code)
13. [Git History](#13-git-history)
14. [What Works Today](#14-what-works-today)
15. [Known Issues & Next Steps](#15-known-issues--next-steps)

---

## 1. What Changed Since Draft 3

| Area | Draft 3 | Draft 4 |
|------|---------|---------|
| Trip Room layout | v1/v2 toggle with setup panel, readiness bars, deadlines, nudge | Single scrollable page: 4 sequential cards |
| Destination selection | Organiser adds destinations, members vote | Search input + AI suggestions with cost breakdown, organiser selects |
| Budget | Preset pills in setup panel | Two `<select>` dropdowns with auto-save (800ms debounce) |
| Availability | Single-user calendar (v2 component) | Multi-member calendar with colored dots per person, single-slot upsert |
| Preferences | Standalone budget preference form | Integrated Card 4 with auto-save (1s debounce) |
| Member visibility | Readiness bars | Member circle row with initials + empty dashed slots |
| Confirm flow | Inline confirm button | Sticky bottom "I'm in" button |
| DB schema | No group_size, no selected_destination_id | 3 new columns on trips table |
| Backend: POST /trips | No group_size | Accepts group_size (integer 2-30) |
| Backend: PATCH /trips | Budget + dates only | + selected_destination_id, destination_summary |
| Backend: destinations | GET + POST + vote | + POST /summary (Gemini search + AI suggest) |
| Backend: availability | Batch replacement only | + Single-slot upsert mode |
| Gemini | getDestinationSuggestions, estimateBudget, rankTravelWindows | + getDestinationSummary (search mode + AI suggest mode) |

### Files deleted (9)
- `frontend/src/components/OrganiserSetupPanel.tsx`
- `frontend/src/components/ReadinessBar.tsx`
- `frontend/src/components/v2/GroupReadinessPanel.tsx`
- `frontend/src/components/v2/TripRoomV2Sections.tsx`
- `frontend/src/components/v2/DeadlineManager.tsx`
- `frontend/src/components/v2/DeadlineCountdown.tsx`
- `frontend/src/components/v2/TravelWindowsDisplay.tsx`
- `frontend/src/components/v2/BudgetEstimateDisplay.tsx`
- `frontend/src/hooks/useVersionToggle.ts`

### Files created (5 frontend)
- `MemberCirclesRow.tsx` — filled circles with initials + empty dashed circles
- `DestinationSearchCard.tsx` — Card 1: search + AI + cost breakdown + select
- `BudgetDropdowns.tsx` — Card 2: two `<select>` elements with debounced auto-save
- `AvailabilityCalendar.tsx` — Card 3: multi-member calendar with dots
- `PersonalPreferencesCard.tsx` — Card 4: segmented buttons + activity pills

### Files created (1 backend)
- `backend/supabase/migration_v4_trip_redesign.sql`

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

### trips table (V4 — 3 new columns)

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
group_size               integer default 4              -- V4 NEW
selected_destination_id  uuid references destination_options(id) on delete set null  -- V4 NEW
destination_summary      jsonb                          -- V4 NEW
created_at               timestamptz not null default now()
```

### Other tables (unchanged from Draft 3)

```sql
-- trip_members
id, trip_id, display_name, member_token, is_organiser, has_confirmed, confirmed_at, joined_at

-- destination_options
id, trip_id, name, tagline, pros, cons, best_for, estimated_cost_min, estimated_cost_max, source, created_at

-- destination_votes
id, trip_id, destination_id, member_id, unique(trip_id, member_id)

-- nudge_log
id, trip_id, target_member_id, sent_at

-- budget_preferences (trip_id, member_id unique)
accommodation_tier, transport_pref, dining_style, activities, daily_budget_min/max, notes

-- budget_estimates (trip_id unique)
per_person_min/max, breakdown, divergence_flags, members_included

-- availability_slots (trip_id, member_id, slot_date unique)
slot_date, tier ('unavailable','free','could_work')

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

---

## 4. API Endpoints

### Changed in V4

| Endpoint | Change |
|----------|--------|
| `POST /api/trips` | Now accepts `group_size` (integer 2-30) |
| `PATCH /api/trips/:joinToken` | Now accepts `selected_destination_id`, `destination_summary` |
| `POST /api/trips/:joinToken/availability` | Now supports single-slot upsert via `{ slot: { date, tier } }` |

### New in V4

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/trips/:joinToken/destinations/summary` | loadTrip | AI destination search/suggest with cost breakdown |

**Summary endpoint details:**
- Body: `{ query: string|null, source: 'search'|'ai' }`
- `source: 'ai'` with `query: null` → returns `{ suggestions: ["Goa", "Manali", "Pondicherry"] }`
- `source: 'search'` with query → returns `{ destination: { name, tagline, highlights, watch_out, cost_breakdown: {...}, nights } }`
- Returns 503 if Gemini unavailable

### All endpoints (complete list)

```
GET    /health
GET    /debug/env-check                              (temporary)

POST   /api/trips                                    Create trip
PATCH  /api/trips/:joinToken                         Update trip (organiser)
GET    /api/trips/:joinToken                         Fetch all trip data

POST   /api/trips/:joinToken/join                    Join trip
POST   /api/trips/:joinToken/confirm                 Confirm participation
POST   /api/trips/:joinToken/nudge                   Nudge unconfirmed (24h cooldown)

GET    /api/trips/:joinToken/destinations             List destinations
POST   /api/trips/:joinToken/destinations             Add destination (organiser)
POST   /api/trips/:joinToken/destinations/summary     AI destination summary   ← V4 NEW
POST   /api/trips/:joinToken/destinations/:destId/vote  Cast vote

POST   /api/trips/:joinToken/ai-suggest              AI destination suggestions (legacy)

POST   /api/trips/:joinToken/budget/preferences      Submit budget prefs
POST   /api/trips/:joinToken/budget/estimate          AI budget estimate
GET    /api/trips/:joinToken/budget                   Fetch prefs + estimate

POST   /api/trips/:joinToken/availability             Submit date slots (batch or single)
POST   /api/trips/:joinToken/availability/windows     AI travel windows
GET    /api/trips/:joinToken/availability              Fetch slots + windows

POST   /api/trips/:joinToken/deadlines                Set deadlines
POST   /api/trips/:joinToken/deadlines/lock/:itemType  Lock deadline
GET    /api/trips/:joinToken/deadlines                 Fetch deadlines
```

---

## 5. Frontend Components

### Pages
| File | Purpose |
|------|---------|
| `Index.tsx` | Landing page — animated hero, "Create a Room" + invite code input |
| `CreateTrip.tsx` | 3 fields: trip name, organiser name, group size → POST /api/trips |
| `JoinTrip.tsx` | Join via invite link — shows trip info, name input |
| `TripRoom.tsx` | **V4 rewrite:** 4-card layout + member circles + sticky confirm |
| `NotFound.tsx` | 404 page |

### New V4 Components
| File | Purpose |
|------|---------|
| `MemberCirclesRow.tsx` | Filled circles (initials) + empty dashed circles. "X of Y joined" counter. Current user: `ring-2 ring-amber`. |
| `DestinationSearchCard.tsx` | Card 1: search input + "Let AI suggest" button. PlaceSummaryCard sub-component with cost breakdown table. "Select [dest] →" button. |
| `BudgetDropdowns.tsx` | Card 2: two native `<select>` for min/max (₹2K–₹30K+). Auto-save with 800ms debounce. Budget mismatch warning. |
| `AvailabilityCalendar.tsx` | Card 3: 6-week calendar grid. Colored dots per member. Tap cycles: free → could_work → unavailable → clear. Single-slot auto-save. ConfirmByBar with deadline + progress. |
| `PersonalPreferencesCard.tsx` | Card 4: segmented buttons (accommodation/transport/dining), activity pills, daily budget range, notes. Auto-save with 1s debounce. "Saved ✓" indicator. |

### Kept from previous versions
| File | Purpose |
|------|---------|
| `Header.tsx` | Fixed header with "Groupism" branding |
| `DestinationCard.tsx` | Vote-style card (still in codebase, not used in V4 TripRoom) |
| `MapBackground.tsx` | Leaflet map background with geolocation |
| `v2/AvailabilityInput.tsx` | Legacy calendar (kept as reference) |
| `v2/BudgetPreferenceForm.tsx` | Legacy preference form (kept as reference) |

### UI Primitives (`components/ui/`)
- `button.tsx` — Variants: amber, outline-strong, ghost, destructive
- `sonner.tsx` — Sonner toast wrapper
- `toast.tsx` / `toaster.tsx` — Radix UI toast primitives
- `tooltip.tsx` — Radix UI tooltip

---

## 6. Trip Room Layout

```
┌──────────────────────────────────────┐
│ Header (trip name + share link)      │
│ MemberCirclesRow                     │
│                                      │
│ Card 1: DestinationSearchCard        │ ← always active
│   [budget mismatch warning]          │ ← conditional
│                                      │
│ Card 2: BudgetDropdowns              │ ← disabled until destination selected
│                                      │
│ Card 3: AvailabilityCalendar         │ ← disabled until budget set
│                                      │
│ Card 4: PersonalPreferencesCard      │ ← always active
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

TripRoom subscribes to 5 Supabase Realtime channels:

```typescript
channel
  .on('postgres_changes', { table: 'destination_votes', filter: `trip_id=eq.${trip.id}` }, fetchTrip)
  .on('postgres_changes', { table: 'trip_members', filter: `trip_id=eq.${trip.id}` }, fetchTrip)
  .on('postgres_changes', { event: 'UPDATE', table: 'trips', filter: `id=eq.${trip.id}` }, fetchTrip)
  .on('postgres_changes', { table: 'budget_preferences', filter: `trip_id=eq.${trip.id}` }, fetchTrip)
  .on('postgres_changes', { table: 'availability_slots', filter: `trip_id=eq.${trip.id}` }, fetchTrip)
```

Also refetches on tab focus (`visibilitychange` event).

---

## 9. Gemini AI Functions

| Function | File | Purpose |
|----------|------|---------|
| `getDestinationSuggestions` | gemini.ts | Legacy: 3 destination cards with pros/cons/cost |
| `estimateBudget` | gemini.ts | Per-person budget breakdown with divergence flags |
| `rankTravelWindows` | gemini.ts | Top 3 travel windows scored 0-100 |
| `getDestinationSummary` | gemini.ts | **V4 NEW:** Two modes — AI suggest (3 names) or search (full summary with cost breakdown) |

### getDestinationSummary details

**AI mode** (`source: 'ai'`, `query: null`):
```json
{ "suggestions": ["Goa", "Manali", "Pondicherry"] }
```

**Search mode** (`source: 'search'`, `query: "Goa"`):
```json
{
  "destination": {
    "name": "Goa",
    "tagline": "one honest, punchy sentence",
    "highlights": ["...", "...", "..."],
    "watch_out": ["...", "..."],
    "cost_breakdown": {
      "flights_min": 4000, "flights_max": 8000,
      "hotel_per_night_min": 800, "hotel_per_night_max": 2000,
      "food_per_day_min": 500, "food_per_day_max": 1200,
      "activities_min": 1000, "activities_max": 3000,
      "total_min": 12000, "total_max": 28000
    },
    "nights": 3
  }
}
```

---

## 10. Auth & Token System

Unchanged from Draft 3.

- **Join token:** URL-safe slug from trip name (e.g., `goa-march-26-a3f`)
- **Organiser token:** Random hex, stored in DB `trips.organiser_token`, sent via `x-organiser-token` header
- **Member token:** Random hex, stored in DB `trip_members.member_token`, sent via `x-member-token` header
- **Client storage:** `localStorage('triphaus:<joinToken>')` → `{ memberToken, memberId, organiserToken? }`
- **Timing-safe comparison** for organiser token via `crypto.timingSafeEqual`

---

## 11. Bugs & Mistakes Log

### V4-specific bugs found and fixed during implementation

1. **PersonalPreferencesCard used display labels instead of DB enum values**
   - Options were `"Budget"`, `"Mid-range"` but backend expects `"budget"`, `"mid"`, `"premium"`
   - Fix: Changed to `{ value: "budget", label: "Budget" }` objects

2. **AvailabilityCalendar misused useMemo for side effects**
   - `useMemo(() => { setLocalSlots(availSlots) }, [availSlots])` — setState inside useMemo is invalid
   - Fix: Replaced with `useEffect`

3. **DestinationSearchCard didn't unwrap API response**
   - Gemini returns `{ destination: { name, tagline, ... } }` but component expected top-level
   - Fix: Added `const summary = res.destination ?? res;`

4. **CostRow expected wrong field shapes**
   - Expected nested `costBreakdown.flights.min` but API returns flat `flights_min`
   - Fix: Changed CostRow to accept `min`/`max` props directly

### Earlier bugs (from Draft 3)
5. **ENV var mismatch on Railway** — `SUPABASE_URL` vs `SUPABASE_PROJECT_URL` → Fixed in supabase.ts with fallback

---

## 12. Complete Code

### File Map

```
backend/
├── src/
│   ├── app.ts                    Express app setup, CORS, routes, error handling
│   ├── index.ts                  Server entrypoint (app.listen)
│   ├── lib/
│   │   ├── gemini.ts             4 AI functions (suggestions, budget, windows, summary)
│   │   ├── supabase.ts           Lazy-init Supabase client with env var fallback
│   │   └── tokens.ts             Token generation (organiser, member, join)
│   ├── middleware/
│   │   └── tokens.ts             loadTrip, requireMember, requireOrganiser
│   └── routes/
│       ├── trips.ts              POST (create), PATCH (update), GET (fetch all)
│       ├── members.ts            join, confirm, nudge
│       ├── destinations.ts       list, add, vote, summary (V4)
│       ├── ai.ts                 Legacy AI suggestions
│       ├── budget.ts             preferences, estimate
│       ├── availability.ts       slots (batch + single V4), windows
│       └── deadlines.ts          set, lock, fetch
├── supabase/
│   ├── migration.sql
│   ├── migration_v2.sql
│   ├── migration_v3_trips_realtime.sql
│   └── migration_v4_trip_redesign.sql

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
│   │   └── use-toast.ts          Toast state management
│   ├── pages/
│   │   ├── Index.tsx             Landing page
│   │   ├── CreateTrip.tsx        Create trip form (V4: sends group_size)
│   │   ├── JoinTrip.tsx          Join via invite link
│   │   ├── TripRoom.tsx          V4: 4-card layout
│   │   └── NotFound.tsx          404
│   └── components/
│       ├── Header.tsx            Fixed header
│       ├── MapBackground.tsx     Leaflet background
│       ├── MemberCirclesRow.tsx  V4: member initials
│       ├── DestinationSearchCard.tsx  V4: Card 1
│       ├── BudgetDropdowns.tsx   V4: Card 2
│       ├── AvailabilityCalendar.tsx   V4: Card 3
│       ├── PersonalPreferencesCard.tsx V4: Card 4
│       ├── DestinationCard.tsx   Legacy vote card (kept)
│       ├── NavLink.tsx           Nav link component
│       ├── v2/
│       │   ├── AvailabilityInput.tsx    Legacy (kept as reference)
│       │   └── BudgetPreferenceForm.tsx Legacy (kept as reference)
│       └── ui/
│           ├── button.tsx
│           ├── sonner.tsx
│           ├── toast.tsx
│           ├── toaster.tsx
│           └── tooltip.tsx
```

---

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

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/debug/env-check', (_req, res) => {
  const vars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'GEMINI_API_KEY', 'FRONTEND_URL', 'PORT', 'NODE_ENV'];
  res.json(Object.fromEntries(vars.map(k => [k, process.env[k] ? 'SET' : 'MISSING'])));
});

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

app.use(express.json({ limit: '10kb' }));

app.use('/api/trips',                         tripsRouter);
app.use('/api/trips/:joinToken',              membersRouter);
app.use('/api/trips/:joinToken/destinations', destinationsRouter);
app.use('/api/trips/:joinToken/ai-suggest',   aiRouter);
app.use('/api/trips/:joinToken/budget',       budgetRouter);
app.use('/api/trips/:joinToken/availability', availabilityRouter);
app.use('/api/trips/:joinToken/deadlines',    deadlinesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Unhandled error:', err.stack || err.message);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException',  err    => console.error('Uncaught exception:', err));
process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));

export default app;
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
      name, budget_min, budget_max, travel_from, travel_to,
      deadline, organiser_name, group_size,
    } = req.body;

    if (!name || !organiser_name) {
      return res.status(400).json({ error: 'name and organiser_name are required' });
    }
    if (name.length > 100) return res.status(400).json({ error: 'Trip name must be 100 characters or fewer' });
    if (organiser_name.length > 50) return res.status(400).json({ error: 'Organiser name must be 50 characters or fewer' });
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

    const tripData: Record<string, any> = { name, join_token, organiser_token };
    if (budget_min  != null) tripData.budget_min  = budget_min;
    if (budget_max  != null) tripData.budget_max  = budget_max;
    if (travel_from)         tripData.travel_from = travel_from;
    if (travel_to)           tripData.travel_to   = travel_to;
    if (deadline)            tripData.deadline    = deadline;
    if (group_size != null)  tripData.group_size  = Number(group_size);

    const { data: trip, error } = await supabase
      .from('trips').insert(tripData).select().single();

    if (error?.code === '23505') {
      join_token = generateJoinToken(name);
      tripData.join_token = join_token;
      const retry = await supabase.from('trips').insert(tripData).select().single();
      if (retry.error) return res.status(500).json({ error: 'Failed to create trip', detail: retry.error.message });

      const { data: member, error: memberErr } = await supabase
        .from('trip_members')
        .insert({ trip_id: retry.data.id, display_name: organiser_name, member_token, is_organiser: true })
        .select().single();
      if (memberErr) return res.status(500).json({ error: 'Failed to register organiser', detail: memberErr.message });

      return res.status(201).json({
        trip_id: retry.data.id, join_token: retry.data.join_token,
        join_url: `${process.env.FRONTEND_URL}/join/${retry.data.join_token}`,
        organiser_token, member_token, member_id: member?.id,
      });
    }

    if (error) return res.status(500).json({ error: 'Failed to create trip', detail: error.message });
    if (!trip) return res.status(500).json({ error: 'Failed to create trip', detail: 'No data returned' });

    const { data: member, error: memberErr } = await supabase
      .from('trip_members')
      .insert({ trip_id: trip.id, display_name: organiser_name, member_token, is_organiser: true })
      .select().single();
    if (memberErr) return res.status(500).json({ error: 'Failed to register organiser', detail: memberErr.message });

    res.status(201).json({
      trip_id: trip.id, join_token: trip.join_token,
      join_url: `${process.env.FRONTEND_URL}/join/${trip.join_token}`,
      organiser_token, member_token, member_id: member?.id,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Trip creation failed', detail: err.message });
  }
});

// PATCH /api/trips/:joinToken
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

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

  const { data, error } = await supabase.from('trips').update(updates).eq('id', trip.id).select().single();
  if (error) return res.status(500).json({ error: 'Failed to update trip' });

  const { organiser_token: _omit, ...safeTrip } = data;
  res.json({ trip: safeTrip });
});

// GET /api/trips/:joinToken
router.get('/:joinToken', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const [
    { data: members }, { data: destinations }, { data: budgetPrefs },
    { data: budgetEstimate }, { data: availSlots }, { data: travelWindows },
    { data: deadlines },
  ] = await Promise.all([
    supabase.from('trip_members').select('id, display_name, is_organiser, has_confirmed, confirmed_at, joined_at').eq('trip_id', trip.id).order('joined_at', { ascending: true }),
    supabase.from('destination_options').select(`id, name, tagline, pros, cons, best_for, estimated_cost_min, estimated_cost_max, source, created_at, destination_votes(member_id)`).eq('trip_id', trip.id).order('created_at', { ascending: true }),
    supabase.from('budget_preferences').select('*, trip_members(id, display_name)').eq('trip_id', trip.id),
    supabase.from('budget_estimates').select('*').eq('trip_id', trip.id).maybeSingle(),
    supabase.from('availability_slots').select('*, trip_members(id, display_name)').eq('trip_id', trip.id),
    supabase.from('travel_windows').select('*').eq('trip_id', trip.id).maybeSingle(),
    supabase.from('deadlines').select('*').eq('trip_id', trip.id),
  ]);

  // Auto-lock past-due deadlines
  const now = new Date().toISOString().slice(0, 10);
  const pastDueUnlocked = (deadlines || []).filter((dl: any) => !dl.locked && dl.due_date < now);
  if (pastDueUnlocked.length > 0) {
    await Promise.all(pastDueUnlocked.map((dl: any) => supabase.from('deadlines').update({ locked: true }).eq('id', dl.id)));
    for (const dl of pastDueUnlocked) dl.locked = true;
  }

  const destinationsWithVotes = (destinations || []).map((d: any) => ({
    ...d, votes: d.destination_votes?.length ?? 0,
    voter_member_ids: (d.destination_votes || []).map((v: any) => v.member_id),
    destination_votes: undefined,
  }));

  const memberIds = new Set((members || []).map((m: any) => m.id));
  const total = memberIds.size;
  const votedMemberIds = new Set<string>();
  for (const d of destinations || []) for (const v of (d as any).destination_votes || []) if (memberIds.has(v.member_id)) votedMemberIds.add(v.member_id);

  const voted = votedMemberIds.size;
  const confirmed = (members || []).filter((m: any) => m.has_confirmed).length;
  const readiness = total === 0 ? 0 : Math.round((voted / total) * 50 + (confirmed / total) * 50);
  const submittedAvailability = new Set((availSlots || []).map((s: any) => s.member_id)).size;
  const submittedBudget = new Set((budgetPrefs || []).map((p: any) => p.member_id)).size;
  const readinessV2 = total === 0 ? 0 : Math.round((voted / total) * 25 + (submittedAvailability / total) * 25 + (submittedBudget / total) * 25 + (confirmed / total) * 25);

  const { organiser_token: _omit, ...safeTrip } = trip;

  res.json({
    trip: safeTrip, members: members ?? [], destinations: destinationsWithVotes,
    readiness_score: readiness, members_voted: voted, members_confirmed: confirmed,
    budget_preferences: budgetPrefs ?? [], budget_estimate: budgetEstimate ?? null,
    availability_slots: availSlots ?? [], travel_windows: travelWindows ?? null,
    deadlines: deadlines ?? [], readiness_v2: readinessV2,
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

router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;
  const { data, error } = await supabase.from('destination_options').select('*, destination_votes(member_id)').eq('trip_id', trip.id).order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: 'Failed to fetch destinations' });

  const destinations = (data || []).map((d: any) => ({
    id: d.id, name: d.name, tagline: d.tagline, pros: d.pros, cons: d.cons,
    best_for: d.best_for, estimated_cost_min: d.estimated_cost_min,
    estimated_cost_max: d.estimated_cost_max, source: d.source,
    votes: d.destination_votes?.length ?? 0,
    voter_member_ids: (d.destination_votes || []).map((v: any) => v.member_id),
  }));
  res.json({ destinations });
});

router.post('/', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const { name, tagline, pros, cons, best_for, estimated_cost_min, estimated_cost_max } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await supabase.from('destination_options')
    .insert({ trip_id: trip.id, name, tagline, pros, cons, best_for, estimated_cost_min, estimated_cost_max, source: 'manual' })
    .select().single();
  if (error) return res.status(500).json({ error: 'Failed to add destination' });
  res.status(201).json({ destination: data });
});

// V4 NEW: AI destination summary
router.post('/summary', loadTrip, async (req, res) => {
  const trip = (req as any).trip;
  const { query, source } = req.body;

  if (!source || !['search', 'ai'].includes(source)) return res.status(400).json({ error: 'source must be "search" or "ai"' });
  if (source === 'search' && !query) return res.status(400).json({ error: 'query is required for search mode' });

  const groupSize = trip.group_size ?? 4;
  const nights = trip.travel_from && trip.travel_to
    ? Math.max(1, Math.ceil((new Date(trip.travel_to).getTime() - new Date(trip.travel_from).getTime()) / 86400000))
    : 3;

  try {
    const result = await getDestinationSummary({ query: query || null, source, groupSize, nights, budgetMin: trip.budget_min ?? undefined, budgetMax: trip.budget_max ?? undefined });
    res.json(result);
  } catch {
    res.status(503).json({ error: 'AI unavailable. Try searching manually.' });
  }
});

router.post('/:destId/vote', loadTrip, requireMember, async (req, res) => {
  const trip = (req as any).trip;
  const member = (req as any).member;
  const { destId } = req.params;

  const { data: dest } = await supabase.from('destination_options').select('id').eq('id', destId).eq('trip_id', trip.id).single();
  if (!dest) return res.status(404).json({ error: 'Destination not found in this trip' });

  const { error } = await supabase.from('destination_votes').upsert({ trip_id: trip.id, destination_id: destId, member_id: member.id }, { onConflict: 'trip_id,member_id' });
  if (error) return res.status(500).json({ error: 'Failed to cast vote' });
  res.json({ voted: true, destination_id: destId });
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

router.post('/', loadTrip, requireMember, async (req, res) => {
  const trip = (req as any).trip;
  const member = (req as any).member;
  const { slot, slots } = req.body;

  // V4: Single-slot upsert mode
  if (slot) {
    if (!slot.date) return res.status(400).json({ error: 'slot.date is required' });
    if (slot.tier === null) {
      const { error } = await supabase.from('availability_slots').delete().eq('trip_id', trip.id).eq('member_id', member.id).eq('slot_date', slot.date);
      if (error) return res.status(500).json({ error: 'Failed to clear slot' });
      return res.json({ saved: 1, cleared: true });
    }
    if (!VALID_TIERS.includes(slot.tier)) return res.status(400).json({ error: 'slot.tier must be unavailable, free, or could_work' });
    const { error } = await supabase.from('availability_slots').upsert({ trip_id: trip.id, member_id: member.id, slot_date: slot.date, tier: slot.tier }, { onConflict: 'trip_id,member_id,slot_date' });
    if (error) return res.status(500).json({ error: 'Failed to save slot' });
    return res.json({ saved: 1 });
  }

  // Batch replacement mode (existing)
  if (!Array.isArray(slots) || slots.length === 0) return res.status(400).json({ error: 'slots must be a non-empty array, or provide a single slot object' });
  for (const slot of slots) {
    if (!slot.date || !VALID_TIERS.includes(slot.tier)) return res.status(400).json({ error: 'Each slot must have a date and tier' });
  }

  const { error: deleteError } = await supabase.from('availability_slots').delete().eq('trip_id', trip.id).eq('member_id', member.id);
  if (deleteError) return res.status(500).json({ error: 'Failed to clear existing slots' });

  const { data, error } = await supabase.from('availability_slots')
    .insert(slots.map((s: any) => ({ trip_id: trip.id, member_id: member.id, slot_date: s.date, tier: s.tier })))
    .select();
  if (error) return res.status(500).json({ error: 'Failed to save availability' });
  res.json({ slots: data });
});

router.post('/windows', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const [{ data: members }, { data: slots }] = await Promise.all([
    supabase.from('trip_members').select('id, display_name').eq('trip_id', trip.id),
    supabase.from('availability_slots').select('*').eq('trip_id', trip.id),
  ]);
  if (!slots || slots.length === 0) return res.status(400).json({ error: 'No availability data submitted yet' });

  let tripDuration = 3;
  if (trip.travel_from && trip.travel_to) {
    tripDuration = Math.max(1, Math.round((new Date(trip.travel_to).getTime() - new Date(trip.travel_from).getTime()) / (1000 * 60 * 60 * 24)));
  }

  try {
    const windows = await rankTravelWindows({
      members: (members || []).map((m: any) => ({ id: m.id, display_name: m.display_name })),
      slots: slots.map((s: any) => ({ member_id: s.member_id, date: s.slot_date, tier: s.tier })),
      trip_duration: tripDuration,
    });
    const { data, error } = await supabase.from('travel_windows').upsert({ trip_id: trip.id, windows }, { onConflict: 'trip_id' }).select().single();
    if (error) return res.status(500).json({ error: 'Failed to save windows' });
    res.json({ windows: data });
  } catch (err: any) {
    if (err.message === 'AI_UNAVAILABLE') return res.status(503).json({ error: 'AI analysis unavailable right now.' });
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

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

### backend/src/lib/gemini.ts (V4 addition: getDestinationSummary)

```typescript
// ... (getDestinationSuggestions, estimateBudget, rankTravelWindows unchanged)

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
    // AI suggest mode → returns 3 destination names
    const prompt = `You are a travel expert for Indian domestic group travel.
Group size: ${params.groupSize} people. Trip duration: ${params.nights} nights. ${budgetContext}
Suggest exactly 3 destination names. Return ONLY valid JSON: { "suggestions": ["Dest1", "Dest2", "Dest3"] }`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
  }

  // Search mode → returns full summary with cost breakdown
  const prompt = `You are a travel expert for Indian domestic group travel.
Destination: ${params.query}. Group size: ${params.groupSize}. Duration: ${params.nights} nights. ${budgetContext}
Generate destination summary + cost breakdown (flights, hotel/night, food/day, activities, total). All INR per person.
Return ONLY valid JSON: { "destination": { "name", "tagline", "highlights": [3], "watch_out": [2], "cost_breakdown": { flights_min/max, hotel_per_night_min/max, food_per_day_min/max, activities_min/max, total_min/max }, "nights" } }`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
}
```

### backend/supabase/migration_v4_trip_redesign.sql

```sql
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS group_size integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS selected_destination_id uuid REFERENCES destination_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_summary jsonb;
```

### frontend/src/pages/TripRoom.tsx (V4 rewrite)

```typescript
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import Header from "@/components/Header";
import MemberCirclesRow from "@/components/MemberCirclesRow";
import DestinationSearchCard from "@/components/DestinationSearchCard";
import BudgetDropdowns from "@/components/BudgetDropdowns";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import PersonalPreferencesCard from "@/components/PersonalPreferencesCard";
import { cn } from "@/lib/utils";
import { api, getTokens } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// ... (interfaces, helpers)

const TripRoom = () => {
  const { id: joinToken } = useParams<{ id: string }>();
  // ... state, fetchTrip, Realtime subscriptions, tab focus refetch

  // Card gating
  const card2Enabled = trip.selected_destination_id !== null;
  const card3Enabled = trip.budget_min !== null;

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="max-w-2xl mx-auto px-6 pt-24 pb-32">
        {/* Trip header + share link */}
        <MemberCirclesRow members={members} groupSize={trip.group_size || members.length} currentMemberId={currentMemberId} />

        {/* Card 1 — Destination */}
        <DestinationSearchCard joinToken={joinToken!} trip={trip} isOrganiser={isOrganiser} onTripUpdated={fetchTrip} />

        {/* Budget mismatch warning */}

        {/* Card 2 — Budget */}
        <BudgetDropdowns joinToken={joinToken!} trip={trip} isOrganiser={isOrganiser} onTripUpdated={fetchTrip} disabled={!card2Enabled} />

        {/* Card 3 — Availability */}
        <AvailabilityCalendar joinToken={joinToken!} trip={trip} members={members} availSlots={availSlots} currentMemberId={currentMemberId} isOrganiser={isOrganiser} onTripUpdated={fetchTrip} disabled={!card3Enabled} />

        {/* Card 4 — Personal Preferences */}
        <PersonalPreferencesCard joinToken={joinToken!} existingPrefs={myPrefs} onRefresh={fetchTrip} />
      </div>

      {/* Sticky "I'm in" button */}
      <div className="fixed bottom-0 left-0 right-0 ...">
        {!hasConfirmed ? <button onClick={handleConfirm}>I'm in</button> : <div>✓ You're in</div>}
      </div>
    </div>
  );
};
```

### frontend/src/pages/CreateTrip.tsx (V4 change: sends group_size)

```typescript
const handleCreate = async () => {
  const trip = await api.post("/api/trips", {
    name: tripName,
    organiser_name: organiserName || "Organiser",
    group_size: groupSize,  // ← V4 addition
  });
  // ... setTokens, navigate
};
```

### frontend/src/components/DestinationSearchCard.tsx

See full code in source — 488 lines. Key sub-components:
- `LoadingShimmer` — 3 shimmer bars with animated gradient
- `PlaceSummaryCard` — destination name (4xl), tagline, highlights/watch-outs, cost breakdown table
- `CostRow` — single cost line with label, range, suffix
- `formatRange` — INR currency formatting with en-IN locale

### frontend/src/components/AvailabilityCalendar.tsx

See full code in source — 396 lines. Key features:
- 42-day (6 week) grid anchored to trip's travel_from date
- Colored dots per member (green/amber/terra) with overflow indicator (+N)
- Tap-to-cycle: free → could_work → unavailable → clear
- Optimistic updates with revert-on-error
- ConfirmByBar: organiser date picker + progress bar

### frontend/src/components/PersonalPreferencesCard.tsx

See full code in source — 297 lines. Key features:
- Segmented buttons with DB enum values (budget/mid/premium, bus_train/flight/self_drive, etc.)
- Activity pills (toggle on/off)
- 1s debounce auto-save, "Saved ✓" indicator

---

## 13. Git History

```
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

## 14. What Works Today

- [x] Create trip with group_size → DB stores it
- [x] Member circles show filled (initials) + empty (dashed) based on group_size
- [x] Search destination → AI returns summary with cost breakdown
- [x] "Let AI suggest" → 3 destination name chips → click one → full summary
- [x] "Select [dest] →" creates destination_option row, PATCHes trip with selected_destination_id + destination_summary
- [x] "← Change destination" returns to search
- [x] Card 2 (Budget) unlocks after destination selected
- [x] Budget dropdowns auto-save with 800ms debounce
- [x] Budget mismatch warning shows when budget < estimated cost
- [x] Card 3 (Availability) unlocks after budget set
- [x] Availability calendar: tap cycles tiers, auto-saves single slot
- [x] Multi-member colored dots via Supabase Realtime
- [x] Confirm-by date picker (organiser) + submission progress bar
- [x] Personal preferences auto-save with 1s debounce, "Saved ✓" indicator
- [x] Sticky "I'm in" / "You're in" bottom bar
- [x] Share link copies invite URL to clipboard
- [x] Realtime subscriptions for cross-device updates
- [x] Tab focus refetch
- [x] TypeScript compiles with 0 errors
- [x] Vite production build succeeds (628KB → 195KB gzipped)

---

## 15. Known Issues & Next Steps

### Known issues
1. **Migration not yet confirmed:** `migration_v4_trip_redesign.sql` needs to be run in Supabase SQL Editor
2. **Legacy files still in codebase:** `DestinationCard.tsx`, `v2/AvailabilityInput.tsx`, `v2/BudgetPreferenceForm.tsx`, `NavLink.tsx` — not used in V4 but not deleted
3. **Budget preferences validation:** Backend requires all 3 tier fields (accommodation, transport, dining) — auto-save will fail if user only fills one field
4. **No date picker for travel_from/travel_to:** Currently only settable if organiser used the old setup panel flow. No UI for setting dates in V4 layout.
5. **debug/env-check endpoint** still active (should be removed for production)
6. **Currency hardcoded to INR** — not configurable
7. **No loading state for individual card saves** — only toast on error

### Next steps
- Add travel dates UI to TripRoom (date pickers or inline in Card 2)
- Delete remaining legacy files
- Remove debug endpoint
- Add member preference summary view for organiser
- Mobile responsive testing
- E2E flow testing on production
