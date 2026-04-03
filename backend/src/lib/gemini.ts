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
