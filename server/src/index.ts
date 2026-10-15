import express from 'express';
import { aiRouter } from './routes/ai';
import { finRouter } from './routes/fin';
import { liveRouter } from './routes/live';
import { llmConfig } from './services/llm';

// Secrets live in the project-root .env (server-side only, git-ignored); llmConfig() loads it.
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use('/api/ai', aiRouter);
app.use('/api/fin', finRouter);
app.use('/api/live', liveRouter);
app.use((_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  const cfg = llmConfig();
  console.log(`[ai-proxy] listening on http://localhost:${port} — provider=${cfg.provider} model=${cfg.model} key=${cfg.hasKey ? 'configured' : 'MISSING'}`);
});
