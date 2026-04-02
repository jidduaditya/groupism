# Groupism — Draft 1: Complete Project Documentation

**Date:** 2 April 2026
**Status:** Backend + Frontend integrated, AI working, 9 delta bugs fixed

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Database Schema](#3-database-schema)
4. [API Endpoints](#4-api-endpoints)
5. [Complete Source Code](#5-complete-source-code)
6. [Frontend ↔ Backend Integration Map](#6-frontend--backend-integration-map)
7. [Gemini AI Flow](#7-gemini-ai-flow)
8. [Token & Auth Flow](#8-token--auth-flow)
9. [Known Bugs & Mistakes](#9-known-bugs--mistakes)
10. [Missing Links & Dead Ends](#10-missing-links--dead-ends)
11. [What Works Today](#11-what-works-today)
12. [Next Steps to Fix](#12-next-steps-to-fix)

---

## 1. Architecture Overview

```
┌─────────────────┐     REST API     ┌─────────────────┐     SQL      ┌──────────────┐
│   React/Vite    │ ──────────────── │  Express/TS     │ ──────────── │   Supabase   │
│   localhost:5173 │   fetch + JSON  │  localhost:3001  │  supabase-js │   PostgreSQL │
└─────────────────┘                  └────────┬────────┘              └──────────────┘
                                              │
                                              │ Gemini API
                                              ▼
                                     ┌─────────────────┐
                                     │  Google Gemini   │
                                     │  2.5 Flash       │
                                     └─────────────────┘
```

**Identity model:** No OAuth, no JWT, no accounts. Two tokens in HTTP headers:
- `x-member-token` — proves membership (stored in browser localStorage)
- `x-organiser-token` — proves trip ownership (stored only in organiser's browser)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS, shadcn/ui, @supabase/supabase-js (Realtime) |
| Backend | Express 5, TypeScript, ts-node-dev |
| Database | Supabase (PostgreSQL) |
| AI | Google Gemini 2.5 Flash via @google/generative-ai |
| Fonts | Fraunces (display), Geist (UI), JetBrains Mono (mono) |
| Map | Leaflet with CartoDB tiles |
| Deploy | Railway (backend), Vercel (frontend) |

---

## 3. Database Schema

**File:** `backend/supabase/migration.sql`

```sql
-- Trips
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

-- Trip Members
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

-- Destination Options
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

-- Destination Votes (one vote per member per trip)
create table if not exists destination_votes (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references trips (id) on delete cascade,
  destination_id  uuid not null references destination_options (id) on delete cascade,
  member_id       uuid not null references trip_members (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (trip_id, member_id)
);

-- Nudge Log
create table if not exists nudge_log (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references trips (id) on delete cascade,
  target_member_id  uuid not null references trip_members (id) on delete cascade,
  sent_at           timestamptz not null default now()
);
```

All tables cascade delete from `trips`. Deleting a trip cleans everything.

---

## 4. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| POST | `/api/trips` | None | Create trip, returns tokens |
| GET | `/api/trips/:joinToken` | None | Fetch trip room (members, destinations, readiness) |
| POST | `/api/trips/:joinToken/join` | None | Join trip with display_name + member_token |
| POST | `/api/trips/:joinToken/confirm` | x-member-token | Confirm budget/dates |
| POST | `/api/trips/:joinToken/nudge` | x-organiser-token | Nudge unconfirmed members (24h rate limit) |
| GET | `/api/trips/:joinToken/destinations` | None | List destinations with vote counts |
| POST | `/api/trips/:joinToken/destinations` | x-organiser-token | Add manual destination |
| POST | `/api/trips/:joinToken/destinations/:destId/vote` | x-member-token | Vote (upsert — changes existing vote) |
| POST | `/api/trips/:joinToken/ai-suggest` | x-organiser-token | Get 3 AI suggestions via Gemini |

---

## 5. Complete Source Code

### Backend

#### `backend/src/index.ts`
```typescript
import 'dotenv/config';
import app from './app';

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`Triphaus backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
```

#### `backend/src/app.ts`
```typescript
import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import tripsRouter        from './routes/trips';
import membersRouter      from './routes/members';
import destinationsRouter from './routes/destinations';
import aiRouter           from './routes/ai';

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));

app.use('/api/trips',                         tripsRouter);
app.use('/api/trips/:joinToken',              membersRouter);
app.use('/api/trips/:joinToken/destinations', destinationsRouter);
app.use('/api/trips/:joinToken/ai-suggest',   aiRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException',  err    => console.error('Uncaught exception:', err));
process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));

export default app;
```

#### `backend/src/lib/supabase.ts`
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }
  _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});
```

#### `backend/src/lib/tokens.ts`
```typescript
import { randomBytes } from 'crypto';

export function generateOrganiserToken(): string {
  return randomBytes(32).toString('hex');
}

export function generateMemberToken(): string {
  return randomBytes(16).toString('hex');
}

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

Suggest exactly 3 destination options. Be specific and honest — real tradeoffs, not marketing copy. Vary the destinations meaningfully.

Return ONLY valid JSON. No markdown fences. No explanation. Exactly this structure:
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

Costs are per person in INR: accommodation + food + local transport only.`;

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
    .from('trips').select('*').eq('join_token', joinToken).single();

  if (error || !trip) return res.status(404).json({ error: 'Trip not found' });
  (req as any).trip = trip;
  next();
}

export async function requireMember(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-member-token'] as string;
  if (!token) return res.status(401).json({ error: 'x-member-token header required' });

  const trip = (req as any).trip;
  const { data: member, error } = await supabase
    .from('trip_members').select('*')
    .eq('trip_id', trip.id).eq('member_token', token).single();

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
import { loadTrip } from '../middleware/tokens';

const router = Router();

router.post('/', async (req, res) => {
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

  const { data: trip, error } = await supabase
    .from('trips')
    .insert({ name, join_token, organiser_token, budget_min, budget_max, travel_from, travel_to, deadline })
    .select().single();

  if (error?.code === '23505') {
    join_token = generateJoinToken(name);
    const retry = await supabase
      .from('trips')
      .insert({ name, join_token, organiser_token, budget_min, budget_max, travel_from, travel_to, deadline })
      .select().single();
    if (retry.error) return res.status(500).json({ error: 'Failed to create trip' });

    const { data: member } = await supabase
      .from('trip_members')
      .insert({ trip_id: retry.data.id, display_name: organiser_name, member_token, is_organiser: true })
      .select().single();

    return res.status(201).json({
      trip_id: retry.data.id, join_token: retry.data.join_token,
      join_url: `${process.env.FRONTEND_URL}/join/${retry.data.join_token}`,
      organiser_token, member_token, member_id: member?.id,
    });
  }

  if (error || !trip) return res.status(500).json({ error: 'Failed to create trip' });

  const { data: member } = await supabase
    .from('trip_members')
    .insert({ trip_id: trip.id, display_name: organiser_name, member_token, is_organiser: true })
    .select().single();

  res.status(201).json({
    trip_id: trip.id, join_token: trip.join_token,
    join_url: `${process.env.FRONTEND_URL}/join/${trip.join_token}`,
    organiser_token, member_token, member_id: member?.id,
  });
});

router.get('/:joinToken', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const { data: members } = await supabase
    .from('trip_members')
    .select('id, display_name, is_organiser, has_confirmed, confirmed_at, joined_at')
    .eq('trip_id', trip.id).order('joined_at', { ascending: true });

  const { data: destinations } = await supabase
    .from('destination_options')
    .select(`id, name, tagline, pros, cons, best_for,
      estimated_cost_min, estimated_cost_max, source, created_at,
      destination_votes(member_id)`)
    .eq('trip_id', trip.id).order('created_at', { ascending: true });

  const destinationsWithVotes = (destinations || []).map((d: any) => ({
    ...d, votes: d.destination_votes?.length ?? 0,
    voter_member_ids: (d.destination_votes || []).map((v: any) => v.member_id),
    destination_votes: undefined,
  }));

  const memberIds = new Set((members || []).map((m: any) => m.id));
  const total = memberIds.size;
  const votedMemberIds = new Set<string>();
  for (const d of destinations || []) {
    for (const v of (d as any).destination_votes || []) {
      if (memberIds.has(v.member_id)) votedMemberIds.add(v.member_id);
    }
  }
  const voted = votedMemberIds.size;
  const confirmed = (members || []).filter((m: any) => m.has_confirmed).length;
  const readiness = total === 0 ? 0 : Math.round((voted / total) * 50 + (confirmed / total) * 50);

  const { organiser_token: _omit, ...safeTrip } = trip;

  res.json({
    trip: safeTrip, members: members ?? [], destinations: destinationsWithVotes,
    readiness_score: readiness, members_voted: voted, members_confirmed: confirmed,
  });
});

export default router;
```

#### `backend/src/routes/members.ts`
```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { loadTrip, requireMember, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

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

  const { data: existing } = await supabase
    .from('trip_members').select('*')
    .eq('trip_id', trip.id).eq('member_token', member_token).single();
  if (existing) return res.json({ member: existing, already_joined: true });

  const { data: member, error } = await supabase
    .from('trip_members')
    .insert({ trip_id: trip.id, display_name, member_token, is_organiser: false })
    .select().single();
  if (error) return res.status(500).json({ error: 'Failed to join trip' });
  res.status(201).json({ member, already_joined: false });
});

router.post('/confirm', loadTrip, requireMember, async (req, res) => {
  const member = (req as any).member;
  const { error } = await supabase
    .from('trip_members')
    .update({ has_confirmed: true, confirmed_at: new Date().toISOString() })
    .eq('id', member.id);
  if (error) return res.status(500).json({ error: 'Failed to confirm' });
  res.json({ confirmed: true });
});

router.post('/nudge', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const { data: members } = await supabase
    .from('trip_members').select('id')
    .eq('trip_id', trip.id).eq('has_confirmed', false);

  if (!members || members.length === 0) {
    return res.json({ nudged_count: 0, skipped_count: 0, message: 'Everyone has confirmed' });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNudges } = await supabase
    .from('nudge_log').select('target_member_id')
    .eq('trip_id', trip.id).gte('sent_at', cutoff);

  const recentlyNudgedIds = new Set((recentNudges || []).map((n: any) => n.target_member_id));
  const toNudge = members.filter((m: any) => !recentlyNudgedIds.has(m.id));
  const toSkip  = members.filter((m: any) => recentlyNudgedIds.has(m.id));

  if (toNudge.length > 0) {
    await supabase.from('nudge_log').insert(
      toNudge.map((m: any) => ({ trip_id: trip.id, target_member_id: m.id }))
    );
  }

  res.json({
    nudged_count: toNudge.length, skipped_count: toSkip.length,
    message: toNudge.length > 0
      ? `Nudge logged for ${toNudge.length} ${toNudge.length === 1 ? 'person' : 'people'}.`
      : 'Everyone was nudged recently — try again tomorrow.',
  });
});

export default router;
```

#### `backend/src/routes/destinations.ts`
```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { loadTrip, requireMember, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;
  const { data, error } = await supabase
    .from('destination_options')
    .select('*, destination_votes(member_id)')
    .eq('trip_id', trip.id).order('created_at', { ascending: true });

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

  const { data, error } = await supabase
    .from('destination_options')
    .insert({ trip_id: trip.id, name, tagline, pros, cons, best_for,
      estimated_cost_min, estimated_cost_max, source: 'manual' })
    .select().single();

  if (error) return res.status(500).json({ error: 'Failed to add destination' });
  res.status(201).json({ destination: data });
});

router.post('/:destId/vote', loadTrip, requireMember, async (req, res) => {
  const trip = (req as any).trip;
  const member = (req as any).member;
  const { destId } = req.params;

  const { data: dest } = await supabase
    .from('destination_options').select('id')
    .eq('id', destId).eq('trip_id', trip.id).single();
  if (!dest) return res.status(404).json({ error: 'Destination not found in this trip' });

  const { error } = await supabase
    .from('destination_votes')
    .upsert({ trip_id: trip.id, destination_id: destId, member_id: member.id },
      { onConflict: 'trip_id,member_id' });

  if (error) return res.status(500).json({ error: 'Failed to cast vote' });
  res.json({ voted: true, destination_id: destId });
});

export default router;
```

#### `backend/src/routes/ai.ts`
```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { getDestinationSuggestions } from '../lib/gemini';
import { loadTrip, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

router.post('/', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const { group_size, budget_min, budget_max, travel_from, travel_to, notes } = req.body;

  if (!group_size || !budget_min || !budget_max) {
    return res.status(400).json({ error: 'group_size, budget_min, budget_max are required' });
  }

  try {
    const suggestions = await getDestinationSuggestions({
      groupSize: Number(group_size), budgetMin: Number(budget_min),
      budgetMax: Number(budget_max), travelFrom: travel_from || '',
      travelTo: travel_to || '', notes,
    });

    const { data: saved, error: saveError } = await supabase
      .from('destination_options')
      .insert(suggestions.map(s => ({
        trip_id: trip.id, name: s.name, tagline: s.tagline,
        pros: s.pros, cons: s.cons, best_for: s.best_for,
        estimated_cost_min: s.estimated_cost_min,
        estimated_cost_max: s.estimated_cost_max, source: 'ai',
      }))).select();

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

---

### Frontend

#### `frontend/src/lib/api.ts`
```typescript
const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
    fetch(`${BASE}${path}`, {
      method: "POST", headers: headers(joinToken), body: JSON.stringify(body),
    }).then(handleRes),
};
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

#### `frontend/src/pages/Index.tsx`
```tsx
// Landing page — two CTAs: "Create a Room" and "Join with code"
// Navigate to /create or /join/:code
// No API calls — purely navigational
// See full code in frontend/src/pages/Index.tsx (120 lines)
```

#### `frontend/src/pages/CreateTrip.tsx`
```
// 3-step wizard: Name + Budget → Dates → AI Suggestions
// Step 3: POST /api/trips → POST /ai-suggest → display real Gemini results
// Stores organiser_token + member_token + member_id in localStorage
// "Create Trip Room" → navigate to /trip/${joinToken}
// See full code in frontend/src/pages/CreateTrip.tsx (~400 lines)
```

#### `frontend/src/pages/TripRoom.tsx`
```
// Main dashboard: fetches trip via GET /api/trips/:joinToken
// Wires: vote, confirm, nudge, add destination, copy invite link
// Member identity via tokens.memberId (stored in localStorage)
// Supabase Realtime: subscribes to destination_votes + trip_members changes
// Refetches on visibilitychange (tab focus)
// Deadline display with 3-day warning
// ReadinessBar shows 3 states: confirmed, voted, none
// Budget confirm button visible for all unconfirmed members
// See full code in frontend/src/pages/TripRoom.tsx (~290 lines)
```

#### `frontend/src/pages/JoinTrip.tsx`
```
// Fetches trip info on mount, shows name input
// Generates member_token client-side, POST /join
// Stores token + member_id from response, navigates to /trip/:code
// See full code in frontend/src/pages/JoinTrip.tsx (~148 lines)
```

#### `frontend/src/lib/supabase.ts`
```typescript
// Supabase anon client for Realtime subscriptions
// Gracefully returns null if env vars not set (opt-in)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
```

---

## 6. Frontend ↔ Backend Integration Map

| Frontend Action | API Call | Backend Route | Status |
|----------------|----------|---------------|--------|
| Create trip form submit | `POST /api/trips` | `routes/trips.ts` POST `/` | **Working** |
| Get AI suggestions | `POST /api/trips/:joinToken/ai-suggest` | `routes/ai.ts` POST `/` | **Working** (Gemini 2.5 Flash) |
| Load trip room | `GET /api/trips/:joinToken` | `routes/trips.ts` GET `/:joinToken` | **Working** |
| Join trip | `POST /api/trips/:code/join` | `routes/members.ts` POST `/join` | **Working** |
| Vote on destination | `POST /api/trips/:joinToken/destinations/:destId/vote` | `routes/destinations.ts` POST `/:destId/vote` | **Working** |
| Confirm budget | `POST /api/trips/:joinToken/confirm` | `routes/members.ts` POST `/confirm` | **Working** (all members) |
| Nudge members | `POST /api/trips/:joinToken/nudge` | `routes/members.ts` POST `/nudge` | **Working** (organiser only) |
| Add destination | `POST /api/trips/:joinToken/destinations` | `routes/destinations.ts` POST `/` | **Working** (organiser only) |
| Copy invite link | Client-side clipboard | N/A | **Working** |
| Realtime updates | Supabase Realtime subscription | N/A (direct Supabase) | **Working** (requires env vars) |

---

## 7. Gemini AI Flow

```
User fills CreateTrip form (name, group size, budget, dates, notes)
       │
       ▼
POST /api/trips → creates trip in Supabase, returns join_token + tokens
       │
       ▼
POST /api/trips/:joinToken/ai-suggest
  body: { group_size, budget_min, budget_max, travel_from, travel_to, notes }
  header: x-organiser-token
       │
       ▼
Backend → gemini.ts → getDestinationSuggestions()
  Sends structured prompt to Gemini 2.5 Flash
  Asks for exactly 3 destinations as JSON
  Strips markdown fences, parses JSON
       │
       ▼
Backend saves 3 destinations to destination_options (source: 'ai')
       │
       ▼
Returns { destinations: [...], saved: true }
       │
       ▼
Frontend maps: estimated_cost_min/max → "₹X – ₹Y pp", best_for → bestFor
Renders 3 DestinationCard components
```

**Known issue:** If Gemini quota is exhausted, returns 503. Frontend shows toast: "AI suggestions unavailable". User can still create the trip room and add destinations manually.

---

## 8. Token & Auth Flow

### Organiser creates a trip:
```
1. POST /api/trips { name, organiser_name, ... }
2. Backend generates:
   - organiser_token (64-char hex, crypto.randomBytes(32))
   - member_token (32-char hex, crypto.randomBytes(16))
   - join_token (URL slug, e.g. "goa-march-a3f2")
3. Frontend stores in localStorage:
   key: "triphaus:goa-march-a3f2"
   value: { memberToken: "...", memberId: "...", organiserToken: "..." }
4. All subsequent API calls auto-attach both headers
```

### Member joins via invite:
```
1. Member opens /join/:code
2. Frontend generates member_token (16 bytes, crypto.getRandomValues)
3. POST /api/trips/:code/join { display_name, member_token }
4. Frontend stores:
   key: "triphaus:goa-march-a3f2"
   value: { memberToken: "...", memberId: "..." }   ← no organiserToken
5. Subsequent calls send x-member-token only
```

### Token verification on protected routes:
```
x-member-token → middleware looks up trip_members by (trip_id, member_token) → attaches member to req
x-organiser-token → middleware compares with trip.organiser_token using timingSafeEqual
```

---

## 9. Known Bugs & Mistakes

### FIXED (Delta Session — 2 April 2026)

#### ~~BUG 1: Invite link route mismatch~~ — FIXED
- Backend `join_url` now generates `/join/` instead of `/t/`
- Added `/t/:code` route in App.tsx as fallback (redirects to JoinTrip)

#### ~~BUG 2: Member can't identify themselves in TripRoom~~ — FIXED
- `memberId` now stored in localStorage during create and join flows
- `currentMemberId` derived from `tokens.memberId` instead of broken is_organiser heuristic

#### ~~BUG 3: Budget confirm button hidden for members~~ — FIXED
- `myMember` now derived from `members.find(m => m.id === currentMemberId)` — works for all members
- Budget confirm button visible for any unconfirmed member

#### ~~BUG 4: Vote state always shows "not voted" for members~~ — FIXED
- `hasVoted` now correctly checks `voter_member_ids.includes(currentMemberId)` with a real member ID

#### ~~BUG 6: GET /trips response drops voter_member_ids~~ — FIXED
- `voter_member_ids` added to `destinationsWithVotes` mapping in `trips.ts` GET

#### ~~BUG 7: No input validation~~ — FIXED
- trips.ts POST: validates budget_min <= budget_max, travel_from <= travel_to, name <= 100 chars, organiser_name <= 50 chars
- members.ts POST /join: validates display_name not empty and <= 50 chars

#### ~~Deadline not displayed~~ — FIXED
- Deadline now shown below ReadinessBar with warning colour when within 3 days

#### ~~ReadinessBar missing voted state~~ — FIXED
- 3-state styling: confirmed = amber underline, voted = faded amber underline, none = grey

#### ~~console.error in NotFound~~ — FIXED
- Removed useEffect with console.error and unnecessary useLocation import

### REMAINING

#### BUG 5: Member token generated client-side
- `JoinTrip.tsx` generates `member_token` using `crypto.getRandomValues` in the browser
- Should be generated server-side (like organiser flow) for security
- Current design works but is weaker — any client can generate any token

#### No rate limiting
- No rate limiting on join/vote/nudge endpoints
- Should add at minimum on auth-sensitive and paid operations

---

## 10. Missing Links & Dead Ends

### Navigation paths
| From | To | Status |
|------|----|--------|
| Backend `join_url` response | `/join/${join_token}` | **Working** |
| Home page "Join" button | `/join/${inviteCode}` | Works if user manually enters code |
| Copy Link in TripRoom | `/join/${joinToken}` | **Working** |
| Old `/t/` links | `/t/${join_token}` → JoinTrip | **Working** (fallback route) |
| CreateTrip "Create Trip Room" | `/trip/${joinToken}` | Works |
| JoinTrip "Join" button | `/trip/${code}` | Works |

### Features with no frontend
| Backend Feature | Status |
|----------------|--------|
| `GET /api/trips/:joinToken/destinations` | **Unused** — TripRoom uses the main GET trip endpoint instead |
| Nudge log history | Backend tracks nudges but frontend shows no history |

### Features with no backend
| Frontend Feature | Status |
|-----------------|--------|
| Framer Motion animations on Index | Client-only, no backend needed |
| Map background (Leaflet) | Client-only |
| Budget presets (₹5K, ₹10K, etc.) | Hardcoded, could be backend-driven |

---

## 11. What Works Today

**Organiser happy path:**
1. Go to `localhost:5173` → Click "Create a Room"
2. Fill in trip name, your name, group size, budget
3. Set dates, click Continue
4. Enter notes, click "Get Suggestions from AI" → Gemini returns 3 real destinations
5. Click "Create Trip Room" → lands on `/trip/${joinToken}` with real data
6. Copy link → share with friends
7. Add manual destinations
8. Nudge unconfirmed members
9. Confirm budget

**Member happy path:**
1. Go to `/join/${code}` → sees real trip info
2. Enter name, click Join → lands on trip room with real data
3. Can see destinations and members
4. Vote on destination → vote state persists across refresh (hasVoted = true)
5. Confirm budget → confirm persists on refresh
6. Realtime: votes/joins in other tabs update automatically (requires Supabase env vars)
7. ReadinessBar shows 3 states per member: confirmed, voted, none
8. Deadline displayed with warning when within 3 days

**AI flow:** Working end-to-end with Gemini 2.5 Flash.

---

## 12. Next Steps

**Remaining work (priority order):**

1. **Move member token generation server-side** — Backend should generate and return it on join (security hardening)

2. **Add rate limiting** — At minimum on join, vote, nudge endpoints

3. **Set Supabase env vars** — Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to frontend `.env` for Realtime to activate

4. **Enable Supabase Realtime** — Ensure `destination_votes` and `trip_members` tables have Realtime enabled in Supabase dashboard

5. **Polish** — Loading skeletons, error boundaries, mobile testing, deploy pipeline

---

*End of Draft 1*
