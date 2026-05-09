import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.execute('SELECT * FROM projects ORDER BY created_at DESC');
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
      name,
      description = null,
      service_type = 'api',
      tech_stack = null,
      team = null,
      status = 'healthy',
    } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const tech = typeof tech_stack === 'string' ? tech_stack : JSON.stringify(tech_stack ?? []);
    await db.execute({
      sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, name, description, service_type, tech, team, status],
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [id] });
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
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
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [req.params.id],
    });
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const cur = existing[0];
    const name = req.body.name ?? cur.name;
    const description = req.body.description ?? cur.description;
    const service_type = req.body.service_type ?? cur.service_type;
    const tech_stack =
      req.body.tech_stack !== undefined
        ? typeof req.body.tech_stack === 'string'
          ? req.body.tech_stack
          : JSON.stringify(req.body.tech_stack)
        : cur.tech_stack;
    const team = req.body.team ?? cur.team;
    const status = req.body.status ?? cur.status;
    await db.execute({
      sql: `UPDATE projects SET name = ?, description = ?, service_type = ?, tech_stack = ?, team = ?, status = ? WHERE id = ?`,
      args: [name, description, service_type, tech_stack, team, status, req.params.id],
    });
    const { rows } = await db.execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [req.params.id],
    });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    await db.execute({ sql: 'DELETE FROM projects WHERE id = ?', args: [req.params.id] });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
