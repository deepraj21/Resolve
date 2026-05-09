import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/database.js';
import {
  complete,
  completeJSON,
  streamCompletion,
  streamMessages,
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

const ABOUT_SYSTEM = `You are the in-app assistant for "Resolve", an AI SRE (Site Reliability Engineering) simulation platform. Help users understand how the app works, what each page and button does, how to test features, the architecture, and use cases.

WHAT RESOLVE IS:
- A full-stack training playground for SRE workflows.
- Users manage simulated microservices ("projects"), watch alerts fire, open incidents, and use an LLM to investigate root causes and write remediation plans.
- NO real integrations. Every alert, log, and telemetry sample is generated and stored in the local DB. Source labels (Prometheus, Grafana, etc.) are decorative.

TECH STACK:
- Backend: Node.js + Express. REST under /api/projects, /api/alerts, /api/incidents, /api/knowledge, /api/logs, /api/telemetry. SSE streaming under /api/ai/investigate/:id and /api/ai/remediate/:id. Health: /api/health.
- Database: libSQL via @libsql/client. Either Turso remote or a local file:./resolve-local.db.
- LLM: OpenRouter chat completions (OpenAI-compatible SSE). Primary model is configurable in services/openrouter.js.
- Frontend: vanilla HTML/CSS/JS shell with hash routing. The Analysis panel mounts a small React + Streamdown bundle so streaming Markdown looks polished while tokens arrive.

PAGES:
1. Dashboard (#/) — stat cards (Projects, Active incidents, Firing alerts, MTTR), Severity breakdown bar chart, Resolved today count, System health grid (one card per project with health dot), Recent activity feed.
2. Projects (#/projects) — fleet list. Project detail has tabs: overview, alerts, logs (filterable by debug/info/warn/error/fatal), telemetry (metric cards with sparklines), knowledge. Top-right buttons: Generate alert (AI), Generate logs (AI), Refresh telemetry, Create incident.
3. Incidents (#/incidents) — list and detail. Detail has Status select (investigating, identified, monitoring, resolved, postmortem), Investigate with AI (streams RCA into Analysis panel), Generate remediation (only after RCA exists), Generate postmortem (creates a Knowledge article), Timeline of status/AI events, Linked alerts.
4. Alerts (#/alerts) — global queue with filters (severity, status, source, project), bulk Acknowledge/Resolve, Generate alert via AI.
5. Knowledge base (#/knowledge) — Markdown library of runbooks, postmortems, architecture, SOPs, known_issues. Project-scoped or global. Articles are also pulled as context during AI investigation.
6. About (#/about) — this page (project overview, page walkthrough, end-to-end test flow, this chat).

END-TO-END TEST FLOW:
1. Confirm "API reachable" in sidebar. 2. Run "npm run seed" if data is missing. 3. Browse Dashboard, click a project from System health. 4. Open Projects → click a project → cycle through tabs. 5. From a project, Generate alert / Generate logs / Refresh telemetry. 6. Create incident from project page. 7. Click "Investigate with AI" on the incident — watch the dark Analysis panel stream Markdown. 8. Click "Generate remediation". 9. Walk Status: investigating → identified → monitoring → resolved. 10. Click "Generate postmortem" — lands in Knowledge base. 11. Open Alerts, bulk Acknowledge then Resolve. 12. Edit a Knowledge article.

USE CASES:
- Onboard SREs without giving them production access.
- Demo AI-assisted incident response and RCA generation.
- Explore prompt design for SRE LLM workflows.
- Test the Streamdown live-Markdown rendering pattern.

RULES:
- Stay focused on Resolve. If the user asks about unrelated topics, politely redirect to app questions.
- Be concise. Prefer 1-3 short paragraphs or a tight bulleted list.
- Use Markdown: headings sparingly, **bold**, \`inline code\`, lists, and short code blocks where useful.
- When the user asks "how do I do X", give a specific click path (e.g. "Open Incidents → click the row → click Investigate with AI").
- Never invent features that don't exist. If unsure, say so.`;

router.post('/about-chat', async (req, res) => {
  sseInit(res);
  try {
    const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const trimmed = incoming
      .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    if (!trimmed.length || trimmed[trimmed.length - 1].role !== 'user') {
      res.write(`data: ${JSON.stringify({ error: 'No user question provided' })}\n\n`);
      res.end();
      return;
    }

    const messages = [{ role: 'system', content: ABOUT_SYSTEM }, ...trimmed];
    const stream = await streamMessages(messages, { max_tokens: 900, temperature: 0.4 });

    for await (const delta of iterateOpenRouterTextStream(stream.body)) {
      res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    const msg = e.message || String(e);
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
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
