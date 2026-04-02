import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { getDestinationSuggestions } from '../lib/gemini';
import { loadTrip, requireOrganiser } from '../middleware/tokens';

const router = Router({ mergeParams: true });

// POST /api/trips/:joinToken/ai-suggest
router.post('/', loadTrip, requireOrganiser, async (req, res) => {
  const trip = (req as any).trip;
  const { group_size, budget_min, budget_max, travel_from, travel_to, notes } = req.body;

  if (!group_size || !budget_min || !budget_max) {
    return res.status(400).json({ error: 'group_size, budget_min, budget_max are required' });
  }

  try {
    const suggestions = await getDestinationSuggestions({
      groupSize:  Number(group_size),
      budgetMin:  Number(budget_min),
      budgetMax:  Number(budget_max),
      travelFrom: travel_from || '',
      travelTo:   travel_to   || '',
      notes,
    });

    const { data: saved, error: saveError } = await supabase
      .from('destination_options')
      .insert(
        suggestions.map(s => ({
          trip_id:             trip.id,
          name:                s.name,
          tagline:             s.tagline,
          pros:                s.pros,
          cons:                s.cons,
          best_for:            s.best_for,
          estimated_cost_min:  s.estimated_cost_min,
          estimated_cost_max:  s.estimated_cost_max,
          source:              'ai',
        }))
      )
      .select();

    if (saveError) {
      console.error('Failed to save AI destinations:', saveError);
      return res.json({ destinations: suggestions, saved: false });
    }

    res.json({ destinations: saved, saved: true });

  } catch (err: any) {
    if (err.message === 'AI_UNAVAILABLE') {
      return res.status(503).json({
        error: 'AI suggestions unavailable right now. Add destinations manually to continue.'
      });
    }
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

export default router;
