import { Router } from 'express';
import { supabase } from '../lib/supabase';
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

// POST /api/trips/:joinToken/destinations/:destId/vote
router.post('/:destId/vote', loadTrip, requireMember, async (req, res) => {
  const trip   = (req as any).trip;
  const member = (req as any).member;
  const { destId } = req.params;

  // Verify destination belongs to this trip
  const { data: dest } = await supabase
    .from('destination_options')
    .select('id')
    .eq('id', destId)
    .eq('trip_id', trip.id)
    .single();

  if (!dest) return res.status(404).json({ error: 'Destination not found in this trip' });

  // Upsert: if member already voted, change their vote to this destination
  const { error } = await supabase
    .from('destination_votes')
    .upsert(
      { trip_id: trip.id, destination_id: destId, member_id: member.id },
      { onConflict: 'trip_id,member_id' }
    );

  if (error) return res.status(500).json({ error: 'Failed to cast vote' });

  res.json({ voted: true, destination_id: destId });
});

export default router;
