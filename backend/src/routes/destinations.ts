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
