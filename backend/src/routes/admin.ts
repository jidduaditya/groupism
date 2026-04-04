import { Router, Request, Response, NextFunction } from 'express';
import { getSupabase } from '../lib/supabase';

const router = Router();

// ─── Admin password middleware ──────────────────────────────────────────────
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const password = req.headers['x-admin-password'];
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || password !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ─── GET /api/admin/analytics ───────────────────────────────────────────────
router.get('/analytics', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const sb = getSupabase();
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

    const [
      tripsTotal,
      trips7d,
      trips30d,
      tripsByDay,
      membersTotal,
      membersConfirmed,
      destinationsCount,
      votesCount,
      budgetsCount,
      availabilityCount,
      insightsCount,
      tripsWith3Plus,
      recentTrips,
    ] = await Promise.all([
      // Trips
      sb.from('trips').select('*', { count: 'exact', head: true }),
      sb.from('trips').select('*', { count: 'exact', head: true })
        .gte('created_at', daysAgo(7)),
      sb.from('trips').select('*', { count: 'exact', head: true })
        .gte('created_at', daysAgo(30)),
      sb.from('trips').select('created_at')
        .gte('created_at', daysAgo(14))
        .order('created_at', { ascending: true }),

      // Members (non-organiser)
      sb.from('trip_members').select('*', { count: 'exact', head: true })
        .eq('is_organiser', false),
      sb.from('trip_members').select('*', { count: 'exact', head: true })
        .eq('is_organiser', false)
        .eq('has_confirmed', true),

      // Engagement counts
      sb.from('destination_options').select('*', { count: 'exact', head: true }),
      sb.from('destination_votes').select('*', { count: 'exact', head: true }),
      sb.from('budget_preferences').select('*', { count: 'exact', head: true }),
      sb.from('availability_slots').select('trip_id, member_id'),
      sb.from('trip_insights').select('*', { count: 'exact', head: true }),

      // Trips with 3+ members
      sb.from('trip_members').select('trip_id'),

      // Recent trips with member counts
      sb.from('trips').select('id, name, join_token, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Compute trips by day (last 14 days)
    const byDayMap: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      byDayMap[d.toISOString().slice(0, 10)] = 0;
    }
    if (tripsByDay.data) {
      for (const row of tripsByDay.data) {
        const date = row.created_at.slice(0, 10);
        if (byDayMap[date] !== undefined) byDayMap[date]++;
      }
    }
    const by_day = Object.entries(byDayMap).map(([date, count]) => ({ date, count }));

    // Compute distinct availability submissions
    const availabilitySet = new Set<string>();
    if (availabilityCount.data) {
      for (const row of availabilityCount.data) {
        availabilitySet.add(`${row.trip_id}:${row.member_id}`);
      }
    }

    // Compute trips with 3+ members
    const memberCountByTrip: Record<string, number> = {};
    if (tripsWith3Plus.data) {
      for (const row of tripsWith3Plus.data) {
        memberCountByTrip[row.trip_id] = (memberCountByTrip[row.trip_id] || 0) + 1;
      }
    }
    const tripsWith3PlusCount = Object.values(memberCountByTrip).filter(c => c >= 3).length;

    // Compute member counts for recent trips
    const recentTripIds = recentTrips.data?.map(t => t.id) || [];
    let recentMemberCounts: Record<string, number> = {};
    if (recentTripIds.length > 0) {
      const { data: members } = await sb.from('trip_members')
        .select('trip_id')
        .in('trip_id', recentTripIds);
      if (members) {
        for (const m of members) {
          recentMemberCounts[m.trip_id] = (recentMemberCounts[m.trip_id] || 0) + 1;
        }
      }
    }

    const totalMembers = membersTotal.count || 0;
    const confirmedMembers = membersConfirmed.count || 0;

    res.json({
      trips: {
        total: tripsTotal.count || 0,
        last_7_days: trips7d.count || 0,
        last_30_days: trips30d.count || 0,
        by_day,
      },
      members: {
        total: totalMembers,
        confirmed: confirmedMembers,
        confirmation_rate: totalMembers > 0
          ? Math.round((confirmedMembers / totalMembers) * 1000) / 10
          : 0,
      },
      engagement: {
        trips_with_3_plus_members: tripsWith3PlusCount,
        destinations_added: destinationsCount.count || 0,
        votes_cast: votesCount.count || 0,
        budgets_submitted: budgetsCount.count || 0,
        availability_submitted: availabilitySet.size,
        insights_generated: insightsCount.count || 0,
      },
      recent_trips: (recentTrips.data || []).map(t => ({
        id: t.id,
        name: t.name,
        join_token: t.join_token,
        member_count: recentMemberCounts[t.id] || 0,
        created_at: t.created_at,
      })),
    });
  } catch (err: any) {
    console.error('Admin analytics error:', err.message || err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
