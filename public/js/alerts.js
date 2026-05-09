import { api } from './api.js';
import {
  escapeHtml,
  severityAlert,
  alertStatus,
  sourceBadge,
  formatTime,
  toast,
  withButtonLoading,
} from './components.js';

export async function render(root) {
  const [alerts, projects] = await Promise.all([
    api.alerts.list(),
    api.projects.list(),
  ]);
  const pmap = Object.fromEntries(projects.map((p) => [p.id, p]));

  let filtered = alerts;

  function applyFilters() {
    const sev = root.querySelector('#f-sev').value;
    const st = root.querySelector('#f-st').value;
    const src = root.querySelector('#f-src').value;
    const pid = root.querySelector('#f-proj').value;
    filtered = alerts.filter((a) => {
      if (sev && a.severity !== sev) return false;
      if (st && a.status !== st) return false;
      if (src && a.source !== src) return false;
      if (pid && a.project_id !== pid) return false;
      return true;
    });
    paintTable();
  }

  function paintTable() {
    const tb = root.querySelector('#alert-rows');
    if (!tb) return;
    tb.innerHTML = filtered
      .map(
        (a) => `
      <tr data-id="${a.id}">
        <td class="checkbox-cell"><input type="checkbox" class="alert-chk" value="${a.id}" /></td>
        <td>${escapeHtml(a.title)}</td>
        <td>${severityAlert(a.severity)}</td>
        <td>${sourceBadge(a.source)}</td>
        <td>${alertStatus(a.status)}</td>
        <td>${escapeHtml(pmap[a.project_id]?.name || '')}</td>
        <td class="meta">${formatTime(a.created_at)}</td>
      </tr>`
      )
      .join('');
    root.querySelectorAll('.alert-chk').forEach((c) => {
      c.addEventListener('change', () => {
        c.closest('tr').toggleAttribute('data-selected', c.checked);
      });
    });
  }

  root.innerHTML = `
    <p class="eyebrow">Signals</p>
    <h1 class="display">Alerts</h1>

    <div class="toolbar">
      <select id="f-sev" style="max-width:140px;padding:8px 0">
        <option value="">severity</option>
        <option value="critical">critical</option>
        <option value="high">high</option>
        <option value="medium">medium</option>
        <option value="low">low</option>
        <option value="info">info</option>
      </select>
      <select id="f-st" style="max-width:140px;padding:8px 0">
        <option value="">status</option>
        <option value="firing">firing</option>
        <option value="acknowledged">acknowledged</option>
        <option value="resolved">resolved</option>
      </select>
      <select id="f-src" style="max-width:140px;padding:8px 0">
        <option value="">source</option>
        <option value="prometheus">prometheus</option>
        <option value="grafana">grafana</option>
        <option value="cloudwatch">cloudwatch</option>
        <option value="datadog">datadog</option>
        <option value="custom">custom</option>
      </select>
      <select id="f-proj" style="max-width:200px;padding:8px 0">
        <option value="">project</option>
        ${projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-ghost" id="bulk-ack">Acknowledge selected</button>
      <button type="button" class="btn btn-ghost" id="bulk-res">Resolve selected</button>
      <button type="button" class="btn btn-primary" id="gen-alert">Generate alert…</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Title</th>
            <th>Severity</th>
            <th>Source</th>
            <th>Status</th>
            <th>Project</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody id="alert-rows"></tbody>
      </table>
    </div>
  `;

  ['f-sev', 'f-st', 'f-src', 'f-proj'].forEach((id) => {
    root.querySelector(`#${id}`).addEventListener('change', applyFilters);
  });

  applyFilters();

  async function selectedIds() {
    return [...root.querySelectorAll('.alert-chk:checked')].map((c) => c.value);
  }

  root.querySelector('#bulk-ack').addEventListener('click', (ev) => {
    withButtonLoading(ev.currentTarget, async () => {
      const ids = await selectedIds();
      for (const id of ids) {
        try {
          await api.alerts.acknowledge(id);
        } catch (e) {
          toast(e.message, 'error');
        }
      }
      toast('Acknowledged');
      location.reload();
    });
  });

  root.querySelector('#bulk-res').addEventListener('click', (ev) => {
    withButtonLoading(ev.currentTarget, async () => {
      const ids = await selectedIds();
      for (const id of ids) {
        try {
          await api.alerts.resolve(id);
        } catch (e) {
          toast(e.message, 'error');
        }
      }
      toast('Resolved');
      location.reload();
    });
  });

  root.querySelector('#gen-alert').addEventListener('click', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <div class="field"><label>Project</label>
        <select name="project_id" required>
          ${projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Severity</label>
        <select name="severity"><option value="auto">AI decides</option>
        <option value="high">high</option><option value="critical">critical</option></select>
      </div>
      <div class="field"><label>Source</label>
        <select name="source"><option value="auto">AI decides</option>
        <option value="prometheus">prometheus</option></select>
      </div>
      <button type="submit" class="btn btn-primary">Generate</button>
    `;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-head">
          <h2 class="heading-sm">Generate alert</h2>
          <button type="button" class="btn-text modal-x">Close</button>
        </div>
        <div class="modal-body"></div>
      </div>`;
    overlay.querySelector('.modal-body').appendChild(form);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.modal-x').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      withButtonLoading(submitBtn, async () => {
        const fd = new FormData(form);
        try {
          await api.ai.generateAlert({
            project_id: fd.get('project_id'),
            severity: fd.get('severity'),
            source: fd.get('source'),
          });
          toast('Alert created');
          close();
          location.reload();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  });
}
