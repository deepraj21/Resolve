import { api } from './api.js';
import {
  escapeHtml,
  healthDot,
  severityIncident,
  severityAlert,
  alertStatus,
  formatTime,
  toast,
} from './components.js';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function render(root) {
  const [projects, incidents, alerts] = await Promise.all([
    api.projects.list(),
    api.incidents.list(),
    api.alerts.list(),
  ]);

  const firing = alerts.filter((a) => a.status === 'firing').length;
  const activeIncidents = incidents.filter((i) =>
    ['investigating', 'identified', 'monitoring'].includes(i.status)
  ).length;

  const resolvedToday = [...incidents, ...alerts].filter((row) => {
    const t = row.resolved_at;
    if (!t) return false;
    return new Date(t) >= startOfToday();
  }).length;

  let mttrMin = null;
  const resolvedWithTimes = incidents.filter((i) => i.resolved_at && i.created_at);
  if (resolvedWithTimes.length) {
    const sum = resolvedWithTimes.reduce((acc, i) => {
      return acc + (new Date(i.resolved_at) - new Date(i.created_at)) / 60000;
    }, 0);
    mttrMin = Math.round(sum / resolvedWithTimes.length);
  }

  const sevCounts = { sev1: 0, sev2: 0, sev3: 0, sev4: 0 };
  for (const i of incidents) {
    if (sevCounts[i.severity] !== undefined) sevCounts[i.severity]++;
  }
  const maxSev = Math.max(1, ...Object.values(sevCounts));
  const trackPx = 100;

  const activity = [];
  for (const i of incidents.slice(0, 8)) {
    activity.push({
      t: i.created_at,
      text: `Incident ${escapeHtml(i.title)} · ${severityIncident(i.severity)}`,
    });
  }
  for (const a of alerts.slice(0, 8)) {
    activity.push({
      t: a.created_at,
      text: `Alert ${escapeHtml(a.title)} · ${severityAlert(a.severity)} ${alertStatus(a.status)}`,
    });
  }
  activity.sort((x, y) => new Date(y.t) - new Date(x.t));

  /* Seed scenario UI (dropdown + “Seed scenario” button) is commented out at end of render().
     Re-enable that block and insert a toolbar div after the Dashboard title if you want demo presets again. */

  root.innerHTML = `
    <p class="eyebrow">Overview</p>
    <h1 class="display">Dashboard</h1>
    <div class="grid grid--4" style="margin-bottom:var(--space-xl)">
      <div class="stat-card">
        <div class="stat-value">${projects.length}</div>
        <div class="stat-label">Projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${activeIncidents}</div>
        <div class="stat-label">Active incidents</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${firing}</div>
        <div class="stat-label">Firing alerts</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${mttrMin != null ? `${mttrMin}m` : '—'}</div>
        <div class="stat-label">MTTR (resolved)</div>
      </div>
    </div>

    <div class="grid grid--2" style="margin-bottom:var(--space-xl)">
      <div class="card">
        <h2 class="heading-sm">Severity breakdown</h2>
        <div class="bar-chart" aria-label="severity incident counts">
          ${['sev1', 'sev2', 'sev3', 'sev4']
            .map((s) => {
              const n = sevCounts[s];
              const h = Math.max(n === 0 ? 0 : 6, Math.round((n / maxSev) * trackPx));
              return `
            <div class="bar-chart__col">
              <div class="bar-chart__track">
                <div class="bar" style="height:${h}px" title="${n} incidents"></div>
              </div>
              <span class="meta">${escapeHtml(s)} (${n})</span>
            </div>`;
            })
            .join('')}
        </div>
      </div>
      <div class="card">
        <h2 class="heading-sm">Resolved today</h2>
        <div class="stat-value" style="font-size:32px">${resolvedToday}</div>
        <p class="meta">Incidents or alerts with resolved_at today (local time).</p>
      </div>
    </div>

    <h2 class="heading-sm">System health</h2>
    <div class="grid grid--3" style="margin-bottom:var(--space-xl)">
      ${projects
        .map(
          (p) => `
        <div class="card project-card" data-nav="/projects/${p.id}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <strong style="color:var(--color-ink)">${escapeHtml(p.name)}</strong>
            ${healthDot(p.status)}
          </div>
          <p class="meta" style="margin-top:8px">${escapeHtml(p.service_type)} · ${escapeHtml(p.team || '')}</p>
        </div>`
        )
        .join('')}
    </div>

    <h2 class="heading-sm">Recent activity</h2>
    <ul class="activity-feed">
      ${activity
        .slice(0, 16)
        .map(
          (a) => `
        <li><span class="meta">${formatTime(a.t)}</span> — ${a.text}</li>`
        )
        .join('')}
    </ul>
  `;

  root.querySelectorAll('.project-card').forEach((card) => {
    card.addEventListener('click', () => {
      location.hash = '#' + card.getAttribute('data-nav');
    });
  });

  /* Seed scenario — paste this HTML after <h1 class="display">Dashboard</h1>:
    <div class="toolbar">
      <select id="scenario-preset" class="field" style="max-width:280px;padding:8px 0">
        <option value="">Seed scenario…</option>
        <option value="database-storm">Database Connection Storm</option>
        <option value="memory-leak-worker">Memory Leak in Worker</option>
        <option value="bad-deploy-api">Bad Deploy — API Regression</option>
        <option value="cache-stampede">Cache Stampede</option>
      </select>
      <button type="button" class="btn btn-primary" id="seed-btn">Seed scenario</button>
    </div>

  const btn = root.querySelector('#seed-btn');
  const sel = root.querySelector('#scenario-preset');
  btn.addEventListener('click', async () => {
    const preset = sel.value;
    if (!preset) {
      toast('Pick a scenario preset', 'error');
      return;
    }
    btn.disabled = true;
    try {
      const meta = await api.ai.seedScenario(preset);
      toast(`Seeded: ${meta.preset} — incident ${meta.incidentId?.slice(0, 8)}…`);
      location.hash = '#/incidents';
      location.reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
  */
}
