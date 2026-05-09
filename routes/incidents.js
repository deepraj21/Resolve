import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/database.js';

const router = Router();

function parseTimeline(json) {
  try {
    const t = JSON.parse(json || '[]');
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

function pushTimeline(json, entry) {
  const t = parseTimeline(json);
  t.push({ ...entry, at: entry.at || new Date().toISOString() });
  return JSON.stringify(t);
}

router.get('/', async (_req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.execute('SELECT * FROM incidents ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const id = crypto.randomUUID();
    const {
      title,
      description = null,
      severity = 'sev3',
      status = 'investigating',
      project_id,
    } = req.body;
    if (!title || !project_id) {
      return res.status(400).json({ error: 'title and project_id required' });
    }
    const timeline = pushTimeline(null, {
      type: 'created',
      label: 'Incident created',
      detail: title,
    });
    await db.execute({
      sql: `INSERT INTO incidents (id, title, description, severity, status, project_id, timeline) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, title, description, severity, status, project_id, timeline],
    });
    const { rows } = await db.execute({
      sql: 'SELECT * FROM incidents WHERE id = ?',
      args: [id],
    });
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.execute({
      sql: 'SELECT * FROM incidents WHERE id = ?',
      args: [req.params.id],
    });
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { rows: existing } = await db.execute({
      sql: 'SELECT * FROM incidents WHERE id = ?',
      args: [req.params.id],
    });
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const cur = existing[0];
    let timeline = cur.timeline;
    if (req.body.status && req.body.status !== cur.status) {
      timeline = pushTimeline(timeline, {
        type: 'status',
        label: 'Status updated',
        detail: `${cur.status} → ${req.body.status}`,
      });
    }
    const title = req.body.title ?? cur.title;
    const description = req.body.description ?? cur.description;
    const severity = req.body.severity ?? cur.severity;
    const status = req.body.status ?? cur.status;
    const project_id = req.body.project_id ?? cur.project_id;
    const rca = req.body.rca !== undefined ? req.body.rca : cur.rca;
    const remediation =
      req.body.remediation !== undefined ? req.body.remediation : cur.remediation;
    if (req.body.timeline !== undefined) timeline = req.body.timeline;
    let resolved_at = cur.resolved_at;
    if (status === 'resolved' || status === 'postmortem') {
      resolved_at = resolved_at || new Date().toISOString();
    }

    await db.execute({
      sql: `UPDATE incidents SET title = ?, description = ?, severity = ?, status = ?, project_id = ?, rca = ?, remediation = ?, timeline = ?, resolved_at = ? WHERE id = ?`,
      args: [
        title,
        description,
        severity,
        status,
        project_id,
        rca,
        remediation,
        timeline,
        resolved_at,
        req.params.id,
      ],
    });
    const { rows } = await db.execute({
      sql: 'SELECT * FROM incidents WHERE id = ?',
      args: [req.params.id],
    });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/link-alert/:alertId', async (req, res) => {
  try {
    const db = getDb();
    const { rows: inc } = await db.execute({
      sql: 'SELECT * FROM incidents WHERE id = ?',
      args: [req.params.id],
    });
    if (!inc.length) return res.status(404).json({ error: 'Incident not found' });
    const { rows: al } = await db.execute({
      sql: 'SELECT * FROM alerts WHERE id = ?',
      args: [req.params.alertId],
    });
    if (!al.length) return res.status(404).json({ error: 'Alert not found' });

    await db.execute({
      sql: 'UPDATE alerts SET incident_id = ? WHERE id = ?',
      args: [req.params.id, req.params.alertId],
    });

    const timeline = pushTimeline(inc[0].timeline, {
      type: 'alert',
      label: 'Alert linked',
      detail: al[0].title,
    });
    await db.execute({
      sql: 'UPDATE incidents SET timeline = ? WHERE id = ?',
      args: [timeline, req.params.id],
    });

    const { rows } = await db.execute({
      sql: 'SELECT * FROM incidents WHERE id = ?',
      args: [req.params.id],
    });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const db = getDb();
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const { rows: existing } = await db.execute({
      sql: 'SELECT * FROM incidents WHERE id = ?',
      args: [req.params.id],
    });
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const cur = existing[0];
    const timeline = pushTimeline(cur.timeline, {
      type: 'status',
      label: 'Status changed',
      detail: `${cur.status} → ${status}`,
    });
    let resolved_at = cur.resolved_at;
    if (status === 'resolved' || status === 'postmortem') {
      resolved_at = resolved_at || new Date().toISOString();
    }
    await db.execute({
      sql: `UPDATE incidents SET status = ?, timeline = ?, resolved_at = ? WHERE id = ?`,
      args: [status, timeline, resolved_at, req.params.id],
    });
    const { rows } = await db.execute({
      sql: 'SELECT * FROM incidents WHERE id = ?',
      args: [req.params.id],
    });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
