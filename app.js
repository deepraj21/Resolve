import express from 'express';
import path from 'path';
import { initSchema } from './db/database.js';
import projectsRouter from './routes/projects.js';
import alertsRouter from './routes/alerts.js';
import incidentsRouter from './routes/incidents.js';
import knowledgeRouter from './routes/knowledge.js';
import logsRouter from './routes/logs.js';
import telemetryRouter from './routes/telemetry.js';
import aiRouter from './routes/ai.js';
import { PRIMARY_MODEL, FALLBACK_MODEL } from './services/openrouter.js';

export async function createApp() {
  await initSchema();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  /** libsql Row objects do not serialize cleanly with res.json — coerce to plain JSON */
  app.use((_req, res, next) => {
    const orig = res.json.bind(res);
    res.json = (body) => orig(JSON.parse(JSON.stringify(body)));
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'resolve',
      model: PRIMARY_MODEL,
      fallback_model: FALLBACK_MODEL,
    });
  });

  app.use('/api/projects', projectsRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/incidents', incidentsRouter);
  app.use('/api/knowledge', knowledgeRouter);
  app.use('/api/logs', logsRouter);
  app.use('/api/telemetry', telemetryRouter);
  app.use('/api/ai', aiRouter);

  const publicDir = path.join(process.cwd(), 'public');
  app.use(express.static(publicDir));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
