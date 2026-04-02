import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { loadTrip, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

const VALID_ITEM_TYPES = ['destination_vote', 'availability', 'budget_input', 'confirmation'];

// POST /api/trips/:joinToken/deadlines
router.post('/', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const { deadlines } = req.body;

  if (!Array.isArray(deadlines) || deadlines.length === 0) {
    return res.status(400).json({ error: 'deadlines must be a non-empty array' });
  }

  for (const dl of deadlines) {
    if (!VALID_ITEM_TYPES.includes(dl.item_type)) {
      return res.status(400).json({ error: `Invalid item_type: ${dl.item_type}` });
    }
    if (!dl.due_date) {
      return res.status(400).json({ error: 'Each deadline must have a due_date' });
    }
  }

  const { data, error } = await supabase
    .from('deadlines')
    .upsert(
      deadlines.map((dl: any) => ({
        trip_id: trip.id,
        item_type: dl.item_type,
        due_date: dl.due_date,
        locked: dl.locked ?? false,
      })),
      { onConflict: 'trip_id,item_type' }
    )
    .select();

  if (error) return res.status(500).json({ error: 'Failed to save deadlines' });

  res.json({ deadlines: data });
});

// GET /api/trips/:joinToken/deadlines
router.get('/', loadTrip, async (req, res) => {
  const trip = (req as any).trip;

  const { data } = await supabase
    .from('deadlines')
    .select('*')
    .eq('trip_id', trip.id);

  res.json({ deadlines: data ?? [] });
});

// POST /api/trips/:joinToken/deadlines/lock/:itemType
router.post('/lock/:itemType', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const itemType = req.params.itemType as string;

  if (!VALID_ITEM_TYPES.includes(itemType)) {
    return res.status(400).json({ error: `Invalid item_type: ${itemType}` });
  }

  const { data, error } = await supabase
    .from('deadlines')
    .update({ locked: true })
    .eq('trip_id', trip.id)
    .eq('item_type', itemType)
    .select()
    .single();

  if (error) return res.status(404).json({ error: 'Deadline not found' });

  res.json({ deadline: data });
});

export default router;
