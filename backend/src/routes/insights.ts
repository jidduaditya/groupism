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
