const API_BASE = '/api';

async function parseError(res) {
  try {
    const j = await res.json();
    return j.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchJSON(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return null;
  return res.json();
}

/** POST SSE stream from OpenRouter proxy endpoints */
export async function streamPost(path, body, { onEvent } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

  if (!res.ok || !res.body) {
    const msg = await parseError(res);
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      try {
        const obj = JSON.parse(payload);
        if (onEvent) onEvent(obj);
      } catch {
        /* ignore */
      }
    }
  }
}

export const api = {
  health: () => fetchJSON('/health'),
  projects: {
    list: () => fetchJSON('/projects'),
    get: (id) => fetchJSON(`/projects/${id}`),
    create: (data) => fetchJSON('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) =>
      fetchJSON(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => fetchJSON(`/projects/${id}`, { method: 'DELETE' }),
  },
  alerts: {
    list: (q = '') => fetchJSON(`/alerts${q}`),
    create: (data) => fetchJSON('/alerts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) =>
      fetchJSON(`/alerts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    acknowledge: (id) => fetchJSON(`/alerts/${id}/acknowledge`, { method: 'POST', body: '{}' }),
    resolve: (id) => fetchJSON(`/alerts/${id}/resolve`, { method: 'POST', body: '{}' }),
  },
  incidents: {
    list: () => fetchJSON('/incidents'),
    get: (id) => fetchJSON(`/incidents/${id}`),
    create: (data) => fetchJSON('/incidents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) =>
      fetchJSON(`/incidents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    linkAlert: (incidentId, alertId) =>
      fetchJSON(`/incidents/${incidentId}/link-alert/${alertId}`, { method: 'POST', body: '{}' }),
    setStatus: (id, status) =>
      fetchJSON(`/incidents/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
  },
  knowledge: {
    list: (q = '') => fetchJSON(`/knowledge${q}`),
    get: (id) => fetchJSON(`/knowledge/${id}`),
    create: (data) => fetchJSON('/knowledge', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) =>
      fetchJSON(`/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => fetchJSON(`/knowledge/${id}`, { method: 'DELETE' }),
  },
  logs: {
    list: (params) => {
      const qs = new URLSearchParams(params).toString();
      return fetchJSON(`/logs${qs ? `?${qs}` : ''}`);
    },
    create: (data) => fetchJSON('/logs', { method: 'POST', body: JSON.stringify(data) }),
  },
  telemetry: {
    list: (params) => {
      const qs = new URLSearchParams(params).toString();
      return fetchJSON(`/telemetry${qs ? `?${qs}` : ''}`);
    },
  },
  ai: {
    generateAlert: (body) =>
      fetchJSON('/ai/generate-alert', { method: 'POST', body: JSON.stringify(body) }),
    generateLogs: (body) =>
      fetchJSON('/ai/generate-logs', { method: 'POST', body: JSON.stringify(body) }),
    generateTelemetry: (body) =>
      fetchJSON('/ai/generate-telemetry', { method: 'POST', body: JSON.stringify(body) }),
    investigateStream: (incidentId, onEvent) =>
      streamPost(`/ai/investigate/${incidentId}`, {}, { onEvent }),
    remediateStream: (incidentId, onEvent) =>
      streamPost(`/ai/remediate/${incidentId}`, {}, { onEvent }),
    postmortem: (incidentId) =>
      fetchJSON(`/ai/generate-postmortem/${incidentId}`, { method: 'POST', body: '{}' }),
    seedScenario: (preset) =>
      fetchJSON('/ai/seed-scenario', { method: 'POST', body: JSON.stringify({ preset }) }),
  },
};
