import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import { getDb, initSchema } from './database.js';

function uuid() {
  return crypto.randomUUID();
}

/** Offset ISO timestamp from now */
function ago(ms) {
  return new Date(Date.now() - ms).toISOString();
}

function buildTimeline(events) {
  return JSON.stringify(
    events.map((e, i) => ({
      type: e.type ?? 'note',
      label: e.label,
      detail: e.detail,
      at: e.at ?? ago(e.minutesAgo * 60 * 1000),
    }))
  );
}

async function clearTables(db) {
  await db.execute('PRAGMA foreign_keys = ON');
  await db.execute('DELETE FROM alerts');
  await db.execute('DELETE FROM logs');
  await db.execute('DELETE FROM telemetry');
  await db.execute('DELETE FROM knowledge');
  await db.execute('DELETE FROM incidents');
  await db.execute('DELETE FROM projects');
}

async function seed() {
  await initSchema();
  const db = getDb();
  await clearTables(db);
  console.log('Cleared existing rows from all tables.');

  const statements = [];

  const projectDefs = [
    {
      name: 'payment-api',
      description:
        'Card vault tokenization, ACH rails, and nightly settlement batches for North America.',
      service_type: 'api',
      tech_stack: ['node', 'postgres', 'redis', 'stripe-connect'],
      team: 'payments',
      status: 'degraded',
    },
    {
      name: 'user-service',
      description: 'OAuth2/OIDC identity, MFA enrollment, and profile graph for consumer accounts.',
      service_type: 'api',
      tech_stack: ['go', 'postgres', 'opa'],
      team: 'platform',
      status: 'healthy',
    },
    {
      name: 'order-worker',
      description: 'Async fulfillment pipeline: inventory holds, vendor callbacks, DLQ replay.',
      service_type: 'worker',
      tech_stack: ['node', 'rabbitmq', 'postgres', 'temporal'],
      team: 'commerce',
      status: 'healthy',
    },
    {
      name: 'redis-cache',
      description: 'Clustered Redis for session fringe, cart snapshots, and rate-limit counters.',
      service_type: 'cache',
      tech_stack: ['redis', 'redis-cluster', 'haproxy'],
      team: 'platform',
      status: 'healthy',
    },
    {
      name: 'api-gateway',
      description: 'North-south Envoy mesh entry: JWT validation, WAF, circuit breaking, retries.',
      service_type: 'gateway',
      tech_stack: ['envoy', 'oauth2', 'lua'],
      team: 'platform',
      status: 'healthy',
    },
    {
      name: 'billing-ledger',
      description: 'Subscription invoicing, tax/VAT tables, and revenue recognition exports.',
      service_type: 'api',
      tech_stack: ['rust', 'postgres', 'kafka'],
      team: 'finance',
      status: 'healthy',
    },
    {
      name: 'notification-hub',
      description: 'Email, SMS, and push fan-out with provider failover and quiet hours.',
      service_type: 'api',
      tech_stack: ['python', 'fastapi', 'redis', 'sendgrid'],
      team: 'growth',
      status: 'healthy',
    },
    {
      name: 'search-indexer',
      description: 'CDC-driven indexing into OpenSearch; synonym packs and ranking experiments.',
      service_type: 'worker',
      tech_stack: ['java', 'kafka', 'opensearch', 'debezium'],
      team: 'discovery',
      status: 'degraded',
    },
    {
      name: 'mobile-bff',
      description: 'GraphQL BFF for iOS/Android; aggregates catalog, cart, and loyalty in one hop.',
      service_type: 'api',
      tech_stack: ['node', 'apollo', 'redis'],
      team: 'commerce',
      status: 'healthy',
    },
    {
      name: 'analytics-stream',
      description: 'Snowplow-style event ingestion → warehouse staging with PII hashing.',
      service_type: 'worker',
      tech_stack: ['scala', 'kafka', 'snowflake', 'dbt'],
      team: 'data',
      status: 'healthy',
    },
    {
      name: 'inventory-service',
      description: 'Stock reservations, ATP calculations, and DC-level availability APIs.',
      service_type: 'api',
      tech_stack: ['go', 'postgres', 'grpc'],
      team: 'commerce',
      status: 'healthy',
    },
    {
      name: 'shipment-tracker',
      description: 'Carrier webhooks, ETA refinement, and customer-facing tracking tokens.',
      service_type: 'api',
      tech_stack: ['ruby', 'rails', 'sidekiq', 'postgres'],
      team: 'logistics',
      status: 'healthy',
    },
    {
      name: 'neon-primary',
      description: 'Primary OLTP Postgres cluster (payments-adjacent schemas; PITR enabled).',
      service_type: 'database',
      tech_stack: ['postgres', 'neon', 'pgbouncer'],
      team: 'platform',
      status: 'healthy',
    },
    {
      name: 'kafka-ingest',
      description: 'Shared Kafka cluster for commerce events; tiered retention and compaction.',
      service_type: 'queue',
      tech_stack: ['kafka', 'schema-registry', 'kafka-connect'],
      team: 'platform',
      status: 'healthy',
    },
    {
      name: 'cdn-static',
      description: 'Marketing site and design-system assets at the edge; ISR-friendly.',
      service_type: 'frontend',
      tech_stack: ['next', 'vercel', 'tailwind'],
      team: 'marketing',
      status: 'healthy',
    },
    {
      name: 'admin-console',
      description: 'Internal ops console for refunds, manual inventory, and support tooling.',
      service_type: 'frontend',
      tech_stack: ['react', 'vite', 'tanstack-query'],
      team: 'platform',
      status: 'healthy',
    },
    {
      name: 'web-checkout',
      description: 'Hosted checkout iframe SDK and fraud signals hook for merchant partners.',
      service_type: 'frontend',
      tech_stack: ['react', 'typescript', 'stripe-js'],
      team: 'payments',
      status: 'degraded',
    },
    {
      name: 'risk-engine',
      description: 'Real-time scoring for card velocity, device fingerprint overlap, and geo anomalies.',
      service_type: 'api',
      tech_stack: ['python', 'pytorch-serving', 'redis'],
      team: 'trust',
      status: 'healthy',
    },
    {
      name: 'document-store',
      description: 'S3-compatible receipts, tax PDFs, and dispute evidence with lifecycle policies.',
      service_type: 'storage',
      tech_stack: ['s3', 'kms', 'clamav'],
      team: 'platform',
      status: 'healthy',
    },
    {
      name: 'pricing-service',
      description: 'Dynamic pricing rules, coupon stacking validation, and currency FX snapshots.',
      service_type: 'api',
      tech_stack: ['kotlin', 'postgres', 'grpc'],
      team: 'commerce',
      status: 'healthy',
    },
    {
      name: 'support-ticketing',
      description: 'Zendesk-like internal API for agent queues and SLA timers.',
      service_type: 'api',
      tech_stack: ['node', 'postgres', 'bullmq'],
      team: 'support',
      status: 'healthy',
    },
    {
      name: 'feature-flags',
      description: 'LaunchDarkly-compatible SDK backend with gradual rollouts and segments.',
      service_type: 'api',
      tech_stack: ['go', 'redis', 'postgres'],
      team: 'platform',
      status: 'healthy',
    },
    {
      name: 'metrics-aggregator',
      description: 'Rolls up Prometheus remote-write; federation and recording rules.',
      service_type: 'worker',
      tech_stack: ['prometheus', 'thanos', 'kubernetes'],
      team: 'platform',
      status: 'healthy',
    },
    {
      name: 'vendor-webhooks',
      description: 'Inbound signature verification and replay-protected vendor callbacks.',
      service_type: 'api',
      tech_stack: ['node', 'hono', 'postgres'],
      team: 'commerce',
      status: 'healthy',
    },
  ];

  const projects = projectDefs.map((p) => ({
    id: uuid(),
    ...p,
  }));

  const byName = Object.fromEntries(projects.map((p) => [p.name, p]));

  for (const p of projects) {
    statements.push({
      sql: `INSERT INTO projects (id, name, description, service_type, tech_stack, team, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        p.id,
        p.name,
        p.description,
        p.service_type,
        JSON.stringify(p.tech_stack),
        p.team,
        p.status,
      ],
    });
  }

  const incidentSpecs = [
    {
      title: 'Checkout API P99 latency elevated',
      description:
        'Merchants reporting intermittent timeouts on POST /v2/checkout/confirm in us-east-1; mobile clients seeing spinner >15s.',
      severity: 'sev2',
      status: 'investigating',
      project: 'payment-api',
      rca: null,
      remediation: null,
      timeline: buildTimeline([
        {
          type: 'created',
          label: 'Incident opened',
          detail: 'PagerDuty triggered from checkout latency SLO burn',
          minutesAgo: 52,
        },
        {
          type: 'alert',
          label: 'SLO breach',
          detail: 'P99 exceeded 800ms for 15m window',
          minutesAgo: 48,
        },
        {
          type: 'note',
          label: 'War room',
          detail: 'payments-oncall + platform joined Zoom bridge',
          minutesAgo: 44,
        },
      ]),
    },
    {
      title: 'Search indexer lag behind CDC stream',
      description:
        'Product catalog freshness degraded; lag ~12 minutes vs SLA of 2 minutes during peak sale.',
      severity: 'sev3',
      status: 'identified',
      project: 'search-indexer',
      rca: 'Burst traffic increased partition skew; one consumer group stalled.',
      remediation: 'Scaled consumers + rebalanced partitions; added lag alert.',
      timeline: buildTimeline([
        {
          type: 'created',
          label: 'Opened',
          detail: 'Support surge + discovery dashboard red',
          minutesAgo: 180,
        },
        {
          type: 'note',
          label: 'Root cause',
          detail: 'Kafka consumer stuck on hot partition',
          minutesAgo: 120,
        },
      ]),
    },
    {
      title: 'Redis failover caused brief checkout errors',
      description: 'Automatic failover in cache tier; ~90s of elevated 5xx on session-backed flows.',
      severity: 'sev2',
      status: 'resolved',
      project: 'redis-cache',
      rca: 'Failover during deploy; clients without cluster-aware retry stampeded DB.',
      remediation: 'Enabled READONLY routing + circuit breaker to payments-primary.',
      timeline: buildTimeline([
        { label: 'Detected', detail: 'Synthetic checks failed edge POP', minutesAgo: 10080 },
        { label: 'Mitigated', detail: 'Scaled API + warmed cache', minutesAgo: 10050 },
        { label: 'Resolved', detail: 'Traffic normalized', minutesAgo: 10020 },
      ]),
    },
    {
      title: 'Webhook delivery backlog for ShipFast integration',
      description: 'Outbound retries saturated worker pool; partners saw 25m delayed status updates.',
      severity: 'sev3',
      status: 'monitoring',
      project: 'vendor-webhooks',
      rca: 'Partner rate limit lowered without notice; exponential backoff piled up.',
      remediation: 'Per-partner concurrency caps + dead-letter dashboard.',
      timeline: buildTimeline([
        { label: 'Opened', detail: 'Ops noticed DLQ depth spike', minutesAgo: 720 },
      ]),
    },
    {
      title: 'Mobile BFF GraphQL timeout spike',
      description: 'p95 resolver time for cartMerge exceeded 4s after loyalty service deploy.',
      severity: 'sev3',
      status: 'resolved',
      project: 'mobile-bff',
      rca: 'N+1 on loyalty tier fetch when feature flag defaulted on.',
      remediation: 'DataLoader batching + flag rollback.',
      timeline: buildTimeline([
        { label: 'Rollback', detail: 'Loyalty flag off globally', minutesAgo: 4320 },
      ]),
    },
    {
      title: 'Billing cron duplicate invoice rows',
      description: 'Nightly job double-posted 0.4% of subscriptions; finance paused exports.',
      severity: 'sev2',
      status: 'postmortem',
      project: 'billing-ledger',
      rca: 'Leader election flake allowed overlapping cron pods.',
      remediation: 'Advisory locks + idempotent invoice keys.',
      timeline: buildTimeline([
        { label: 'Containment', detail: 'Paused cron + froze bad batch IDs', minutesAgo: 20160 },
      ]),
    },
    {
      title: 'Notification SMS provider elevated error rate',
      description: 'Twilio subaccount rate limited during flash sale broadcast.',
      severity: 'sev4',
      status: 'resolved',
      project: 'notification-hub',
      rca: 'Burst exceeded negotiated RPS; retries amplified.',
      remediation: 'Shaped sends + secondary provider failover.',
      timeline: buildTimeline([{ label: 'Closed', detail: 'Secondary path verified', minutesAgo: 5040 }]),
    },
    {
      title: 'Warehouse inventory negative ATP glitch',
      description: 'Race in reservation release led to oversell risk on limited SKU drop.',
      severity: 'sev1',
      status: 'resolved',
      project: 'inventory-service',
      rca: 'Optimistic lock retry exhausted under concurrent checkout.',
      remediation: 'Pessimistic lock on hot SKUs + queue for drops.',
      timeline: buildTimeline([
        { label: 'All-hands', detail: 'Commerce leadership engaged', minutesAgo: 30240 },
      ]),
    },
    {
      title: 'Gateway JWT validation latency regression',
      description: 'jwks fetch storm after IdP cert rotation; cold cache on several pods.',
      severity: 'sev3',
      status: 'resolved',
      project: 'api-gateway',
      rca: 'Stampede on new kid after rotation.',
      remediation: 'JWKS warm + backoff jitter shared across workers.',
      timeline: buildTimeline([{ label: 'Mitigated', detail: 'Preloaded keys on deploy', minutesAgo: 8640 }]),
    },
    {
      title: 'Hosted checkout iframe CSP mismatch',
      description: 'Partner embed domains blocked after CSP tighten; checkout iframe blank for subset.',
      severity: 'sev3',
      status: 'monitoring',
      project: 'web-checkout',
      rca: 'Allowlist rollout missed two reseller domains.',
      remediation: 'Automated domain sync from partner registry.',
      timeline: buildTimeline([{ label: 'Hotfix', detail: 'Domains added + deployed', minutesAgo: 240 }]),
    },
    {
      title: 'Risk engine model drift false positives',
      description: 'Sudden spike in soft-declines for returning customers in EU.',
      severity: 'sev4',
      status: 'identified',
      project: 'risk-engine',
      rca: null,
      remediation: null,
      timeline: buildTimeline([{ label: 'Investigating', detail: 'Comparing feature distributions', minutesAgo: 360 }]),
    },
    {
      title: 'Analytics stream lag to warehouse',
      description: 'Snowflake pipe backlog after schema migration increased batch sizes.',
      severity: 'sev4',
      status: 'resolved',
      project: 'analytics-stream',
      rca: 'Migration doubled row width; loader thrashed.',
      remediation: 'Tuned batch + warehouse warehouse WH resize overnight.',
      timeline: buildTimeline([{ label: 'Caught up', detail: 'Lag < 5 min', minutesAgo: 1440 }]),
    },
    {
      title: 'Support ticketing SLA breach wave',
      description: 'Redis outage on feature-flags caused retry storm into ticketing API.',
      severity: 'sev3',
      status: 'resolved',
      project: 'support-ticketing',
      rca: 'Cascading dependency not in failure matrix.',
      remediation: 'Bulkhead + cached read path for agent roster.',
      timeline: buildTimeline([{ label: 'Recovered', detail: 'P95 API latency green', minutesAgo: 5760 }]),
    },
    {
      title: 'PDF receipt generation timeouts',
      description: 'Antivirus scan queue saturated during tax season peak.',
      severity: 'sev3',
      status: 'resolved',
      project: 'document-store',
      rca: 'Single-threaded scan worker bottleneck.',
      remediation: 'Horizontal scan workers + size limits.',
      timeline: buildTimeline([{ label: 'Scaled', detail: 'Workers 3→12', minutesAgo: 7200 }]),
    },
    {
      title: 'Pricing rule evaluation CPU pegged',
      description: 'Black Friday preview traffic triggered expensive nested rule chains.',
      severity: 'sev2',
      status: 'resolved',
      project: 'pricing-service',
      rca: 'Missing index on rule dependency graph.',
      remediation: 'Indexed edges + memoization cache.',
      timeline: buildTimeline([{ label: 'Stable', detail: 'CPU < 60%', minutesAgo: 10800 }]),
    },
    {
      title: 'Kafka ingest broker disk pressure',
      description: 'Retention misconfiguration on hot topic filled disks faster than GC.',
      severity: 'sev2',
      status: 'monitoring',
      project: 'kafka-ingest',
      rca: 'Topic retention override left at debug value.',
      remediation: 'Corrected retention + disk alerts per broker.',
      timeline: buildTimeline([{ label: 'Pager', detail: 'infra rotation ack', minutesAgo: 480 }]),
    },
    {
      title: 'Marketing CDN 404 spike on design tokens',
      description: 'Bad deploy manifest pointed to hashed filenames that were purged early.',
      severity: 'sev4',
      status: 'resolved',
      project: 'cdn-static',
      rca: 'Purge job overlapped with lazy ISR.',
      remediation: 'Immutable asset naming + purge ban during deploy.',
      timeline: buildTimeline([{ label: 'Rollback', detail: 'Previous manifest restored', minutesAgo: 960 }]),
    },
    {
      title: 'Admin console partial outage — auth redirect loop',
      description: 'OIDC client secret rotation not synced to staging parity test.',
      severity: 'sev4',
      status: 'resolved',
      project: 'admin-console',
      rca: 'Manual secret in vault drifted from IdP.',
      remediation: 'Terraform sync + nightly drift check.',
      timeline: buildTimeline([{ label: 'Fixed', detail: 'Secret rotated + pods restarted', minutesAgo: 2880 }]),
    },
    {
      title: 'Shipment tracker carrier API 429 storm',
      description: 'Polling backoff bug hammered UPS sandbox during integration test.',
      severity: 'sev4',
      status: 'resolved',
      project: 'shipment-tracker',
      rca: 'Integration tests pointed at prod-like rate limits.',
      remediation: 'Separate sandbox credentials + test scheduler.',
      timeline: buildTimeline([{ label: 'Quiet', detail: 'Traffic shaped', minutesAgo: 3600 }]),
    },
    {
      title: 'Neon connection ceiling during migration window',
      description: 'Logical migration opened extra pools temporarily; near max_connections.',
      severity: 'sev3',
      status: 'resolved',
      project: 'neon-primary',
      rca: 'Overlapping pg_dump and app pools.',
      remediation: 'Serialized migration windows + pool caps.',
      timeline: buildTimeline([{ label: 'Resolved', detail: 'Connections under 70%', minutesAgo: 6480 }]),
    },
    {
      title: 'Metrics aggregator recording rule evaluation delays',
      description: 'Thanos compact backlog caused stale SLO dashboards for 45m.',
      severity: 'sev4',
      status: 'resolved',
      project: 'metrics-aggregator',
      rca: 'Compaction blocked on large block.',
      remediation: 'Manual compact + increased resources.',
      timeline: buildTimeline([{ label: 'Caught up', detail: 'Eval lag normal', minutesAgo: 7920 }]),
    },
  ];

  const incidents = incidentSpecs.map((spec) => ({
    id: uuid(),
    ...spec,
    project_id: byName[spec.project].id,
  }));

  for (const inc of incidents) {
    statements.push({
      sql: `INSERT INTO incidents (id, title, description, severity, status, project_id, rca, remediation, timeline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        inc.id,
        inc.title,
        inc.description,
        inc.severity,
        inc.status,
        inc.project_id,
        inc.rca,
        inc.remediation,
        inc.timeline,
      ],
    });
  }

  const incidentByTitle = Object.fromEntries(incidents.map((i) => [i.title, i]));

  const knowledgeSpecs = [
    {
      title: 'Runbook: Postgres connection pool exhaustion',
      content:
        '## Symptoms\n- Rising wait time on pool.acquire()\n- Errors: `timeout acquiring connection`\n- Elevated API latency tail\n\n## Mitigation\n1. Shed load at gateway (429 tuned)\n2. Scale API replicas horizontally\n3. Validate `max_connections` vs per-pod pool size\n4. Check for slow queries holding connections\n\n## Escalation\nDBA on-call if connections >85% sustained.',
      category: 'runbook',
      tags: ['postgres', 'pool', 'payments'],
      project: 'payment-api',
    },
    {
      title: 'Postmortem: Redis failover-induced stampede',
      content:
        '## Summary\nBrief 7m outage when cache went cold after AZ failover.\n\n## Impact\n~0.8% checkout attempts failed; no data loss.\n\n## Action items\n- [ ] Circuit break on DB when cache miss rate spikes\n- [ ] Jittered TTL on hot keys\n- [ ] Chaos test quarterly failover',
      category: 'postmortem',
      tags: ['redis', 'cache', 'failover'],
      project: 'redis-cache',
    },
    {
      title: 'Architecture: Payment API boundaries',
      content:
        '## Context\nSettlement vs auth paths; PCI scope stays in tokenization service.\n\n## Dependencies\nNeon primary, Redis hot keys, Stripe Connect webhooks.\n\n## Diagrams\nSee FigJam `payments-2026-Q1`.',
      category: 'architecture',
      tags: ['payments', 'diagram', 'pci'],
      project: 'payment-api',
    },
    {
      title: 'SOP: Declaring a SEV2 incident',
      content:
        '1. Page owning team + secondary\n2. Open incident channel `#inc-YYYY-MM-DD-name`\n3. Assign comms lead if customer-visible\n4. Update status page template within 15m\n5. Start timeline entries every major action',
      category: 'sop',
      tags: ['process', 'severity'],
      project: 'api-gateway',
    },
    {
      title: 'Known issue: Legacy SKU format in mobile BFF',
      content:
        'Older app versions send hyphenated SKU; resolver maps via lookup table. Remove after v4.2 min version enforcement.',
      category: 'known_issue',
      tags: ['mobile', 'sku', 'graphql'],
      project: 'mobile-bff',
    },
    {
      title: 'Runbook: Kafka consumer lag triage',
      content:
        '## Check\n- Consumer group lag per partition\n- Broker disk / ISR\n- Poison pill messages (DLQ inspect)\n\n## Fix paths\nScale consumers, skip bad offset with approval, fix upstream producer.',
      category: 'runbook',
      tags: ['kafka', 'lag'],
      project: 'search-indexer',
    },
    {
      title: 'Runbook: Envoy 503 upstream reset',
      content:
        'Correlate with cluster health checks; verify subset endpoints; check for circuit open on dependency.\n\nRollback path: previous config revision via GitOps.',
      category: 'runbook',
      tags: ['envoy', 'gateway'],
      project: 'api-gateway',
    },
    {
      title: 'Architecture: Notification hub provider matrix',
      content:
        'Primary SendGrid email, fallback SES. SMS Twilio + Telnyx DR. Push via FCM/APNs direct.',
      category: 'architecture',
      tags: ['email', 'sms', 'providers'],
      project: 'notification-hub',
    },
    {
      title: 'Postmortem: Billing duplicate invoices',
      content:
        'See finance retro doc; keys now idempotent on `(subscription_id, period_end)`.\n\nReplay scripts in `finance-tools` repo.',
      category: 'postmortem',
      tags: ['billing', 'idempotency'],
      project: 'billing-ledger',
    },
    {
      title: 'Runbook: Snowflake pipe backlog',
      content:
        'Check pipe status, staging file count, warehouse autosuspend. Scale WH temporarily; avoid concurrent schema migrations during peak.',
      category: 'runbook',
      tags: ['snowflake', 'etl'],
      project: 'analytics-stream',
    },
    {
      title: 'Known issue: OpenSearch synonym pack v3 drift',
      content:
        'Retail team A/B testing synonyms; relevance regressions possible on broad queries. Coordinate with discovery before edits.',
      category: 'known_issue',
      tags: ['search', 'opensearch'],
      project: 'search-indexer',
    },
    {
      title: 'SOP: Rotating gateway JWKS without thundering herd',
      content:
        'Pre-deploy: warm keys to all pods via init container fetch; stagger rollout by AZ.',
      category: 'sop',
      tags: ['jwt', 'jwks', 'rotation'],
      project: 'api-gateway',
    },
    {
      title: 'Architecture: Inventory reservation state machine',
      content:
        'States: available → held → committed | released. Deadlines for holds; orphan sweeper hourly.',
      category: 'architecture',
      tags: ['inventory', 'state-machine'],
      project: 'inventory-service',
    },
    {
      title: 'Runbook: Carrier webhook signature failures',
      content:
        'Verify HMAC secret version in vault vs partner dashboard; replay window 15m; use idempotency keys on our outbound.',
      category: 'runbook',
      tags: ['webhooks', 'hmac'],
      project: 'shipment-tracker',
    },
    {
      title: 'Postmortem: Neon connection storm during migration',
      content:
        'Lesson: never overlap pg_dump with blue/green cutover without pool budget.',
      category: 'postmortem',
      tags: ['postgres', 'neon', 'migration'],
      project: 'neon-primary',
    },
    {
      title: 'Known issue: Checkout iframe third-party cookies',
      content:
        'Safari ITP limits; recommend token-in-postMessage flow for partners still on cookie auth.',
      category: 'known_issue',
      tags: ['safari', 'iframe', 'checkout'],
      project: 'web-checkout',
    },
    {
      title: 'Runbook: Risk model rollback',
      content:
        'Feature flag `risk_model_version`; instant rollback to prior artifact; shadow mode for canaries.',
      category: 'runbook',
      tags: ['ml', 'risk'],
      project: 'risk-engine',
    },
    {
      title: 'Architecture: Document store virus scan pipeline',
      content:
        'Upload → pre-signed URL → S3 → SQS → ClamAV workers → metadata row update.',
      category: 'architecture',
      tags: ['s3', 'security'],
      project: 'document-store',
    },
    {
      title: 'SOP: Customer comms during payments incident',
      content:
        'Template set in Intercom; avoid specifics on card data; link to status page only.',
      category: 'sop',
      tags: ['comms', 'payments'],
      project: 'payment-api',
    },
    {
      title: 'Runbook: Pricing rule hotfix deploy',
      content:
        'Rulesets versioned; deploy via API with dry-run against shadow traffic first.',
      category: 'runbook',
      tags: ['pricing', 'deploy'],
      project: 'pricing-service',
    },
    {
      title: 'Known issue: Support ticketing bulk export timeout',
      content:
        'Exports >500k rows should use async job; sync endpoint will 504.',
      category: 'known_issue',
      tags: ['export', 'timeout'],
      project: 'support-ticketing',
    },
    {
      title: 'Architecture: Feature flags evaluation path',
      content:
        'Edge cache in Redis; segments resolved from user-service bulk snapshot nightly.',
      category: 'architecture',
      tags: ['flags', 'redis'],
      project: 'feature-flags',
    },
    {
      title: 'Postmortem: Kafka broker disk filled',
      content:
        'Retention mis-set during debug session; added linter on topic apply.',
      category: 'postmortem',
      tags: ['kafka', 'ops'],
      project: 'kafka-ingest',
    },
    {
      title: 'Runbook: CDN purge gone wrong',
      content:
        'Never purge `/_next/static/*` during active deploy; use soft TTL bump instead.',
      category: 'runbook',
      tags: ['cdn', 'next'],
      project: 'cdn-static',
    },
    {
      title: 'SOP: Admin console OIDC secret rotation',
      content:
        'Coordinate with IdP team; rotate in vault first; rolling restart admin pods; validate SSO test account.',
      category: 'sop',
      tags: ['oidc', 'sso'],
      project: 'admin-console',
    },
    {
      title: 'Runbook: Vendor webhook DLQ replay',
      content:
        'Inspect DLQ reason; fix signature or payload; replay with rate limit per partner.',
      category: 'runbook',
      tags: ['dlq', 'replay'],
      project: 'vendor-webhooks',
    },
    {
      title: 'Architecture: Metrics aggregator Thanos topology',
      content:
        'Sidecars → receive → compact → store gateway; global query fan-out.',
      category: 'architecture',
      tags: ['prometheus', 'thanos'],
      project: 'metrics-aggregator',
    },
    {
      title: 'Known issue: GraphQL max complexity default',
      content:
        'Some legacy queries hit limit; clients must paginate `orderHistory`.',
      category: 'known_issue',
      tags: ['graphql', 'limits'],
      project: 'mobile-bff',
    },
    {
      title: 'Runbook: Order worker poison message',
      content:
        'DLQ inspect → reproduce in staging → patch consumer → replay from offset with approval.',
      category: 'runbook',
      tags: ['rabbitmq', 'worker'],
      project: 'order-worker',
    },
    {
      title: 'Postmortem: Mobile loyalty N+1 deploy',
      content:
        'Feature flag interaction caused resolver fan-out; DataLoader ship in hotfix.',
      category: 'postmortem',
      tags: ['graphql', 'performance'],
      project: 'mobile-bff',
    },
    {
      title: 'SOP: Tax season document throughput',
      content:
        'Pre-scale ClamAV workers by 4× starting Feb 1; freeze non-urgent scans.',
      category: 'sop',
      tags: ['tax', 'scale'],
      project: 'document-store',
    },
  ];

  for (const k of knowledgeSpecs) {
    statements.push({
      sql: `INSERT INTO knowledge (id, title, content, category, tags, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        uuid(),
        k.title,
        k.content,
        k.category,
        JSON.stringify(k.tags),
        byName[k.project].id,
      ],
    });
  }

  const alertSpecs = [
    {
      title: 'P99 latency > 800ms on checkout_confirm',
      severity: 'high',
      source: 'prometheus',
      status: 'firing',
      message: 'SLO burn rate exceeded for checkout latency (fast burn).',
      metric_data: { metric_name: 'http_server_duration_p99', threshold: '500ms', current: '920ms' },
      project: 'payment-api',
      incidentTitle: 'Checkout API P99 latency elevated',
    },
    {
      title: 'Postgres connections near saturation',
      severity: 'critical',
      source: 'datadog',
      status: 'acknowledged',
      message: 'Active connections 92/100 on payments-primary.',
      metric_data: { metric_name: 'pg_connections_active', threshold: '80', current: '92' },
      project: 'payment-api',
      incidentTitle: 'Checkout API P99 latency elevated',
    },
    {
      title: 'Redis hit ratio dropped',
      severity: 'medium',
      source: 'grafana',
      status: 'resolved',
      message: 'Cache effectiveness degraded during deploy window.',
      metric_data: { metric_name: 'redis_hit_ratio', threshold: '0.92', current: '0.78' },
      project: 'redis-cache',
      incidentTitle: null,
    },
    {
      title: 'Kafka consumer lag > 400k messages',
      severity: 'high',
      source: 'prometheus',
      status: 'firing',
      message: 'Group `search-cdc` lag rising on partition 7.',
      metric_data: { metric_name: 'kafka_consumer_lag', threshold: '100000', current: '412000' },
      project: 'search-indexer',
      incidentTitle: 'Search indexer lag behind CDC stream',
    },
    {
      title: 'OpenSearch cluster yellow',
      severity: 'medium',
      source: 'custom',
      status: 'acknowledged',
      message: 'Replica shard unassigned on os-prod-03.',
      metric_data: { metric_name: 'cluster_health', threshold: 'green', current: 'yellow' },
      project: 'search-indexer',
      incidentTitle: 'Search indexer lag behind CDC stream',
    },
    {
      title: 'GraphQL resolver p99 > 3s',
      severity: 'high',
      source: 'datadog',
      status: 'resolved',
      message: 'Field `cartMerge` latency elevated.',
      metric_data: { metric_name: 'graphql_resolver_p99', threshold: '1500ms', current: '4100ms' },
      project: 'mobile-bff',
      incidentTitle: 'Mobile BFF GraphQL timeout spike',
    },
    {
      title: 'Webhook DLQ depth critical',
      severity: 'critical',
      source: 'cloudwatch',
      status: 'acknowledged',
      message: 'DLQ `vendor-webhooks-dlq` depth 14k.',
      metric_data: { metric_name: 'sqs_approximate_depth', threshold: '1000', current: '14020' },
      project: 'vendor-webhooks',
      incidentTitle: 'Webhook delivery backlog for ShipFast integration',
    },
    {
      title: 'Invoice job error rate > 1%',
      severity: 'high',
      source: 'prometheus',
      status: 'resolved',
      message: 'Duplicate key violations on invoice_lines.',
      metric_data: { metric_name: 'job_error_ratio', threshold: '0.001', current: '0.012' },
      project: 'billing-ledger',
      incidentTitle: 'Billing cron duplicate invoice rows',
    },
    {
      title: 'SMS provider 5xx rate elevated',
      severity: 'medium',
      source: 'datadog',
      status: 'resolved',
      message: 'Twilio API error spike region US1.',
      metric_data: { metric_name: 'provider_5xx_rate', threshold: '0.01', current: '0.07' },
      project: 'notification-hub',
      incidentTitle: 'Notification SMS provider elevated error rate',
    },
    {
      title: 'Inventory reservation conflicts spike',
      severity: 'critical',
      source: 'prometheus',
      status: 'resolved',
      message: 'Optimistic lock failures on SKU DROP-2026-LIMITED.',
      metric_data: { metric_name: 'lock_conflict_rate', threshold: '50/min', current: '890/min' },
      project: 'inventory-service',
      incidentTitle: 'Warehouse inventory negative ATP glitch',
    },
    {
      title: 'Envoy upstream_rq_pending_overflow',
      severity: 'high',
      source: 'prometheus',
      status: 'resolved',
      message: 'Circuit breaker opening on auth-metadata upstream.',
      metric_data: { metric_name: 'circuit_breaker_open', threshold: '0', current: '1' },
      project: 'api-gateway',
      incidentTitle: 'Gateway JWT validation latency regression',
    },
    {
      title: 'CSP violation reports spike',
      severity: 'medium',
      source: 'custom',
      status: 'firing',
      message: 'iframe blocked: script-src eval on partner embed.',
      metric_data: { metric_name: 'csp_report_count', threshold: '10/min', current: '340/min' },
      project: 'web-checkout',
      incidentTitle: 'Hosted checkout iframe CSP mismatch',
    },
    {
      title: 'Risk model score variance anomaly',
      severity: 'low',
      source: 'custom',
      status: 'firing',
      message: 'Population mean drift > 2σ vs baseline.',
      metric_data: { metric_name: 'score_drift', threshold: '0.5σ', current: '2.1σ' },
      project: 'risk-engine',
      incidentTitle: 'Risk engine model drift false positives',
    },
    {
      title: 'Snowflake pipe backlog minutes high',
      severity: 'medium',
      source: 'datadog',
      status: 'resolved',
      message: 'Average lag 42m for pipe RAW_EVENTS.',
      metric_data: { metric_name: 'pipe_lag_minutes', threshold: '15', current: '42' },
      project: 'analytics-stream',
      incidentTitle: 'Analytics stream lag to warehouse',
    },
    {
      title: 'Ticketing API p95 latency',
      severity: 'high',
      source: 'grafana',
      status: 'resolved',
      message: 'Support API latency correlated with flags Redis.',
      metric_data: { metric_name: 'http_server_duration_p95', threshold: '400ms', current: '2100ms' },
      project: 'support-ticketing',
      incidentTitle: 'Support ticketing SLA breach wave',
    },
    {
      title: 'ClamAV queue wait time',
      severity: 'high',
      source: 'prometheus',
      status: 'resolved',
      message: 'Scan queue depth 8k documents.',
      metric_data: { metric_name: 'scan_queue_depth', threshold: '500', current: '8200' },
      project: 'document-store',
      incidentTitle: 'PDF receipt generation timeouts',
    },
    {
      title: 'Pricing rule evaluation CPU',
      severity: 'high',
      source: 'cloudwatch',
      status: 'resolved',
      message: 'ECS CPU sustained >85%.',
      metric_data: { metric_name: 'cpu_utilization', threshold: '70%', current: '91%' },
      project: 'pricing-service',
      incidentTitle: 'Pricing rule evaluation CPU pegged',
    },
    {
      title: 'Kafka broker disk >85%',
      severity: 'critical',
      source: 'prometheus',
      status: 'acknowledged',
      message: 'broker-2 /var/lib/kafka at 88%.',
      metric_data: { metric_name: 'disk_used_pct', threshold: '80%', current: '88%' },
      project: 'kafka-ingest',
      incidentTitle: 'Kafka ingest broker disk pressure',
    },
    {
      title: 'CDN 404 rate',
      severity: 'medium',
      source: 'custom',
      status: 'resolved',
      message: '404s on /_next/static/chunks/* pattern.',
      metric_data: { metric_name: 'http_404_rate', threshold: '0.1%', current: '4.2%' },
      project: 'cdn-static',
      incidentTitle: 'Marketing CDN 404 spike on design tokens',
    },
    {
      title: 'OIDC token validation failures',
      severity: 'medium',
      source: 'grafana',
      status: 'resolved',
      message: '401 spike on /api/admin/* routes.',
      metric_data: { metric_name: 'auth_failure_rate', threshold: '1%', current: '18%' },
      project: 'admin-console',
      incidentTitle: 'Admin console partial outage — auth redirect loop',
    },
    {
      title: 'UPS API 429 responses',
      severity: 'low',
      source: 'custom',
      status: 'resolved',
      message: 'Rate limit exceeded for polling integration.',
      metric_data: { metric_name: 'carrier_429_count', threshold: '0', current: '1240/hr' },
      project: 'shipment-tracker',
      incidentTitle: 'Shipment tracker carrier API 429 storm',
    },
    {
      title: 'Neon connections utilization',
      severity: 'high',
      source: 'datadog',
      status: 'resolved',
      message: 'Connections 142/180.',
      metric_data: { metric_name: 'pg_connections_pct', threshold: '75%', current: '79%' },
      project: 'neon-primary',
      incidentTitle: 'Neon connection ceiling during migration window',
    },
    {
      title: 'Thanos compact latency',
      severity: 'medium',
      source: 'prometheus',
      status: 'resolved',
      message: 'Compaction jobs behind by 3 generations.',
      metric_data: { metric_name: 'compact_pending_blocks', threshold: '5', current: '22' },
      project: 'metrics-aggregator',
      incidentTitle: 'Metrics aggregator recording rule evaluation delays',
    },
    {
      title: 'Order worker DLQ growth',
      severity: 'medium',
      source: 'datadog',
      status: 'resolved',
      message: 'Transient vendor timeout causing retries.',
      metric_data: { metric_name: 'rabbitmq_dlq_depth', threshold: '100', current: '450' },
      project: 'order-worker',
      incidentTitle: null,
    },
    {
      title: 'RabbitMQ memory alarm',
      severity: 'critical',
      source: 'prometheus',
      status: 'resolved',
      message: 'Node rabbit-02 memory watermark breached.',
      metric_data: { metric_name: 'mem_alarm', threshold: '0', current: '1' },
      project: 'order-worker',
      incidentTitle: null,
    },
    {
      title: 'Feature flag evaluation errors',
      severity: 'low',
      source: 'custom',
      status: 'resolved',
      message: 'Redis timeouts to flags cluster.',
      metric_data: { metric_name: 'flag_eval_error_rate', threshold: '0.1%', current: '2.4%' },
      project: 'feature-flags',
      incidentTitle: null,
    },
    {
      title: 'Stripe webhook signature failures',
      severity: 'medium',
      source: 'datadog',
      status: 'firing',
      message: 'Clock skew on webhook receivers.',
      metric_data: { metric_name: 'webhook_sig_fail', threshold: '0', current: '34/hr' },
      project: 'payment-api',
      incidentTitle: null,
    },
    {
      title: 'Ledger settlement batch delayed',
      severity: 'high',
      source: 'cloudwatch',
      status: 'acknowledged',
      message: 'Nightly batch started 47m late.',
      metric_data: { metric_name: 'batch_start_delay_min', threshold: '15', current: '47' },
      project: 'billing-ledger',
      incidentTitle: null,
    },
    {
      title: 'Push notification delivery drop',
      severity: 'low',
      source: 'grafana',
      status: 'resolved',
      message: 'FCM token invalid rate elevated after OS update wave.',
      metric_data: { metric_name: 'push_delivery_rate', threshold: '97%', current: '91%' },
      project: 'notification-hub',
      incidentTitle: null,
    },
    {
      title: 'API gateway rate limit violations',
      severity: 'info',
      source: 'prometheus',
      status: 'resolved',
      message: 'Partner load test tripped default RPS.',
      metric_data: { metric_name: 'rate_limit_429', threshold: '100/min', current: '420/min' },
      project: 'api-gateway',
      incidentTitle: null,
    },
  ];

  for (const a of alertSpecs) {
    const inc = a.incidentTitle ? incidentByTitle[a.incidentTitle] : null;
    statements.push({
      sql: `INSERT INTO alerts (id, title, severity, source, status, message, metric_data, project_id, incident_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        uuid(),
        a.title,
        a.severity,
        a.source,
        a.status,
        a.message,
        JSON.stringify(a.metric_data),
        byName[a.project].id,
        inc ? inc.id : null,
      ],
    });
  }

  const logLevels = ['debug', 'info', 'info', 'warn', 'warn', 'error', 'error', 'fatal'];
  const logTemplates = [
    (i, pid) =>
      `request completed trace=${pid.slice(0, 8)} path=/v1/cards/tokenize status=200 duration_ms=${120 + (i % 200)}`,
    (i) =>
      `retry scheduled queue=payments-settlement attempt=${1 + (i % 4)} next_backoff_ms=${500 * (i % 8)}`,
    () =>
      `connection pool exhausted pool=payments-pg active=50 max=50 waiters=14`,
    () =>
      `checkout_confirm deadline exceeded partner_id=merchant_4821 timeout_ms=30000`,
    () =>
      `heap usage critical runtime=node heap_used_mb=892 heap_limit_mb=948 gc=major`,
    (i) =>
      `kafka consumer lag group=search-cdc partition=${i % 12} lag=${8000 + i * 17}`,
    () =>
      `graphql complexity exceeded query_id=cartMerge client=ios/4.1.2 cost=8421 max=8000`,
    () =>
      `dead letter published routing_key=order.fulfillment reason=vendor_timeout`,
    (i) =>
      `envoy upstream_rq_time host=auth-metadata p99_ms=${180 + i % 90}`,
    () =>
      `stripe webhook processed evt=charge.succeeded latency_ms=34`,
    () =>
      `snowflake copy into pipeline=raw_events rows_loaded=184920`,
    () =>
      `clamav scan_complete doc_id=rcpt_9x4k result=clean duration_ms=812`,
    () =>
      `redis cluster NODE timeout marking slave failing`,
    () =>
      `temporal workflow_failed workflow_id=fulfill-99281 error=ActivityTimeout`,
    () =>
      `jwt validation kid mismatch cached=false fetch_jwks_ms=410`,
  ];

  const logCount = 420;
  for (let i = 0; i < logCount; i++) {
    const proj = projects[i % projects.length];
    const level = logLevels[i % logLevels.length];
    const tmpl = logTemplates[i % logTemplates.length];
    let message;
    if (tmpl.length === 2) message = tmpl(i, proj.id);
    else if (tmpl.length === 1) message = tmpl(i);
    else message = tmpl();
    const minutesAgo = 5 + ((i * 7) % 10080);
    statements.push({
      sql: `INSERT INTO logs (project_id, level, message, metadata, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      args: [
        proj.id,
        level,
        message,
        JSON.stringify({
          request_id: uuid(),
          trace_id: uuid(),
          span_id: uuid().slice(0, 16),
          region: ['us-east-1', 'eu-west-1', 'us-west-2'][i % 3],
          pod: `${proj.name.slice(0, 12)}-${(i % 9) + 1}`,
          duration_ms: 40 + (i % 400),
        }),
        `-${minutesAgo} minutes`,
      ],
    });
  }

  const metricNames = [
    ['cpu_usage', '%'],
    ['memory_usage', '%'],
    ['error_rate', '%'],
    ['p99_latency', 'ms'],
    ['request_count', 'rpm'],
    ['pod_count', 'count'],
    ['queue_depth', 'jobs'],
    ['db_conn_wait_ms', 'ms'],
  ];

  let tIdx = 0;
  for (const proj of projects) {
    for (let bucket = 0; bucket < 18; bucket++) {
      for (const [name, unit] of metricNames) {
        const base =
          name === 'cpu_usage'
            ? 35 + (tIdx % 40)
            : name === 'memory_usage'
              ? 55 + (tIdx % 35)
              : name === 'error_rate'
                ? Math.round((Math.random() * 2 + 0.1) * 100) / 100
                : name === 'p99_latency'
                  ? 80 + (tIdx % 900)
                  : name === 'request_count'
                    ? 400 + (tIdx % 8000)
                    : name === 'pod_count'
                      ? 3 + (tIdx % 18)
                      : name === 'queue_depth'
                        ? Math.round(Math.random() * 120)
                        : 5 + (tIdx % 200);
        const jitter = name === 'error_rate' ? base : base + Math.random() * 6 - 3;
        statements.push({
          sql: `INSERT INTO telemetry (project_id, metric_name, value, unit, timestamp) VALUES (?, ?, ?, ?, datetime('now', ?))`,
          args: [proj.id, name, jitter, unit, `-${bucket * 4 + (tIdx % 3)} minutes`],
        });
        tIdx++;
      }
    }
  }

  await db.batch(statements);
  console.log(
    `Seed completed: ${projects.length} projects, ${incidents.length} incidents, ${knowledgeSpecs.length} knowledge, ${alertSpecs.length} alerts, ${logCount} logs, telemetry expanded.`
  );
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
