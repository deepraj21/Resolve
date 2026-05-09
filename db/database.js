import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

function createDb() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error(
      'Missing TURSO_DATABASE_URL. Copy .env.example to .env — use a Turso URL or file:./resolve-local.db for local SQLite.'
    );
  }
  if (url.startsWith('file:')) {
    return createClient({ url });
  }
  if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN is required for remote Turso databases.');
  }
  return createClient({ url, authToken });
}

let _db;
export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export async function initSchema() {
  const db = getDb();
  await db.execute('PRAGMA foreign_keys = ON');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      service_type TEXT CHECK(service_type IN ('api', 'database', 'queue', 'cache', 'frontend', 'worker', 'gateway', 'storage')),
      tech_stack TEXT,
      team TEXT,
      status TEXT DEFAULT 'healthy' CHECK(status IN ('healthy', 'degraded', 'critical', 'maintenance')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS knowledge (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT CHECK(category IN ('runbook', 'postmortem', 'architecture', 'sop', 'known_issue')),
      tags TEXT,
      project_id TEXT REFERENCES projects(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      severity TEXT CHECK(severity IN ('sev1', 'sev2', 'sev3', 'sev4')),
      status TEXT DEFAULT 'investigating' CHECK(status IN ('investigating', 'identified', 'monitoring', 'resolved', 'postmortem')),
      project_id TEXT REFERENCES projects(id),
      rca TEXT,
      remediation TEXT,
      timeline TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
      source TEXT CHECK(source IN ('prometheus', 'grafana', 'cloudwatch', 'datadog', 'custom')),
      status TEXT DEFAULT 'firing' CHECK(status IN ('firing', 'acknowledged', 'resolved')),
      message TEXT,
      metric_data TEXT,
      project_id TEXT REFERENCES projects(id),
      incident_id TEXT REFERENCES incidents(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT REFERENCES projects(id),
      level TEXT CHECK(level IN ('debug', 'info', 'warn', 'error', 'fatal')),
      message TEXT,
      metadata TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT REFERENCES projects(id),
      metric_name TEXT,
      value REAL,
      unit TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
