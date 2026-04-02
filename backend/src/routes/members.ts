import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { loadTrip, requireMember, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

// POST /api/trips/:joinToken/join
router.post('/join', loadTrip, async (req, res) => {
  const { display_name, member_token } = req.body;
  const trip = (req as any).trip;

  if (!display_name || !member_token) {
    return res.status(400).json({ error: 'display_name and member_token required' });
  }

  // Idempotent: if this member_token already exists, return existing record
  const { data: existing } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', trip.id)
    .eq('member_token', member_token)
    .single();

  if (existing) return res.json({ member: existing, already_joined: true });

  const { data: member, error } = await supabase
    .from('trip_members')
    .insert({ trip_id: trip.id, display_name, member_token, is_organiser: false })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to join trip' });

  res.status(201).json({ member, already_joined: false });
});

// POST /api/trips/:joinToken/confirm
router.post('/confirm', loadTrip, requireMember, async (req, res) => {
  const member = (req as any).member;

  const { error } = await supabase
    .from('trip_members')
    .update({ has_confirmed: true, confirmed_at: new Date().toISOString() })
    .eq('id', member.id);

  if (error) return res.status(500).json({ error: 'Failed to confirm' });

  res.json({ confirmed: true });
});

// POST /api/trips/:joinToken/nudge
router.post('/nudge', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;

  const { data: members } = await supabase
    .from('trip_members')
    .select('id')
    .eq('trip_id', trip.id)
    .eq('has_confirmed', false);

  if (!members || members.length === 0) {
    return res.json({ nudged_count: 0, skipped_count: 0, message: 'Everyone has confirmed' });
  }

  // Get nudges sent in last 24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNudges } = await supabase
    .from('nudge_log')
    .select('target_member_id')
    .eq('trip_id', trip.id)
    .gte('sent_at', cutoff);

  const recentlyNudgedIds = new Set((recentNudges || []).map((n: any) => n.target_member_id));

  const toNudge = members.filter((m: any) => !recentlyNudgedIds.has(m.id));
  const toSkip  = members.filter((m: any) => recentlyNudgedIds.has(m.id));

  if (toNudge.length > 0) {
    await supabase.from('nudge_log').insert(
      toNudge.map((m: any) => ({ trip_id: trip.id, target_member_id: m.id }))
    );
  }

  res.json({
    nudged_count:  toNudge.length,
    skipped_count: toSkip.length,
    message: toNudge.length > 0
      ? `Nudge logged for ${toNudge.length} ${toNudge.length === 1 ? 'person' : 'people'}.`
      : 'Everyone was nudged recently — try again tomorrow.',
  });
});

export default router;
