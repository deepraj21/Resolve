import { api } from './api.js';
import * as Dashboard from './dashboard.js';
import * as Projects from './projects.js';
import * as Incidents from './incidents.js';
import * as Alerts from './alerts.js';
import * as Knowledge from './knowledge.js';

const appEl = document.getElementById('app');
const nav = document.getElementById('nav');

const routes = [
  { path: '/', label: 'Dashboard' },
  { path: '/projects', label: 'Projects' },
  { path: '/incidents', label: 'Incidents' },
  { path: '/alerts', label: 'Alerts' },
  { path: '/knowledge', label: 'Knowledge base' },
];

function parseHash() {
  const raw = (location.hash.replace(/^#\/?/, '') || '/').trim();
  const parts = raw.split('/').filter(Boolean);
  const path = '/' + (parts[0] || '');
  return { path, parts };
}

function navLink(path, label) {
  const href = `#${path}`;
  return `<a href="${href}" data-path="${path}">${label}</a>`;
}

function paintNav() {
  const { path } = parseHash();
  nav.innerHTML = routes.map((r) => navLink(r.path, r.label)).join('');
  nav.querySelectorAll('a').forEach((a) => {
    const p = a.getAttribute('data-path');
    let active = false;
    if (p === '/') active = path === '/' || path === '';
    else active = path === p;
    a.classList.toggle('active', active);
  });
}

async function render() {
  const { path, parts } = parseHash();
  paintNav();

  appEl.innerHTML = `<p class="meta">Loading…</p>`;

  try {
    if (path === '/' || path === '') {
      await Dashboard.render(appEl);
    } else if (path === '/projects') {
      if (parts[1]) await Projects.render(appEl, { id: parts[1] });
      else await Projects.render(appEl, {});
    } else if (path === '/incidents') {
      if (parts[1]) await Incidents.render(appEl, { id: parts[1] });
      else await Incidents.render(appEl, {});
    } else if (path === '/alerts') {
      await Alerts.render(appEl);
    } else if (path === '/knowledge') {
      if (parts[1]) await Knowledge.render(appEl, { id: parts[1] });
      else await Knowledge.render(appEl, {});
    } else {
      appEl.innerHTML = `<p class="meta">Not found</p>`;
    }
  } catch (e) {
    const msg = e?.message || String(e);
    appEl.innerHTML = `<div class="toast toast--error" style="position:static">${msg.replace(/</g, '&lt;')}</div>`;
  }
}

window.addEventListener('hashchange', render);

(async () => {
  try {
    await api.health();
    const dot = document.getElementById('health-dot');
    const lbl = document.getElementById('health-label');
    if (dot) dot.style.background = 'var(--signal-green)';
    if (lbl) lbl.textContent = 'API reachable';
  } catch {
    const lbl = document.getElementById('health-label');
    if (lbl) lbl.textContent = 'API unavailable';
  }

  if (!location.hash) location.hash = '#/';
  await render();
})();
