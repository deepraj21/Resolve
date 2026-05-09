import { getDb } from '../db/database.js';

export async function loadIncidentBundle(incidentId) {
  const db = getDb();
  const inc = await db.execute({
    sql: 'SELECT * FROM incidents WHERE id = ?',
    args: [incidentId],
  });
  if (!inc.rows.length) return null;

  const incident = inc.rows[0];
  const proj = await db.execute({
    sql: 'SELECT * FROM projects WHERE id = ?',
    args: [incident.project_id],
  });
  const project = proj.rows[0] || null;

  let alertsLinked = await db.execute({
    sql: 'SELECT * FROM alerts WHERE incident_id = ? ORDER BY created_at DESC',
    args: [incidentId],
  });
  if (!alertsLinked.rows.length) {
    alertsLinked = await db.execute({
      sql: 'SELECT * FROM alerts WHERE project_id = ? ORDER BY created_at DESC LIMIT 20',
      args: [incident.project_id],
    });
  }

  const logs = await db.execute({
    sql: `SELECT * FROM logs WHERE project_id = ? AND level IN ('error', 'warn', 'fatal', 'info')
       ORDER BY timestamp DESC LIMIT 80`,
    args: [incident.project_id],
  });

  const telemetry = await db.execute({
    sql: 'SELECT * FROM telemetry WHERE project_id = ? ORDER BY timestamp DESC LIMIT 40',
    args: [incident.project_id],
  });

  const knowledge = await db.execute({
    sql: 'SELECT * FROM knowledge WHERE project_id = ? OR project_id IS NULL ORDER BY created_at DESC LIMIT 15',
    args: [incident.project_id],
  });

  return {
    incident,
    project,
    alerts: alertsLinked.rows,
    logs: logs.rows,
    telemetry: telemetry.rows,
    knowledge: knowledge.rows,
  };
}

export function buildInvestigationPrompt(bundle) {
  const { incident, project, alerts, logs, telemetry, knowledge } = bundle;

  const alertsBlock = alerts
    .map(
      (a) =>
        `- ${a.title} (${a.severity}, ${a.source}, ${a.status})\n  ${a.message || ''}\n  metric_data: ${a.metric_data || '{}'}`
    )
    .join('\n');

  const logsBlock = logs
    .map((l) => `- [${l.timestamp}] ${l.level}: ${l.message}\n  ${l.metadata || '{}'}`)
    .join('\n');

  const teleBlock = telemetry
    .map((t) => `- ${t.metric_name}: ${t.value} ${t.unit || ''} @ ${t.timestamp}`)
    .join('\n');

  const kbBlock = knowledge
    .map((k) => `### ${k.title} (${k.category})\n${k.content.slice(0, 4000)}`)
    .join('\n\n');

  return `You are an expert SRE performing root cause analysis. You have access to the following data from our systems:

## Incident
- Title: ${incident.title}
- Description: ${incident.description || 'N/A'}
- Severity: ${incident.severity}
- Status: ${incident.status}

## Linked Alerts
${alertsBlock || '(none)'}

## Recent Logs
${logsBlock || '(none)'}

## Telemetry
${teleBlock || '(none)'}

## Knowledge Base
${kbBlock || '(none)'}

## Service Context
- Project: ${project?.name || 'unknown'} (${project?.service_type || 'n/a'})
- Tech stack: ${project?.tech_stack || '[]'}
- Team: ${project?.team || 'n/a'}
- Health: ${project?.status || 'unknown'}

---

Perform a thorough investigation. Reference specific log lines, metric values, and alert titles from the data above.

Provide:

### Summary
2-3 sentence executive summary of what happened.

### Root Cause
Detailed root cause analysis. Be specific.

### Impact
What was affected and for how long.

### Contributing Factors
What conditions allowed this to happen.

### Evidence
Point to specific logs, metrics, and alerts that support your analysis.
`;
}

export function buildRemediationPrompt(rcaContent, project) {
  return `Based on this root cause analysis:
${rcaContent}

For service: ${project?.name || 'service'} (${project?.service_type || 'n/a'}, stack: ${project?.tech_stack || '[]'})

Generate a remediation plan with:

### Immediate Actions
Steps to resolve the current incident right now. Be specific with commands, config changes, or code fixes.

### Short-term Fixes (This Sprint)
Changes to prevent recurrence in the near term.

### Long-term Improvements (This Quarter)
Architectural or process changes for permanent resolution.

### Monitoring Improvements
New alerts, dashboards, or SLOs to detect this earlier.

### Runbook Update
Draft a runbook entry for this incident type so future on-call engineers can resolve it faster.
`;
}

export function buildPostmortemPrompt(bundle) {
  const { incident, project, alerts } = bundle;
  return `Write a postmortem article in Markdown for this resolved incident.

Incident: ${incident.title}
Description: ${incident.description || ''}
Severity: ${incident.severity}
RCA summary: ${(incident.rca || '').slice(0, 6000)}

Alerts involved:
${alerts.map((a) => `- ${a.title}`).join('\n')}

Service: ${project?.name} (${project?.service_type})

Include: Summary, Impact, Timeline, Root cause, What went well, What went wrong, Action items (with owners as TBD), Lessons learned.
`;
}
