import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { supabase } from '../lib/supabase';

// Attach trip to req from join_token URL param
export async function loadTrip(req: Request, res: Response, next: NextFunction) {
  const { joinToken } = req.params;
  if (!joinToken) return res.status(400).json({ error: 'Missing join token' });

  const { data: trip, error } = await supabase
    .from('trips')
    .select('*')
    .eq('join_token', joinToken)
    .single();

  if (error || !trip) return res.status(404).json({ error: 'Trip not found' });

  (req as any).trip = trip;
  next();
}

// Verify x-member-token header belongs to a member of this trip
export async function requireMember(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-member-token'] as string;
  if (!token) return res.status(401).json({ error: 'x-member-token header required' });

  const trip = (req as any).trip;
  const { data: member, error } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', trip.id)
    .eq('member_token', token)
    .single();

  if (error || !member) return res.status(403).json({ error: 'Not a member of this trip' });

  (req as any).member = member;
  next();
}

// Verify x-organiser-token header matches this trip's organiser_token
// Uses constant-time comparison to prevent timing attacks
export async function requireOrganiser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-organiser-token'] as string;
  if (!token) return res.status(401).json({ error: 'x-organiser-token header required' });

  const trip = (req as any).trip;

  const a = Buffer.from(token);
  const b = Buffer.from(trip.organiser_token);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Invalid organiser token' });
  }

  next();
}
