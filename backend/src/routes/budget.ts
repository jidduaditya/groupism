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
