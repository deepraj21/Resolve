import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { project_id, status, incident_id } = req.query;
    let sql = 'SELECT * FROM alerts WHERE 1=1';
    const args = [];
    if (project_id) {
      sql += ' AND project_id = ?';
      args.push(project_id);
    }
    if (incident_id) {
      sql += ' AND incident_id = ?';
      args.push(incident_id);
    }
    if (status) {
      sql += ' AND status = ?';
      args.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await db.execute({ sql, args });
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
      severity = 'medium',
      source = 'custom',
      status = 'firing',
      message = null,
      metric_data = null,
      project_id,
      incident_id = null,
    } = req.body;
    if (!title || !project_id) {
      return res.status(400).json({ error: 'title and project_id required' });
    }
    const md =
      typeof metric_data === 'string' ? metric_data : JSON.stringify(metric_data ?? {});
    await db.execute({
      sql: `INSERT INTO alerts (id, title, severity, source, status, message, metric_data, project_id, incident_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, title, severity, source, status, message, md, project_id, incident_id],
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM alerts WHERE id = ?', args: [id] });
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { rows: existing } = await db.execute({
      sql: 'SELECT * FROM alerts WHERE id = ?',
      args: [req.params.id],
    });
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const cur = existing[0];
    const title = req.body.title ?? cur.title;
    const severity = req.body.severity ?? cur.severity;
    const source = req.body.source ?? cur.source;
    const status = req.body.status ?? cur.status;
    const message = req.body.message ?? cur.message;
    const metric_data =
      req.body.metric_data !== undefined
        ? typeof req.body.metric_data === 'string'
          ? req.body.metric_data
          : JSON.stringify(req.body.metric_data)
        : cur.metric_data;
    const project_id = req.body.project_id ?? cur.project_id;
    const incident_id =
      req.body.incident_id !== undefined ? req.body.incident_id : cur.incident_id;
    const resolved_at =
      status === 'resolved'
        ? cur.resolved_at || new Date().toISOString()
        : req.body.resolved_at ?? cur.resolved_at;

    await db.execute({
      sql: `UPDATE alerts SET title = ?, severity = ?, source = ?, status = ?, message = ?, metric_data = ?, project_id = ?, incident_id = ?, resolved_at = ? WHERE id = ?`,
      args: [
        title,
        severity,
        source,
        status,
        message,
        metric_data,
        project_id,
        incident_id,
        resolved_at,
        req.params.id,
      ],
    });
    const { rows } = await db.execute({
      sql: 'SELECT * FROM alerts WHERE id = ?',
      args: [req.params.id],
    });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/acknowledge', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.execute({
      sql: 'SELECT * FROM alerts WHERE id = ?',
      args: [req.params.id],
    });
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    await db.execute({
      sql: `UPDATE alerts SET status = 'acknowledged' WHERE id = ?`,
      args: [req.params.id],
    });
    const out = await db.execute({
      sql: 'SELECT * FROM alerts WHERE id = ?',
      args: [req.params.id],
    });
    res.json(out.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/resolve', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.execute({
      sql: 'SELECT * FROM alerts WHERE id = ?',
      args: [req.params.id],
    });
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const resolvedAt = new Date().toISOString();
    await db.execute({
      sql: `UPDATE alerts SET status = 'resolved', resolved_at = ? WHERE id = ?`,
      args: [resolvedAt, req.params.id],
    });
    const out = await db.execute({
      sql: 'SELECT * FROM alerts WHERE id = ?',
      args: [req.params.id],
    });
    res.json(out.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
