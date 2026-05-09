import crypto from 'crypto';

export const ALERT_SYSTEM = `You are a production monitoring system simulator. Respond only with valid JSON as specified.`;

export function buildAlertUserPrompt(project, severity, source) {
  return `Generate a realistic monitoring alert for:
- Service: ${project.name} (${project.service_type})
- Tech Stack: ${project.tech_stack || '[]'}
- Severity: ${severity || 'let AI pick one of critical|high|medium|low|info'}
- Source: ${source || 'choose prometheus|grafana|cloudwatch|datadog|custom'}

Respond in JSON:
{
  "title": "Short alert title",
  "message": "Detailed alert message with realistic metrics",
  "metric_data": {
    "metric_name": "value with unit",
    "threshold": "threshold value",
    "current": "current value"
  }
}`;
}

export function buildLogsUserPrompt(project, count, scenario) {
  return `Generate ${count} realistic application log entries for:
- Service: ${project.name} (${project.service_type})
- Tech Stack: ${project.tech_stack || '[]'}
- Scenario: ${scenario || 'normal operation'}

Respond as JSON array. Each entry:
{
  "level": "error",
  "message": "Connection pool exhausted: 50/50 connections in use, 23 waiting",
  "metadata": { "stack_trace": "...", "request_id": "...", "duration_ms": 3400 },
  "timestamp": "ISO timestamp within last 30 minutes"
}`;
}

export function parseTelemetryFromHealth(serviceType, status) {
  const base = [
    { metric_name: 'cpu_usage', unit: '%' },
    { metric_name: 'memory_usage', unit: '%' },
    { metric_name: 'error_rate', unit: '%' },
    { metric_name: 'p99_latency', unit: 'ms' },
    { metric_name: 'request_count', unit: 'rpm' },
  ];
  const mult =
    status === 'critical' ? 1.4 : status === 'degraded' ? 1.15 : status === 'maintenance' ? 0.9 : 1;
  return base.map((b) => ({
    ...b,
    value:
      b.metric_name === 'error_rate'
        ? Number((2 * mult + Math.random()).toFixed(2))
        : b.metric_name.includes('latency')
          ? Math.round(120 * mult + Math.random() * 80)
          : Math.round(40 + Math.random() * 45 * mult),
  }));
}

function id() {
  return crypto.randomUUID();
}

/** Deterministic demo scenarios — inserts related entities */
export async function insertScenario(db, preset) {
  const scenarios = {
    'database-storm': () => buildDatabaseStorm(),
    'memory-leak-worker': () => buildMemoryLeak(),
    'bad-deploy-api': () => buildBadDeploy(),
    'cache-stampede': () => buildCacheStampede(),
  };
  const fn = scenarios[preset];
  if (!fn) throw new Error(`Unknown scenario: ${preset}`);
  const batch = fn();
  await db.batch(batch.stmts);
  return batch.meta;
}

