import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { loadTrip, requireMember } from '../middleware/tokens';

const router = Router({ mergeParams: true });

// POST /api/trips/:joinToken/couples/link
router.post('/link', loadTrip, requireMember, async (req, res) => {
  const trip   = (req as any).trip;
  const member = (req as any).member;
  const { partner_member_token, couple_name } = req.body;

  if (!partner_member_token) {
    return res.status(400).json({ error: 'partner_member_token is required' });
  }

  const { data: partner } = await supabase
    .from('trip_members')
    .select('id, display_name, couple_id')
    .eq('trip_id', trip.id)
    .eq('member_token', partner_member_token)
    .single();

  if (!partner) return res.status(404).json({ error: 'Partner not found in this trip' });
  if (partner.id === member.id) return res.status(400).json({ error: 'Cannot link to yourself' });
  if (member.couple_id) return res.status(400).json({ error: 'You are already in a couple' });
  if (partner.couple_id) return res.status(400).json({ error: 'Your partner is already in a couple' });

  const name = couple_name || `${member.display_name} & ${partner.display_name}`;

  const { data: couple, error: coupleErr } = await supabase
    .from('couples')
    .insert({ trip_id: trip.id, member_id_1: member.id, member_id_2: partner.id, couple_name: name })
    .select()
    .single();

  if (coupleErr) return res.status(500).json({ error: 'Failed to create couple', detail: coupleErr.message });

  await supabase
    .from('trip_members')
    .update({ couple_id: couple.id })
    .in('id', [member.id, partner.id]);

  res.status(201).json({ couple });
});

// POST /api/trips/:joinToken/couples/solo
router.post('/solo', loadTrip, requireMember, async (req, res) => {
  const trip   = (req as any).trip;
  const member = (req as any).member;

  if (member.couple_id) return res.status(400).json({ error: 'Already in a couple or registered solo' });

  const { data: couple, error } = await supabase
    .from('couples')
    .insert({ trip_id: trip.id, member_id_1: member.id, couple_name: member.display_name })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to register as solo', detail: error.message });

  await supabase
    .from('trip_members')
    .update({ couple_id: couple.id })
    .eq('id', member.id);

  res.json({ couple });
});

// GET /api/trips/:joinToken/couples
router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const { data: couples } = await supabase
    .from('couples')
    .select(`
      id, couple_name, created_at,
      member_1:trip_members!couples_member_id_1_fkey(id, display_name, has_confirmed, couple_id),
      member_2:trip_members!couples_member_id_2_fkey(id, display_name, has_confirmed, couple_id)
    `)
    .eq('trip_id', trip.id)
    .order('created_at', { ascending: true });

  res.json({ couples: couples ?? [] });
});

export default router;
