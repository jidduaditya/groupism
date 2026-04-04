import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import tripsRouter        from './routes/trips';
import membersRouter      from './routes/members';
import destinationsRouter from './routes/destinations';
import aiRouter           from './routes/ai';
import budgetRouter       from './routes/budget';
import availabilityRouter from './routes/availability';
import deadlinesRouter    from './routes/deadlines';
import insightsRouter     from './routes/insights';
import adminRouter        from './routes/admin';

const app = express();

// ─── Health endpoint BEFORE any middleware ────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://groupism-p9g9.vercel.app',
  'https://groupism.space',
  'http://localhost:5173',
  'http://localhost:8080',
  ...(process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean),
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/trips',                         tripsRouter);
app.use('/api/trips/:joinToken',              membersRouter);
app.use('/api/trips/:joinToken/destinations', destinationsRouter);
app.use('/api/trips/:joinToken/ai-suggest',   aiRouter);
app.use('/api/trips/:joinToken/budget',       budgetRouter);
app.use('/api/trips/:joinToken/availability', availabilityRouter);
app.use('/api/trips/:joinToken/deadlines',    deadlinesRouter);
app.use('/api/trips/:joinToken/insights',    insightsRouter);
app.use('/api/admin',                        adminRouter);

// ─── 404 fallthrough ─────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Unhandled error:', err.stack || err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Process-level safety net ────────────────────────────────────────────────
process.on('uncaughtException',  err    => console.error('Uncaught exception:', err));
process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));

export default app;