function buildDatabaseStorm() {
  const proj = id();
  const inc = id();
  const stmts = [];
  const kb1 = id();
  const kb2 = id();
  stmts.push({
    sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      proj,
      'payment-api',
      'Payments orchestration API — scenario: connection storm.',
      'api',
      JSON.stringify(['node', 'postgres', 'redis']),
      'payments',
      'critical',
    ],
  });
  stmts.push({
    sql: `INSERT INTO knowledge (id, title, content, category, tags, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      kb1,
      'Runbook: Postgres saturation',
      '## Detect\n- Rising wait on pool.acquire\n## Mitigate\nScale replicas, reduce TTL on pooled conn\n',
      'runbook',
      JSON.stringify(['postgres', 'pool']),
      proj,
    ],
  });
  stmts.push({
    sql: `INSERT INTO knowledge (id, title, content, category, tags, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      kb2,
      'Known issue: checkout latency',
      'Historical correlation between pool waits and checkout P99.',
      'known_issue',
      JSON.stringify(['latency']),
      proj,
    ],
  });

  stmts.push({
    sql: `INSERT INTO incidents (id, title, description, severity, status, project_id, timeline) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      inc,
      'Database connection storm on payment-api',
      'Connection pool exhausted; cascading timeouts through checkout path.',
      'sev1',
      'investigating',
      proj,
      JSON.stringify([
        {
          type: 'created',
          label: 'Scenario seeded',
          detail: 'Database Connection Storm',
          at: new Date().toISOString(),
        },
      ]),
    ],
  });

  const alertSpecs = [
    ['Pool wait time P99 > 2s', 'critical', 'prometheus', 'firing'],
    ['Postgres connections maxed', 'high', 'datadog', 'firing'],
    ['Checkout error budget burn', 'high', 'grafana', 'acknowledged'],
  ];
  for (const [title, sev, src, st] of alertSpecs) {
    const aid = id();
    stmts.push({
      sql: `INSERT INTO alerts (id, title, severity, source, status, message, metric_data, project_id, incident_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        aid,
        title,
        sev,
        src,
        st,
        'Synthetic scenario alert for connection storm.',
        JSON.stringify({ metric_name: 'pool_wait_p99', threshold: '500ms', current: '2100ms' }),
        proj,
        inc,
      ],
    });
  }

  for (let i = 0; i < 18; i++) {
    stmts.push({
      sql: `INSERT INTO logs (project_id, level, message, metadata, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      args: [
        proj,
        i % 3 === 0 ? 'error' : 'warn',
        `pool.acquire timeout (${i}) — waiting requests: ${12 + i}`,
        JSON.stringify({ request_id: id(), pool_size: 50, in_use: 50 }),
        `-${25 - i} minutes`,
      ],
    });
  }

  parseTelemetryFromHealth('api', 'critical').forEach((row, i) => {
    stmts.push({
      sql: `INSERT INTO telemetry (project_id, metric_name, value, unit, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      args: [proj, row.metric_name, row.value, row.unit, `-${i + 1} minutes`],
    });
  });

  return { stmts, meta: { preset: 'database-storm', projectId: proj, incidentId: inc } };
}

function buildMemoryLeak() {
  const proj = id();
  const inc = id();
  const stmts = [];
  stmts.push({
    sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      proj,
      'order-worker',
      'Background worker — scenario: memory leak leading to OOM risk.',
      'worker',
      JSON.stringify(['node', 'rabbitmq']),
      'commerce',
      'degraded',
    ],
  });
  stmts.push({
    sql: `INSERT INTO incidents (id, title, description, severity, status, project_id, timeline) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      inc,
      'Worker RSS growth — suspected memory leak',
      'RSS climbing 80MB/hour; GC ineffective.',
      'sev2',
      'investigating',
      proj,
      JSON.stringify([
        {
          type: 'created',
          label: 'Scenario seeded',
          detail: 'Memory Leak in Worker',
          at: new Date().toISOString(),
        },
      ]),
    ],
  });
  const a1 = id();
  stmts.push({
    sql: `INSERT INTO alerts (id, title, severity, source, status, message, metric_data, project_id, incident_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      a1,
      'Heap usage > 85% on order-worker',
      'high',
      'prometheus',
      'firing',
      'Memory pressure before OOM kill threshold.',
      JSON.stringify({ metric_name: 'process_resident_memory_bytes', threshold: '2Gi', current: '2.5Gi' }),
      proj,
      inc,
    ],
  });
  for (let i = 0; i < 15; i++) {
    stmts.push({
      sql: `INSERT INTO logs (project_id, level, message, metadata, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      args: [
        proj,
        i % 4 === 0 ? 'fatal' : 'error',
        `V8 heap limit approaching — GC pause ${120 + i * 5}ms`,
        JSON.stringify({ worker_id: `w-${i % 3}`, rss_mb: 1800 + i * 12 }),
        `-${20 - i} minutes`,
      ],
    });
  }
  parseTelemetryFromHealth('worker', 'degraded').forEach((row, i) => {
    stmts.push({
      sql: `INSERT INTO telemetry (project_id, metric_name, value, unit, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      args: [proj, row.metric_name, row.value, row.unit, `-${i + 2} minutes`],
    });
  });
  return { stmts, meta: { preset: 'memory-leak-worker', projectId: proj, incidentId: inc } };
}

