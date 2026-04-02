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
