/**
 * Full-screen dot-matrix style loader (centered).
 * Visual language inspired by https://dotmatrix.zzzzshawn.cloud/ — vanilla CSS;
 * official React components ship via shadcn registry only.
 */

let overlayEl = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;

  const rows = 8;
  const cols = 8;
  const ov = document.createElement('div');
  ov.className = 'loading-overlay';
  ov.setAttribute('role', 'progressbar');
  ov.setAttribute('aria-busy', 'false');
  ov.setAttribute('aria-label', 'Loading');

  const wrap = document.createElement('div');
  wrap.className = 'dot-matrix-loader';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('span');
      cell.className = 'dot-matrix-loader__dot';
      const stagger = (r + c) * 0.06;
      cell.style.animationDelay = `${stagger}s`;
      wrap.appendChild(cell);
    }
  }

  ov.appendChild(wrap);
  document.body.appendChild(ov);
  overlayEl = ov;
  return overlayEl;
}

export function showLoading() {
  const el = ensureOverlay();
  el.classList.add('loading-overlay--visible');
  el.setAttribute('aria-busy', 'true');
}

export function hideLoading() {
  if (!overlayEl) return;
  overlayEl.classList.remove('loading-overlay--visible');
  overlayEl.setAttribute('aria-busy', 'false');
}
