# Groupism — Version 8: Average Budget, Activity Redesign, AI Group Insights, Summary Card

**Date:** 3 April 2026
**Status:** V8 shipped — group average budget row, activity category cards with voice-to-text, AI group insights panel, trip summary card, group_insights Realtime subscription. Build succeeded first try with 0 TS errors.
**Previous:** V7 (commit 40dfa8c)

---

## Table of Contents

1. [What Changed Since V7](#1-what-changed-since-v7)
2. [Current Architecture](#2-current-architecture)
3. [Database Schema](#3-database-schema)
4. [API Endpoints](#4-api-endpoints)
5. [Frontend Components](#5-frontend-components)
6. [Trip Room Layout](#6-trip-room-layout)
7. [Realtime Subscriptions](#7-realtime-subscriptions)
8. [Gemini AI Functions](#8-gemini-ai-functions)
9. [Auth & Token System](#9-auth--token-system)
10. [Bugs & Mistakes Log](#10-bugs--mistakes-log)
11. [Complete Code](#11-complete-code)
12. [Git History](#12-git-history)
13. [What Works Today](#13-what-works-today)
14. [Known Issues & Next Steps](#14-known-issues--next-steps)

---

## 1. What Changed Since V7

| Area | V7 | V8 |
|------|----|----|
| Budget card | Per-member budget dropdowns, AI analysis panel | + Group average row (appears when ≥2 members submit) rounded to nearest ₹500 |
| Activities | Single `activities` text array, notes field | 4 visual category cards (Chill, Shopping, Experiences, Exploration) + detail textarea with voice-to-text |
| Preferences card | Segmented buttons for accommodation/transport/dining + activities pills + notes | + activity_categories grid cards, activity_details textarea with mic button, voice recording via Web Speech API |
| AI insights | None | New GroupInsightsPanel: vibe summary, itinerary notes, friction flags. Auto-generates when ≥2 prefs exist |
| Summary card | None | New TripSummaryCard: 3-column grid (destination, budget avg, group activity preferences + vibe snippet) |
| Trip Room layout | 4 cards: destination → budget → availability → preferences | Summary card above cards, + GroupInsightsPanel below preferences |
| Backend routes | 7 routers | + insights router (POST /generate, GET /) |
| Gemini functions | estimateBudget, analyseBudgets, rankTravelWindows, getDestinationSummary, getDestinationSuggestions | + generateGroupInsights |
| DB schema | budget_preferences had activities[], notes | + activity_categories text[], activity_details text on budget_preferences; + group_insights table |
| Realtime | 6 tables (trips, trip_members, destination_options, destination_votes, budget_preferences, availability_slots) | + group_insights (7 total) |

### Files created (5)

- `backend/src/routes/insights.ts` — insights router (generate + GET)
- `backend/supabase/migration_v8_activities.sql` — activity_categories + activity_details columns
- `backend/supabase/migration_v8_insights.sql` — group_insights table + Realtime
- `frontend/src/components/GroupInsightsPanel.tsx` — AI group insights display
- `frontend/src/components/TripSummaryCard.tsx` — 3-column trip summary

### Files modified (7)

- `backend/src/app.ts` — added insights router import + mount
- `backend/src/lib/gemini.ts` — added generateGroupInsights function + GroupInsightsResult interface
- `backend/src/routes/budget.ts` — added activity_categories + activity_details validation and upsert
- `backend/src/routes/trips.ts` — added group_insights fetch in GET /:joinToken, included in response
- `frontend/src/components/BudgetCard.tsx` — added group average row calculation + display
- `frontend/src/components/PersonalPreferencesCard.tsx` — replaced activity pills with 4 category cards, added detail textarea with voice recording
- `frontend/src/pages/TripRoom.tsx` — added TripSummaryCard + GroupInsightsPanel imports and rendering, added groupInsights state, added group_insights Realtime subscription

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

### trips

```sql
id                       uuid PRIMARY KEY DEFAULT gen_random_uuid()
name                     text NOT NULL
join_token               text NOT NULL UNIQUE
organiser_token          text NOT NULL
budget_min               numeric
budget_max               numeric
travel_from              date
travel_to                date
deadline                 date
group_size               integer DEFAULT 4                          -- V4
selected_destination_id  uuid REFERENCES destination_options(id)    -- V4
destination_summary      jsonb                                      -- V4
created_at               timestamptz NOT NULL DEFAULT now()
```

### trip_members

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id         uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE
display_name    text NOT NULL
member_token    text NOT NULL
is_organiser    boolean NOT NULL DEFAULT false
has_confirmed   boolean NOT NULL DEFAULT false
confirmed_at    timestamptz
joined_at       timestamptz NOT NULL DEFAULT now()
```

### destination_options

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id             uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE
name                text NOT NULL
tagline             text
pros                jsonb DEFAULT '[]'
cons                jsonb DEFAULT '[]'
best_for            text
estimated_cost_min  numeric
estimated_cost_max  numeric
cost_breakdown      jsonb                                              -- V6
nights              integer                                            -- V6
added_by_member_id  uuid REFERENCES trip_members(id)                   -- V6
source              text NOT NULL DEFAULT 'manual'
created_at          timestamptz NOT NULL DEFAULT now()
```

### destination_votes

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id         uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE
destination_id  uuid NOT NULL REFERENCES destination_options(id) ON DELETE CASCADE
member_id       uuid NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE
created_at      timestamptz NOT NULL DEFAULT now()
UNIQUE (trip_id, member_id)
```

### budget_preferences

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id             uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE
member_id           uuid NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE
accommodation_tier  text CHECK (accommodation_tier IN ('budget', 'mid', 'premium'))
transport_pref      text CHECK (transport_pref IN ('bus_train', 'flight', 'self_drive'))
dining_style        text CHECK (dining_style IN ('local_cheap', 'mixed', 'restaurants'))
activities          text[] DEFAULT '{}'
daily_budget_min    numeric
daily_budget_max    numeric
notes               text
trip_budget_min     numeric                    -- V7
trip_budget_max     numeric                    -- V7
activity_categories text[] DEFAULT '{}'        -- V8 ★
activity_details    text                       -- V8 ★
created_at          timestamptz NOT NULL DEFAULT now()
UNIQUE (trip_id, member_id)
```

### budget_estimates

```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id           uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE
per_person_min    numeric NOT NULL
per_person_max    numeric NOT NULL
breakdown         jsonb NOT NULL DEFAULT '{}'
divergence_flags  jsonb NOT NULL DEFAULT '[]'
members_included  int NOT NULL DEFAULT 0
created_at        timestamptz NOT NULL DEFAULT now()
UNIQUE (trip_id)
```

### availability_slots

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE
member_id   uuid NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE
slot_date   date NOT NULL
tier        text NOT NULL CHECK (tier IN ('unavailable', 'free', 'could_work'))
created_at  timestamptz NOT NULL DEFAULT now()
UNIQUE (trip_id, member_id, slot_date)
```

### travel_windows

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE
windows     jsonb NOT NULL DEFAULT '[]'
created_at  timestamptz NOT NULL DEFAULT now()
UNIQUE (trip_id)
```

### deadlines

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE
item_type   text NOT NULL CHECK (item_type IN ('destination_vote', 'availability', 'budget_input', 'confirmation'))
due_date    date NOT NULL
locked      boolean NOT NULL DEFAULT false
created_at  timestamptz NOT NULL DEFAULT now()
UNIQUE (trip_id, item_type)
```

### nudge_log

```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id           uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE
target_member_id  uuid NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE
sent_at           timestamptz NOT NULL DEFAULT now()
```

### group_insights — V8 ★

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id         uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE
vibe_summary    text
itinerary_notes text
friction_flags  jsonb
members_used    int
generated_at    timestamptz NOT NULL DEFAULT now()
UNIQUE (trip_id)
```

---

## 4. API Endpoints

### trips router (`/api/trips`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/trips` | None | Create trip + register organiser as first member |
| GET | `/api/trips/:joinToken` | None | Fetch full trip room data (trip, members, destinations, budget, availability, deadlines, group_insights) |
| PATCH | `/api/trips/:joinToken` | Organiser | Update trip fields (budget, dates, deadline, selected_destination_id, destination_summary) |

### members router (`/api/trips/:joinToken`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/join` | None | Join trip with display_name + member_token |
| POST | `/confirm` | Member | Mark member as confirmed |
| POST | `/nudge` | Organiser | Log nudge for unconfirmed members (24h cooldown) |

### destinations router (`/api/trips/:joinToken/destinations`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | List all destinations with vote counts |
| POST | `/` | Organiser | Add destination manually |
| POST | `/summary` | None | AI destination search or suggest (auto-saves to destination_options) |
| POST | `/:destId/vote` | Member | Cast/move vote for a destination |
| DELETE | `/:destId` | Organiser | Remove destination (not if selected) |

### ai-suggest router (`/api/trips/:joinToken/ai-suggest`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | Organiser | Get 3 AI destination suggestions (legacy) |

### budget router (`/api/trips/:joinToken/budget`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | Get all preferences + estimate |
| POST | `/preferences` | Member | Upsert budget preferences (including activity_categories, activity_details) |
| POST | `/estimate` | Organiser | AI budget estimation |
| POST | `/analyse` | Member | AI budget analysis with destination context |

### availability router (`/api/trips/:joinToken/availability`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | Get all slots + travel windows |
| POST | `/` | Member | Save availability (single slot upsert or batch) |
| POST | `/windows` | Organiser | AI travel window ranking |

### deadlines router (`/api/trips/:joinToken/deadlines`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | List all deadlines |
| POST | `/` | Organiser | Upsert deadlines |
| POST | `/lock/:itemType` | Organiser | Lock a deadline |

### insights router (`/api/trips/:joinToken/insights`) — V8 ★

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | Get cached group insights |
| POST | `/generate` | Member | Generate AI group insights (requires ≥2 prefs) |

---

## 5. Frontend Components

| Component | File | Description |
|-----------|------|-------------|
| `App` | `frontend/src/App.tsx` | Router setup: /, /create, /trip/:id, /join/:code, /t/:code |
| `MapBackground` | `frontend/src/components/MapBackground.tsx` | Leaflet map background with geolocation, fixed behind content |
| `Header` | `frontend/src/components/Header.tsx` | Fixed top header with "Groupism" link |
| `MemberCirclesRow` | `frontend/src/components/MemberCirclesRow.tsx` | Filled circles with initials + empty dashed circles |
| `DeadlineSetterCollapsed` | `frontend/src/components/DeadlineSetterCollapsed.tsx` | Collapsible deadline date inputs (organiser only) |
| `TripSummaryCard` | `frontend/src/components/TripSummaryCard.tsx` | **V8 ★** 3-column grid: destination, budget avg, group activity prefs + vibe |
| `DestinationSearchCard` | `frontend/src/components/DestinationSearchCard.tsx` | Search input + AI suggest + destination list with voting |
| `DestinationVoteCard` | `frontend/src/components/DestinationVoteCard.tsx` | Individual destination card with vote button, cost breakdown, select/deselect |
| `BudgetCard` | `frontend/src/components/BudgetCard.tsx` | Per-member budget dropdowns + **V8: group average row** + AI analysis |
| `BudgetAnalysisPanel` | `frontend/src/components/BudgetAnalysisPanel.tsx` | AI budget analysis with verdict, detail, destination fits |
| `BudgetDropdowns` | `frontend/src/components/BudgetDropdowns.tsx` | Organiser budget + date inputs (used in earlier versions, still present) |
| `AvailabilityCalendar` | `frontend/src/components/AvailabilityCalendar.tsx` | Multi-member calendar with coloured strips, tier cycling |
| `PersonalPreferencesCard` | `frontend/src/components/PersonalPreferencesCard.tsx` | **V8: Activity category cards** (4 visual cards) + detail textarea with voice recording |
| `GroupInsightsPanel` | `frontend/src/components/GroupInsightsPanel.tsx` | **V8 ★** AI group insights: vibe summary, itinerary notes, friction flags |
| `Index` | `frontend/src/pages/Index.tsx` | Landing page with Create/Join CTAs |
| `CreateTrip` | `frontend/src/pages/CreateTrip.tsx` | Trip creation form (name, organiser name, group size) |
| `JoinTrip` | `frontend/src/pages/JoinTrip.tsx` | Join trip page with name input |
| `TripRoom` | `frontend/src/pages/TripRoom.tsx` | Main trip room — all cards + Realtime + state management |
| `NotFound` | `frontend/src/pages/NotFound.tsx` | 404 page |
| UI: `Button` | `frontend/src/components/ui/button.tsx` | CVA button with amber variant |
| UI: `Toast/Toaster` | `frontend/src/components/ui/toast.tsx`, `toaster.tsx` | Radix toast primitives |
| UI: `Sonner` | `frontend/src/components/ui/sonner.tsx` | Sonner toast wrapper |
| UI: `Tooltip` | `frontend/src/components/ui/tooltip.tsx` | Radix tooltip primitives |

---

## 6. Trip Room Layout

```
┌──────────────────────────────────────────────┐
│ Header (fixed)                    [Groupism] │
├──────────────────────────────────────────────┤
│                                              │
│  Trip Name                    [Share link]   │
│  ₹X,XXX – ₹X,XXX  ·  5 Apr–8 Apr  ·  6    │
│                                              │
│  [●A] [●B] [●C] [○] [○] [○]               │
│  3 of 6 joined                               │
│                                              │
│  + Set response deadlines (organiser only)   │
│                                              │
│  ┌─── TripSummaryCard ──────────────────┐   │  ★ V8
│  │ Destination  │  Budget   │ Group wants│   │
│  │ Goa (leading)│  ₹8K–12K │ Chill, Exp │   │
│  │ 3N · ₹5K–8K │  avg 4/6  │ vibe snip  │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌─── Card 1: DestinationSearchCard ────┐   │
│  │ Search input + AI suggest             │   │
│  │ Destination vote cards                │   │
│  └───────────────────────────────────────┘   │
│                                              │
│  ┌─── Card 2: BudgetCard ──────────────┐    │
│  │ My budget: min / max dropdowns       │    │
│  │ Group overview (per member)          │    │
│  │ Group average row                    │    │  ★ V8
│  │ AI Budget Analysis                   │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌─── Card 3: AvailabilityCalendar ────┐    │
│  │ Travel dates (organiser editable)    │    │
│  │ Monthly calendar with strips         │    │
│  │ Legend + progress                    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌─── Card 4: PersonalPreferencesCard ──┐   │
│  │ Accommodation / Transport / Food      │   │
│  │ Activity categories (4 cards)         │   │  ★ V8
│  │ Detail textarea + voice recording     │   │  ★ V8
│  │ Notes                                 │   │
│  └───────────────────────────────────────┘   │
│                                              │
│  ┌─── GroupInsightsPanel ───────────────┐   │  ★ V8
│  │ Group vibe                            │   │
│  │ What to plan for                      │   │
│  │ Friction flags                        │   │
│  │ Generated Xm ago    [Regenerate]      │   │
│  └───────────────────────────────────────┘   │
│                                              │
├──────────────────────────────────────────────┤
│ [═══════ I'm in / You're in ═══════] (sticky)│
└──────────────────────────────────────────────┘
```

---

## 7. Realtime Subscriptions

The TripRoom subscribes to 7 tables via Supabase Realtime (all filtered by trip_id):

1. `destination_options` — `*` events
2. `destination_votes` — `*` events
3. `trip_members` — `*` events
4. `trips` — `UPDATE` events (filtered by `id`)
5. `budget_preferences` — `*` events
6. `availability_slots` — `*` events
7. `group_insights` — `*` events ★ V8

All trigger a full refetch of the trip room data via `GET /api/trips/:joinToken`.

---

## 8. Gemini AI Functions

All functions in `backend/src/lib/gemini.ts` use Gemini 2.5 Flash.

| Function | Params | Returns | Description |
|----------|--------|---------|-------------|
| `getDestinationSuggestions` | groupSize, budgetMin/Max, travelFrom/To, notes | `DestinationSuggestion[]` | 3 destination suggestions with pros/cons/cost |
| `getDestinationSummary` | query, source ('search'\|'ai'), groupSize, nights, budget, memberPreferences | `DestinationSummaryResult` | Search mode: full destination summary with cost breakdown. AI mode: 3 destination name suggestions |
| `estimateBudget` | destination, preferences[], travelFrom/To | `BudgetEstimateResult` | Per-person budget estimate with breakdown and divergence flags |
| `analyseBudgets` | memberBudgets[], selectedDestination, suggestedDestinations, nights | `BudgetAnalysisResult` | Budget analysis with verdict, detail, destination fits |
| `rankTravelWindows` | members[], slots[], trip_duration | `TravelWindow[]` | Top 3 travel windows scored 0-100 |
| `generateGroupInsights` | destination, nights, members[] (with all prefs) | `GroupInsightsResult` | ★ V8: vibe summary, itinerary notes, friction flags |

---

## 9. Auth & Token System

**Three token types:**

| Token | Length | Generated | Stored | Used for |
|-------|--------|-----------|--------|----------|
| `organiser_token` | 64 hex chars | Server (crypto.randomBytes(32)) | localStorage + DB trips table | x-organiser-token header |
| `member_token` | 32 hex chars | Server (trip creation) or Client (joining) | localStorage + DB trip_members table | x-member-token header |
| `join_token` | URL slug (e.g. "goa-march-a3f2") | Server | DB trips table, used in URL | URL path segment |

**Middleware chain:** `loadTrip` → `requireMember` or `requireOrganiser`

- `loadTrip`: Looks up trip by join_token URL param
- `requireMember`: Validates x-member-token against trip_members
- `requireOrganiser`: Validates x-organiser-token using timing-safe comparison

**Frontend storage:** `localStorage.setItem('triphaus:{joinToken}', JSON.stringify({ memberToken, memberId, organiserToken? }))`

---

## 10. Bugs & Mistakes Log

**V8 build: 0 issues.** Build succeeded on first try with no TypeScript errors.

Key design decisions:
- Group average budget rounds to nearest ₹500 for clean display
- Activity categories use a 2x2 / 4-column grid with emoji + label cards
- Voice recording uses Web Speech API (`webkitSpeechRecognition`) with `en-IN` locale
- GroupInsightsPanel auto-triggers generation when ≥2 prefs exist and no cached insights
- TripSummaryCard shows leading destination (most votes) when no selection is locked
- group_insights table added to Supabase Realtime publication for live updates

---

## 11. Complete Code

> Every source file in the project at V8 (commit 55e6264).

### Backend

#### `backend/package.json`

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

#### `backend/tsconfig.json`

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

#### `backend/src/index.ts`

```ts
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


#### `backend/src/app.ts`

```ts
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
import insightsRouter     from './routes/insights';

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
app.use('/api/trips/:joinToken/insights',    insightsRouter);

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

#### `backend/src/lib/supabase.ts`

```ts
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

#### `backend/src/lib/tokens.ts`

```ts
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

#### `backend/src/middleware/tokens.ts`

```ts
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


#### `backend/src/lib/gemini.ts`

```ts
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

// ─── Budget Analysis ────────────────────────────────────────────────────────

export interface BudgetAnalysisResult {
  mode: 'locked' | 'suggestions' | 'no_context';
  group_budget_min: number;
  group_budget_max: number;
  verdict: string;
  detail: string;
  destination_fits?: Array<{
    name: string;
    fit: 'comfortable' | 'tight' | 'out_of_range';
    note: string;
  }> | null;
}

export async function analyseBudgets(params: {
  memberBudgets: Array<{ name: string; min: number; max: number }>;
  selectedDestination?: { name: string; cost_min: number; cost_max: number } | null;
  suggestedDestinations?: Array<{ name: string; cost_min: number; cost_max: number }>;
  nights: number;
}): Promise<BudgetAnalysisResult> {
  const budgetSummary = params.memberBudgets
    .map(m => `${m.name}: ₹${m.min.toLocaleString('en-IN')} – ₹${m.max.toLocaleString('en-IN')}`)
    .join('\n');

  const groupMin = Math.min(...params.memberBudgets.map(m => m.min));
  const groupMax = Math.max(...params.memberBudgets.map(m => m.max));

  const mode = params.selectedDestination
    ? 'locked'
    : params.suggestedDestinations?.length
      ? 'suggestions'
      : 'no_context';

  let contextBlock = '';
  if (params.selectedDestination) {
    contextBlock = `Locked destination: ${params.selectedDestination.name}
Estimated cost: ₹${params.selectedDestination.cost_min.toLocaleString('en-IN')} – ₹${params.selectedDestination.cost_max.toLocaleString('en-IN')} per person for ${params.nights} nights`;
  } else if (params.suggestedDestinations?.length) {
    contextBlock = `Suggested destinations under consideration:\n` +
      params.suggestedDestinations.map(d =>
        `${d.name}: ₹${d.cost_min.toLocaleString('en-IN')} – ₹${d.cost_max.toLocaleString('en-IN')} pp`
      ).join('\n');
  }

  const destFitsSchema = mode === 'suggestions'
    ? `"destination_fits": [{ "name": "string", "fit": "comfortable|tight|out_of_range", "note": "one sentence" }]`
    : `"destination_fits": null`;

  const prompt = `You are a practical travel budget advisor for an Indian group trip.

Individual budgets submitted:
${budgetSummary}

${contextBlock}

Trip duration: ${params.nights} nights

Analyse whether the group's budget works for their travel plans. Be direct and specific — not encouraging fluff.

Return ONLY valid JSON, no markdown fences:
{
  "mode": "${mode}",
  "group_budget_min": ${groupMin},
  "group_budget_max": ${groupMax},
  "verdict": "one sentence — e.g. 'Most of the group can afford Goa comfortably, but Meera's budget is tight.'",
  "detail": "2-3 sentences of actionable guidance",
  ${destFitsSchema}
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('Gemini budget analysis error:', err);
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
  memberPreferences?: Array<{
    accommodation_tier: string | null;
    transport_pref: string | null;
    dining_style: string | null;
    activities: string[] | null;
  }>;
}): Promise<DestinationSummaryResult> {

  const budgetContext = params.budgetMin && params.budgetMax
    ? `The group's budget is ₹${params.budgetMin.toLocaleString('en-IN')} – ₹${params.budgetMax.toLocaleString('en-IN')} per person.`
    : '';

  // Build member preferences summary for AI context
  let prefsContext = '';
  if (params.memberPreferences && params.memberPreferences.length > 0) {
    const accomCounts: Record<string, number> = {};
    const transportCounts: Record<string, number> = {};
    const diningCounts: Record<string, number> = {};
    const activityCounts: Record<string, number> = {};

    for (const p of params.memberPreferences) {
      if (p.accommodation_tier) accomCounts[p.accommodation_tier] = (accomCounts[p.accommodation_tier] || 0) + 1;
      if (p.transport_pref) transportCounts[p.transport_pref] = (transportCounts[p.transport_pref] || 0) + 1;
      if (p.dining_style) diningCounts[p.dining_style] = (diningCounts[p.dining_style] || 0) + 1;
      if (p.activities) {
        for (const a of p.activities) {
          activityCounts[a] = (activityCounts[a] || 0) + 1;
        }
      }
    }

    const parts: string[] = [];
    const summarize = (label: string, counts: Record<string, number>) => {
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (entries.length > 0) {
        parts.push(`${label}: ${entries.map(([k, v]) => `${v} prefer ${k}`).join(', ')}`);
      }
    };
    summarize('Accommodation', accomCounts);
    summarize('Transport', transportCounts);
    summarize('Dining', diningCounts);
    if (Object.keys(activityCounts).length > 0) {
      const topActivities = Object.entries(activityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
      parts.push(`Popular activities: ${topActivities.join(', ')}`);
    }

    if (parts.length > 0) {
      prefsContext = `\nGroup member preferences:\n${parts.join('\n')}`;
    }
  }

  if (params.source === 'ai') {
    const userRequest = params.query
      ? `\nThe group is looking for: ${params.query}`
      : '';

    const prompt = `You are a travel expert for Indian domestic group travel.

Group size: ${params.groupSize} people
Trip duration: ${params.nights} nights
${budgetContext}${prefsContext}${userRequest}

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

// ─── Group Insights ─────────────────────────────────────────────────────────

export interface GroupInsightsResult {
  vibe_summary: string;
  itinerary_notes: string;
  friction_flags: Array<{ area: string; detail: string }>;
}

export async function generateGroupInsights(params: {
  destination: string | null;
  nights: number;
  members: Array<{
    name: string;
    trip_budget_min?: number | null;
    trip_budget_max?: number | null;
    accommodation_tier?: string | null;
    transport_pref?: string | null;
    dining_style?: string | null;
    activity_categories?: string[] | null;
    activity_details?: string | null;
  }>;
}): Promise<GroupInsightsResult> {
  const destContext = params.destination
    ? `Destination: ${params.destination}, ${params.nights} nights`
    : `Trip duration: ${params.nights} nights (destination not decided yet)`;

  const memberLines = params.members.map((m, i) => {
    const parts: string[] = [];
    if (m.accommodation_tier) parts.push(`stay=${m.accommodation_tier}`);
    if (m.transport_pref) parts.push(`transport=${m.transport_pref}`);
    if (m.dining_style) parts.push(`food=${m.dining_style}`);
    if (m.activity_categories?.length) parts.push(`wants=[${m.activity_categories.join(', ')}]`);
    if (m.activity_details) parts.push(`details="${m.activity_details}"`);
    if (m.trip_budget_min && m.trip_budget_max) {
      parts.push(`budget=₹${m.trip_budget_min.toLocaleString('en-IN')}–₹${m.trip_budget_max.toLocaleString('en-IN')}`);
    }
    return `${i + 1}. ${m.name}: ${parts.join(', ') || 'no preferences yet'}`;
  }).join('\n');

  const prompt = `You are a group travel analyst for Indian domestic trips. Analyse this group's collective preferences and provide insights.

${destContext}
Group size: ${params.members.length}

Member preferences:
${memberLines}

Provide:
1. A vibe summary — what kind of trip does this group collectively want? (2-3 sentences, be specific)
2. Itinerary notes — what should the planner prioritise? (3-5 bullet points, one per line)
3. Friction flags — where do members disagree or where might planning get complicated? (can be empty if everyone is aligned)

Return ONLY valid JSON, no markdown fences:
{
  "vibe_summary": "string",
  "itinerary_notes": "bullet1\\nbullet2\\nbullet3",
  "friction_flags": [{ "area": "string", "detail": "string" }]
}

Be direct and practical. No generic travel advice. friction_flags can be empty array if everyone is aligned.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean);

    if (!parsed.vibe_summary || parsed.itinerary_notes === undefined) {
      throw new Error('Unexpected Gemini response shape');
    }

    return parsed;
  } catch (err) {
    console.error('Gemini group insights error:', err);
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


#### `backend/src/routes/trips.ts`

```ts
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
    { data: groupInsights },
  ] = await Promise.all([
    supabase
      .from('trip_members')
      .select('id, display_name, is_organiser, has_confirmed, confirmed_at, joined_at')
      .eq('trip_id', trip.id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('destination_options')
      .select(`
        id, name, tagline, pros, cons, best_for,
        estimated_cost_min, estimated_cost_max, cost_breakdown, nights,
        added_by_member_id, source, created_at,
        destination_votes(member_id)
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
      .from('group_insights')
      .select('*')
      .eq('trip_id', trip.id)
      .maybeSingle(),
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
    id:                  d.id,
    name:                d.name,
    tagline:             d.tagline,
    pros:                d.pros,
    cons:                d.cons,
    best_for:            d.best_for,
    estimated_cost_min:  d.estimated_cost_min,
    estimated_cost_max:  d.estimated_cost_max,
    cost_breakdown:      d.cost_breakdown ?? null,
    nights:              d.nights ?? null,
    added_by_member_id:  d.added_by_member_id ?? null,
    source:              d.source,
    created_at:          d.created_at,
    votes:               d.destination_votes?.length ?? 0,
    voter_member_ids:    (d.destination_votes || []).map((v: any) => v.member_id),
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
    group_insights: groupInsights ?? null,
  });
});

export default router;
```


#### `backend/src/routes/members.ts`

```ts
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

#### `backend/src/routes/destinations.ts`

```ts
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
    cost_breakdown:      d.cost_breakdown ?? null,
    nights:              d.nights ?? null,
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

  // Optionally resolve member for added_by tracking
  const memberToken = req.headers['x-member-token'] as string;
  let addedByMemberId: string | null = null;
  if (memberToken) {
    const { data: member } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', trip.id)
      .eq('member_token', memberToken)
      .single();
    if (member) addedByMemberId = member.id;
  }

  const groupSize = trip.group_size ?? 4;
  const nights = trip.travel_from && trip.travel_to
    ? Math.max(1, Math.ceil((new Date(trip.travel_to).getTime() - new Date(trip.travel_from).getTime()) / 86400000))
    : 3;

  // Fetch member preferences to enrich AI context
  const { data: prefs } = await supabase
    .from('budget_preferences')
    .select('accommodation_tier, transport_pref, dining_style, activities')
    .eq('trip_id', trip.id);

  try {
    const result: any = await getDestinationSummary({
      query: query || null,
      source,
      groupSize,
      nights,
      budgetMin: trip.budget_min ?? undefined,
      budgetMax: trip.budget_max ?? undefined,
      memberPreferences: prefs ?? [],
    });

    // Auto-save destination to destination_options when a full summary is returned
    if (result.destination) {
      const d = result.destination;

      // Check if this destination already exists (case-insensitive)
      const { data: existing } = await supabase
        .from('destination_options')
        .select('id')
        .eq('trip_id', trip.id)
        .ilike('name', d.name)
        .maybeSingle();

      if (!existing) {
        const { data: saved } = await supabase
          .from('destination_options')
          .insert({
            trip_id:            trip.id,
            name:               d.name,
            tagline:            d.tagline,
            pros:               d.highlights ?? d.pros ?? [],
            cons:               d.watch_out ?? d.cons ?? [],
            best_for:           d.tagline,
            estimated_cost_min: d.cost_breakdown?.total_min ?? null,
            estimated_cost_max: d.cost_breakdown?.total_max ?? null,
            cost_breakdown:     d.cost_breakdown ?? null,
            nights:             d.nights ?? null,
            added_by_member_id: addedByMemberId,
            source:             'ai',
          })
          .select('id')
          .single();

        result.destination.id = saved?.id ?? null;
        result.destination.already_existed = false;
      } else {
        result.destination.id = existing.id;
        result.destination.already_existed = true;
      }
    }

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

  const { data: dest } = await supabase
    .from('destination_options')
    .select('id')
    .eq('id', destId)
    .eq('trip_id', trip.id)
    .single();

  if (!dest) return res.status(404).json({ error: 'Destination not found in this trip' });

  const { error } = await supabase
    .from('destination_votes')
    .upsert(
      { trip_id: trip.id, destination_id: destId, member_id: member.id },
      { onConflict: 'trip_id,member_id' }
    );

  if (error) return res.status(500).json({ error: 'Failed to cast vote', detail: error.message });

  res.json({ voted: true, destination_id: destId });
});

// DELETE /api/trips/:joinToken/destinations/:destId
router.delete('/:destId', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const { destId } = req.params;

  if (trip.selected_destination_id === destId) {
    return res.status(400).json({ error: 'Cannot remove the selected destination. Change selection first.' });
  }

  const { error } = await supabase
    .from('destination_options')
    .delete()
    .eq('id', destId)
    .eq('trip_id', trip.id);

  if (error) return res.status(500).json({ error: 'Failed to remove destination' });
  res.json({ deleted: true });
});

export default router;
```

#### `backend/src/routes/ai.ts`

```ts
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


#### `backend/src/routes/budget.ts`

```ts
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { estimateBudget, analyseBudgets } from '../lib/gemini';
import { loadTrip, requireMember, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

const ACCOMMODATION_TIERS = ['budget', 'mid', 'premium'];
const TRANSPORT_PREFS = ['bus_train', 'flight', 'self_drive'];
const DINING_STYLES = ['local_cheap', 'mixed', 'restaurants'];

// POST /api/trips/:joinToken/budget/preferences
router.post('/preferences', loadTrip, requireMember, async (req, res) => {
  const trip = (req as any).trip;
  const member = (req as any).member;
  const { accommodation_tier, transport_pref, dining_style, activities, daily_budget_min, daily_budget_max, trip_budget_min, trip_budget_max, notes, activity_categories, activity_details } = req.body;

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
  if (activity_categories && !Array.isArray(activity_categories)) {
    return res.status(400).json({ error: 'activity_categories must be an array' });
  }
  if (activity_details !== undefined && typeof activity_details !== 'string') {
    return res.status(400).json({ error: 'activity_details must be a string' });
  }
  if (daily_budget_min != null && typeof daily_budget_min !== 'number') {
    return res.status(400).json({ error: 'daily_budget_min must be a number' });
  }
  if (daily_budget_max != null && typeof daily_budget_max !== 'number') {
    return res.status(400).json({ error: 'daily_budget_max must be a number' });
  }
  if (trip_budget_min != null && typeof trip_budget_min !== 'number') {
    return res.status(400).json({ error: 'trip_budget_min must be a number' });
  }
  if (trip_budget_max != null && typeof trip_budget_max !== 'number') {
    return res.status(400).json({ error: 'trip_budget_max must be a number' });
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
  if (trip_budget_min       !== undefined) prefData.trip_budget_min       = trip_budget_min;
  if (trip_budget_max       !== undefined) prefData.trip_budget_max       = trip_budget_max;
  if (activity_categories   !== undefined) prefData.activity_categories   = activity_categories || [];
  if (activity_details      !== undefined) prefData.activity_details      = activity_details || null;

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

// POST /api/trips/:joinToken/budget/analyse
router.post('/analyse', loadTrip, requireMember, async (req, res) => {
  const trip = (req as any).trip;

  const { data: prefs } = await supabase
    .from('budget_preferences')
    .select('trip_budget_min, trip_budget_max, trip_members(display_name)')
    .eq('trip_id', trip.id)
    .not('trip_budget_min', 'is', null);

  if (!prefs || prefs.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 budget submissions to analyse' });
  }

  const memberBudgets = prefs
    .filter((p: any) => p.trip_budget_min && p.trip_budget_max)
    .map((p: any) => ({
      name: (p.trip_members as any)?.display_name ?? 'Member',
      min: Number(p.trip_budget_min),
      max: Number(p.trip_budget_max),
    }));

  const nights = trip.travel_from && trip.travel_to
    ? Math.ceil((new Date(trip.travel_to).getTime() - new Date(trip.travel_from).getTime()) / 86400000)
    : 3;

  let selectedDest = null;
  if (trip.selected_destination_id && trip.destination_summary) {
    const summary = trip.destination_summary as any;
    selectedDest = {
      name: summary.name ?? 'destination',
      cost_min: summary.cost_breakdown?.total_min ?? 0,
      cost_max: summary.cost_breakdown?.total_max ?? 0,
    };
  }

  const { data: destOptions } = await supabase
    .from('destination_options')
    .select('name, estimated_cost_min, estimated_cost_max')
    .eq('trip_id', trip.id)
    .order('created_at', { ascending: true });

  const suggestedDests = (destOptions || [])
    .filter((d: any) => d.estimated_cost_min && d.estimated_cost_max)
    .map((d: any) => ({ name: d.name, cost_min: d.estimated_cost_min, cost_max: d.estimated_cost_max }));

  try {
    const analysis = await analyseBudgets({
      memberBudgets,
      selectedDestination: selectedDest,
      suggestedDestinations: suggestedDests.length ? suggestedDests : undefined,
      nights,
    });

    await supabase.from('budget_estimates').upsert(
      {
        trip_id: trip.id,
        per_person_min: analysis.group_budget_min,
        per_person_max: analysis.group_budget_max,
        breakdown: analysis,
        members_included: memberBudgets.length,
      },
      { onConflict: 'trip_id' }
    );

    res.json({ analysis });
  } catch {
    res.status(503).json({ error: 'AI analysis unavailable. Try again.' });
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

#### `backend/src/routes/availability.ts`

```ts
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
  const { slot, slots } = req.body;

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
        { trip_id: trip.id, member_id: member.id, slot_date: slot.date, tier: slot.tier },
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

#### `backend/src/routes/deadlines.ts`

```ts
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

#### `backend/src/routes/insights.ts`

```ts
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { generateGroupInsights } from '../lib/gemini';
import { loadTrip, requireMember } from '../middleware/tokens';

const router = Router({ mergeParams: true });

// POST /api/trips/:joinToken/insights/generate
router.post('/generate', loadTrip, requireMember, async (req, res) => {
  const trip = (req as any).trip;

  // Fetch all budget preferences with member names
  const { data: prefs } = await supabase
    .from('budget_preferences')
    .select('*, trip_members(id, display_name)')
    .eq('trip_id', trip.id);

  if (!prefs || prefs.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 member preferences to generate insights' });
  }

  // Get destination context
  let destinationName: string | null = null;
  let nights = 3;

  if (trip.travel_from && trip.travel_to) {
    nights = Math.ceil(
      (new Date(trip.travel_to).getTime() - new Date(trip.travel_from).getTime()) / 86400000
    );
  }

  if (trip.selected_destination_id) {
    const { data: dest } = await supabase
      .from('destination_options')
      .select('name, nights')
      .eq('id', trip.selected_destination_id)
      .maybeSingle();
    if (dest) {
      destinationName = dest.name;
      if (dest.nights) nights = dest.nights;
    }
  }

  const members = prefs.map((p: any) => ({
    name: (p.trip_members as any)?.display_name ?? 'Member',
    trip_budget_min: p.trip_budget_min,
    trip_budget_max: p.trip_budget_max,
    accommodation_tier: p.accommodation_tier,
    transport_pref: p.transport_pref,
    dining_style: p.dining_style,
    activity_categories: p.activity_categories,
    activity_details: p.activity_details,
  }));

  try {
    const result = await generateGroupInsights({
      destination: destinationName,
      nights,
      members,
    });

    const { data, error } = await supabase
      .from('group_insights')
      .upsert(
        {
          trip_id: trip.id,
          vibe_summary: result.vibe_summary,
          itinerary_notes: result.itinerary_notes,
          friction_flags: result.friction_flags,
          members_used: prefs.length,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'trip_id' }
      )
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to save insights' });

    res.json({ insights: data });
  } catch {
    res.status(503).json({ error: 'AI insights unavailable. Try again.' });
  }
});

// GET /api/trips/:joinToken/insights
router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const { data } = await supabase
    .from('group_insights')
    .select('*')
    .eq('trip_id', trip.id)
    .maybeSingle();

  res.json({ insights: data ?? null });
});

export default router;
```


### SQL Migrations

#### `backend/supabase/migration.sql`

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
  source              text not null default 'manual',
  created_at          timestamptz not null default now()
);

create index idx_destination_options_trip on destination_options (trip_id);

-- ─── Destination Votes ───────────────────────────────────────────────────────
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

#### `backend/supabase/migration_v2.sql`

```sql
-- V2 migration: budget preferences, availability, deadlines

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

create table if not exists travel_windows (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  windows     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  unique (trip_id)
);

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

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'budget_preferences') then
    alter publication supabase_realtime add table budget_preferences;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'availability_slots') then
    alter publication supabase_realtime add table availability_slots;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'deadlines') then
    alter publication supabase_realtime add table deadlines;
  end if;
end $$;
```

#### `backend/supabase/migration_v3_trips_realtime.sql`

```sql
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'trips') then
    alter publication supabase_realtime add table trips;
  end if;
end $$;
```

#### `backend/supabase/migration_v4_trip_redesign.sql`

```sql
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS group_size integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS selected_destination_id uuid REFERENCES destination_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_summary jsonb;
```

#### `backend/supabase/migration_v5_couples.sql`

```sql
CREATE TABLE IF NOT EXISTS couples (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id_1  uuid NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  member_id_2  uuid REFERENCES trip_members(id) ON DELETE SET NULL,
  couple_name  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, member_id_1)
);

ALTER TABLE trip_members       ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;
ALTER TABLE budget_preferences ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;
ALTER TABLE availability_slots ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;
ALTER TABLE destination_votes  ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS couple_count integer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_destination_votes_couple
  ON destination_votes(trip_id, couple_id) WHERE couple_id IS NOT NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE couples;
```

#### `backend/supabase/migration_v6_destinations.sql`

```sql
ALTER TABLE destination_options
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS nights integer,
  ADD COLUMN IF NOT EXISTS added_by_member_id uuid REFERENCES trip_members(id) ON DELETE SET NULL;
```

#### `backend/supabase/migration_v6_remove_couples.sql`

```sql
ALTER TABLE trip_members         DROP COLUMN IF EXISTS couple_id;
ALTER TABLE budget_preferences   DROP COLUMN IF EXISTS couple_id;
ALTER TABLE availability_slots   DROP COLUMN IF EXISTS couple_id;
ALTER TABLE destination_votes    DROP COLUMN IF EXISTS couple_id;

DROP INDEX IF EXISTS idx_destination_votes_couple;
DROP TABLE IF EXISTS couples CASCADE;
```

#### `backend/supabase/migration_v7_per_member_budget.sql`

```sql
ALTER TABLE budget_preferences
  ADD COLUMN IF NOT EXISTS trip_budget_min numeric,
  ADD COLUMN IF NOT EXISTS trip_budget_max numeric;
```

#### `backend/supabase/migration_v7_realtime_tables.sql`

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE trips;
ALTER PUBLICATION supabase_realtime ADD TABLE trip_members;
ALTER PUBLICATION supabase_realtime ADD TABLE destination_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE destination_options;
ALTER PUBLICATION supabase_realtime ADD TABLE budget_preferences;
ALTER PUBLICATION supabase_realtime ADD TABLE availability_slots;
```

#### `backend/supabase/migration_v8_activities.sql`

```sql
-- V8: Activity categories + detail text
ALTER TABLE budget_preferences
  ADD COLUMN IF NOT EXISTS activity_categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS activity_details text;
```

#### `backend/supabase/migration_v8_insights.sql`

```sql
-- V8: Group AI insights
CREATE TABLE IF NOT EXISTS group_insights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  vibe_summary    text,
  itinerary_notes text,
  friction_flags  jsonb,
  members_used    int,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id)
);
ALTER PUBLICATION supabase_realtime ADD TABLE group_insights;
```


### Frontend

#### `frontend/package.json`

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

#### `frontend/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Groupism — Group Trip Planning</title>
    <meta name="description" content="Stop herding cats. Start planning trips." />
    <meta name="author" content="Groupism" />

    <meta property="og:title" content="Groupism" />
    <meta property="og:description" content="Group trip coordination for the reluctant organiser." />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@Lovable" />
    <meta name="twitter:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,700;0,9..144,900;1,9..144,300;1,9..144,700;1,9..144,900&family=Geist:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  </head>

  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

#### `frontend/vite.config.ts`

```ts
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

#### `frontend/tsconfig.json`

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

#### `frontend/tsconfig.app.json`

```json
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "lib": [
      "ES2020",
      "DOM",
      "DOM.Iterable"
    ],
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "noEmit": true,
    "noFallthroughCasesInSwitch": false,
    "noImplicitAny": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "paths": {
      "@/*": [
        "./src/*"
      ]
    },
    "skipLibCheck": true,
    "strict": false,
    "target": "ES2020",
    "useDefineForClassFields": true
  },
  "include": [
    "src"
  ]
}
```

#### `frontend/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "allowSyntheticDefaultImports": true,
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2022"
  },
  "include": [
    "vite.config.ts"
  ]
}
```

#### `frontend/postcss.config.js`

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

#### `frontend/tailwind.config.ts`

```ts
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


#### `frontend/src/main.tsx`

```tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

#### `frontend/src/index.css`

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

#### `frontend/src/App.tsx`

```tsx
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

#### `frontend/src/lib/utils.ts`

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

#### `frontend/src/lib/api.ts`

```ts
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

  delete: (path: string, joinToken?: string) =>
    fetch(`${BASE}${path}`, {
      method: "DELETE",
      headers: headers(joinToken),
    }).then(handleRes),
};
```

#### `frontend/src/lib/supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
```

#### `frontend/src/hooks/use-toast.ts`

```ts
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

#### `frontend/src/components/ui/button.tsx`

```tsx
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

#### `frontend/src/components/ui/toast.tsx`

```tsx
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

#### `frontend/src/components/ui/toaster.tsx`

```tsx
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

#### `frontend/src/components/ui/sonner.tsx`

```tsx
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

#### `frontend/src/components/ui/tooltip.tsx`

```tsx
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

#### `frontend/src/components/Header.tsx`

```tsx
import { Link } from "react-router-dom";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-10">
      <Link to="/" className="font-display font-medium text-lg text-t-primary tracking-wide">
        Groupism
      </Link>
    </header>
  );
};

export default Header;
```

#### `frontend/src/components/MapBackground.tsx`

```tsx
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

#### `frontend/src/components/MemberCirclesRow.tsx`

```tsx
"use client";

import { cn } from "@/lib/utils";

interface MemberCirclesRowProps {
  members: Array<{ id: string; display_name: string }>;
  groupSize: number;
  currentMemberId: string | null;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function MemberCirclesRow({
  members,
  groupSize,
  currentMemberId,
}: MemberCirclesRowProps) {
  const total =
    groupSize <= 0 || groupSize < members.length
      ? members.length
      : groupSize;
  const emptyCount = Math.max(0, total - members.length);

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {members.map((m) => (
          <div key={m.id} className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "w-10 h-10 rounded-full bg-elevated border border-[var(--border-mid)] flex items-center justify-center font-mono text-xs text-t-primary",
                m.id === currentMemberId && "ring-2 ring-amber"
              )}
              title={m.display_name}
            >
              {getInitials(m.display_name)}
            </div>
            <p className="font-ui text-[10px] text-t-tertiary truncate max-w-[40px] text-center">
              {m.display_name.split(" ")[0]}
            </p>
          </div>
        ))}

        {Array.from({ length: emptyCount }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-10 h-10 rounded-full border-2 border-dashed border-[var(--border-mid)] bg-transparent"
          />
        ))}
      </div>

      <p className="font-ui font-light text-xs text-t-secondary mt-3">
        {members.length} of {total} joined
      </p>
    </div>
  );
}
```

#### `frontend/src/components/DeadlineSetterCollapsed.tsx`

```tsx
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

#### `frontend/src/components/TripSummaryCard.tsx`

```tsx
"use client";

interface TripSummaryCardProps {
  trip: {
    selected_destination_id: string | null;
    travel_from: string | null;
    travel_to: string | null;
  };
  destinations: Array<{
    id: string;
    name: string;
    nights: number | null;
    estimated_cost_min: number | null;
    estimated_cost_max: number | null;
    votes: number;
  }>;
  budgetPrefs: Array<{
    trip_budget_min?: number | null;
    trip_budget_max?: number | null;
    activity_categories?: string[] | null;
  }>;
  groupInsights: {
    vibe_summary: string | null;
  } | null;
  members: Array<{ id: string }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  chill: "Chill",
  shopping: "Shopping",
  experiences: "Experiences",
  exploration: "Exploration",
};

function formatBudget(val: number): string {
  return `\u20B9${val.toLocaleString("en-IN")}`;
}

export default function TripSummaryCard({
  trip,
  destinations,
  budgetPrefs,
  groupInsights,
  members,
}: TripSummaryCardProps) {
  // Destination section
  const selectedDest = trip.selected_destination_id
    ? destinations.find((d) => d.id === trip.selected_destination_id)
    : null;

  const leadingDest =
    !selectedDest && destinations.length > 0
      ? [...destinations].sort((a, b) => b.votes - a.votes)[0]
      : null;

  const destName = selectedDest?.name ?? leadingDest?.name ?? null;
  const destNights = selectedDest?.nights ?? leadingDest?.nights ?? null;
  const destCostMin =
    selectedDest?.estimated_cost_min ?? leadingDest?.estimated_cost_min ?? null;
  const destCostMax =
    selectedDest?.estimated_cost_max ?? leadingDest?.estimated_cost_max ?? null;
  const destVotes = selectedDest?.votes ?? leadingDest?.votes ?? 0;

  // Budget section
  const submitted = budgetPrefs.filter(
    (p) => p.trip_budget_min != null && p.trip_budget_max != null
  );
  const avgMin =
    submitted.length >= 2
      ? Math.round(
          submitted.reduce((s, p) => s + p.trip_budget_min!, 0) /
            submitted.length /
            500
        ) * 500
      : null;
  const avgMax =
    submitted.length >= 2
      ? Math.round(
          submitted.reduce((s, p) => s + p.trip_budget_max!, 0) /
            submitted.length /
            500
        ) * 500
      : null;
  const fullMin =
    submitted.length > 0
      ? Math.min(...submitted.map((p) => p.trip_budget_min!))
      : null;
  const fullMax =
    submitted.length > 0
      ? Math.max(...submitted.map((p) => p.trip_budget_max!))
      : null;

  // Activity categories — most popular
  const catCounts: Record<string, number> = {};
  for (const p of budgetPrefs) {
    for (const cat of p.activity_categories ?? []) {
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    }
  }
  const topCats = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  // Vibe snippet
  const vibeSnippet = groupInsights?.vibe_summary
    ? groupInsights.vibe_summary.split(".")[0] + "."
    : null;

  // If nothing to show, don't render
  const hasDest = !!destName;
  const hasBudget = avgMin !== null;
  const hasActivities = topCats.length > 0 || !!vibeSnippet;
  if (!hasDest && !hasBudget && !hasActivities) return null;

  return (
    <div className="bg-surface border border-b-mid rounded-[8px] p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Destination */}
        <div>
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-1">
            Destination
          </p>
          {destName ? (
            <>
              <p className="font-display text-lg font-bold text-t-primary leading-tight">
                {destName}
                {!selectedDest && leadingDest && (
                  <span className="font-ui text-xs text-t-tertiary font-normal ml-1.5">
                    (leading)
                  </span>
                )}
              </p>
              <p className="font-mono text-xs text-t-secondary mt-0.5">
                {destNights ? `${destNights}N` : ""}
                {destCostMin && destCostMax
                  ? `${destNights ? " · " : ""}${formatBudget(destCostMin)}–${formatBudget(destCostMax)}`
                  : ""}
                {destVotes > 0
                  ? ` · ${destVotes} vote${destVotes > 1 ? "s" : ""}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="font-mono text-sm text-t-tertiary">—</p>
          )}
        </div>

        {/* Budget */}
        <div>
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-1">
            Budget
          </p>
          {avgMin !== null && avgMax !== null ? (
            <>
              <p className="font-mono text-lg font-medium text-t-primary leading-tight">
                {formatBudget(avgMin)} – {formatBudget(avgMax)}
              </p>
              <p className="font-mono text-xs text-t-secondary mt-0.5">
                avg of {submitted.length}/{members.length}
                {fullMin !== null && fullMax !== null
                  ? ` · range ${formatBudget(fullMin)}–${formatBudget(fullMax)}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="font-mono text-sm text-t-tertiary">
              {submitted.length > 0
                ? `${submitted.length} submitted`
                : "No budgets yet"}
            </p>
          )}
        </div>

        {/* What the group wants */}
        <div>
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-1">
            What the group wants
          </p>
          {topCats.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-1">
              {topCats.map((cat) => (
                <span
                  key={cat}
                  className="inline-block px-2 py-0.5 rounded-full bg-elevated text-t-secondary font-ui text-xs"
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
              ))}
            </div>
          ) : null}
          {vibeSnippet ? (
            <p className="font-ui text-xs text-t-secondary leading-relaxed">
              {vibeSnippet}
            </p>
          ) : topCats.length === 0 ? (
            <p className="font-mono text-sm text-t-tertiary">—</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

#### `frontend/src/components/DestinationSearchCard.tsx`

```tsx
"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import DestinationVoteCard from "./DestinationVoteCard";

interface Destination {
  id: string;
  name: string;
  tagline: string | null;
  pros: string[];
  cons: string[];
  estimated_cost_min: number | null;
  estimated_cost_max: number | null;
  cost_breakdown: any | null;
  nights: number | null;
  votes: number;
  voter_member_ids: string[];
  added_by_member_id: string | null;
}

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
  destinations: Destination[];
  currentMemberId: string | null;
  isOrganiser: boolean;
  onTripUpdated: () => void;
  onVote: (destId: string) => void;
  onRemove: (destId: string) => void;
  onSelect: (destId: string) => void;
  onDeselect: () => void;
  deadline?: { due_date: string; locked: boolean } | null;
}

type AddState =
  | { mode: "idle" }
  | { mode: "loading"; loadingText: string }
  | { mode: "suggestions"; suggestions: string[] }
  | { mode: "preview"; summary: any }
  | { mode: "error"; message: string };

export default function DestinationSearchCard({
  joinToken,
  trip,
  destinations,
  currentMemberId,
  isOrganiser,
  onTripUpdated,
  onVote,
  onRemove,
  onSelect,
  onDeselect,
  deadline,
}: DestinationSearchCardProps) {
  const [searchValue, setSearchValue] = useState("");
  const [aiPromptValue, setAiPromptValue] = useState("");
  const [addState, setAddState] = useState<AddState>({ mode: "idle" });

  // Find the winning destination (most votes, at least 1)
  const maxVotes = Math.max(0, ...destinations.map((d) => d.votes));
  const winningId =
    maxVotes > 0
      ? destinations.find((d) => d.votes === maxVotes)?.id ?? null
      : null;

  // Sort: selected first, then by votes descending
  const sortedDestinations = [...destinations].sort((a, b) => {
    if (a.id === trip.selected_destination_id) return -1;
    if (b.id === trip.selected_destination_id) return 1;
    return b.votes - a.votes;
  });

  async function handleSearch() {
    const query = searchValue.trim();
    if (!query) return;

    setAddState({ mode: "loading", loadingText: "Searching..." });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query, source: "search" },
        joinToken
      );
      const summary = res.destination ?? res;
      if (summary.already_existed) {
        toast({ title: "Already in the list" });
        setAddState({ mode: "idle" });
        setSearchValue("");
        onTripUpdated();
      } else {
        setAddState({ mode: "preview", summary });
      }
    } catch {
      setAddState({
        mode: "error",
        message: "AI is unavailable right now. Try again later.",
      });
    }
  }

  async function handleAiSuggest() {
    setAddState({ mode: "loading", loadingText: "Thinking about your group..." });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query: aiPromptValue.trim() || null, source: "ai" },
        joinToken
      );

      if (res.suggestions && Array.isArray(res.suggestions)) {
        setAddState({ mode: "suggestions", suggestions: res.suggestions });
      } else {
        const summary = res.destination ?? res;
        if (summary.already_existed) {
          toast({ title: "Already in the list" });
          setAddState({ mode: "idle" });
          onTripUpdated();
        } else {
          setAddState({ mode: "preview", summary });
        }
      }
    } catch {
      setAddState({
        mode: "error",
        message: "AI is unavailable right now. Try again later.",
      });
    }
  }

  async function handleChipClick(chipName: string) {
    setAddState({ mode: "loading", loadingText: "Searching..." });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query: chipName, source: "search" },
        joinToken
      );
      const summary = res.destination ?? res;
      if (summary.already_existed) {
        toast({ title: "Already in the list" });
        setAddState({ mode: "idle" });
        onTripUpdated();
      } else {
        setAddState({ mode: "preview", summary });
      }
    } catch {
      setAddState({
        mode: "error",
        message: "AI is unavailable right now. Try again later.",
      });
    }
  }

  function handleAddedToList() {
    // The destination was auto-saved by the backend during the summary call
    setAddState({ mode: "idle" });
    setSearchValue("");
    setAiPromptValue("");
    onTripUpdated();
    toast({ title: "Added to group list" });
  }

  function handleReset() {
    setAddState({ mode: "idle" });
    setSearchValue("");
  }

  return (
    <div className="bg-surface border border-b-subtle rounded-[4px] p-6">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-6">
        Where are you going?
      </h2>

      {/* ─── Section A: Add a suggestion ─── */}
      <div className="mb-6">
        {addState.mode === "idle" && (
          <div className="space-y-4">
            {/* Direct search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-t-tertiary text-base pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder="Search a destination..."
                className="w-full h-11 pl-10 pr-4 bg-elevated border border-b-mid rounded-[4px] font-ui text-sm text-t-primary placeholder:text-t-tertiary outline-none focus:border-amber transition-colors"
              />
            </div>

            {/* AI suggest */}
            <div className="border-t border-b-subtle pt-4">
              <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
                Or let AI suggest
              </p>
              <textarea
                value={aiPromptValue}
                onChange={(e) => setAiPromptValue(e.target.value)}
                placeholder="e.g. beach + nightlife, or quiet hills for families..."
                rows={2}
                className="w-full px-4 py-3 bg-elevated border border-b-mid rounded-[4px] font-ui text-sm text-t-primary placeholder:text-t-tertiary outline-none focus:border-amber transition-colors resize-none"
              />
              <button
                onClick={handleAiSuggest}
                className="mt-2 h-11 px-5 rounded-[4px] border border-b-mid bg-transparent font-ui text-sm text-t-primary hover:bg-hover transition-all cursor-pointer whitespace-nowrap"
              >
                Suggest →
              </button>
            </div>
          </div>
        )}

        {addState.mode === "loading" && (
          <LoadingShimmer text={addState.loadingText} />
        )}

        {addState.mode === "suggestions" && (
          <div className="space-y-4">
            <p className="font-ui text-sm text-t-secondary">
              Pick a destination to explore:
            </p>
            <div className="flex flex-wrap gap-3">
              {addState.suggestions.map((name) => (
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
              onClick={handleReset}
              className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
            >
              ← Back to search
            </button>
          </div>
        )}

        {addState.mode === "preview" && (
          <div className="space-y-4">
            <button
              onClick={handleReset}
              className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
            >
              ← Back to search
            </button>
            {/* Compact preview */}
            <div className="border border-b-mid rounded-[4px] p-4">
              <h3 className="font-display text-xl font-bold text-t-primary">
                {addState.summary.name}
              </h3>
              {addState.summary.tagline && (
                <p className="font-ui font-light text-sm text-t-secondary mt-1">
                  {addState.summary.tagline}
                </p>
              )}
              {addState.summary.cost_breakdown && (
                <p className="font-mono text-xs text-t-tertiary mt-2">
                  Est.{" "}
                  {formatRange(
                    addState.summary.cost_breakdown.total_min,
                    addState.summary.cost_breakdown.total_max
                  )}{" "}
                  pp
                  {addState.summary.nights
                    ? `  ·  ${addState.summary.nights} nights`
                    : ""}
                </p>
              )}
            </div>
            <button
              onClick={handleAddedToList}
              className={cn(
                "w-full h-12 bg-amber text-[#1c1a15] font-display font-bold text-base rounded-[4px] cursor-pointer hover:opacity-90 transition-opacity"
              )}
            >
              Add {addState.summary.name || "destination"} to group list →
            </button>
          </div>
        )}

        {addState.mode === "error" && (
          <div className="space-y-4">
            <p className="font-ui text-sm text-terra">{addState.message}</p>
            <button
              onClick={handleReset}
              className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
            >
              ← Back to search
            </button>
          </div>
        )}
      </div>

      {/* ─── Section B: Shared suggestions list ─── */}
      <div className="border-t border-b-subtle pt-6">
        {destinations.length === 0 ? (
          <p className="font-ui font-light text-sm text-t-tertiary text-center py-4">
            Suggest a destination above — it'll appear here for the group to vote on.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
              {destinations.length} {destinations.length === 1 ? "suggestion" : "suggestions"}
            </p>
            {sortedDestinations.map((dest) => (
              <div
                key={dest.id}
                className={cn(
                  "transition-opacity",
                  trip.selected_destination_id &&
                    trip.selected_destination_id !== dest.id &&
                    "opacity-50"
                )}
              >
                <DestinationVoteCard
                  destination={dest}
                  currentMemberId={currentMemberId}
                  isOrganiser={isOrganiser}
                  isSelected={trip.selected_destination_id === dest.id}
                  isWinning={winningId === dest.id}
                  joinToken={joinToken}
                  groupSize={trip.group_size}
                  onVote={onVote}
                  onRemove={onRemove}
                  onSelect={onSelect}
                  onDeselect={onDeselect}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline deadline */}
      {deadline && !deadline.locked && (() => {
        const now = new Date(); now.setHours(0, 0, 0, 0);
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
        <div key={i} className="h-12 bg-surface rounded-[4px] overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.06)] to-transparent animate-shimmer" />
        </div>
      ))}
      <p className="font-ui font-light text-sm text-t-secondary">{text}</p>
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

#### `frontend/src/components/DestinationVoteCard.tsx`

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface CostBreakdown {
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
}

interface DestinationVoteCardProps {
  destination: {
    id: string;
    name: string;
    tagline: string | null;
    pros: string[];
    cons: string[];
    estimated_cost_min: number | null;
    estimated_cost_max: number | null;
    cost_breakdown: CostBreakdown | null;
    nights: number | null;
    votes: number;
    voter_member_ids: string[];
    added_by_member_id: string | null;
  };
  currentMemberId: string | null;
  isOrganiser: boolean;
  isSelected: boolean;
  isWinning: boolean;
  joinToken: string;
  groupSize: number;
  onVote: (destId: string) => void;
  onRemove: (destId: string) => void;
  onSelect: (destId: string) => void;
  onDeselect: () => void;
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

export default function DestinationVoteCard({
  destination,
  currentMemberId,
  isOrganiser,
  isSelected,
  isWinning,
  groupSize,
  onVote,
  onRemove,
  onSelect,
  onDeselect,
}: DestinationVoteCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasVoted = currentMemberId
    ? destination.voter_member_ids.includes(currentMemberId)
    : false;

  const highlights = destination.pros ?? [];
  const watchOuts = destination.cons ?? [];
  const cb = destination.cost_breakdown;

  const borderClass = isSelected
    ? "border-l-[3px] border-l-green"
    : hasVoted
      ? "border-l-[3px] border-l-amber bg-elevated"
      : isWinning
        ? "border-l-[3px] border-l-green"
        : "border-l-[3px] border-l-transparent";

  return (
    <div
      className={cn(
        "bg-surface border border-b-subtle rounded-[4px] p-5 transition-opacity",
        borderClass,
        isSelected ? "" : "",
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-2xl font-bold text-t-primary">
          {destination.name}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          {isSelected && (
            <span className="font-mono text-xs text-green bg-green/10 px-2 py-1 rounded">
              Selected ✓
            </span>
          )}
          <span className="font-mono text-sm text-amber font-medium">
            {destination.votes} {destination.votes === 1 ? "vote" : "votes"}
          </span>
          {isOrganiser && !isSelected && (
            <button
              onClick={() => onRemove(destination.id)}
              className="text-t-tertiary hover:text-terra transition-colors text-lg leading-none px-1"
              title="Remove destination"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Tagline */}
      {destination.tagline && (
        <p className="font-ui font-light text-sm text-t-secondary mt-1">
          {destination.tagline}
        </p>
      )}

      {/* Highlights & watch-outs (compact) */}
      {(highlights.length > 0 || watchOuts.length > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
          {highlights.slice(0, 2).map((h, i) => (
            <span key={`h-${i}`} className="text-green font-ui text-xs">
              ✓ {h}
            </span>
          ))}
          {watchOuts.slice(0, 1).map((w, i) => (
            <span key={`w-${i}`} className="text-terra font-ui text-xs">
              ✗ {w}
            </span>
          ))}
        </div>
      )}

      {/* Cost estimate line */}
      <p className="font-mono text-xs text-t-tertiary mt-2">
        Est. {formatRange(destination.estimated_cost_min, destination.estimated_cost_max)} pp
        {destination.nights ? `  ·  ${destination.nights} nights` : ""}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-4">
        {isSelected ? (
          <p className="font-ui text-sm text-green">The group is going here</p>
        ) : (
          <button
            onClick={() => onVote(destination.id)}
            className={cn(
              "h-10 px-5 rounded-[4px] font-ui text-sm transition-all cursor-pointer",
              hasVoted
                ? "bg-amber text-[#1c1a15] font-medium"
                : "border border-b-mid text-t-primary hover:bg-hover"
            )}
          >
            {hasVoted ? "✓ Voted" : `Vote for ${destination.name}`}
          </button>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="font-ui text-xs text-t-tertiary hover:text-t-secondary transition-colors cursor-pointer"
        >
          {expanded ? "Hide details" : "↗ Full details"}
        </button>

        {isOrganiser && isWinning && !isSelected && destination.votes > 0 && (
          <button
            onClick={() => onSelect(destination.id)}
            className="h-10 px-5 rounded-[4px] bg-green/10 border border-green text-green font-ui text-sm font-medium cursor-pointer hover:bg-green/20 transition-colors ml-auto"
          >
            Lock in →
          </button>
        )}

        {isOrganiser && isSelected && (
          <button
            onClick={onDeselect}
            className="font-ui text-xs text-t-tertiary hover:text-terra transition-colors cursor-pointer ml-auto"
          >
            × Change selection
          </button>
        )}
      </div>

      {/* Expanded cost breakdown */}
      {expanded && cb && (
        <div className="mt-4 pt-4 border-t border-b-subtle space-y-3">
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider font-medium">
            Cost breakdown
            {destination.nights != null && groupSize > 0
              ? ` (${destination.nights} night${destination.nights !== 1 ? "s" : ""}, ${groupSize} ${groupSize === 1 ? "person" : "people"})`
              : ""}
          </p>
          <div className="space-y-2">
            <CostRow label="Flights" min={cb.flights_min} max={cb.flights_max} suffix="pp" />
            <CostRow label="Hotel" min={cb.hotel_per_night_min} max={cb.hotel_per_night_max} suffix="pp/night" />
            <CostRow label="Food" min={cb.food_per_day_min} max={cb.food_per_day_max} suffix="pp/day" />
            <CostRow label="Activities" min={cb.activities_min} max={cb.activities_max} suffix="pp" />
          </div>
          {(cb.total_min != null || cb.total_max != null) && (
            <div>
              <div className="border-t border-b-subtle" />
              <div className="flex justify-between items-center pt-2">
                <span className="font-ui text-sm text-t-secondary">Total estimate</span>
                <span className="font-mono font-medium text-sm text-t-primary">
                  {formatRange(cb.total_min, cb.total_max)} pp
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

#### `frontend/src/components/BudgetCard.tsx`

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import BudgetAnalysisPanel from "./BudgetAnalysisPanel";

interface BudgetCardProps {
  joinToken: string;
  budgetPrefs: Array<{
    member_id: string;
    trip_budget_min?: number | null;
    trip_budget_max?: number | null;
    trip_members?: { id: string; display_name: string } | null;
  }>;
  members: Array<{ id: string; display_name: string }>;
  currentMemberId: string | null;
  onTripUpdated: () => void;
  deadline?: { due_date: string; locked: boolean } | null;
  cachedAnalysis?: any | null;
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

export default function BudgetCard({
  joinToken,
  budgetPrefs,
  members,
  currentMemberId,
  onTripUpdated,
  deadline,
  cachedAnalysis,
}: BudgetCardProps) {
  // Find current member's existing budget
  const myPref = budgetPrefs.find((p) => p.member_id === currentMemberId);

  const [budgetMin, setBudgetMin] = useState<number | null>(
    myPref?.trip_budget_min ?? null
  );
  const [budgetMax, setBudgetMax] = useState<number | null>(
    myPref?.trip_budget_max ?? null
  );
  const [savedVisible, setSavedVisible] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  // Sync from props when data refreshes
  useEffect(() => {
    const updated = budgetPrefs.find((p) => p.member_id === currentMemberId);
    if (updated) {
      setBudgetMin(updated.trip_budget_min ?? null);
      setBudgetMax(updated.trip_budget_max ?? null);
    }
  }, [budgetPrefs, currentMemberId]);

  const validationError =
    budgetMin !== null && budgetMax !== null && budgetMin > budgetMax
      ? "Minimum can't be more than maximum."
      : null;

  const save = useCallback(
    async (min: number, max: number) => {
      try {
        await api.post(
          `/api/trips/${joinToken}/budget/preferences`,
          { trip_budget_min: min, trip_budget_max: max },
          joinToken
        );
        setSavedVisible(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSavedVisible(false), 2000);
        onTripUpdated();
      } catch {
        toast({ title: "Failed to save budget", variant: "destructive" });
      }
    },
    [joinToken, onTripUpdated]
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
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

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Build group overview data
  const prefsByMember = new Map(
    budgetPrefs.map((p) => [p.member_id, p])
  );

  function formatBudget(val: number): string {
    return `₹${val.toLocaleString("en-IN")}`;
  }

  function daysUntilDeadline(dueDate: string): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil(
      (new Date(dueDate).getTime() - now.getTime()) / 86400000
    );
  }

  return (
    <div className="rounded-[4px] border border-b-mid bg-surface p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-2xl font-bold text-t-primary">
          What&apos;s your budget for this trip?
        </h2>
        {savedVisible && (
          <span className="font-ui text-xs text-green">Saved ✓</span>
        )}
      </div>
      <p className="font-ui font-light text-sm text-t-secondary mb-6">
        Set your per-person budget range. This helps the group find destinations everyone can afford.
      </p>

      {/* My budget inputs */}
      <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
        My total budget per person
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="font-ui text-xs text-t-secondary block mb-1">
            Minimum
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
          <label className="font-ui text-xs text-t-secondary block mb-1">
            Maximum
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

      {/* Group budget overview */}
      <div className="mt-6 border-t border-b-subtle pt-4">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
          Group budget overview
        </p>
        <div className="space-y-2">
          {members.map((m) => {
            const pref = prefsByMember.get(m.id);
            const hasMin = pref?.trip_budget_min != null;
            const hasMax = pref?.trip_budget_max != null;
            const isMe = m.id === currentMemberId;

            return (
              <div
                key={m.id}
                className={cn(
                  "flex justify-between items-center py-1 px-2 rounded-[2px]",
                  isMe && "border-l-2 border-l-amber"
                )}
              >
                <span className="font-ui text-sm text-t-secondary">
                  {m.display_name}
                </span>
                <span
                  className={cn(
                    "font-mono text-sm",
                    hasMin || hasMax ? "text-t-primary" : "text-t-tertiary"
                  )}
                >
                  {hasMin && hasMax
                    ? `${formatBudget(pref!.trip_budget_min!)} – ${formatBudget(pref!.trip_budget_max!)}`
                    : "—"}
                </span>
              </div>
            );
          })}

          {/* Group average row */}
          {(() => {
            const submitted = budgetPrefs.filter(
              (p) => p.trip_budget_min != null && p.trip_budget_max != null
            );
            if (submitted.length < 2) return null;
            const avgMin =
              Math.round(
                submitted.reduce((s, p) => s + p.trip_budget_min!, 0) /
                  submitted.length /
                  500
              ) * 500;
            const avgMax =
              Math.round(
                submitted.reduce((s, p) => s + p.trip_budget_max!, 0) /
                  submitted.length /
                  500
              ) * 500;
            return (
              <div className="border-t border-b-subtle pt-2 mt-2 flex justify-between items-center py-1 px-2">
                <span className="font-ui text-xs text-t-tertiary uppercase tracking-widest">
                  Group average
                </span>
                <span className="font-mono text-sm text-t-primary font-medium">
                  {formatBudget(avgMin)} – {formatBudget(avgMax)}
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* AI Budget Analysis — shown when ≥2 members have submitted */}
      {budgetPrefs.filter((p) => p.trip_budget_min != null).length >= 2 && (
        <BudgetAnalysisPanel
          joinToken={joinToken}
          cachedAnalysis={cachedAnalysis ?? null}
          submittedCount={budgetPrefs.filter((p) => p.trip_budget_min != null).length}
        />
      )}

      {/* Inline deadline */}
      {deadline && !deadline.locked && (() => {
        const days = daysUntilDeadline(deadline.due_date);
        return (
          <p className={cn("font-ui text-xs mt-4", days <= 2 ? "text-terra" : "text-t-tertiary")}>
            {days <= 0
              ? "⚠ Deadline passed"
              : `Submit budget by ${new Date(deadline.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
          </p>
        );
      })()}
    </div>
  );
}
```

#### `frontend/src/components/BudgetAnalysisPanel.tsx`

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface DestinationFit {
  name: string;
  fit: "comfortable" | "tight" | "out_of_range";
  note: string;
}

interface Analysis {
  mode: "locked" | "suggestions" | "no_context";
  group_budget_min: number;
  group_budget_max: number;
  verdict: string;
  detail: string;
  destination_fits?: DestinationFit[] | null;
}

interface BudgetAnalysisPanelProps {
  joinToken: string;
  cachedAnalysis: Analysis | null;
  submittedCount: number;
}

export default function BudgetAnalysisPanel({
  joinToken,
  cachedAnalysis,
  submittedCount,
}: BudgetAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(cachedAnalysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  // Auto-trigger on first render if no cached analysis
  useEffect(() => {
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis);
      return;
    }
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchAnalysis();
  }, [cachedAnalysis]);

  async function fetchAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(
        `/api/trips/${joinToken}/budget/analyse`,
        {},
        joinToken
      );
      setAnalysis(res.analysis);
    } catch (err: any) {
      setError(err.message || "Analysis unavailable");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-6 border-t border-b-subtle pt-4">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
          AI Budget Analysis
        </p>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-6 bg-surface rounded-[4px] overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.06)] to-transparent animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 border-t border-b-subtle pt-4">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
          AI Budget Analysis
        </p>
        <p className="font-ui text-sm text-terra">{error}</p>
        <button
          onClick={fetchAnalysis}
          className="font-ui text-xs text-t-tertiary hover:text-t-secondary mt-2 cursor-pointer transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analysis) return null;

  const fitIcon = (fit: string) => {
    switch (fit) {
      case "comfortable":
        return <span className="text-green">✓</span>;
      case "tight":
        return <span className="text-amber">⚠</span>;
      case "out_of_range":
        return <span className="text-terra">✗</span>;
      default:
        return null;
    }
  };

  return (
    <div className="mt-6 border-t border-b-subtle pt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider">
          AI Budget Analysis
        </p>
        <button
          onClick={fetchAnalysis}
          className="font-ui text-xs text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
        >
          Recalculate
        </button>
      </div>

      <p className="font-display text-lg text-t-primary leading-snug">
        {analysis.verdict}
      </p>
      <p className="font-ui font-light text-sm text-t-secondary mt-2">
        {analysis.detail}
      </p>

      {analysis.destination_fits && analysis.destination_fits.length > 0 && (
        <div className="mt-4 space-y-2">
          {analysis.destination_fits.map((d) => (
            <div
              key={d.name}
              className="flex items-start gap-2"
            >
              <span className="text-sm mt-0.5">{fitIcon(d.fit)}</span>
              <div>
                <span className="font-ui text-sm text-t-primary font-medium">
                  {d.name}
                </span>
                <span className="font-ui text-sm text-t-secondary ml-2">
                  {d.note}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### `frontend/src/components/BudgetDropdowns.tsx`

```tsx
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
    <div className="rounded-[4px] border border-b-mid bg-surface p-6">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-4">
        What&apos;s the budget?
      </h2>

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

#### `frontend/src/components/AvailabilityCalendar.tsx`

```tsx
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  };
  members: Array<{ id: string; display_name: string }>;
  availSlots: Array<{ member_id: string; slot_date: string; tier: string }>;
  currentMemberId: string | null;
  isOrganiser: boolean;
  onTripUpdated: () => void;
  availabilityDeadline?: { due_date: string; locked: boolean } | null;
}

type Tier = "free" | "could_work" | "unavailable";

const TIER_CYCLE: Array<Tier | null> = ["free", "could_work", "unavailable", null];

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const FULL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MEMBER_COLOURS = [
  { bg: "rgba(212, 144, 10, 0.25)", border: "#D4900A", label: "Amber" },
  { bg: "rgba(58, 125, 92, 0.25)", border: "#3A7D5C", label: "Green" },
  { bg: "rgba(196, 97, 74, 0.25)", border: "#C4614A", label: "Terra" },
  { bg: "rgba(99, 102, 241, 0.25)", border: "#6366F1", label: "Indigo" },
  { bg: "rgba(236, 72, 153, 0.25)", border: "#EC4899", label: "Pink" },
  { bg: "rgba(14, 165, 233, 0.25)", border: "#0EA5E9", label: "Sky" },
  { bg: "rgba(168, 85, 247, 0.25)", border: "#A855F7", label: "Purple" },
  { bg: "rgba(34, 197, 94, 0.25)", border: "#22C55E", label: "Lime" },
];

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateDisplay(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  // 0=Sun, convert so Mon=0
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export default function AvailabilityCalendar({
  joinToken,
  trip,
  members,
  availSlots,
  currentMemberId,
  isOrganiser,
  onTripUpdated,
  availabilityDeadline,
}: AvailabilityCalendarProps) {
  const [localSlots, setLocalSlots] = useState<
    Array<{ member_id: string; slot_date: string; tier: string }>
  >(availSlots);

  const [deadlineValue, setDeadlineValue] = useState<string>(
    trip.deadline ?? ""
  );

  // Travel date editing state
  const [travelFrom, setTravelFrom] = useState<string>(trip.travel_from ?? "");
  const [travelTo, setTravelTo] = useState<string>(trip.travel_to ?? "");
  const dateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Month navigation
  const [currentMonth, setCurrentMonth] = useState(() => {
    const anchor = trip.travel_from
      ? new Date(trip.travel_from + "T00:00:00")
      : new Date();
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  // Re-anchor when travel_from changes
  useEffect(() => {
    if (trip.travel_from) {
      const d = new Date(trip.travel_from + "T00:00:00");
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [trip.travel_from]);

  // Sync travel dates from props
  useEffect(() => {
    setTravelFrom(trip.travel_from ?? "");
    setTravelTo(trip.travel_to ?? "");
  }, [trip.travel_from, trip.travel_to]);

  // Keep local slots in sync
  useEffect(() => {
    setLocalSlots(availSlots);
  }, [availSlots]);

  // Member colour map (deterministic by member order)
  const memberColourMap = useMemo(
    () =>
      new Map(
        members.map((m, i) => [m.id, MEMBER_COLOURS[i % MEMBER_COLOURS.length]])
      ),
    [members]
  );

  // Build lookup: date string -> array of { member_id, tier }
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Array<{ member_id: string; tier: string }>>();
    for (const slot of localSlots) {
      const key = slot.slot_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ member_id: slot.member_id, tier: slot.tier });
    }
    return map;
  }, [localSlots]);

  // Submitted member IDs
  const submittedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of localSlots) ids.add(slot.member_id);
    return ids;
  }, [localSlots]);

  const submittedCount = submittedMemberIds.size;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Travel window range for highlighting
  const travelRange = useMemo(() => {
    if (!trip.travel_from || !trip.travel_to) return null;
    return {
      from: trip.travel_from,
      to: trip.travel_to,
    };
  }, [trip.travel_from, trip.travel_to]);

  // Build calendar days for current month
  const calendarCells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDow = getFirstDayOfWeek(year, month);

    const cells: Array<{ date: Date; inMonth: boolean } | null> = [];

    // Leading empties
    for (let i = 0; i < firstDow; i++) cells.push(null);

    // Days in month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }

    // Trailing empties to fill last row
    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
  }, [currentMonth]);

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

      const previousSlots = [...localSlots];

      if (nextTier === null) {
        setLocalSlots((prev) =>
          prev.filter(
            (s) => !(s.member_id === currentMemberId && s.slot_date === key)
          )
        );
      } else if (existing) {
        setLocalSlots((prev) =>
          prev.map((s) =>
            s.member_id === currentMemberId && s.slot_date === key
              ? { ...s, tier: nextTier }
              : s
          )
        );
      } else {
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
        setLocalSlots(previousSlots);
        toast({
          title: "Failed to update availability",
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
        toast({ title: "Failed to update deadline", variant: "destructive" });
      }
    },
    [joinToken, onTripUpdated, trip.deadline]
  );

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
    dateDebounceRef.current = setTimeout(() => saveDate(newFrom, newTo), 800);
  };

  useEffect(() => {
    return () => {
      if (dateDebounceRef.current) clearTimeout(dateDebounceRef.current);
    };
  }, []);

  // Navigation
  const prevMonth = () =>
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
    );
  const nextMonth = () =>
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
    );

  function isInTravelRange(date: Date): boolean {
    if (!travelRange) return false;
    const key = dateKey(date);
    return key >= travelRange.from && key <= travelRange.to;
  }

  function renderStrips(date: Date) {
    const key = dateKey(date);
    const entries = slotsByDate.get(key);
    if (!entries || entries.length === 0) return null;

    return (
      <div className="flex flex-col gap-[2px] w-full mt-auto">
        {entries.slice(0, 6).map((entry, i) => {
          const colour = memberColourMap.get(entry.member_id);
          if (!colour) return null;

          const isCurrentUser = entry.member_id === currentMemberId;
          const opacity =
            entry.tier === "free" ? 1 : entry.tier === "could_work" ? 0.6 : 1;

          return (
            <div
              key={`${entry.member_id}-${i}`}
              className={cn(
                "h-1 rounded-[1px] w-full",
                isCurrentUser && "ring-1 ring-amber ring-offset-0",
                entry.tier === "unavailable" &&
                  "bg-[repeating-linear-gradient(135deg,transparent,transparent_2px,currentColor_2px,currentColor_3px)]"
              )}
              style={
                entry.tier === "unavailable"
                  ? { color: colour.border, opacity: 0.5 }
                  : { backgroundColor: colour.border, opacity }
              }
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-surface border border-b-subtle rounded-[4px] p-6">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-1">
        When can everyone go?
      </h2>

      {/* Travel dates — organiser sets, everyone sees */}
      <div className="mb-6">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
          When are you travelling?
        </p>
        {isOrganiser ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="font-ui text-xs text-t-secondary block mb-1">
                From
              </label>
              <input
                type="date"
                value={travelFrom}
                onChange={(e) => handleDateChange("from", e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-b-mid rounded-[4px] font-mono text-sm text-t-primary focus:outline-none focus:border-amber transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="font-ui text-xs text-t-secondary block mb-1">
                To
              </label>
              <input
                type="date"
                value={travelTo}
                min={travelFrom}
                onChange={(e) => handleDateChange("to", e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-b-mid rounded-[4px] font-mono text-sm text-t-primary focus:outline-none focus:border-amber transition-colors"
              />
            </div>
          </div>
        ) : (
          <p className="font-mono text-sm text-t-primary">
            {trip.travel_from && trip.travel_to ? (
              `${formatDateDisplay(trip.travel_from)} → ${formatDateDisplay(trip.travel_to)}`
            ) : (
              <span className="text-t-tertiary">Dates not set yet</span>
            )}
          </p>
        )}
      </div>

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

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="h-9 w-9 flex items-center justify-center rounded-[4px] border border-b-mid text-t-secondary hover:bg-hover transition-colors cursor-pointer"
        >
          ←
        </button>
        <span className="font-display text-xl text-t-primary">
          {FULL_MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </span>
        <button
          onClick={nextMonth}
          className="h-9 w-9 flex items-center justify-center rounded-[4px] border border-b-mid text-t-secondary hover:bg-hover transition-colors cursor-pointer"
        >
          →
        </button>
      </div>

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
        {calendarCells.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="min-h-[52px] sm:min-h-[52px]" />;
          }

          const { date } = cell;
          const key = dateKey(date);
          const isPast = date < today;
          const inRange = isInTravelRange(date);
          const myEntry = currentMemberId
            ? localSlots.find(
                (s) => s.member_id === currentMemberId && s.slot_date === key
              )
            : null;

          return (
            <button
              key={key}
              type="button"
              disabled={isPast}
              onClick={() => {
                if (!isPast) handleCellTap(date);
              }}
              className={cn(
                "min-h-[44px] sm:min-h-[52px] p-1 border border-b-subtle/50 flex flex-col items-start",
                "transition-colors rounded-[4px]",
                inRange && "bg-[rgba(240,234,214,0.06)]",
                myEntry && "ring-1 ring-inset ring-amber/40",
                isPast
                  ? "opacity-30 cursor-not-allowed"
                  : "cursor-pointer hover:bg-hover"
              )}
            >
              <span className="font-mono text-xs text-t-primary leading-tight">
                {date.getDate()}
              </span>
              {renderStrips(date)}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-b-subtle">
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
          {members.map((m) => {
            const colour = memberColourMap.get(m.id);
            if (!colour) return null;
            return (
              <div key={m.id} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-[2px]"
                  style={{ backgroundColor: colour.border }}
                />
                <span className="font-ui text-xs text-t-secondary">
                  {m.display_name}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4">
          <span className="font-ui text-xs text-t-tertiary">
            ██ Free
          </span>
          <span className="font-ui text-xs text-t-tertiary">
            ▒▒ Could work
          </span>
          <span className="font-ui text-xs text-t-tertiary">
            ╳╳ Unavailable
          </span>
        </div>
      </div>

      {/* Confirm by / Progress */}
      <div className="mt-4 pt-4 border-t border-b-subtle">
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
            Deadline:{" "}
            {new Date(trip.deadline).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
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

      {/* Inline deadline */}
      {availabilityDeadline &&
        !availabilityDeadline.locked &&
        (() => {
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const days = Math.ceil(
            (new Date(availabilityDeadline.due_date).getTime() -
              now.getTime()) /
              86400000
          );
          return (
            <p
              className={cn(
                "font-ui text-xs mt-4",
                days <= 2 ? "text-terra" : "text-t-tertiary"
              )}
            >
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

#### `frontend/src/components/PersonalPreferencesCard.tsx`

```tsx
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
    activity_categories?: string[];
    activity_details?: string;
    notes?: string;
  } | null;
  onRefresh: () => void;
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

const ACTIVITY_CATEGORIES = [
  { value: "chill", label: "Chill", emoji: "\u{1F305}" },
  { value: "shopping", label: "Shopping", emoji: "\u{1F6CD}\u{FE0F}" },
  { value: "experiences", label: "Experiences", emoji: "\u{1F3AD}" },
  { value: "exploration", label: "Exploration", emoji: "\u{1F9ED}" },
];

export default function PersonalPreferencesCard({
  joinToken,
  existingPrefs,
  onRefresh,
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
  const [activityCategories, setActivityCategories] = useState<string[]>(
    existingPrefs?.activity_categories ?? []
  );
  const [activityDetails, setActivityDetails] = useState<string>(
    existingPrefs?.activity_details ?? ""
  );
  const [notes, setNotes] = useState<string>(existingPrefs?.notes ?? "");
  const [savedVisible, setSavedVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const recognitionRef = useRef<any>(null);

  const toggleCategory = (cat: string) => {
    setActivityCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const save = useCallback(async () => {
    const payload: Record<string, unknown> = {
      accommodation_tier: accommodation || undefined,
      transport_pref: transport || undefined,
      dining_style: dining || undefined,
      activity_categories:
        activityCategories.length > 0 ? activityCategories : undefined,
      activity_details: activityDetails || undefined,
      notes: notes || undefined,
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
    activityCategories,
    activityDetails,
    notes,
    joinToken,
    onRefresh,
  ]);

  // 1s debounce for non-textarea fields
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
  }, [accommodation, transport, dining, activityCategories, notes, save]);

  // 1.5s debounce for detail textarea
  useEffect(() => {
    if (isInitialMount.current) return;

    if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current);
    detailDebounceRef.current = setTimeout(() => {
      save();
    }, 1500);

    return () => {
      if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current);
    };
  }, [activityDetails, save]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current);
    };
  }, []);

  const startRecording = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setActivityDetails((prev) =>
        prev ? `${prev} ${transcript}` : transcript
      );
    };
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const labelClass =
    "font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2 block";

  const segmentedBtn = (selected: boolean) =>
    cn(
      "h-[44px] px-4 rounded-[4px] text-sm transition-colors",
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
              onClick={() =>
                setTransport(transport === opt.value ? "" : opt.value)
              }
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
              onClick={() =>
                setDining(dining === opt.value ? "" : opt.value)
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activities — 4 category cards */}
      <div className="mb-5">
        <label className={labelClass}>What do you want to do?</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ACTIVITY_CATEGORIES.map((cat) => {
            const selected = activityCategories.includes(cat.value);
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => toggleCategory(cat.value)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 h-[72px] rounded-[8px] transition-all",
                  selected
                    ? "border-2 border-amber bg-surface"
                    : "bg-elevated border border-b-mid"
                )}
              >
                <span className="text-xl">{cat.emoji}</span>
                <span
                  className={cn(
                    "font-ui text-sm",
                    selected ? "text-t-primary font-medium" : "text-t-secondary"
                  )}
                >
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detail textarea — shown when any category is selected */}
        {activityCategories.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <label className="font-ui text-xs text-t-tertiary">
                Tell us more
              </label>
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  "flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-ui transition-colors",
                  isRecording
                    ? "bg-terra/20 text-terra"
                    : "bg-elevated text-t-secondary hover:bg-hover"
                )}
              >
                {isRecording && (
                  <span className="w-2 h-2 rounded-full bg-terra animate-pulse" />
                )}
                <span>{isRecording ? "Stop" : "\u{1F3A4} Record"}</span>
              </button>
            </div>
            <textarea
              rows={3}
              placeholder="E.g. we love water sports, want a cooking class, or just want to chill by the pool..."
              className="w-full px-3 py-2 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors resize-none"
              value={activityDetails}
              onChange={(e) => setActivityDetails(e.target.value)}
            />
          </div>
        )}
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

#### `frontend/src/components/GroupInsightsPanel.tsx`

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface GroupInsightsPanelProps {
  joinToken: string;
  groupInsights: {
    vibe_summary: string | null;
    itinerary_notes: string | null;
    friction_flags: Array<{ area: string; detail: string }> | null;
    members_used: number;
    generated_at: string;
  } | null;
  prefsCount: number;
  onRefresh: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function GroupInsightsPanel({
  joinToken,
  groupInsights,
  prefsCount,
  onRefresh,
}: GroupInsightsPanelProps) {
  const [generating, setGenerating] = useState(false);
  const autoTriggered = useRef(false);

  // Auto-generate when ≥2 prefs and no cached insights
  useEffect(() => {
    if (autoTriggered.current) return;
    if (prefsCount < 2 || groupInsights) return;
    autoTriggered.current = true;
    generate();
  }, [prefsCount, groupInsights]);

  const generate = async () => {
    setGenerating(true);
    try {
      await api.post(
        `/api/trips/${joinToken}/insights/generate`,
        {},
        joinToken
      );
      onRefresh();
    } catch {
      // silent — panel stays empty
    } finally {
      setGenerating(false);
    }
  };

  if (prefsCount < 2) return null;

  if (!groupInsights && !generating) return null;

  if (generating && !groupInsights) {
    return (
      <div className="rounded-[4px] border border-b-mid bg-surface p-6">
        <p className="font-ui text-sm text-t-secondary animate-pulse">
          Analysing group preferences...
        </p>
      </div>
    );
  }

  if (!groupInsights) return null;

  const frictionFlags: Array<{ area: string; detail: string }> =
    Array.isArray(groupInsights.friction_flags)
      ? groupInsights.friction_flags
      : [];

  const itineraryLines = (groupInsights.itinerary_notes || "")
    .split("\n")
    .filter((l) => l.trim());

  const isStale = prefsCount > groupInsights.members_used;

  return (
    <div className="rounded-[4px] border border-b-mid bg-surface p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-2xl font-bold text-t-primary">
          Group insights
        </h2>
        {isStale && (
          <span className="font-ui text-xs text-amber">
            Based on {groupInsights.members_used} of {prefsCount} members
          </span>
        )}
      </div>

      {/* GROUP VIBE */}
      {groupInsights.vibe_summary && (
        <div className="mb-5">
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
            Group vibe
          </p>
          <p className="font-ui text-sm text-t-primary leading-relaxed">
            {groupInsights.vibe_summary}
          </p>
        </div>
      )}

      {/* WHAT TO PLAN FOR */}
      {itineraryLines.length > 0 && (
        <div className="mb-5">
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
            What to plan for
          </p>
          <ul className="space-y-1.5">
            {itineraryLines.map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber mt-0.5 text-xs">●</span>
                <span className="font-ui text-sm text-t-secondary">
                  {line.replace(/^[-•]\s*/, "")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* FRICTION FLAGS */}
      {frictionFlags.length > 0 && (
        <div className="mb-4">
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
            Where it might get complicated
          </p>
          <ul className="space-y-1.5">
            {frictionFlags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-terra mt-0.5 text-xs">⚠</span>
                <span className="font-ui text-sm text-t-secondary">
                  <strong className="text-t-primary">{flag.area}:</strong>{" "}
                  {flag.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer: stale time + regenerate */}
      <div className="flex items-center justify-between pt-2 border-t border-b-subtle">
        <span className="font-ui text-xs text-t-tertiary">
          Generated {timeAgo(groupInsights.generated_at)}
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className={cn(
            "font-ui text-xs text-t-secondary hover:text-t-primary transition-colors",
            generating && "opacity-50 pointer-events-none"
          )}
        >
          {generating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>
    </div>
  );
}
```

#### `frontend/src/pages/Index.tsx`

```tsx
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

#### `frontend/src/pages/CreateTrip.tsx`

```tsx
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

#### `frontend/src/pages/JoinTrip.tsx`

```tsx
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
      navigate(`/trip/${code}`);
    } catch (err: any) {
      toast({ title: "Failed to join", description: err.message, variant: "destructive" });
    } finally {
      setJoining(false);
    }
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

        {/* Right — join action */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:pr-[12vw] lg:pl-12 pt-8 lg:pt-0 pb-24 lg:pb-0 max-w-lg lg:max-w-none">
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
        </div>
      </div>
    </div>
  );
};

export default JoinTrip;
```

#### `frontend/src/pages/TripRoom.tsx`

```tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import Header from "@/components/Header";
import MemberCirclesRow from "@/components/MemberCirclesRow";
import DeadlineSetterCollapsed from "@/components/DeadlineSetterCollapsed";
import DestinationSearchCard from "@/components/DestinationSearchCard";
import BudgetCard from "@/components/BudgetCard";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import PersonalPreferencesCard from "@/components/PersonalPreferencesCard";
import GroupInsightsPanel from "@/components/GroupInsightsPanel";
import TripSummaryCard from "@/components/TripSummaryCard";
import { api, getTokens } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

interface Member {
  id: string;
  display_name: string;
  is_organiser: boolean;
  has_confirmed: boolean;
  confirmed_at: string | null;
  joined_at: string;
}

interface Deadline {
  item_type: string;
  due_date: string;
  locked: boolean;
}

interface Destination {
  id: string;
  name: string;
  tagline: string | null;
  pros: string[];
  cons: string[];
  estimated_cost_min: number | null;
  estimated_cost_max: number | null;
  cost_breakdown: any | null;
  nights: number | null;
  votes: number;
  voter_member_ids: string[];
  added_by_member_id: string | null;
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
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [budgetEstimate, setBudgetEstimate] = useState<any>(null);
  const [groupInsights, setGroupInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      setDeadlines(data.deadlines ?? []);
      setDestinations(data.destinations ?? []);
      setBudgetEstimate(data.budget_estimate ?? null);
      setGroupInsights(data.group_insights ?? null);
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

  // Stable ref to fetchTrip so Realtime callback doesn't cause re-subscriptions
  const fetchTripRef = useRef(fetchTrip);
  fetchTripRef.current = fetchTrip;

  // Supabase Realtime
  useEffect(() => {
    if (!supabase || !trip?.id) return;

    const refetch = () => fetchTripRef.current();

    const channel = supabase
      .channel(`triproom-${trip.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "destination_options", filter: `trip_id=eq.${trip.id}` },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "destination_votes", filter: `trip_id=eq.${trip.id}` },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${trip.id}` },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${trip.id}` },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budget_preferences", filter: `trip_id=eq.${trip.id}` },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability_slots", filter: `trip_id=eq.${trip.id}` },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_insights", filter: `trip_id=eq.${trip.id}` },
        refetch
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Realtime subscription failed:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trip?.id]);

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

  // ─── Destination handlers ───

  const handleVote = async (destId: string) => {
    if (!joinToken) return;

    // Optimistic update
    setDestinations((prev) =>
      prev.map((d) => {
        if (d.id !== destId) return d;
        const alreadyVoted = currentMemberId
          ? d.voter_member_ids.includes(currentMemberId)
          : false;
        if (alreadyVoted) {
          return {
            ...d,
            votes: d.votes - 1,
            voter_member_ids: d.voter_member_ids.filter((id) => id !== currentMemberId),
          };
        }
        return {
          ...d,
          votes: d.votes + 1,
          voter_member_ids: currentMemberId
            ? [...d.voter_member_ids, currentMemberId]
            : d.voter_member_ids,
        };
      })
    );

    try {
      await api.post(
        `/api/trips/${joinToken}/destinations/${destId}/vote`,
        {},
        joinToken
      );
      await fetchTrip();
    } catch (err: any) {
      // Rollback — refetch
      await fetchTrip();
      toast({ title: "Vote failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveDestination = async (destId: string) => {
    if (!joinToken) return;
    try {
      await api.delete(`/api/trips/${joinToken}/destinations/${destId}`, joinToken);
      await fetchTrip();
      toast({ title: "Destination removed" });
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    }
  };

  const handleSelectDestination = async (destId: string) => {
    if (!joinToken) return;
    try {
      await api.patch(
        `/api/trips/${joinToken}`,
        { selected_destination_id: destId },
        joinToken
      );
      await fetchTrip();
      toast({ title: "Destination locked in" });
    } catch (err: any) {
      toast({ title: "Selection failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDeselectDestination = async () => {
    if (!joinToken) return;
    try {
      await api.patch(
        `/api/trips/${joinToken}`,
        { selected_destination_id: null },
        joinToken
      );
      await fetchTrip();
      toast({ title: "Selection cleared" });
    } catch (err: any) {
      toast({ title: "Failed to clear", description: err.message, variant: "destructive" });
    }
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


  const myPrefs = budgetPrefs.find((p: any) => p.member_id === currentMemberId) ?? null;

  // Deadline lookups
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
  headerParts.push(`${members.length} people`);

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
        />

        {/* Deadline setter — organiser only */}
        {isOrganiser && (
          <div className="mt-4">
            <DeadlineSetterCollapsed
              joinToken={joinToken!}
              deadlines={deadlines}
              onUpdated={fetchTrip}
            />
          </div>
        )}

        {/* Summary card */}
        <div className="mt-6">
          <TripSummaryCard
            trip={trip}
            destinations={destinations}
            budgetPrefs={budgetPrefs}
            groupInsights={groupInsights}
            members={members}
          />
        </div>

        {/* Card 1 — Destination */}
        <div className="mt-8">
          <DestinationSearchCard
            joinToken={joinToken!}
            trip={trip}
            destinations={destinations}
            currentMemberId={currentMemberId}
            isOrganiser={isOrganiser}
            onTripUpdated={fetchTrip}
            onVote={handleVote}
            onRemove={handleRemoveDestination}
            onSelect={handleSelectDestination}
            onDeselect={handleDeselectDestination}
            deadline={destDeadline}
          />
        </div>

        {/* Card 2 — Budget */}
        <div className="mt-6">
          <BudgetCard
            joinToken={joinToken!}
            budgetPrefs={budgetPrefs}
            members={members}
            currentMemberId={currentMemberId}
            onTripUpdated={fetchTrip}
            deadline={budgetDeadline}
            cachedAnalysis={budgetEstimate?.breakdown ?? null}
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
            availabilityDeadline={availDeadline}
          />
        </div>

        {/* Card 4 — Personal Preferences */}
        <div className="mt-6">
          <PersonalPreferencesCard
            joinToken={joinToken!}
            existingPrefs={myPrefs}
            onRefresh={fetchTrip}
          />
        </div>
        {/* Group Insights */}
        <div className="mt-6">
          <GroupInsightsPanel
            joinToken={joinToken!}
            groupInsights={groupInsights}
            prefsCount={budgetPrefs.length}
            onRefresh={fetchTrip}
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

#### `frontend/src/pages/NotFound.tsx`

```tsx
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

---

## 12. Git History

```
55e6264 V8: Average budget row, activity redesign, AI group insights, summary card, Realtime
40dfa8c V7: Remove card gating, per-member budget, AI analysis, calendar redesign, Realtime fix
7161eeb V6: Shared destination voting + remove couple model
a7cd5f7 AI suggest: add user input textarea + member preferences context
486ef18 Add project documentation: Draft2, Draft3, Draft4, Version6
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

## 13. What Works Today

- **Trip creation** — name, organiser name, group size. Generates join_token URL slug.
- **Trip joining** — invite link (/join/:code or /t/:code), name input, member_token generation
- **Destination search** — search by name, get AI cost breakdown + summary, auto-saves to destination_options
- **AI destination suggest** — free-text prompt or no prompt, returns 3 destination name chips to explore
- **Destination voting** — one vote per member, optimistic UI, organiser can lock winner
- **Destination removal** — organiser can remove (unless selected)
- **Per-member budget** — each member sets min/max trip budget via dropdowns, auto-saves with 800ms debounce
- **Group budget average** — appears when 2+ members submit, rounded to nearest 500
- **AI budget analysis** — auto-triggers when 2+ budgets exist, shows verdict + destination fits
- **Availability calendar** — multi-member, coloured strips per person, tap to cycle tiers, single-slot upsert
- **Travel date editing** — organiser sets from/to dates in calendar card, auto-saves
- **Personal preferences** — accommodation, transport, dining segmented buttons + activity category cards + detail textarea with voice recording
- **AI group insights** — auto-generates when 2+ prefs exist: vibe summary, itinerary notes, friction flags
- **Trip summary card** — 3-column overview: destination (selected or leading), budget average, group activity wants + vibe snippet
- **Deadlines** — organiser sets per-item deadlines, auto-lock past-due, inline countdown on each card
- **Confirmation** — sticky "I'm in" button, confirmed state persists
- **Nudge** — organiser can nudge unconfirmed members (24h cooldown)
- **Realtime** — 7-table Supabase Realtime subscription, all changes trigger full refetch
- **Tab focus refetch** — data refreshes on tab visibility change
- **Share link** — copy invite link to clipboard
- **Map background** — Leaflet map with geolocation, fixed behind all content
- **Voice recording** — Web Speech API for activity detail input (en-IN locale)

---

## 14. Known Issues & Next Steps

### Known Issues

- **No RLS (Row Level Security)** — all Supabase queries use the service key. Anyone who reverse-engineers the API could read/write any trip's data. Priority for production.
- **No rate limiting** — AI endpoints (Gemini) have no request throttling. A malicious user could burn through the API quota.
- **Realtime publication gap** — if a table was already in the publication before running a migration `ALTER PUBLICATION ... ADD TABLE`, the statement errors silently. The v7 migration handles this by running each statement independently.
- **Budget preferences CHECK constraints** — the original v2 migration has `NOT NULL` constraints on accommodation_tier, transport_pref, dining_style, but V7+ auto-save sends partial payloads. These constraints may need to be relaxed to `NULL`-able in production.
- **Bundle size** — Leaflet + framer-motion + Radix UI add significant weight. Consider lazy-loading the map.
- **No offline support** — optimistic updates exist for voting but not for other operations.

### Next Steps

- Add RLS policies for all tables
- Rate limit AI endpoints
- Add trip deletion (organiser only)
- Push notifications for nudges
- Export trip summary as PDF
- Dark mode support (CSS variables are ready)
- Member profile pictures
- Trip photo gallery
