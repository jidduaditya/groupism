# Groupism — Draft 3: Env Var Fix + Diagnostic Infrastructure

**Date:** 2 April 2026
**Status:** V1 + V2 features live, Railway 500 diagnosed and fixed (env var name mismatch), diagnostic tooling added
**Previous:** Draft2 — V2 features, create flow restructure, budget/availability/deadlines

---

## Table of Contents

1. [What Changed Since Draft 2](#1-what-changed-since-draft-2)
2. [Current Architecture](#2-current-architecture)
3. [Database Schema](#3-database-schema)
4. [API Endpoints](#4-api-endpoints)
5. [Frontend Components](#5-frontend-components)
6. [Create Flow](#6-create-flow)
7. [Organiser Setup Panel](#7-organiser-setup-panel)
8. [Version Toggle (v1/v2)](#8-version-toggle-v1v2)
9. [Realtime Subscriptions](#9-realtime-subscriptions)
10. [Gemini AI Functions](#10-gemini-ai-functions)
11. [Auth & Token System](#11-auth--token-system)
12. [Bugs & Mistakes Log](#12-bugs--mistakes-log)
13. [Deployment & Environment](#13-deployment--environment)
14. [Complete Code](#14-complete-code)
15. [Git History](#15-git-history)
16. [What Works Today](#16-what-works-today)
17. [Known Issues & Next Steps](#17-known-issues--next-steps)

---

## 1. What Changed Since Draft 2

| Area | Draft 2 | Draft 3 |
|------|---------|---------|
| POST /api/trips | 500 on production (Railway) | Fixed — env var name mismatch (`SUPABASE_URL` vs `SUPABASE_PROJECT_URL`) |
| Error handling | Trip creation had no try/catch; errors hit global handler as generic 500 | Full try/catch with `detail` field in error responses |
| Env var names | Code only accepted `SUPABASE_URL` | Now accepts `SUPABASE_URL` OR `SUPABASE_PROJECT_URL` |
| Startup diagnostics | None | Env var presence check logged at startup |
| Debug endpoint | None | `/debug/env-check` (temporary) — reports which env vars are SET vs MISSING |

### Key bug fix
**Root cause:** Railway had the Supabase URL stored as `SUPABASE_PROJECT_URL`, but `backend/src/lib/supabase.ts` only checked for `SUPABASE_URL`. The Proxy-based lazy init threw `Missing SUPABASE_URL or SUPABASE_SERVICE_KEY`, which was an uncaught exception that hit the global error handler as a generic `{"error":"Internal server error"}`. Health check still worked because it doesn't touch Supabase.

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

**Auth model:** `x-member-token` + `x-organiser-token` in HTTP headers, stored in localStorage per trip.

---

## 3. Database Schema

### V1 Tables (5)

```sql
-- trips
id              uuid primary key default gen_random_uuid()
name            text not null
join_token      text not null unique
organiser_token text not null
budget_min      numeric
budget_max      numeric
travel_from     date
travel_to       date
deadline        date
created_at      timestamptz not null default now()

-- trip_members
id              uuid primary key default gen_random_uuid()
trip_id         uuid not null references trips(id) on delete cascade
display_name    text not null
member_token    text not null
is_organiser    boolean not null default false
has_confirmed   boolean not null default false
confirmed_at    timestamptz
joined_at       timestamptz not null default now()
-- Indexes: idx_trip_members_trip, idx_trip_members_token(trip_id, member_token)

-- destination_options
id                  uuid primary key
trip_id             uuid not null references trips(id)
name                text not null
tagline             text
pros, cons          jsonb default '[]'
best_for            text
estimated_cost_min  numeric
estimated_cost_max  numeric
source              text not null default 'manual'  -- 'manual' or 'ai'
created_at          timestamptz

-- destination_votes
id              uuid primary key
trip_id         uuid not null references trips(id)
destination_id  uuid not null references destination_options(id)
member_id       uuid not null references trip_members(id)
unique (trip_id, member_id)  -- one vote per member per trip

-- nudge_log
id                uuid primary key
trip_id           uuid not null references trips(id)
target_member_id  uuid not null references trip_members(id)
sent_at           timestamptz not null default now()
```

### V2 Tables (5)

```sql
-- budget_preferences (trip_id, member_id unique)
accommodation_tier  text CHECK ('budget','mid','premium')
transport_pref      text CHECK ('bus_train','flight','self_drive')
dining_style        text CHECK ('local_cheap','mixed','restaurants')
activities          text[]
daily_budget_min/max numeric
notes               text

-- budget_estimates (trip_id unique)
per_person_min/max  numeric
breakdown           jsonb  {accommodation/transport/food/activities → {min,max,note}}
divergence_flags    jsonb  [{issue, gap_description}]
members_included    int

-- availability_slots (trip_id, member_id, slot_date unique)
slot_date           date
tier                text CHECK ('unavailable','free','could_work')

-- travel_windows (trip_id unique)
windows             jsonb  [{start_date, end_date, nights, score, summary, ...}]

-- deadlines (trip_id, item_type unique)
item_type           text CHECK ('destination_vote','availability','budget_input','confirmation')
due_date            date
locked              boolean
```

### Realtime Publications
Enabled: `budget_preferences`, `availability_slots`, `deadlines`, `trips`
**NOT enabled (known issue):** `destination_votes`, `trip_members`

### Migration Files
- `backend/supabase/migration.sql` — V1 schema
- `backend/supabase/migration_v2.sql` — V2 tables + Realtime (idempotent)
- `backend/supabase/migration_v3_trips_realtime.sql` — trips Realtime publication

---

## 4. API Endpoints

### POST /api/trips — Create trip
- **Auth:** None
- **Body:** `{ name, organiser_name }`
- **Returns:** `{ trip_id, join_token, join_url, organiser_token, member_token, member_id }`
- **Error handling:** Full try/catch with `detail` field in error responses

### PATCH /api/trips/:joinToken — Update trip
- **Auth:** requireOrganiser
- **Body:** `{ budget_min?, budget_max?, travel_from?, travel_to?, deadline? }`

### GET /api/trips/:joinToken — Fetch all trip data
- **Auth:** loadTrip
- **Returns:** Full trip state including V2 data, readiness scores, auto-locks past-due deadlines

### POST /api/trips/:joinToken/join — Join trip
### POST /api/trips/:joinToken/confirm — Confirm participation
### POST /api/trips/:joinToken/nudge — Nudge unconfirmed (24h cooldown)

### GET/POST /api/trips/:joinToken/destinations — List/add destinations
### POST /api/trips/:joinToken/destinations/:destId/vote — Cast vote

### POST /api/trips/:joinToken/ai-suggest — AI destination suggestions

### POST /api/trips/:joinToken/budget/preferences — Submit budget prefs
### POST /api/trips/:joinToken/budget/estimate — AI budget estimate
### GET /api/trips/:joinToken/budget — Fetch prefs + estimate

### POST /api/trips/:joinToken/availability — Submit date slots
### POST /api/trips/:joinToken/availability/windows — AI travel windows
### GET /api/trips/:joinToken/availability — Fetch slots + windows

### POST /api/trips/:joinToken/deadlines — Set deadlines
### POST /api/trips/:joinToken/deadlines/lock/:itemType — Lock deadline
### GET /api/trips/:joinToken/deadlines — Fetch deadlines

### GET /health — Health check (before CORS)
### GET /debug/env-check — Temporary env var diagnostic (before CORS)

---

## 5. Frontend Components

### Pages
| File | Purpose |
|------|---------|
| `Index.tsx` | Landing page — animated hero, "Create a Room" + invite code input |
| `CreateTrip.tsx` | 3 fields: trip name, organiser name, group size → POST /api/trips |
| `JoinTrip.tsx` | Join via invite link — shows trip info, name input |
| `TripRoom.tsx` | Main room: setup panel + v1/v2 sections + Realtime |
| `NotFound.tsx` | 404 page |

### Core Components
| File | Purpose |
|------|---------|
| `Header.tsx` | Fixed header with "Groupism" branding |
| `DestinationCard.tsx` | Vote card: large vote count, name, pros/cons, CTA |
| `ReadinessBar.tsx` | V1 member list with 3-state underlines |
| `OrganiserSetupPanel.tsx` | Progressive 3-step: budget → dates → AI |
| `MapBackground.tsx` | Leaflet map background with geolocation |

### V2 Components (`components/v2/`)
| File | Purpose |
|------|---------|
| `TripRoomV2Sections.tsx` | Orchestrator: readiness → deadlines → destinations → availability → budget → confirm |
| `GroupReadinessPanel.tsx` | 4D readiness bar + member × task grid |
| `BudgetPreferenceForm.tsx` | Segmented controls + activity pills + daily budget range |
| `BudgetEstimateDisplay.tsx` | AI estimate: total, breakdown table, divergence flags |
| `AvailabilityInput.tsx` | 6-week calendar grid, tap to cycle tiers |
| `TravelWindowsDisplay.tsx` | Top 3 ranked travel windows from AI |
| `DeadlineManager.tsx` | Organiser sets deadlines per item_type |
| `DeadlineCountdown.tsx` | Inline badge: "Due in X days" / "Due today" / "Closed" |

### UI Primitives (`components/ui/`)
- `button.tsx` — Variants: amber, outline-strong, ghost, destructive
- `sonner.tsx` — Sonner toast wrapper
- `toast.tsx` / `toaster.tsx` — Radix UI toast primitives
- `tooltip.tsx` — Radix UI tooltip

---

## 6. Create Flow

```
/create → Name + Organiser name + Group size only
        → "Create Trip Room →" button → POST /api/trips → /trip/:joinToken

/trip/:joinToken (organiser, first visit)
        → Setup Panel: Budget → Dates → AI (progressive, collapsing sections)
        → Trip Room becomes live once organiser completes setup
```

Frontend sends only `{ name, organiser_name }`. Budget, dates, AI moved to OrganiserSetupPanel.

---

## 7. Organiser Setup Panel

**File:** `frontend/src/components/OrganiserSetupPanel.tsx`

Three sequential sections:
1. **Budget** — Min/max inputs + preset pills (₹5K, ₹10K, ₹15K, ₹25K+) → PATCH trips
2. **Dates** — FROM, TO, Confirm-by → PATCH trips
3. **AI Suggestions** — Optional notes → POST ai-suggest → shimmer loading → destination cards

Panel visibility: `isOrganiser && !setupDismissed && (budget_min === null || travel_from === null || destinations.length === 0)`

---

## 8. Version Toggle (v1/v2)

- `localStorage('groupism:version')`, defaults to `'v1'`
- Pill button in TripRoom header
- V1: ReadinessBar, destinations, members, budget confirm
- V2: GroupReadinessPanel, deadlines, destinations, availability, budget prefs, AI estimates, confirm

---

## 9. Realtime Subscriptions

**File:** `frontend/src/pages/TripRoom.tsx` — Supabase channel `trip-${trip.id}`

| Table | Event |
|-------|-------|
| `destination_votes` | `*` |
| `trip_members` | `*` |
| `trips` | `UPDATE` |
| `budget_preferences` | `*` |
| `availability_slots` | `*` |
| `deadlines` | `*` |

All trigger `fetchTrip()` to refresh entire room state. Also refetches on tab focus (`visibilitychange`).

---

## 10. Gemini AI Functions

**File:** `backend/src/lib/gemini.ts` — Uses `gemini-2.5-flash`

### getDestinationSuggestions(params)
- Input: groupSize, budgetMin/Max, travelFrom/To, notes
- Output: 3 destinations with name, tagline, pros/cons, best_for, estimated_cost
- Prompt: Indian domestic travel, honest tradeoffs

### estimateBudget(params)
- Input: destination name, member preferences[], travel dates
- Output: `{ per_person_min, per_person_max, breakdown, divergence_flags }`
- Prompt: Identify divergence between members

### rankTravelWindows(params)
- Input: members with names, availability slots (with tiers), trip duration
- Output: Top 3 windows `[{ start_date, end_date, nights, score, summary, stretching/unavailable members }]`

All functions: strip markdown fences before JSON.parse, throw `'AI_UNAVAILABLE'` on failure → routes return 503.

---

## 11. Auth & Token System

**File:** `backend/src/middleware/tokens.ts`

Three-tier token system (no JWT/session):

1. **loadTrip** — Extracts `joinToken` from URL → queries `trips.join_token` → attaches to `req.trip`
2. **requireMember** — Checks `x-member-token` header → queries `trip_members` → attaches to `req.member`
3. **requireOrganiser** — Checks `x-organiser-token` header → **constant-time comparison** (`crypto.timingSafeEqual`) against `trip.organiser_token`

Token generation (`backend/src/lib/tokens.ts`):
- `generateOrganiserToken()` → 64-char hex (256-bit)
- `generateMemberToken()` → 32-char hex (128-bit)
- `generateJoinToken(name)` → URL-safe slug: `"goa-march-a3f2"`

Frontend token storage (`frontend/src/lib/api.ts`):
- `localStorage('triphaus:${joinToken}')` → `{ memberToken, memberId, organiserToken? }`
- Headers injected automatically by `api.get/post/patch`

---

## 12. Bugs & Mistakes Log

### Bug 1: Supabase Realtime publication duplicate (FIXED — Draft 2)
- **Fix:** `IF NOT EXISTS` check in migration_v2.sql

### Bug 2: POST /api/trips 500 — undefined fields (FIXED — Draft 2)
- **Fix:** Build insert object conditionally, only include fields when `!= null`

### Bug 3: CORS rejection (FIXED — Draft 2)
- **Fix:** Hardcoded Vercel origin + return `false` instead of throwing

### Bug 4: Realtime not firing for votes/members (KNOWN)
- `destination_votes` and `trip_members` NOT in `supabase_realtime` publication

### Bug 5: POST /api/trips 500 on Railway production (FIXED — Draft 3)
- **Error:** `{"error":"Internal server error"}` on POST /api/trips
- **Root cause:** Railway env var named `SUPABASE_PROJECT_URL`, code only checked `SUPABASE_URL`
- **Diagnosis path:** Health check passed (no Supabase), POST failed. Added try/catch with `detail` field → response showed `"Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"`. Checked Railway Variables screenshot → `SUPABASE_PROJECT_URL` not `SUPABASE_URL`.
- **Fix:** `supabase.ts` now accepts `process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL`
- **Files:** `backend/src/lib/supabase.ts`, `backend/src/index.ts`, `backend/src/routes/trips.ts`, `backend/src/app.ts`
- **Lesson:** Always accept common env var name variants. Add startup diagnostics that log which required env vars are present.

---

## 13. Deployment & Environment

### Railway Environment Variables (current)
| Variable | Status |
|----------|--------|
| `ANON_KEY` | SET (Supabase anon JWT) |
| `FRONTEND_URL` | SET (`https://groupism-p9g9.vercel.app,http://localhost:5173`) |
| `GEMINI_API_KEY` | SET |
| `SUPABASE_API_KEY` | SET (service role secret) |
| `SUPABASE_PROJECT_URL` | SET (`https://ebmhfmnqdorzasyyufzy.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | SET (anon key) |
| `SUPABASE_SERVICE_KEY` | SET (service role JWT) |
| + 8 Railway auto-injected vars | SET |

### Vercel Environment Variables (frontend)
| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend URL (Railway) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (for Realtime) |

### Build & Deploy
- **Backend:** `tsc` → `node dist/index.js` (Railway auto-detects via `package.json`)
- **Frontend:** Vite build → Vercel auto-deploys from GitHub
- **Port:** Railway routes to port from `PORT` env var (default 3001)

### Startup Diagnostics
`backend/src/index.ts` now logs at startup:
```
Env check: SUPABASE_URL=SET SUPABASE_SERVICE_KEY=SET GEMINI_API_KEY=SET FRONTEND_URL=SET
```

### Temporary Debug Endpoint
`GET /debug/env-check` — Returns which env vars are SET/MISSING (no values exposed). Remove after confirming production works.

---

## 14. Complete Code

### Backend

#### `backend/src/app.ts`
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

// ─── Health endpoint BEFORE any middleware ────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Temporary debug endpoint — remove once env vars confirmed ────────────────
app.get('/debug/env-check', (_req, res) => {
  const vars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'GEMINI_API_KEY', 'FRONTEND_URL', 'PORT', 'NODE_ENV'];
  res.json(Object.fromEntries(vars.map(k => [k, process.env[k] ? 'SET' : 'MISSING'])));
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

#### `backend/src/index.ts`
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

#### `backend/src/lib/supabase.ts`
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

#### `backend/src/lib/tokens.ts`
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

#### `backend/src/lib/gemini.ts`
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

#### `backend/src/middleware/tokens.ts`
```typescript
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { supabase } from '../lib/supabase';

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

#### `backend/src/routes/trips.ts`
```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { generateOrganiserToken, generateMemberToken, generateJoinToken } from '../lib/tokens';
import { loadTrip, requireOrganiser } from '../middleware/tokens';

const router = Router();

// POST /api/trips — create a new trip
router.post('/', async (req, res) => {
  try {
    const { name, budget_min, budget_max, travel_from, travel_to, deadline, organiser_name } = req.body;

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

    const organiser_token = generateOrganiserToken();
    const member_token    = generateMemberToken();
    let   join_token      = generateJoinToken(name);

    const tripData: Record<string, any> = { name, join_token, organiser_token };
    if (budget_min  != null) tripData.budget_min  = budget_min;
    if (budget_max  != null) tripData.budget_max  = budget_max;
    if (travel_from)         tripData.travel_from = travel_from;
    if (travel_to)           tripData.travel_to   = travel_to;
    if (deadline)            tripData.deadline    = deadline;

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

// PATCH and GET handlers unchanged from Draft 2 — see full source
```

*(Route files for members, destinations, ai, budget, availability, deadlines are unchanged from Draft 2 — full source in repo)*

### Frontend

#### `frontend/src/lib/api.ts`
```typescript
const BASE = import.meta.env.VITE_API_URL || "https://groupism-production.up.railway.app";

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
  try { return JSON.parse(raw); } catch { return null; }
}

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
    fetch(`${BASE}${path}`, { method: "POST", headers: headers(joinToken), body: JSON.stringify(body) }).then(handleRes),
  patch: (path: string, body: unknown, joinToken?: string) =>
    fetch(`${BASE}${path}`, { method: "PATCH", headers: headers(joinToken), body: JSON.stringify(body) }).then(handleRes),
};
```

#### `frontend/src/lib/supabase.ts`
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
```

*(Full source for all frontend pages and components is in the repo — key files documented in sections above)*

---

## 15. Git History

```
2bba6bd  Fix env var name mismatch: accept SUPABASE_PROJECT_URL as fallback
83384a9  Add startup env var check and /debug/env-check endpoint
e8df5c1  Add diagnostic error detail to POST /api/trips 500 response
465fa9a  Fix POST /api/trips 500: filter undefined optional fields from insert payload
e576c65  Restructure create trip flow: move budget, dates, AI to TripRoom setup panel
3a6a695  Fix CORS: hardcode Vercel origin and stop throwing on rejected origins
2827dbd  Add V2 features: budget estimation, availability mapping, deadlines, group readiness with version toggle
ae569ee  Fix 9 delta bugs, add Supabase Realtime, Vercel experimentalServices
68640af  Add complete backend and frontend for Triphaus
ed04962  first commit
```

---

## 16. What Works Today

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
- [x] **POST /api/trips working on Railway production** (Draft 3 fix)
- [x] **Startup env var diagnostics**
- [x] **Error detail in trip creation failures**

---

## 17. Known Issues & Next Steps

### Issues
1. `destination_votes` and `trip_members` not in Realtime publication — cross-tab vote/join updates won't fire
2. Frontend bundle is 641KB gzipped (198KB) — chunk splitting recommended
3. No RLS policies on any table — backend uses service key, but should add if client-side access is ever enabled
4. `/debug/env-check` endpoint should be removed after confirming production works

### Next Steps
- Run the `destination_votes` + `trip_members` Realtime publication SQL
- Test full end-to-end flow on production (Vercel + Railway)
- Remove `/debug/env-check` once confirmed
- Consider code-splitting v2 components with `React.lazy()`
- Mobile testing: calendar grid touch targets, date input UX

---

## Current File Map

```
backend/
├── src/
│   ├── app.ts                          Express setup, CORS, route mounting, debug endpoint
│   ├── index.ts                        Server startup + env var diagnostics
│   ├── lib/
│   │   ├── gemini.ts                   3 AI functions (destinations, budget, windows)
│   │   ├── supabase.ts                 Lazy-init Supabase (accepts SUPABASE_URL or SUPABASE_PROJECT_URL)
│   │   └── tokens.ts                   Token generation (organiser, member, join)
│   ├── middleware/
│   │   └── tokens.ts                   loadTrip, requireMember, requireOrganiser
│   └── routes/
│       ├── trips.ts                    POST create (with try/catch), PATCH update, GET fetch-all
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
├── package.json                        express 5.2, @supabase/supabase-js, @google/generative-ai
└── tsconfig.json                       ES2020, strict, commonjs

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
│   │   ├── Index.tsx                   Landing page (animated hero)
│   │   ├── CreateTrip.tsx              3 fields: name, organiser, group size
│   │   ├── JoinTrip.tsx                Join via invite link
│   │   ├── TripRoom.tsx                Main room: setup panel + v1/v2 sections
│   │   └── NotFound.tsx                404
│   └── components/
│       ├── Header.tsx                  Logo + nav
│       ├── MapBackground.tsx           Leaflet background
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
├── vite.config.ts                      React SWC, path alias
└── package.json                        react 18.3, react-router, supabase, framer-motion, leaflet
```
