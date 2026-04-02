import 'dotenv/config';
import app from './app';

// ─── Startup env var check ────────────────────────────────────────────────────
const supaUrl = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
const supaKey = process.env.SUPABASE_SERVICE_KEY;
console.log('Env check:',
  `SUPABASE_URL=${supaUrl ? 'SET' : 'MISSING'}`,
  `SUPABASE_SERVICE_KEY=${supaKey ? 'SET' : 'MISSING'}`,
  `GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? 'SET' : 'MISSING'}`,
  `FRONTEND_URL=${process.env.FRONTEND_URL ? 'SET' : 'MISSING'}`,
);
if (!supaUrl || !supaKey) console.error('FATAL: Missing required Supabase env vars');

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`Triphaus backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
