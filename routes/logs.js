import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { project_id, level } = req.query;
    let sql = 'SELECT * FROM logs WHERE 1=1';
    const args = [];
    if (project_id) {
      sql += ' AND project_id = ?';
      args.push(project_id);
    }
    if (level) {
      sql += ' AND level = ?';
      args.push(level);
    }
    sql += ' ORDER BY timestamp DESC LIMIT 500';
    const { rows } = await db.execute({ sql, args });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { project_id, level = 'info', message, metadata = null, timestamp = null } =
      req.body;
    if (!project_id || !message) {
      return res.status(400).json({ error: 'project_id and message required' });
    }
    const meta = typeof metadata === 'string' ? metadata : JSON.stringify(metadata ?? {});
    if (timestamp) {
      await db.execute({
        sql: `INSERT INTO logs (project_id, level, message, metadata, timestamp) VALUES (?, ?, ?, ?, ?)`,
        args: [project_id, level, message, meta, timestamp],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO logs (project_id, level, message, metadata) VALUES (?, ?, ?, ?)`,
        args: [project_id, level, message, meta],
      });
    }
    const { rows } = await db.execute({
      sql: 'SELECT * FROM logs ORDER BY id DESC LIMIT 1',
      args: [],
    });
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
