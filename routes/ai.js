import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/database.js';
import {
  complete,
  completeJSON,
  streamCompletion,
  iterateOpenRouterTextStream,
} from '../services/openrouter.js';
import {
  ALERT_SYSTEM,
  buildAlertUserPrompt,
  buildLogsUserPrompt,
  insertScenario,
  parseTelemetryFromHealth,
} from '../services/simulator.js';
import {
  loadIncidentBundle,
  buildInvestigationPrompt,
  buildRemediationPrompt,
  buildPostmortemPrompt,
} from '../services/investigator.js';

const router = Router();

const INVESTIGATOR_SYSTEM = `You are an expert Site Reliability Engineer. Respond in structured Markdown with the sections requested by the user. Be precise and cite evidence from the provided data.`;

function pushTimeline(json, entry) {
  let t = [];
  try {
    t = JSON.parse(json || '[]');
  } catch {
    t = [];
  }
  if (!Array.isArray(t)) t = [];
  t.push({ ...entry, at: entry.at || new Date().toISOString() });
  return JSON.stringify(t);
}

function sseInit(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();
}

router.post('/generate-alert', async (req, res) => {
  try {
    const { project_id, severity, source } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const db = getDb();
    const { rows } = await db.execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [project_id],
    });
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    const project = rows[0];

    const data = await completeJSON(ALERT_SYSTEM, buildAlertUserPrompt(project, severity, source));
    const id = crypto.randomUUID();
    const severities = ['critical', 'high', 'medium', 'low', 'info'];
    const sources = ['prometheus', 'grafana', 'cloudwatch', 'datadog', 'custom'];
    const sev =
      severity && severity !== 'auto'
        ? severity
        : severities.includes(data.severity)
          ? data.severity
          : 'high';
    const src =
      source && source !== 'auto'
        ? source
        : sources.includes(data.source)
          ? data.source
          : 'prometheus';
    await db.execute({
      sql: `INSERT INTO alerts (id, title, severity, source, status, message, metric_data, project_id) VALUES (?, ?, ?, ?, 'firing', ?, ?, ?)`,
      args: [id, data.title, sev, src, data.message, JSON.stringify(data.metric_data || {}), project_id],
    });
    const out = await db.execute({ sql: 'SELECT * FROM alerts WHERE id = ?', args: [id] });
    res.status(201).json(out.rows[0]);
  } catch (e) {
    const msg = e.message || String(e);
    const code = msg.includes('OPENROUTER') ? 503 : 500;
    res.status(code).json({ error: msg });
  }
});

