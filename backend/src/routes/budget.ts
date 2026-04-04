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
  try {
  const trip = (req as any).trip;
  const member = (req as any).member;
  const { accommodation_tier, transport_pref, dining_style, activities, daily_budget_min, daily_budget_max, trip_budget_min, trip_budget_max, notes, activity_categories, activity_details, activity_notes, anything_else } = req.body;

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
  if (activity_notes !== undefined && typeof activity_notes !== 'string') {
    return res.status(400).json({ error: 'activity_notes must be a string' });
  }
  if (anything_else !== undefined && typeof anything_else !== 'string') {
    return res.status(400).json({ error: 'anything_else must be a string' });
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
  if (activity_notes        !== undefined) prefData.activity_notes        = activity_notes || null;
  if (anything_else         !== undefined) prefData.anything_else         = anything_else || null;

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

  if (error) return res.status(500).json({ error: 'Failed to save preferences', detail: error.message });

  res.json({ preference: data });
  } catch (err: any) {
    console.error('Budget preferences error:', err);
    res.status(500).json({ error: 'Failed to save preferences', detail: err.message });
  }
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
  try {
    const trip = (req as any).trip;

    const [{ data: preferences }, { data: estimate }] = await Promise.all([
      supabase.from('budget_preferences').select('*, trip_members(id, display_name)').eq('trip_id', trip.id),
      supabase.from('budget_estimates').select('*').eq('trip_id', trip.id).maybeSingle(),
    ]);

    res.json({ preferences: preferences ?? [], estimate: estimate ?? null });
  } catch (err: any) {
    console.error('Budget fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch budget data', detail: err.message });
  }
});

export default router;
