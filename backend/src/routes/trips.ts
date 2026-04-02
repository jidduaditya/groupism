import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { generateOrganiserToken, generateMemberToken, generateJoinToken } from '../lib/tokens';
import { loadTrip } from '../middleware/tokens';

const router = Router();

// POST /api/trips — create a new trip
router.post('/', async (req, res) => {
  const {
    name,
    budget_min,
    budget_max,
    travel_from,
    travel_to,
    deadline,
    organiser_name,
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

  const organiser_token = generateOrganiserToken();
  const member_token    = generateMemberToken();
  let   join_token      = generateJoinToken(name);

  // Retry once on join_token collision (extremely rare but possible)
  const { data: trip, error } = await supabase
    .from('trips')
    .insert({ name, join_token, organiser_token, budget_min, budget_max, travel_from, travel_to, deadline })
    .select()
    .single();

  if (error?.code === '23505') {
    join_token = generateJoinToken(name);
    const retry = await supabase
      .from('trips')
      .insert({ name, join_token, organiser_token, budget_min, budget_max, travel_from, travel_to, deadline })
      .select()
      .single();

    if (retry.error) return res.status(500).json({ error: 'Failed to create trip' });

    const { data: member } = await supabase
      .from('trip_members')
      .insert({ trip_id: retry.data.id, display_name: organiser_name, member_token, is_organiser: true })
      .select()
      .single();

    return res.status(201).json({
      trip_id:         retry.data.id,
      join_token:      retry.data.join_token,
      join_url:        `${process.env.FRONTEND_URL}/join/${retry.data.join_token}`,
      organiser_token,
      member_token,
      member_id:       member?.id,
    });
  }

  if (error || !trip) return res.status(500).json({ error: 'Failed to create trip' });

  // Register organiser as first member
  const { data: member } = await supabase
    .from('trip_members')
    .insert({ trip_id: trip.id, display_name: organiser_name, member_token, is_organiser: true })
    .select()
    .single();

  res.status(201).json({
    trip_id:         trip.id,
    join_token:      trip.join_token,
    join_url:        `${process.env.FRONTEND_URL}/join/${trip.join_token}`,
    organiser_token,
    member_token,
    member_id:       member?.id,
  });
});

// GET /api/trips/:joinToken — fetch everything for the Trip Room
router.get('/:joinToken', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  // Fetch members
  const { data: members } = await supabase
    .from('trip_members')
    .select('id, display_name, is_organiser, has_confirmed, confirmed_at, joined_at')
    .eq('trip_id', trip.id)
    .order('joined_at', { ascending: true });

  // Fetch destinations with individual vote records (not just count)
  const { data: destinations } = await supabase
    .from('destination_options')
    .select(`
      id, name, tagline, pros, cons, best_for,
      estimated_cost_min, estimated_cost_max, source, created_at,
      destination_votes(member_id)
    `)
    .eq('trip_id', trip.id)
    .order('created_at', { ascending: true });

  // Flatten vote counts and expose voter_member_ids
  const destinationsWithVotes = (destinations || []).map((d: any) => ({
    ...d,
    votes: d.destination_votes?.length ?? 0,
    voter_member_ids: (d.destination_votes || []).map((v: any) => v.member_id),
    destination_votes: undefined,
  }));

  // Readiness score: 50% voting + 50% confirmation
  const memberIds = new Set((members || []).map((m: any) => m.id));
  const total = memberIds.size;

  // Collect member IDs that have voted on any destination
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

  // Never expose organiser_token in GET response
  const { organiser_token: _omit, ...safeTrip } = trip;

  res.json({
    trip: safeTrip,
    members: members ?? [],
    destinations: destinationsWithVotes,
    readiness_score: readiness,
    members_voted: voted,
    members_confirmed: confirmed,
  });
});

export default router;
