import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { project_id } = req.query;
    let sql = 'SELECT * FROM knowledge WHERE 1=1';
    const args = [];
    if (project_id) {
      sql += ' AND project_id = ?';
      args.push(project_id);
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
      content,
      category = 'runbook',
      tags = [],
      project_id = null,
    } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'title and content required' });
    }
    const tagsJson = typeof tags === 'string' ? tags : JSON.stringify(tags);
    await db.execute({
      sql: `INSERT INTO knowledge (id, title, content, category, tags, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, title, content, category, tagsJson, project_id],
    });
    const { rows } = await db.execute({
      sql: 'SELECT * FROM knowledge WHERE id = ?',
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
      sql: 'SELECT * FROM knowledge WHERE id = ?',
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
      sql: 'SELECT * FROM knowledge WHERE id = ?',
      args: [req.params.id],
    });
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const cur = existing[0];
    const title = req.body.title ?? cur.title;
    const content = req.body.content ?? cur.content;
    const category = req.body.category ?? cur.category;
    const tags =
      req.body.tags !== undefined
        ? typeof req.body.tags === 'string'
          ? req.body.tags
          : JSON.stringify(req.body.tags)
        : cur.tags;
    const project_id =
      req.body.project_id !== undefined ? req.body.project_id : cur.project_id;

    await db.execute({
      sql: `UPDATE knowledge SET title = ?, content = ?, category = ?, tags = ?, project_id = ? WHERE id = ?`,
      args: [title, content, category, tags, project_id, req.params.id],
    });
    const { rows } = await db.execute({
      sql: 'SELECT * FROM knowledge WHERE id = ?',
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
    await db.execute({ sql: 'DELETE FROM knowledge WHERE id = ?', args: [req.params.id] });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