router.post('/generate-logs', async (req, res) => {
  try {
    const { project_id, count = 15, scenario } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const db = getDb();
    const { rows } = await db.execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [project_id],
    });
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    const project = rows[0];

    const n = Math.min(40, Math.max(5, Number(count) || 15));
    const LOG_SYSTEM = `You are a log generator. Respond ONLY with a valid JSON array. No markdown.`;
    const raw = await completeJSON(
      LOG_SYSTEM,
      buildLogsUserPrompt(project, n, scenario || 'production traffic')
    );
    let entries = raw;
    if (!Array.isArray(entries)) {
      if (Array.isArray(entries?.logs)) entries = entries.logs;
      else if (Array.isArray(entries?.entries)) entries = entries.entries;
      else entries = [];
    }
    const inserted = [];
    for (const entry of entries) {
      const meta =
        typeof entry.metadata === 'object'
          ? JSON.stringify(entry.metadata || {})
          : String(entry.metadata || '{}');
      const ts = entry.timestamp || new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO logs (project_id, level, message, metadata, timestamp) VALUES (?, ?, ?, ?, ?)`,
        args: [
          project_id,
          entry.level || 'info',
          entry.message || 'log',
          meta,
          ts,
        ],
      });
      const last = await db.execute({
        sql: 'SELECT * FROM logs ORDER BY id DESC LIMIT 1',
        args: [],
      });
      inserted.push(last.rows[0]);
    }
    res.status(201).json({ count: inserted.length, logs: inserted });
  } catch (e) {
    const msg = e.message || String(e);
    const code = msg.includes('OPENROUTER') ? 503 : 500;
    res.status(code).json({ error: msg });
  }
});

router.post('/generate-telemetry', async (req, res) => {
  try {
    const { project_id } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const db = getDb();
    const { rows } = await db.execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [project_id],
    });
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    const project = rows[0];
    const points = parseTelemetryFromHealth(project.service_type, project.status);
    const stmt = [];
    for (let i = 0; i < points.length; i++) {
      const row = points[i];
      stmt.push({
        sql: `INSERT INTO telemetry (project_id, metric_name, value, unit, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
        args: [project_id, row.metric_name, row.value, row.unit, `-${i + 1} minutes`],
      });
    }
    await db.batch(stmt);
    const out = await db.execute({
      sql: 'SELECT * FROM telemetry WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?',
      args: [project_id, points.length],
    });
    res.status(201).json({ telemetry: out.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/investigate/:incidentId', async (req, res) => {
  sseInit(res);
  let fullText = '';
  try {
    const bundle = await loadIncidentBundle(req.params.incidentId);
    if (!bundle) {
      res.write(`data: ${JSON.stringify({ error: 'Incident not found' })}\n\n`);
      res.end();
      return;
    }
    const userPrompt = buildInvestigationPrompt(bundle);
    const stream = await streamCompletion(INVESTIGATOR_SYSTEM, userPrompt, {
      max_tokens: 1800,
    });

    for await (const delta of iterateOpenRouterTextStream(stream.body)) {
      fullText += delta;
      res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
    }

    const db = getDb();
    const { rows } = await db.execute({
      sql: 'SELECT * FROM incidents WHERE id = ?',
      args: [req.params.incidentId],
    });
    if (rows.length) {
      const timeline = pushTimeline(rows[0].timeline, {
        type: 'ai',
        label: 'RCA generated',
        detail: 'Investigation stream completed',
      });
      await db.execute({
        sql: 'UPDATE incidents SET rca = ?, timeline = ? WHERE id = ?',
        args: [fullText, timeline, req.params.incidentId],
      });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    const msg = e.message || String(e);
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

router.post('/remediate/:incidentId', async (req, res) => {
  sseInit(res);
  let fullText = '';
  try {
    const bundle = await loadIncidentBundle(req.params.incidentId);
    if (!bundle || !bundle.incident.rca) {
      res.write(
        `data: ${JSON.stringify({ error: 'Incident not found or RCA missing — run investigation first.' })}\n\n`
      );
      res.end();
      return;
    }
    const userPrompt = buildRemediationPrompt(bundle.incident.rca, bundle.project);
    const stream = await streamCompletion(INVESTIGATOR_SYSTEM, userPrompt, { max_tokens: 1800 });

    for await (const delta of iterateOpenRouterTextStream(stream.body)) {
      fullText += delta;
      res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
    }

    const db = getDb();
    const { rows } = await db.execute({
      sql: 'SELECT * FROM incidents WHERE id = ?',
      args: [req.params.incidentId],
    });
    if (rows.length) {
      const timeline = pushTimeline(rows[0].timeline, {
        type: 'ai',
        label: 'Remediation generated',
        detail: 'Remediation plan stream completed',
      });
      await db.execute({
        sql: 'UPDATE incidents SET remediation = ?, timeline = ? WHERE id = ?',
        args: [fullText, timeline, req.params.incidentId],
      });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    const msg = e.message || String(e);
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

router.post('/generate-postmortem/:incidentId', async (req, res) => {
  try {
    const bundle = await loadIncidentBundle(req.params.incidentId);
    if (!bundle) return res.status(404).json({ error: 'Incident not found' });
    const md = await complete(
      'You write clear engineering postmortems in Markdown.',
      buildPostmortemPrompt(bundle),
      { max_tokens: 2500 }
    );
    const db = getDb();
    const id = crypto.randomUUID();
    await db.execute({
      sql: `INSERT INTO knowledge (id, title, content, category, tags, project_id) VALUES (?, ?, ?, 'postmortem', ?, ?)`,
      args: [
        id,
        `Postmortem: ${bundle.incident.title}`,
        md,
        JSON.stringify(['postmortem', 'generated']),
        bundle.incident.project_id,
      ],
    });
    const out = await db.execute({ sql: 'SELECT * FROM knowledge WHERE id = ?', args: [id] });
    res.status(201).json(out.rows[0]);
  } catch (e) {
    const msg = e.message || String(e);
    res.status(msg.includes('OPENROUTER') ? 503 : 500).json({ error: msg });
  }
});

router.post('/seed-scenario', async (req, res) => {
  try {
    const preset = req.body.preset || req.body.scenario || 'database-storm';
    const db = getDb();
    const meta = await insertScenario(db, preset);
    res.status(201).json(meta);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