function buildBadDeploy() {
  const proj = id();
  const inc = id();
  const stmts = [];
  stmts.push({
    sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      proj,
      'user-service',
      'User profile API — scenario: bad deploy regression.',
      'api',
      JSON.stringify(['go', 'postgres']),
      'platform',
      'critical',
    ],
  });
  stmts.push({
    sql: `INSERT INTO incidents (id, title, description, severity, status, project_id, timeline) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      inc,
      'Elevated 500s after deploy user-service@v1.42.0',
      'Canary showed errors on GET /users/{id}/preferences',
      'sev2',
      'investigating',
      proj,
      JSON.stringify([
        {
          type: 'created',
          label: 'Scenario seeded',
          detail: 'Bad Deploy - API Regression',
          at: new Date().toISOString(),
        },
      ]),
    ],
  });
  const a1 = id();
  stmts.push({
    sql: `INSERT INTO alerts (id, title, severity, source, status, message, metric_data, project_id, incident_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      a1,
      'HTTP 5xx rate > 5% on user-service',
      'critical',
      'grafana',
      'firing',
      'Deploy window correlated with spike.',
      JSON.stringify({ metric_name: 'http_5xx_rate', threshold: '1%', current: '6.8%' }),
      proj,
      inc,
    ],
  });
  for (let i = 0; i < 16; i++) {
    stmts.push({
      sql: `INSERT INTO logs (project_id, level, message, metadata, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      args: [
        proj,
        'error',
        `panic: nil pointer in preferences mapper — req ${i}`,
        JSON.stringify({ trace: 'preferences.go:118', deploy: 'v1.42.0' }),
        `-${18 - i} minutes`,
      ],
    });
  }
  parseTelemetryFromHealth('api', 'critical').forEach((row, i) => {
    stmts.push({
      sql: `INSERT INTO telemetry (project_id, metric_name, value, unit, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      args: [proj, row.metric_name, row.value, row.unit, `-${i} minutes`],
    });
  });
  return { stmts, meta: { preset: 'bad-deploy-api', projectId: proj, incidentId: inc } };
}

function buildCacheStampede() {
  const proj = id();
  const inc = id();
  const stmts = [];
  stmts.push({
    sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      proj,
      'redis-cache',
      'Shared Redis tier — scenario: cache stampede.',
      'cache',
      JSON.stringify(['redis', 'redis-cluster']),
      'platform',
      'degraded',
    ],
  });
  stmts.push({
    sql: `INSERT INTO incidents (id, title, description, severity, status, project_id, timeline) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      inc,
      'Cache stampede after TTL expiry',
      'Miss storm triggered thundering herd on primary DB.',
      'sev2',
      'investigating',
      proj,
      JSON.stringify([
        {
          type: 'created',
          label: 'Scenario seeded',
          detail: 'Cache Stampede',
          at: new Date().toISOString(),
        },
      ]),
    ],
  });
  const a1 = id();
  stmts.push({
    sql: `INSERT INTO alerts (id, title, severity, source, status, message, metric_data, project_id, incident_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      a1,
      'Redis hit ratio collapsed',
      'high',
      'cloudwatch',
      'firing',
      'Hot keys expired simultaneously.',
      JSON.stringify({ metric_name: 'cache_hit_ratio', threshold: '0.9', current: '0.41' }),
      proj,
      inc,
    ],
  });
  for (let i = 0; i < 14; i++) {
    stmts.push({
      sql: `INSERT INTO logs (project_id, level, message, metadata, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      args: [
        proj,
        i % 2 === 0 ? 'warn' : 'error',
        `DB pool saturation from cache miss surge — shard ${i % 4}`,
        JSON.stringify({ key: `catalog:${i}`, reloads: 400 + i }),
        `-${15 - i} minutes`,
      ],
    });
  }
  parseTelemetryFromHealth('cache', 'degraded').forEach((row, i) => {
    stmts.push({
      sql: `INSERT INTO telemetry (project_id, metric_name, value, unit, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      args: [proj, row.metric_name, row.value, row.unit, `-${i + 1} minutes`],
    });
  });
  return { stmts, meta: { preset: 'cache-stampede', projectId: proj, incidentId: inc } };
}
