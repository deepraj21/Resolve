import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import { getDb, initSchema } from './database.js';

function id() {
  return crypto.randomUUID();
}

async function seed() {
  await initSchema();
  const db = getDb();

  const projPayment = id();
  const projUser = id();
  const projWorker = id();
  const projRedis = id();
  const projGateway = id();

  const incOpen = id();
  const alert1 = id();
  const alert2 = id();
  const alert3 = id();

  const knowledge1 = id();
  const knowledge2 = id();
  const knowledge3 = id();

  const timeline = JSON.stringify([
    {
      type: 'created',
      label: 'Incident opened',
      detail: 'Triggered from payment-api latency SLO breach',
      at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    {
      type: 'alert',
      label: 'Alert linked',
      detail: 'High P99 latency — checkout API',
      at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    },
  ]);

  const statements = [
    {
      sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        projPayment,
        'payment-api',
        'Processes card vault tokenization and ledger settlements.',
        'api',
        JSON.stringify(['node', 'postgres', 'redis']),
        'payments',
        'degraded',
      ],
    },
    {
      sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        projUser,
        'user-service',
        'Identity, profiles, and session issuance.',
        'api',
        JSON.stringify(['go', 'postgres']),
        'platform',
        'healthy',
      ],
    },
    {
      sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        projWorker,
        'order-worker',
        'Async fulfillment and retry-heavy jobs.',
        'worker',
        JSON.stringify(['node', 'rabbitmq', 'postgres']),
        'commerce',
        'healthy',
      ],
    },
    {
      sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        projRedis,
        'redis-cache',
        'Hot-path cache and rate-limit counters.',
        'cache',
        JSON.stringify(['redis', 'redis-cluster']),
        'platform',
        'healthy',
      ],
    },
    {
      sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        projGateway,
        'api-gateway',
        'North-south routing, authn/z, and traffic shaping.',
        'gateway',
        JSON.stringify(['envoy', 'oauth2']),
        'platform',
        'healthy',
      ],
    },
    {
      sql: `INSERT INTO incidents (id, title, description, severity, status, project_id, rca, remediation, timeline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        incOpen,
        'Checkout API P99 latency elevated',
        'Customers reporting timeouts on /v2/checkout/confirm in us-east-1.',
        'sev2',
        'investigating',
        projPayment,
        null,
        null,
        timeline,
      ],
    },
    {
      sql: `INSERT INTO knowledge (id, title, content, category, tags, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        knowledge1,
        'Runbook: Postgres connection pool exhaustion',
        '## Symptoms\n- Rising wait time on pool.acquire()\n- Errors: "timeout acquiring connection"\n\n## Mitigation\n1. Shed load at gateway\n2. Scale API replicas\n3. Validate max_connections vs pool size\n',
        'runbook',
        JSON.stringify(['postgres', 'pool', 'payments']),
        projPayment,
      ],
    },
    {
      sql: `INSERT INTO knowledge (id, title, content, category, tags, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        knowledge2,
        'Postmortem: Redis failover-induced stampede',
        '## Summary\nBrief outage when cache cold after failover.\n\n## Action items\n- Circuit break DB\n- Jittered TTL\n',
        'postmortem',
        JSON.stringify(['redis', 'cache']),
        projRedis,
      ],
    },
    {
      sql: `INSERT INTO knowledge (id, title, content, category, tags, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        knowledge3,
        'Architecture: Payment API',
        'Service boundaries, dependencies, and data flows for settlement.',
        'architecture',
        JSON.stringify(['payments', 'diagram']),
        projPayment,
      ],
    },
    {
      sql: `INSERT INTO alerts (id, title, severity, source, status, message, metric_data, project_id, incident_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        alert1,
        'P99 latency > 800ms on checkout_confirm',
        'high',
        'prometheus',
        'firing',
        'SLO burn rate exceeded for checkout latency.',
        JSON.stringify({
          metric_name: 'http_server_duration_p99',
          threshold: '500ms',
          current: '920ms',
        }),
        projPayment,
        incOpen,
      ],
    },
    {
      sql: `INSERT INTO alerts (id, title, severity, source, status, message, metric_data, project_id, incident_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        alert2,
        'Postgres connections near saturation',
        'critical',
        'datadog',
        'acknowledged',
        'Active connections 92/100 on payments-primary.',
        JSON.stringify({
          metric_name: 'pg_connections_active',
          threshold: '80',
          current: '92',
        }),
        projPayment,
        incOpen,
      ],
    },
    {
      sql: `INSERT INTO alerts (id, title, severity, source, status, message, metric_data, project_id, incident_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        alert3,
        'Redis hit ratio dropped',
        'medium',
        'grafana',
        'resolved',
        'Cache effectiveness degraded during deploy window.',
        JSON.stringify({
          metric_name: 'redis_hit_ratio',
          threshold: '0.92',
          current: '0.78',
        }),
        projRedis,
        null,
      ],
    },
  ];

  const logLevels = ['info', 'warn', 'error', 'error', 'fatal'];
  const messages = [
    'request completed',
    'retry scheduled for dead letter',
    'connection pool exhausted: 50/50 in use',
    'checkout_confirm timeout after 30000ms',
    'OOM risk: heap 94%',
  ];

  for (let i = 0; i < 24; i++) {
    const pid = i % 4 === 0 ? projPayment : i % 3 === 0 ? projWorker : projUser;
    const level = logLevels[i % logLevels.length];
    statements.push({
      sql: `INSERT INTO logs (project_id, level, message, metadata, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      args: [
        pid,
        level,
        `${messages[i % messages.length]} #${i}`,
        JSON.stringify({
          request_id: id(),
          trace_id: id(),
          duration_ms: 120 + i * 13,
        }),
        `-${30 - i} minutes`,
      ],
    });
  }

  const metrics = [
    ['cpu_usage', 72, '%'],
    ['memory_usage', 88, '%'],
    ['error_rate', 4.2, '%'],
    ['p99_latency', 920, 'ms'],
    ['request_count', 1840, 'rpm'],
  ];

  let tIdx = 0;
  for (const p of [projPayment, projUser, projWorker, projRedis, projGateway]) {
    for (const [name, val, unit] of metrics) {
      statements.push({
        sql: `INSERT INTO telemetry (project_id, metric_name, value, unit, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
        args: [p, name, val + Math.random() * 5, unit, `-${tIdx % 18} minutes`],
      });
      tIdx++;
    }
  }

  await db.batch(statements);
  console.log('Seed completed successfully.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
