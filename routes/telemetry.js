import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { project_id, metric } = req.query;
    let sql = 'SELECT * FROM telemetry WHERE 1=1';
    const args = [];
    if (project_id) {
      sql += ' AND project_id = ?';
      args.push(project_id);
    }
    if (metric) {
      sql += ' AND metric_name = ?';
      args.push(metric);
    }
    sql += ' ORDER BY timestamp DESC LIMIT 200';
    const { rows } = await db.execute({ sql, args });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
