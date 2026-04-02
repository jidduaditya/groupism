import 'dotenv/config';
import app from './app';

// ─── Startup env var check ────────────────────────────────────────────────────
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const optional = ['GEMINI_API_KEY', 'FRONTEND_URL'];
console.log(
  'Env check:',
  [...required, ...optional].map(k => `${k}=${process.env[k] ? 'SET' : 'MISSING'}`).join(', ')
);
const missing = required.filter(k => !process.env[k]);
if (missing.length) console.error(`FATAL: Missing required env vars: ${missing.join(', ')}`);

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`Triphaus backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
