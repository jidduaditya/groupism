# Groupism — Draft 2: V2 Features + Create Flow Restructure

**Date:** 2 April 2026
**Status:** V1 stable, V2 features live (budget estimation, availability, deadlines, readiness), create flow restructured with organiser setup panel
**Previous:** Draft1 — initial backend + frontend, AI suggestions, 9 delta bug fixes

---

## Table of Contents

1. [What Changed Since Draft 1](#1-what-changed-since-draft-1)
2. [Current Architecture](#2-current-architecture)
3. [Database Schema — V2 Additions](#3-database-schema--v2-additions)
4. [New API Endpoints](#4-new-api-endpoints)
5. [V2 Frontend Components](#5-v2-frontend-components)
6. [Create Flow Restructure](#6-create-flow-restructure)
7. [Organiser Setup Panel](#7-organiser-setup-panel)
8. [Version Toggle (v1/v2)](#8-version-toggle-v1v2)
9. [Realtime Subscriptions](#9-realtime-subscriptions)
10. [Gemini AI — New Functions](#10-gemini-ai--new-functions)
11. [Bugs & Mistakes Log](#11-bugs--mistakes-log)
12. [Current File Map](#12-current-file-map)
13. [Git History](#13-git-history)
14. [What Works Today](#14-what-works-today)
15. [Known Issues & Next Steps](#15-known-issues--next-steps)

---

## 1. What Changed Since Draft 1

| Area | Draft 1 | Draft 2 |
|------|---------|---------|
| Create flow | 3-step wizard (name+budget → dates → AI) on `/create` | Single page (name, organiser, group size) → navigate to TripRoom immediately |
| Budget/Dates/AI | Set during trip creation | Set progressively in TripRoom via organiser setup panel |
| V2 features | Not implemented | Budget estimation, availability mapping, travel windows, deadlines, group readiness — all behind v1/v2 toggle |
| Realtime | destination_votes, trip_members | + budget_preferences, availability_slots, deadlines, trips |
| Gemini | getDestinationSuggestions only | + estimateBudget, rankTravelWindows |
| DB tables | 5 tables (trips, trip_members, destination_options, destination_votes, nudge_log) | + 5 V2 tables (budget_preferences, budget_estimates, availability_slots, travel_windows, deadlines) |
| Backend routes | trips, members, destinations, ai | + budget, availability, deadlines, PATCH trips |

---

## 2. Current Architecture

```
┌─────────────────┐     REST API     ┌─────────────────┐     SQL      ┌──────────────┐
│   React/Vite    │ ──────────────── │  Express/TS     │ ──────────── │   Supabase   │
│   Vercel        │   fetch + JSON   │  Railway        │  supabase-js │   PostgreSQL │
└────────┬────────┘                  └────────┬────────┘              └──────┬───────┘
         │                                    │                              │
         │ Supabase Realtime (WebSocket)      │ Gemini API                   │ Realtime
         └────────────────────────────────────┴──────────────────────────────┘
```

**Deployment:**
- Frontend: Vercel (`groupism-p9g9.vercel.app`)
- Backend: Railway (`groupism-production.up.railway.app`)
- DB: Supabase (PostgreSQL + Realtime)

**Auth model:** Unchanged — `x-member-token` + `x-organiser-token` in HTTP headers, stored in localStorage per trip.

---

## 3. Database Schema — V2 Additions

### V1 tables (unchanged from Draft 1)
- `trips` — id, name, join_token, organiser_token, budget_min/max (nullable), travel_from/to (nullable), deadline (nullable)
- `trip_members` — id, trip_id, display_name, member_token, is_organiser, has_confirmed
- `destination_options` — id, trip_id, name, tagline, pros/cons (jsonb), best_for, estimated_cost, source
- `destination_votes` — trip_id + member_id (unique), destination_id
- `nudge_log` — trip_id, target_member_id, sent_at

### V2 tables (new)

```sql
budget_preferences (trip_id, member_id unique)
├── accommodation_tier  text CHECK ('budget','mid','premium')
├── transport_pref      text CHECK ('bus_train','flight','self_drive')
├── dining_style        text CHECK ('local_cheap','mixed','restaurants')
├── activities          text[]
├── daily_budget_min/max numeric
└── notes               text

budget_estimates (trip_id unique)
├── per_person_min/max  numeric
├── breakdown           jsonb  {accommodation/transport/food/activities → {min,max,note}}
├── divergence_flags    jsonb  [{issue, gap_description}]
└── members_included    int

availability_slots (trip_id, member_id, slot_date unique)
├── slot_date           date
└── tier                text CHECK ('unavailable','free','could_work')

travel_windows (trip_id unique)
└── windows             jsonb  [{start_date, end_date, nights, score, summary, ...}]

deadlines (trip_id, item_type unique)
├── item_type           text CHECK ('destination_vote','availability','budget_input','confirmation')
├── due_date            date
└── locked              boolean (auto-locks when past due)
```

### Realtime publications
Enabled: `budget_preferences`, `availability_slots`, `deadlines`, `trips`, `destination_votes`, `trip_members`

### Migration files
- `backend/supabase/migration.sql` — V1 schema
- `backend/supabase/migration_v2.sql` — V2 tables + Realtime (idempotent)
- `backend/supabase/migration_v3_trips_realtime.sql` — trips Realtime publication

---

## 4. New API Endpoints

### PATCH /api/trips/:joinToken (new)
- **Auth:** requireOrganiser
- **Purpose:** Organiser updates budget, dates, deadline after trip creation
- **Body:** `{ budget_min?, budget_max?, travel_from?, travel_to?, deadline? }`
- **Response:** `{ trip }` (organiser_token omitted)

### POST /api/trips/:joinToken/budget/preferences
- **Auth:** requireMember
- **Body:** `{ accommodation_tier, transport_pref, dining_style, activities[], daily_budget_min, daily_budget_max, notes? }`
- **Upserts** one row per trip+member

### POST /api/trips/:joinToken/budget/estimate
- **Auth:** requireOrganiser
- **Requires:** ≥1 budget preference submitted
- **Calls:** `estimateBudget()` (Gemini) with top-voted destination + all preferences
- **Upserts** budget_estimates row

### GET /api/trips/:joinToken/budget
- Returns `{ preferences[], estimate }`

### POST /api/trips/:joinToken/availability
- **Auth:** requireMember
- **Body:** `{ slots: [{ date, tier }] }`
- **Deletes** old slots for this member, inserts new batch

### POST /api/trips/:joinToken/availability/windows
- **Auth:** requireOrganiser
- **Calls:** `rankTravelWindows()` (Gemini)
- **Upserts** travel_windows row

### GET /api/trips/:joinToken/availability
- Returns `{ slots[], windows }`

### POST /api/trips/:joinToken/deadlines
- **Auth:** requireOrganiser
- **Body:** `{ deadlines: [{ item_type, due_date }] }`
- **Upserts** per item_type

### POST /api/trips/:joinToken/deadlines/lock/:itemType
- **Auth:** requireOrganiser
- Sets `locked = true`

### GET /api/trips/:joinToken/deadlines
- Returns `{ deadlines[] }`

### GET /api/trips/:joinToken (extended)
- Now returns V2 data in addition to V1:
  - `budget_preferences`, `budget_estimate`, `availability_slots`, `travel_windows`, `deadlines`
  - `readiness_v2` (4-dimension: voted 25% + availability 25% + budget 25% + confirmed 25%)
  - Auto-locks past-due deadlines on every GET

---

## 5. V2 Frontend Components

All in `frontend/src/components/v2/`:

| Component | Purpose | Props |
|-----------|---------|-------|
| `TripRoomV2Sections.tsx` | Orchestrator — renders all V2 sections in order | All trip data + handlers |
| `GroupReadinessPanel.tsx` | 4-dimension member matrix (dest/avail/budget/confirm) + readiness bar | members, readinessV2, currentMemberId |
| `BudgetPreferenceForm.tsx` | 3 segmented controls + activity pills + budget range | joinToken, onSubmitted |
| `BudgetEstimateDisplay.tsx` | AI estimate display: total, breakdown table, divergence flags | estimate, isOrganiser |
| `AvailabilityInput.tsx` | 6-week calendar grid, tap to cycle tiers (free/could_work/unavailable) | joinToken, tripFrom/To |
| `TravelWindowsDisplay.tsx` | Top 3 ranked travel windows from AI | windows, isOrganiser |
| `DeadlineManager.tsx` | Organiser sets deadlines per item_type | joinToken, deadlines |
| `DeadlineCountdown.tsx` | Inline badge: "Due in X days" / "Due today" / "Closed" | deadline object |

---

## 6. Create Flow Restructure

### Before (Draft 1)
```
/create → Step 1: Name + Budget + Organiser name + Group size
        → Step 2: Travel dates + Confirm-by date
        → Step 3: AI suggestions (Gemini call, skeleton loading)
        → "Create Trip Room" button → POST /api/trips → /trip/:joinToken
```

### After (Draft 2)
```
/create → Name + Organiser name + Group size only
        → "Create Trip Room →" button → POST /api/trips → /trip/:joinToken

/trip/:joinToken (organiser, first visit)
        → Setup Panel: Budget → Dates → AI (progressive, collapsing sections)
        → Trip Room becomes live once organiser completes setup
```

**Key change:** `CreateTrip.tsx` went from 400 lines to ~100 lines. Budget, dates, AI moved to `OrganiserSetupPanel.tsx`.

**group_size** is saved to `localStorage('triphaus:${joinToken}:group_size')` during creation, read back in setup panel for the AI call.

---

## 7. Organiser Setup Panel

**File:** `frontend/src/components/OrganiserSetupPanel.tsx`

Three sequential sections that expand one at a time:

### Section 1 — Budget
- Min/max number inputs (₹)
- Preset pills: ₹5K (3K-5K), ₹10K (7K-10K), ₹15K (10K-15K), ₹25K+ (18K-25K)
- Save → `PATCH /api/trips/:joinToken` with `{ budget_min, budget_max }`
- Collapses to: `₹3,000 – ₹5,000 per person  ✓` (green mono)

### Section 2 — Dates
- FROM, TO, Confirm-by date inputs
- Save → `PATCH /api/trips/:joinToken` with `{ travel_from, travel_to, deadline }`
- Collapses to: `15 Apr – 20 Apr  ·  Confirm by 10 Apr  ✓` (green mono)

### Section 3 — AI Suggestions
- Optional textarea for group notes
- "Get AI Suggestions" button (font-display, h-52px)
- Loading: 3 shimmer skeleton cards + cycling copy (1.5s): "Reading the vibe..." → "Checking travel windows..." → "Writing honest tradeoffs..."
- On success: destination cards with staggered fade-in → panel dismisses
- "Skip — I'll add destinations manually" link
- On 503 (Gemini down): inline error + continue link

### Panel visibility logic
```typescript
const showSetupPanel = isOrganiser && !setupDismissed && (
  trip.budget_min === null || trip.travel_from === null || destinations.length === 0
);
```

**Resumes on reload:** derives initial step from trip data:
```typescript
const initialStep = trip.budget_min === null ? 'budget'
  : trip.travel_from === null ? 'dates' : 'ai';
```

### Non-organiser placeholder
When `trip.budget_min === null` and user is not organiser:
> The organiser is still setting up the trip. Check back in a moment.

Updates automatically via Realtime when organiser saves.

---

## 8. Version Toggle (v1/v2)

**Hook:** `frontend/src/hooks/useVersionToggle.ts`
- `localStorage('groupism:version')`, defaults to `'v1'`
- Returns `[version, toggleVersion]`

**UI:** Pill button in TripRoom header next to "Copy Link":
```
┌────┬────┐
│ v1 │ v2 │  ← amber highlight on active
└────┴────┘
```

**Rendering logic:**
- Header (trip name, subtitle, copy link, toggle) — shared
- `{version === 'v1' && !showSetupPanel && !tripNotReady && <V1Sections />}`
- `{version === 'v2' && !showSetupPanel && !tripNotReady && <TripRoomV2Sections />}`

---

## 9. Realtime Subscriptions

**File:** `frontend/src/pages/TripRoom.tsx` — Supabase channel `trip-${trip.id}`

| Table | Event | Trigger |
|-------|-------|---------|
| `destination_votes` | `*` | Vote cast/changed |
| `trip_members` | `*` | Member joins/confirms |
| `trips` | `UPDATE` | Organiser saves budget/dates |
| `budget_preferences` | `*` | Member submits prefs |
| `availability_slots` | `*` | Member submits availability |
| `deadlines` | `*` | Organiser sets/locks deadline |

All trigger `fetchTrip()` to refresh entire room state.

Additional: `visibilitychange` event refetches on tab focus.

**Required Realtime publications** (run in Supabase SQL Editor):
- `budget_preferences`, `availability_slots`, `deadlines`, `trips` — in migration_v2 + v3
- `destination_votes`, `trip_members` — must be manually enabled (see Bugs #4)

---

## 10. Gemini AI — New Functions

**File:** `backend/src/lib/gemini.ts` — Uses `gemini-2.5-flash`

### estimateBudget(params)
- **Input:** destination name, member preferences[], travel dates
- **Prompt:** Estimate per-person costs for an Indian group trip. Return breakdown (accommodation/transport/food/activities with min/max/note) and divergence_flags (conflicts between member preferences)
- **Output:** `{ per_person_min, per_person_max, breakdown, divergence_flags }`
- **Error:** throws `'AI_UNAVAILABLE'`

### rankTravelWindows(params)
- **Input:** members with names, all availability slots (with tiers), trip duration
- **Prompt:** Find top 3 windows maximizing group availability, score 0-100
- **Output:** `[{ start_date, end_date, nights, full_availability_count, stretching_members[], unavailable_members[], summary, score }]`
- **Error:** throws `'AI_UNAVAILABLE'`

### getDestinationSuggestions(params) — unchanged from Draft 1
- 3 destinations with name, tagline, pros/cons, best_for, estimated_cost

All functions strip markdown fences from Gemini response before JSON.parse.

---

## 11. Bugs & Mistakes Log

### Bug 1: Supabase Realtime publication duplicate (FIXED)
- **Error:** `relation "budget_preferences" is already member of publication "supabase_realtime"`
- **Cause:** `ALTER PUBLICATION ... ADD TABLE` is not idempotent — fails on re-run
- **Fix:** Wrapped in `DO $$ ... IF NOT EXISTS (SELECT FROM pg_publication_tables) ... END $$`
- **File:** `backend/supabase/migration_v2.sql`
- **Lesson:** Always make migration SQL idempotent

### Bug 2: POST /api/trips 500 on create (FIXED)
- **Error:** `Failed to load resource: 500` when clicking "Create Trip Room"
- **Cause:** After restructuring CreateTrip to only send `{ name, organiser_name }`, the POST handler still passed `budget_min`, `budget_max`, `travel_from`, `travel_to`, `deadline` as `undefined` to Supabase `.insert()`. Supabase JS client fails on explicit undefined values.
- **Fix:** Build insert object conditionally — only include optional fields when `!= null`
- **File:** `backend/src/routes/trips.ts` (lines 36-45)
- **Lesson:** When making fields optional, update every code path that constructs the DB insert — don't pass `undefined` to Supabase

### Bug 3: CORS rejection (FIXED in earlier commit)
- **Error:** CORS preflight failure on Vercel deploy
- **Cause:** `cors()` config was throwing on rejected origins
- **Fix:** Hardcoded Vercel origin + return `false` instead of throwing
- **File:** `backend/src/app.ts`

### Bug 4: Realtime not firing for votes/members (KNOWN)
- **Issue:** `destination_votes` and `trip_members` tables are NOT in the `supabase_realtime` publication
- **Impact:** Votes and member joins/confirms won't trigger Realtime updates across tabs
- **Fix needed:** Run SQL to add both tables to publication
- **Status:** Identified, fix SQL provided to user, not yet confirmed run

---

## 12. Current File Map

```
backend/
├── src/
│   ├── app.ts                          Express setup, CORS, route mounting
│   ├── index.ts                        Server startup (PORT 3001)
│   ├── lib/
│   │   ├── gemini.ts                   3 AI functions (destinations, budget, windows)
│   │   ├── supabase.ts                 Lazy-init Supabase client (service key)
│   │   └── tokens.ts                   Token generation (organiser, member, join)
│   ├── middleware/
│   │   └── tokens.ts                   loadTrip, requireMember, requireOrganiser
│   └── routes/
│       ├── trips.ts                    POST create, PATCH update, GET fetch-all
│       ├── members.ts                  POST join, confirm, nudge
│       ├── destinations.ts             GET, POST add, POST vote
│       ├── ai.ts                       POST ai-suggest
│       ├── budget.ts                   POST preferences, POST estimate, GET
│       ├── availability.ts             POST slots, POST windows, GET
│       └── deadlines.ts               POST set, POST lock, GET
├── supabase/
│   ├── migration.sql                   V1 schema (5 tables)
│   ├── migration_v2.sql                V2 schema (5 tables + Realtime)
│   └── migration_v3_trips_realtime.sql trips Realtime publication
└── package.json                        express, @supabase/supabase-js, @google/generative-ai

frontend/
├── src/
│   ├── App.tsx                         Router: /, /create, /join/:id, /trip/:id
│   ├── main.tsx                        Entry point
│   ├── index.css                       Tailwind, CSS vars, animations, noise overlay
│   ├── lib/
│   │   ├── api.ts                      HTTP helpers (get, post, patch) + token storage
│   │   ├── supabase.ts                 Supabase client (anon key, nullable)
│   │   └── utils.ts                    cn() utility
│   ├── hooks/
│   │   ├── use-toast.ts                Toast notifications
│   │   └── useVersionToggle.ts         v1/v2 localStorage toggle
│   ├── pages/
│   │   ├── Index.tsx                   Landing page
│   │   ├── CreateTrip.tsx              3 fields: name, organiser, group size
│   │   ├── JoinTrip.tsx                Join via invite link
│   │   ├── TripRoom.tsx                Main room: setup panel + v1/v2 sections
│   │   └── NotFound.tsx                404
│   └── components/
│       ├── Header.tsx                  Logo + nav
│       ├── MapBackground.tsx           Decorative background
│       ├── DestinationCard.tsx         Vote card with pros/cons
│       ├── ReadinessBar.tsx            V1 member status bar
│       ├── OrganiserSetupPanel.tsx     Progressive setup (budget → dates → AI)
│       ├── NavLink.tsx                 Nav helper
│       ├── ui/                         Radix UI primitives (button, toast, tooltip)
│       └── v2/                         V2-only components
│           ├── TripRoomV2Sections.tsx   Orchestrator
│           ├── GroupReadinessPanel.tsx   4D readiness matrix
│           ├── BudgetPreferenceForm.tsx  Member budget prefs
│           ├── BudgetEstimateDisplay.tsx AI estimate + divergence
│           ├── AvailabilityInput.tsx     6-week calendar
│           ├── TravelWindowsDisplay.tsx  AI travel windows
│           ├── DeadlineManager.tsx       Organiser deadline setter
│           └── DeadlineCountdown.tsx     Inline deadline badge
├── tailwind.config.ts                  Custom colors, fonts (Fraunces/Geist/JetBrains)
└── package.json                        react, react-router, @supabase/supabase-js, sonner
```

---

## 13. Git History

```
465fa9a  Fix POST /api/trips 500: filter undefined optional fields from insert payload
e576c65  Restructure create trip flow: move budget, dates, AI to TripRoom setup panel
3a6a695  Fix CORS: hardcode Vercel origin and stop throwing on rejected origins
2827dbd  Add V2 features: budget estimation, availability mapping, deadlines, group readiness with version toggle
ae569ee  Fix 9 delta bugs, add Supabase Realtime, Vercel experimentalServices
68640af  Add complete backend and frontend for Triphaus
ed04962  first commit
```

---

## 14. What Works Today

- [x] Create trip with name + organiser name + group size
- [x] Navigate immediately to TripRoom
- [x] Organiser setup panel: budget → dates → AI (progressive)
- [x] AI destination suggestions with shimmer loading + cycling messages
- [x] Skip AI option
- [x] Budget preset pills (₹5K, ₹10K, ₹15K, ₹25K+)
- [x] Join trip via invite link
- [x] Vote on destinations (one vote per member)
- [x] Confirm budget participation
- [x] Nudge unconfirmed members (24h cooldown)
- [x] V1 readiness: voting 50% + confirmation 50%
- [x] V2 readiness: 4 dimensions × 25% each
- [x] V2 budget preference form (accommodation/transport/dining/activities)
- [x] V2 AI budget estimate with breakdown + divergence flags
- [x] V2 availability calendar (6-week, tap-to-cycle tiers)
- [x] V2 AI travel window ranking (top 3)
- [x] V2 deadline management + auto-lock past-due
- [x] V2 group readiness matrix (member × 4 dimensions)
- [x] v1/v2 toggle (localStorage persisted)
- [x] Realtime: budget_preferences, availability_slots, deadlines, trips
- [x] Tab focus refetch
- [x] Non-organiser placeholder during setup

---

## 15. Known Issues & Next Steps

### Issues
1. `destination_votes` and `trip_members` not in Realtime publication — votes/joins won't trigger cross-tab updates until added
2. Frontend bundle is 641KB gzipped (198KB) — chunk splitting recommended
3. No RLS policies on any table — backend uses service key so not exploitable, but should add if client-side Supabase access is ever enabled

### Next steps
- Run the `destination_votes` + `trip_members` Realtime publication SQL
- Test full end-to-end flow on production (Vercel + Railway)
- Consider code-splitting v2 components with `React.lazy()`
- Mobile testing: calendar grid touch targets, date input UX
