import { api } from './api.js';
import {
  escapeHtml,
  severityIncident,
  toast,
  formatTime,
  renderMarkdown,
  el,
  modal,
  withButtonLoading,
} from './components.js';

function parseTimeline(json) {
  try {
    const t = JSON.parse(json || '[]');
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

let activeStreamApi = null;

async function renderDetail(root, id) {
  activeStreamApi?.unmount();
  activeStreamApi = null;

  const incident = await api.incidents.get(id);
  const project = await api.projects.get(incident.project_id);
  let alerts = await api.alerts.list(`?incident_id=${encodeURIComponent(id)}`);
  if (!alerts.length) {
    alerts = await api.alerts.list(`?project_id=${encodeURIComponent(incident.project_id)}`);
  }

  let streamBuf = '';
  let investigating = false;
  let thinkingLabel = '';

  function modelLabel() {
    const raw = window.__resolveModel || 'model';
    return raw.replace(/:free$/, '');
  }

  function renderPanel() {
    const thinking = root.querySelector('#ai-thinking');
    if (thinking) {
      const showThink = investigating && !streamBuf.trim();
      thinking.hidden = !showThink;
      const lbl = thinking.querySelector('.ai-thinking__label');
      if (lbl && thinkingLabel) lbl.textContent = thinkingLabel;
    }
    if (activeStreamApi) {
      activeStreamApi.update(streamBuf, investigating);
      return;
    }
    const pre = root.querySelector('#ai-fallback');
    if (pre) {
      pre.textContent = streamBuf + (investigating ? ' ▍' : '');
      const wrap = pre.closest('.ai-panel-stream');
      if (wrap) wrap.scrollTop = wrap.scrollHeight;
    }
  }

  root.innerHTML = `
    <p class="eyebrow">Incident</p>
    <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div>
        <h1 class="display" style="margin-bottom:8px">${escapeHtml(incident.title)}</h1>
        <p class="meta">${escapeHtml(incident.description || '')}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${severityIncident(incident.severity)}
        <span class="badge">${escapeHtml(incident.status)}</span>
      </div>
    </div>

    <div class="toolbar" style="margin-top:24px">
      <label class="meta">Status</label>
      <select id="inc-status" style="max-width:220px;padding:8px 0">
        ${['investigating', 'identified', 'monitoring', 'resolved', 'postmortem']
          .map((s) => `<option value="${s}" ${incident.status === s ? 'selected' : ''}>${s}</option>`)
          .join('')}
      </select>
      <button type="button" class="btn btn-primary" id="btn-inv">Investigate with AI</button>
      <button type="button" class="btn btn-ghost" id="btn-rem" ${incident.rca ? '' : 'disabled'}>Generate remediation</button>
      <button type="button" class="btn btn-ghost" id="btn-pm">Generate postmortem</button>
    </div>

    <div class="split" style="margin-top:24px">
      <div>
        <h2 class="heading-sm">Analysis</h2>
        <div id="ai-panel" class="ai-panel-stream" aria-live="polite">
          <div id="ai-thinking" class="ai-thinking" hidden>
            <span class="ai-thinking__dots" aria-hidden="true"><span></span><span></span><span></span></span>
            <span class="ai-thinking__label">Thinking…</span>
          </div>
          <div id="ai-panel-root"></div>
        </div>

        <h2 class="heading-sm" style="margin-top:32px">Root cause (saved)</h2>
        <div class="card">${incident.rca ? renderMarkdown(incident.rca) : '<p class="meta">No RCA yet.</p>'}</div>

        <h2 class="heading-sm" style="margin-top:32px">Remediation (saved)</h2>
        <div class="card">${incident.remediation ? renderMarkdown(incident.remediation) : '<p class="meta">No remediation yet.</p>'}</div>
      </div>
      <aside>
        <h2 class="heading-sm">Timeline</h2>
        <div class="timeline">
          ${parseTimeline(incident.timeline)
            .slice()
            .reverse()
            .map(
              (ev) => `
            <div class="timeline-item">
              <div class="meta">${formatTime(ev.at)}</div>
              <strong>${escapeHtml(ev.label || ev.type || '')}</strong>
              <p class="meta">${escapeHtml(ev.detail || '')}</p>
            </div>`
            )
            .join('')}
        </div>

        <h2 class="heading-sm" style="margin-top:24px">Linked alerts</h2>
        <ul class="activity-feed">
          ${alerts
            .map(
              (a) => `
            <li><strong>${escapeHtml(a.title)}</strong><br/><span class="meta">${escapeHtml(a.severity)} · ${escapeHtml(a.status)}</span></li>`
            )
            .join('')}
        </ul>
      </aside>
    </div>
  `;

  const mountEl = root.querySelector('#ai-panel-root');
  if (mountEl) {
    try {
      const mod = await import('/js/ai-stream.bundle.js');
      activeStreamApi = mod.mountAiStreamPanel(mountEl);
    } catch (e) {
      console.warn('ai-stream bundle unavailable, using plain text', e);
      const panel = root.querySelector('#ai-panel');
      if (panel) {
        panel.innerHTML =
          '<p class="meta" style="margin:0 0 8px">Streamdown not built. Run <code>npm run build:ai-stream</code></p><pre id="ai-fallback" class="ai-fallback" style="white-space:pre-wrap;margin:0;font:inherit;color:inherit"></pre>';
      }
      activeStreamApi = {
        update(t, a) {
          const pre = root.querySelector('#ai-fallback');
          if (pre) pre.textContent = t + (a ? ' ▍' : '');
          const wrap = root.querySelector('.ai-panel-stream');
          if (wrap) wrap.scrollTop = wrap.scrollHeight;
        },
        unmount() {},
      };
    }
  }

  root.querySelector('#inc-status').addEventListener('change', async (e) => {
    try {
      await api.incidents.setStatus(id, e.target.value);
      toast('Status updated');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  root.querySelector('#btn-inv').addEventListener('click', (e) => {
    withButtonLoading(
      e.currentTarget,
      () =>
        new Promise((resolve) => {
          streamBuf = '';
          investigating = true;
          thinkingLabel = `Investigating with ${modelLabel()}…`;
          renderPanel();
          api.ai
            .investigateStream(id, (evt) => {
              if (evt.chunk) {
                streamBuf += evt.chunk;
                renderPanel();
              }
              if (evt.error) {
                toast(evt.error, 'error');
                investigating = false;
                renderPanel();
                resolve();
              }
              if (evt.done) {
                investigating = false;
                renderPanel();
                const remBtn = root.querySelector('#btn-rem');
                if (remBtn && remBtn.dataset.loading !== 'true') remBtn.disabled = false;
                toast('RCA saved');
                resolve();
              }
            })
            .catch((err) => {
              toast(err.message, 'error');
              investigating = false;
              renderPanel();
              resolve();
            });
        })
    );
  });

  root.querySelector('#btn-rem').addEventListener('click', (e) => {
    withButtonLoading(
      e.currentTarget,
      () =>
        new Promise((resolve) => {
          streamBuf = '';
          investigating = true;
          thinkingLabel = `Generating remediation with ${modelLabel()}…`;
          renderPanel();
          api.ai
            .remediateStream(id, (evt) => {
              if (evt.chunk) {
                streamBuf += evt.chunk;
                renderPanel();
              }
              if (evt.error) {
                toast(evt.error, 'error');
                investigating = false;
                renderPanel();
                resolve();
              }
              if (evt.done) {
                investigating = false;
                renderPanel();
                toast('Remediation saved');
                resolve();
              }
            })
            .catch((err) => {
              toast(err.message, 'error');
              investigating = false;
              renderPanel();
              resolve();
            });
        })
    );
  });

  root.querySelector('#btn-pm').addEventListener('click', (e) => {
    withButtonLoading(e.currentTarget, async () => {
      try {
        await api.ai.postmortem(id);
        toast('Postmortem article created in Knowledge');
        location.hash = '#/knowledge';
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

export async function render(root, params) {
  if (params.id) {
    await renderDetail(root, params.id);
    return;
  }

  activeStreamApi?.unmount();
  activeStreamApi = null;

  const incidents = await api.incidents.list();
  const projects = await api.projects.list();
  const pmap = Object.fromEntries(projects.map((p) => [p.id, p]));

  root.innerHTML = `
    <p class="eyebrow">Response</p>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:var(--space-lg)">
      <h1 class="display" style="margin:0">Incidents</h1>
      <button type="button" class="btn btn-primary" id="new-inc">New incident</button>
    </div>
    <div class="table-wrap" style="margin-top:24px">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Project</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${incidents
            .map(
              (i) => `
            <tr data-id="${i.id}" style="cursor:pointer">
              <td>${escapeHtml(i.title)}</td>
              <td>${severityIncident(i.severity)}</td>
              <td><span class="badge">${escapeHtml(i.status)}</span></td>
              <td>${escapeHtml(pmap[i.project_id]?.name || i.project_id)}</td>
              <td class="meta">${formatTime(i.created_at)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  root.querySelectorAll('tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => {
      location.hash = `#/incidents/${row.getAttribute('data-id')}`;
    });
  });

  root.querySelector('#new-inc').addEventListener('click', () => {
    const form = el(`
      <form>
        <div class="field"><label>Title</label><input name="title" required /></div>
        <div class="field"><label>Description</label><textarea name="description" rows="3"></textarea></div>
        <div class="field"><label>Severity</label>
          <select name="severity">
            <option value="sev1">sev1</option>
            <option value="sev2">sev2</option>
            <option value="sev3" selected>sev3</option>
            <option value="sev4">sev4</option>
          </select>
        </div>
        <div class="field"><label>Project</label>
          <select name="project_id">
            ${projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Create</button>
      </form>
    `);
    const { element, close } = modal({ title: 'New incident', body: form });
    document.body.appendChild(element);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      withButtonLoading(submitBtn, async () => {
        const fd = new FormData(form);
        try {
          const inc = await api.incidents.create({
            title: fd.get('title'),
            description: fd.get('description'),
            severity: fd.get('severity'),
            project_id: fd.get('project_id'),
          });
          close();
          location.hash = `#/incidents/${inc.id}`;
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  });
}
