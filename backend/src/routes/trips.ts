import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { generateOrganiserToken, generateMemberToken, generateJoinToken } from '../lib/tokens';
import { loadTrip, requireOrganiser, requireMember } from '../middleware/tokens';

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

// PATCH /api/trips/:joinToken/notes — any member can update shared group notes
router.patch('/:joinToken/notes', loadTrip, requireMember, async (req, res) => {
  const trip = (req as any).trip;
  const { group_activity_notes, group_anything_else } = req.body;

  const updates: Record<string, any> = {};
  if (group_activity_notes !== undefined) updates.group_activity_notes = group_activity_notes;
  if (group_anything_else  !== undefined) updates.group_anything_else  = group_anything_else;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const { data, error } = await supabase
    .from('trips')
    .update(updates)
    .eq('id', trip.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update notes' });

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
