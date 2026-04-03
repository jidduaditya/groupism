import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { rankTravelWindows } from '../lib/gemini';
import { loadTrip, requireMember, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

const VALID_TIERS = ['unavailable', 'free', 'could_work'];

// POST /api/trips/:joinToken/availability
router.post('/', loadTrip, requireMember, async (req, res) => {
  const trip = (req as any).trip;
  const member = (req as any).member;
  const { slot, slots } = req.body;

  // Single-slot upsert mode
  if (slot) {
    if (!slot.date) {
      return res.status(400).json({ error: 'slot.date is required' });
    }
    if (slot.tier === null) {
      // Clear this date for this member
      const { error } = await supabase
        .from('availability_slots')
        .delete()
        .eq('trip_id', trip.id)
        .eq('member_id', member.id)
        .eq('slot_date', slot.date);
      if (error) return res.status(500).json({ error: 'Failed to clear slot' });
      return res.json({ saved: 1, cleared: true });
    }
    if (!VALID_TIERS.includes(slot.tier)) {
      return res.status(400).json({ error: 'slot.tier must be unavailable, free, or could_work' });
    }
    const { error } = await supabase
      .from('availability_slots')
      .upsert(
        { trip_id: trip.id, member_id: member.id, slot_date: slot.date, tier: slot.tier },
        { onConflict: 'trip_id,member_id,slot_date' }
      );
    if (error) return res.status(500).json({ error: 'Failed to save slot' });
    return res.json({ saved: 1 });
  }

  // Batch replacement mode (existing behavior)
  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'slots must be a non-empty array, or provide a single slot object' });
  }

  for (const slot of slots) {
    if (!slot.date || !VALID_TIERS.includes(slot.tier)) {
      return res.status(400).json({ error: 'Each slot must have a date and tier (unavailable, free, or could_work)' });
    }
  }

  // Delete existing slots for this member, then insert new batch
  const { error: deleteError } = await supabase
    .from('availability_slots')
    .delete()
    .eq('trip_id', trip.id)
    .eq('member_id', member.id);

  if (deleteError) return res.status(500).json({ error: 'Failed to clear existing slots' });

  const { data, error } = await supabase
    .from('availability_slots')
    .insert(
      slots.map((s: any) => ({
        trip_id: trip.id,
        member_id: member.id,
        slot_date: s.date,
        tier: s.tier,
      }))
    )
    .select();

  if (error) return res.status(500).json({ error: 'Failed to save availability' });

  res.json({ slots: data });
});

// POST /api/trips/:joinToken/availability/windows
router.post('/windows', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;

  const [{ data: members }, { data: slots }] = await Promise.all([
    supabase.from('trip_members').select('id, display_name').eq('trip_id', trip.id),
    supabase.from('availability_slots').select('*').eq('trip_id', trip.id),
  ]);

  if (!slots || slots.length === 0) {
    return res.status(400).json({ error: 'No availability data submitted yet' });
  }

  // Calculate trip duration from dates
  let tripDuration = 3; // default
  if (trip.travel_from && trip.travel_to) {
    const from = new Date(trip.travel_from);
    const to = new Date(trip.travel_to);
    tripDuration = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  }

  try {
    const windows = await rankTravelWindows({
      members: (members || []).map((m: any) => ({ id: m.id, display_name: m.display_name })),
      slots: slots.map((s: any) => ({
        member_id: s.member_id,
        date: s.slot_date,
        tier: s.tier,
      })),
      trip_duration: tripDuration,
    });

    const { data, error } = await supabase
      .from('travel_windows')
      .upsert(
        { trip_id: trip.id, windows },
        { onConflict: 'trip_id' }
      )
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to save windows' });

    res.json({ windows: data });
  } catch (err: any) {
    if (err.message === 'AI_UNAVAILABLE') {
      return res.status(503).json({ error: 'AI analysis unavailable right now. Try again later.' });
    }
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// GET /api/trips/:joinToken/availability
router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const [{ data: slots }, { data: windows }] = await Promise.all([
    supabase.from('availability_slots').select('*, trip_members(id, display_name)').eq('trip_id', trip.id),
    supabase.from('travel_windows').select('*').eq('trip_id', trip.id).maybeSingle(),
  ]);

  res.json({ slots: slots ?? [], windows: windows ?? null });
});

export default router;
