import { api } from './api.js';
import {
  escapeHtml,
  healthDot,
  modal,
  toast,
  formatTime,
  severityAlert,
  alertStatus,
  sourceBadge,
  renderMarkdown,
  el,
  withButtonLoading,
} from './components.js';

function parseTech(stack) {
  try {
    const j = JSON.parse(stack || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

async function renderDetail(root, id) {
  const project = await api.projects.get(id);
  let alerts = await api.alerts.list(`?project_id=${encodeURIComponent(id)}`);
  let logs = await api.logs.list({ project_id: id });
  let telemetry = await api.telemetry.list({ project_id: id });
  let knowledge = await api.knowledge.list(`?project_id=${encodeURIComponent(id)}`);

  let tab = sessionStorage.getItem(`tab-${id}`) || 'overview';
  let logLevel = '';

  async function reloadData() {
    ;[alerts, telemetry, knowledge, logs] = await Promise.all([
      api.alerts.list(`?project_id=${encodeURIComponent(id)}`),
      api.telemetry.list({ project_id: id }),
      api.knowledge.list(`?project_id=${encodeURIComponent(id)}`),
      api.logs.list({ project_id: id }),
    ]);
  }

  function filteredLogs() {
    if (!logLevel) return logs;
    return logs.filter((l) => l.level === logLevel);
  }

  function paint() {
    sessionStorage.setItem(`tab-${id}`, tab);
    const tech = parseTech(project.tech_stack);

    const alertsHtml = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Title</th><th>Severity</th><th>Source</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            ${alerts
              .map(
                (a) => `
              <tr data-alert="${a.id}">
                <td>${escapeHtml(a.title)}</td>
                <td>${severityAlert(a.severity)}</td>
                <td>${sourceBadge(a.source)}</td>
                <td>${alertStatus(a.status)}</td>
                <td class="meta">${formatTime(a.created_at)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    const logsHtml = `
      <div class="toolbar">
        <label class="meta">Level</label>
        <select id="log-level" style="max-width:160px;padding:8px 0">
          <option value="">all</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
          <option value="fatal">fatal</option>
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Level</th><th>Message</th></tr></thead>
          <tbody>
            ${filteredLogs()
              .slice(0, 200)
              .map(
                (l) => `
              <tr>
                <td class="meta">${formatTime(l.timestamp)}</td>
                <td><span class="badge">${escapeHtml(l.level)}</span></td>
                <td><code style="font-size:13px">${escapeHtml(l.message)}</code></td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    const teleGrouped = {};
    for (const t of telemetry) {
      if (!teleGrouped[t.metric_name]) teleGrouped[t.metric_name] = [];
      teleGrouped[t.metric_name].push(t);
    }
    const teleHtml = `
      <div class="grid grid--3">
        ${Object.keys(teleGrouped)
          .slice(0, 12)
          .map((name) => {
            const rows = teleGrouped[name].slice(0, 8).reverse();
            const latest = rows[rows.length - 1];
            const spark = rows
              .map((r) => {
                const denom = latest?.value || 1;
                const h = Math.min(100, Math.max(4, (r.value / denom) * 28));
                return `<span style="height:${h}px;background:var(--color-hairline-soft)"></span>`;
              })
              .join('');
            return `
            <div class="metric-card">
              <div class="metric-sub">${escapeHtml(name)}</div>
              <div class="metric-val">${latest ? Number(latest.value).toFixed(1) : '—'}</div>
              <div class="metric-sub">${escapeHtml(latest?.unit || '')}</div>
              <div class="spark" style="margin-top:8px">${spark}</div>
            </div>`;
          })
          .join('')}
      </div>
    `;

    const knowHtml = `
      <div class="grid grid--2">
        ${knowledge
          .map(
            (k) => `
          <div class="card">
            <strong>${escapeHtml(k.title)}</strong>
            <p class="meta">${escapeHtml(k.category)}</p>
            <div class="md-preview" style="margin-top:12px;font-size:14px;color:var(--color-graphite);max-height:140px;overflow:hidden">
              ${renderMarkdown(k.content.slice(0, 800))}
            </div>
          </div>`
          )
          .join('')}
      </div>
    `;

    let main = '';
    if (tab === 'overview') main = `<div class="card">${alertsHtml}</div>`;
    else if (tab === 'alerts') main = alertsHtml;
    else if (tab === 'logs') main = logsHtml;
    else if (tab === 'telemetry') main = teleHtml;
    else if (tab === 'knowledge') main = knowHtml;

    root.innerHTML = `
      <p class="eyebrow">Project</p>
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start">
        <h1 class="display" style="margin-bottom:8px">${escapeHtml(project.name)}</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost" id="btn-gen-alert">Generate alert (AI)</button>
          <button type="button" class="btn btn-ghost" id="btn-gen-logs">Generate logs (AI)</button>
          <button type="button" class="btn btn-ghost" id="btn-gen-tel">Refresh telemetry</button>
          <button type="button" class="btn btn-primary" id="btn-create-inc">Create incident</button>
        </div>
      </div>
      <p class="meta">${escapeHtml(project.description || '')}</p>
      <div style="margin:24px 0;display:flex;gap:12px;align-items:center">
        ${healthDot(project.status)}
        <span>${escapeHtml(project.status)}</span>
        <span class="meta">·</span>
        <span class="meta">${escapeHtml(project.service_type)}</span>
        <span class="meta">·</span>
        <span class="meta">${escapeHtml(project.team || '')}</span>
      </div>
      <div class="pills-row" style="margin-bottom:24px">
        ${tech.map((t) => `<span class="tech-pill">${escapeHtml(t)}</span>`).join('')}
      </div>

      <div class="tabs" role="tablist">
        ${['overview', 'alerts', 'logs', 'telemetry', 'knowledge']
          .map(
            (name) => `
          <button type="button" class="tab ${tab === name ? 'active' : ''}" data-tab="${name}">${name}</button>`
          )
          .join('')}
      </div>
      ${main}
    `;

    root.querySelectorAll('.tab').forEach((b) => {
      b.addEventListener('click', () => {
        tab = b.getAttribute('data-tab');
        paint();
      });
    });

    const ll = root.querySelector('#log-level');
    if (ll) {
      ll.value = logLevel;
      ll.addEventListener('change', () => {
        logLevel = ll.value;
        paint();
      });
    }

    root.querySelector('#btn-gen-alert')?.addEventListener('click', () => {
      const form = el(`
        <form id="gen-alert-form">
          <div class="field"><label>Severity</label>
            <select name="severity"><option value="auto">AI decides</option>
            <option value="critical">critical</option><option value="high">high</option><option value="medium">medium</option></select>
          </div>
          <div class="field"><label>Source</label>
            <select name="source"><option value="auto">AI decides</option>
            <option value="prometheus">prometheus</option><option value="grafana">grafana</option><option value="datadog">datadog</option></select>
          </div>
          <button type="submit" class="btn btn-primary">Generate</button>
        </form>
      `);
      const { element, close } = modal({ title: 'Generate alert', body: form });
      document.body.appendChild(element);
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        withButtonLoading(submitBtn, async () => {
          const fd = new FormData(form);
          try {
            await api.ai.generateAlert({
              project_id: id,
              severity: fd.get('severity'),
              source: fd.get('source'),
            });
            toast('Alert generated');
            close();
            await reloadData();
            paint();
          } catch (e) {
            toast(e.message, 'error');
          }
        });
      });
    });

    root.querySelector('#btn-gen-logs')?.addEventListener('click', (ev) => {
      withButtonLoading(ev.currentTarget, async () => {
        try {
          await api.ai.generateLogs({
            project_id: id,
            count: 18,
            scenario: 'realistic errors mixed with normal traffic',
          });
          toast('Logs generated');
          await reloadData();
          paint();
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });

    root.querySelector('#btn-gen-tel')?.addEventListener('click', (ev) => {
      withButtonLoading(ev.currentTarget, async () => {
        try {
          await api.ai.generateTelemetry({ project_id: id });
          toast('Telemetry snapshots added');
          await reloadData();
          paint();
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });

    root.querySelector('#btn-create-inc')?.addEventListener('click', (ev) => {
      const title = prompt('Incident title');
      if (!title) return;
      withButtonLoading(ev.currentTarget, async () => {
        try {
          const inc = await api.incidents.create({
            title,
            description: '',
            severity: 'sev3',
            project_id: id,
          });
          location.hash = `#/incidents/${inc.id}`;
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });
  }

  paint();
}

export async function render(root, params) {
  if (params.id) {
    await renderDetail(root, params.id);
    return;
  }

  const projects = await api.projects.list();

  root.innerHTML = `
    <p class="eyebrow">Fleet</p>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
      <h1 class="display">Projects</h1>
      <button type="button" class="btn btn-primary" id="new-project">New project</button>
    </div>
    <div class="grid grid--3" style="margin-top:24px">
      ${projects
        .map(
          (p) => `
        <div class="card project-card" data-id="${p.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <strong style="color:var(--color-ink);font-size:18px">${escapeHtml(p.name)}</strong>
            ${healthDot(p.status)}
          </div>
          <p class="meta" style="margin-top:8px">${escapeHtml(p.service_type)} · ${escapeHtml(p.team || '')}</p>
          <div class="pills-row" style="margin-top:12px">
            ${parseTech(p.tech_stack)
              .slice(0, 6)
              .map((t) => `<span class="tech-pill">${escapeHtml(t)}</span>`)
              .join('')}
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;

  root.querySelectorAll('.project-card').forEach((c) => {
    c.addEventListener('click', () => {
      location.hash = `#/projects/${c.getAttribute('data-id')}`;
    });
  });

  root.querySelector('#new-project').addEventListener('click', () => {
    const form = el(`
      <form id="np">
        <div class="field"><label>Name</label><input name="name" required /></div>
        <div class="field"><label>Description</label><textarea name="description" rows="3"></textarea></div>
        <div class="field"><label>Service type</label>
          <select name="service_type">
            <option value="api">api</option>
            <option value="worker">worker</option>
            <option value="database">database</option>
            <option value="cache">cache</option>
            <option value="gateway">gateway</option>
          </select>
        </div>
        <div class="field"><label>Team</label><input name="team" /></div>
        <button type="submit" class="btn btn-primary">Create</button>
      </form>
    `);
    const { element, close } = modal({ title: 'New project', body: form });
    document.body.appendChild(element);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      withButtonLoading(submitBtn, async () => {
        const fd = new FormData(form);
        try {
          await api.projects.create({
            name: fd.get('name'),
            description: fd.get('description'),
            service_type: fd.get('service_type'),
            team: fd.get('team'),
            tech_stack: JSON.stringify(['node']),
            status: 'healthy',
          });
          toast('Project created');
          close();
          await render(root, {});
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  });
}
