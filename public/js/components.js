export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

export function severityIncident(sev) {
  const map = {
    sev1: 'badge badge--sev1',
    sev2: 'badge badge--sev2',
    sev3: 'badge badge--sev3',
    sev4: 'badge badge--sev4',
  };
  return `<span class="${map[sev] || 'badge'}">${escapeHtml(sev || '')}</span>`;
}

export function severityAlert(sev) {
  const map = {
    critical: 'badge badge--crit',
    high: 'badge badge--high',
    medium: 'badge badge--med',
    low: 'badge badge--low',
    info: 'badge badge--info',
  };
  return `<span class="${map[sev] || 'badge'}">${escapeHtml(sev || '')}</span>`;
}

export function alertStatus(st) {
  const pulse = st === 'firing' ? ' pill pill--pulse' : '';
  const cls =
    st === 'resolved'
      ? 'pill pill--ok'
      : st === 'acknowledged'
        ? 'pill pill--warn'
        : 'pill pill--fire' + pulse;
  return `<span class="${cls}">${escapeHtml(st || '')}</span>`;
}

export function sourceBadge(src) {
  const short = {
    prometheus: 'PROM',
    grafana: 'GRAF',
    cloudwatch: 'CW',
    datadog: 'DD',
    custom: 'CUS',
  };
  const label = short[src] || src?.slice(0, 4)?.toUpperCase() || '';
  return `<span class="src-tag">${escapeHtml(label)}</span>`;
}

export function healthDot(status) {
  const map = {
    healthy: 'health-dot health-dot--ok',
    degraded: 'health-dot health-dot--warn',
    critical: 'health-dot health-dot--crit',
    maintenance: 'health-dot health-dot--blue',
  };
  return `<span class="${map[status] || 'health-dot'}" title="${escapeHtml(status)}"></span>`;
}

export function modal({ title, body, onClose }) {
  const overlay = el(`
    <div class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal-card">
        <div class="modal-head">
          <h2 class="heading-sm">${escapeHtml(title)}</h2>
          <button type="button" class="btn-text modal-close" aria-label="Close">Close</button>
        </div>
        <div class="modal-body"></div>
      </div>
    </div>
  `);
  overlay.querySelector('.modal-body').appendChild(body);
  function close() {
    overlay.remove();
    if (onClose) onClose();
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.modal-close').addEventListener('click', close);
  return { element: overlay, close };
}

export function toast(message, kind = 'info') {
  const t = el(`<div class="toast toast--${kind}">${escapeHtml(message)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

export function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function renderMarkdown(md) {
  if (!window.marked) return `<pre class="md-fallback">${escapeHtml(md)}</pre>`;
  return `<div class="md">${window.marked.parse(md || '', { mangle: false, headerIds: false })}</div>`;
}
