import { api } from './api.js';
import { renderMarkdown, withButtonLoading, escapeHtml, toast } from './components.js';

export async function render(root) {
  const model = window.__resolveModel
    ? String(window.__resolveModel).replace(/:free$/, '')
    : 'OpenRouter LLM';

  root.innerHTML = `
    <p class="eyebrow">About</p>
    <h1 class="display" style="margin-bottom:var(--space-md)">Resolve — AI SRE simulation</h1>
    <p class="meta" style="max-width:780px;font-size:15px;line-height:1.6">
      Resolve is a full-stack training playground for site reliability engineering. You operate a fleet of
      simulated microservices, watch alerts fire, open incidents, and let an LLM
      (currently <code>${escape(model)}</code>) stream a root-cause analysis and a remediation plan
      while you watch the tokens arrive. Nothing is wired to real infrastructure — every signal
      (alert, log, telemetry sample) is generated and stored locally.
    </p>

    <section class="about-chat" style="margin-top:var(--space-xl)">
      <div class="about-chat__head">
        <h2 class="heading-sm" style="margin:0">Ask Resolve</h2>
        <span class="meta">Powered by <code>${escape(model)}</code></span>
      </div>
      <p class="meta" style="margin:0 0 var(--space-md)">
        Ask anything about the app — what a screen does, how a feature is wired, what to test, the architecture, or use cases.
      </p>

      <div id="chat-log" class="chat-log" aria-live="polite"></div>

      <form id="chat-form" class="chat-form">
        <input
          id="chat-input"
          type="text"
          class="chat-input"
          placeholder="e.g. How do I generate a postmortem?"
          autocomplete="off"
          required
        />
        <button type="submit" class="btn btn-primary" id="chat-send">Ask</button>
      </form>

      <div class="chat-suggestions" id="chat-suggestions">
        <button type="button" class="chat-chip" data-q="What is Resolve and what problem does it solve?">What is Resolve?</button>
        <button type="button" class="chat-chip" data-q="Walk me through the end-to-end test flow.">Test flow</button>
        <button type="button" class="chat-chip" data-q="What does the Analysis panel on the incident page do?">Analysis panel</button>
        <button type="button" class="chat-chip" data-q="How does the AI generate alerts and logs?">AI generators</button>
        <button type="button" class="chat-chip" data-q="What are good use cases for this app?">Use cases</button>
      </div>
    </section>

    <h2 class="heading-sm" style="margin-top:var(--space-xl)">Quick reference</h2>

    <div class="grid grid--3" style="margin-top:var(--space-md)">
      <div class="card">
        <strong style="color:var(--color-ink)">No real integrations</strong>
        <p class="meta" style="margin-top:8px">No Prometheus, Datadog, or PagerDuty calls. Sources are decorative labels on synthetic alerts so the UI feels real.</p>
      </div>
      <div class="card">
        <strong style="color:var(--color-ink)">Streaming AI</strong>
        <p class="meta" style="margin-top:8px">Investigate / Remediate use Server-Sent Events from <code>/api/ai/*</code>; output renders live as Markdown via Streamdown.</p>
      </div>
      <div class="card">
        <strong style="color:var(--color-ink)">libSQL persistence</strong>
        <p class="meta" style="margin-top:8px">Turso (or local <code>file:</code> SQLite). Projects, incidents, alerts, logs, telemetry, and knowledge all live in the DB.</p>
      </div>
    </div>

    <h2 class="heading-sm" style="margin-top:var(--space-xl)">How the simulation works</h2>
    <div class="card" style="font-size:14px;line-height:1.6">
      <ol style="margin:0;padding-left:1.25rem;display:flex;flex-direction:column;gap:8px">
        <li><strong>You (or the seed script) create projects</strong> — services with a tech stack, team owner, and health status.</li>
        <li><strong>Alerts and logs are generated</strong> — either by the AI generator buttons or by <code>npm run seed</code>. They persist in libSQL.</li>
        <li><strong>An incident is opened</strong> against a project, optionally linked to existing alerts.</li>
        <li><strong>You click <em>Investigate with AI</em></strong> on the incident page. The server gathers the incident, its alerts, recent logs, telemetry samples, and any linked knowledge articles, then sends them as context to the LLM.</li>
        <li><strong>The LLM streams Markdown</strong> over SSE. The Analysis panel renders it live; when the stream completes, the RCA is saved on the incident row.</li>
        <li><strong>Generate remediation</strong> repeats the same pattern, this time conditioned on the saved RCA.</li>
        <li><strong>Generate postmortem</strong> writes a finished article into the Knowledge base.</li>
        <li><strong>You walk the status</strong> through investigating → identified → monitoring → resolved (or postmortem) and acknowledge or resolve the linked alerts.</li>
      </ol>
    </div>

    <h2 class="heading-sm" style="margin-top:var(--space-xl)">Pages</h2>

    <div class="card" style="margin-bottom:var(--space-md)">
      <strong style="color:var(--color-ink);font-size:16px">Dashboard <span class="meta" style="font-weight:400">— <code>#/</code></span></strong>
      <p class="meta" style="margin-top:6px">Top-level overview of the whole simulated estate.</p>
      <ul style="margin:12px 0 0;padding-left:1.25rem;font-size:14px;line-height:1.7">
        <li><strong>Stat cards</strong> — total projects, active incidents (status in investigating / identified / monitoring), firing alerts, and MTTR (mean of <code>resolved_at − created_at</code> across resolved incidents).</li>
        <li><strong>Severity breakdown</strong> — bar chart of incidents grouped by sev1 → sev4 with counts.</li>
        <li><strong>Resolved today</strong> — count of incidents or alerts whose <code>resolved_at</code> falls within today (local time).</li>
        <li><strong>System health</strong> — one card per project with a colored health dot (healthy / degraded / critical / maintenance). Click a card to open that project.</li>
        <li><strong>Recent activity</strong> — interleaved feed of the latest incidents and alerts with timestamps and severity badges.</li>
      </ul>
    </div>

    <div class="card" style="margin-bottom:var(--space-md)">
      <strong style="color:var(--color-ink);font-size:16px">Projects <span class="meta" style="font-weight:400">— <code>#/projects</code></span></strong>
      <p class="meta" style="margin-top:6px">Fleet of simulated services. The list grid shows every project with its tech-stack pills.</p>
      <p class="meta" style="margin:8px 0 0"><strong>Project detail</strong> opens a tabbed view:</p>
      <ul style="margin:8px 0 0;padding-left:1.25rem;font-size:14px;line-height:1.7">
        <li><strong>overview</strong> — alerts associated with this project.</li>
        <li><strong>alerts</strong> — same table, isolated.</li>
        <li><strong>logs</strong> — recent logs filterable by level (debug / info / warn / error / fatal).</li>
        <li><strong>telemetry</strong> — metric cards with mini sparklines per metric name.</li>
        <li><strong>knowledge</strong> — articles linked to this project.</li>
      </ul>
      <p class="meta" style="margin:8px 0 0">Top-right buttons let the AI <strong>generate alerts</strong>, <strong>generate logs</strong>, <strong>refresh telemetry</strong>, or <strong>create an incident</strong> tied to this project.</p>
    </div>

    <div class="card" style="margin-bottom:var(--space-md)">
      <strong style="color:var(--color-ink);font-size:16px">Incidents <span class="meta" style="font-weight:400">— <code>#/incidents</code></span></strong>
      <p class="meta" style="margin-top:6px">List of every open and historical incident. Click a row to open the detail page where the core demo lives:</p>
      <ul style="margin:8px 0 0;padding-left:1.25rem;font-size:14px;line-height:1.7">
        <li><strong>Status select</strong> — investigating → identified → monitoring → resolved → postmortem.</li>
        <li><strong>Investigate with AI</strong> — streams an RCA into the dark Analysis panel; saves to <code>incident.rca</code>.</li>
        <li><strong>Generate remediation</strong> — only enabled after RCA exists; streams a remediation plan; saves to <code>incident.remediation</code>.</li>
        <li><strong>Generate postmortem</strong> — fires off a non-streaming completion that writes a Knowledge article and navigates to it.</li>
        <li><strong>Timeline</strong> — every status change and AI run is recorded with a timestamp.</li>
        <li><strong>Linked alerts</strong> — alerts attached to this incident (or to its parent project as a fallback).</li>
      </ul>
    </div>

    <div class="card" style="margin-bottom:var(--space-md)">
      <strong style="color:var(--color-ink);font-size:16px">Alerts <span class="meta" style="font-weight:400">— <code>#/alerts</code></span></strong>
      <p class="meta" style="margin-top:6px">Global queue of alerts across all projects.</p>
      <ul style="margin:8px 0 0;padding-left:1.25rem;font-size:14px;line-height:1.7">
        <li><strong>Filters</strong> — severity, status, source (Prometheus / Grafana / CloudWatch / Datadog / custom), project.</li>
        <li><strong>Bulk actions</strong> — select rows, then <em>Acknowledge selected</em> or <em>Resolve selected</em>.</li>
        <li><strong>Generate alert…</strong> — opens a modal; the LLM picks severity and source if you choose <em>AI decides</em>, otherwise you pin them.</li>
      </ul>
    </div>

    <div class="card" style="margin-bottom:var(--space-md)">
      <strong style="color:var(--color-ink);font-size:16px">Knowledge base <span class="meta" style="font-weight:400">— <code>#/knowledge</code></span></strong>
      <p class="meta" style="margin-top:6px">Markdown library of <strong>runbooks</strong>, <strong>postmortems</strong>, <strong>architecture notes</strong>, <strong>SOPs</strong>, and <strong>known issues</strong>. Articles can be project-scoped or global. Each article is an editable Markdown document that the AI can also pull as context during investigation.</p>
    </div>

    <h2 class="heading-sm" style="margin-top:var(--space-xl)">End-to-end test flow</h2>
    <p class="meta" style="margin-bottom:var(--space-md)">Walk through this script to exercise every screen and every AI surface. Estimated time: ~5 minutes once you have an OpenRouter key and a seeded DB.</p>

    <div class="card">
      <strong style="color:var(--color-ink)">Phase 1 — Setup</strong>
      <ol style="margin:8px 0 0;padding-left:1.25rem;font-size:14px;line-height:1.7">
        <li>Confirm the sidebar shows <em>API reachable</em>. If it says <em>API unavailable</em>, your server is down.</li>
        <li>If you haven't yet, run <code>npm run seed</code> in another terminal so projects, alerts, and one open incident exist.</li>
      </ol>
    </div>

    <div class="card" style="margin-top:var(--space-md)">
      <strong style="color:var(--color-ink)">Phase 2 — Orient</strong>
      <ol style="margin:8px 0 0;padding-left:1.25rem;font-size:14px;line-height:1.7" start="3">
        <li>Open <a href="#/">Dashboard</a>. Verify all four stat cards render and the recent activity feed has rows. Click a project card in <em>System health</em> — it should jump to that project's detail page.</li>
        <li>Open <a href="#/projects">Projects</a>. Click any project. Cycle through the <strong>overview / alerts / logs / telemetry / knowledge</strong> tabs to confirm data loads and the log-level filter works.</li>
      </ol>
    </div>

    <div class="card" style="margin-top:var(--space-md)">
      <strong style="color:var(--color-ink)">Phase 3 — Generate signals (AI buttons)</strong>
      <ol style="margin:8px 0 0;padding-left:1.25rem;font-size:14px;line-height:1.7" start="5">
        <li>On a project detail page, click <strong>Generate alert (AI)</strong>. Pick <em>AI decides</em>, submit. A new row appears under alerts.</li>
        <li>Click <strong>Generate logs (AI)</strong>. ~18 new log rows should land in the <em>logs</em> tab.</li>
        <li>Click <strong>Refresh telemetry</strong>. The <em>telemetry</em> tab should show fresh metric snapshots.</li>
        <li>Click <strong>Create incident</strong>, give it a title, and you'll be redirected to the incident detail.</li>
      </ol>
    </div>

    <div class="card" style="margin-top:var(--space-md)">
      <strong style="color:var(--color-ink)">Phase 4 — Incident response (the core flow)</strong>
      <ol style="margin:8px 0 0;padding-left:1.25rem;font-size:14px;line-height:1.7" start="9">
        <li>Click <strong>Investigate with AI</strong>. Watch the dark Analysis panel: you should see the bouncing-dot indicator with the model name, then streaming Markdown, then a toast saying <em>RCA saved</em>.</li>
        <li>Click <strong>Generate remediation</strong> (now enabled). Same pattern; a toast confirms <em>Remediation saved</em>.</li>
        <li>Use the <strong>Status</strong> dropdown to walk through investigating → identified → monitoring → resolved.</li>
        <li>Click <strong>Generate postmortem</strong>. You'll be navigated to the Knowledge base where the new article appears.</li>
      </ol>
    </div>

    <div class="card" style="margin-top:var(--space-md)">
      <strong style="color:var(--color-ink)">Phase 5 — Clean the queue</strong>
      <ol style="margin:8px 0 0;padding-left:1.25rem;font-size:14px;line-height:1.7" start="13">
        <li>Open <a href="#/alerts">Alerts</a>. Filter by status = firing.</li>
        <li>Tick a couple of alerts and click <strong>Acknowledge selected</strong>, then <strong>Resolve selected</strong>. The list reloads and the rows move out of <em>firing</em>.</li>
        <li>Open <a href="#/knowledge">Knowledge base</a>. Find your generated postmortem; click into it to read; click <strong>Edit</strong>, change a word, save — toast says <em>Saved</em>.</li>
        <li>Return to the <a href="#/">Dashboard</a>: <em>Active incidents</em> should be down by one, <em>Resolved today</em> should reflect your activity.</li>
      </ol>
    </div>

    <h2 class="heading-sm" style="margin-top:var(--space-xl)">Tech</h2>
    <div class="grid grid--2">
      <div class="card">
        <strong style="color:var(--color-ink)">Server</strong>
        <p class="meta" style="margin-top:6px">Node + Express. REST under <code>/api/projects</code>, <code>/api/alerts</code>, <code>/api/incidents</code>, <code>/api/knowledge</code>, <code>/api/logs</code>, <code>/api/telemetry</code>. SSE under <code>/api/ai/investigate/:id</code> and <code>/api/ai/remediate/:id</code>. Health at <code>/api/health</code>.</p>
      </div>
      <div class="card">
        <strong style="color:var(--color-ink)">Frontend</strong>
        <p class="meta" style="margin-top:6px">Vanilla HTML/CSS/JS shell with hash routing. The Analysis panel mounts a small React + Streamdown bundle so streaming Markdown looks polished while tokens arrive.</p>
      </div>
      <div class="card">
        <strong style="color:var(--color-ink)">Database</strong>
        <p class="meta" style="margin-top:6px">libSQL via <code>@libsql/client</code>. Either Turso remote or a local <code>file:./resolve-local.db</code> for offline dev.</p>
      </div>
      <div class="card">
        <strong style="color:var(--color-ink)">LLM</strong>
        <p class="meta" style="margin-top:6px">OpenRouter chat completions. Current primary model: <code>${escape(model)}</code>. Streaming uses OpenAI-compatible SSE.</p>
      </div>
    </div>

    <p class="meta" style="margin-top:var(--space-xl);font-size:13px">
      For the full specification, env variables, and deployment notes, see the
      <strong>README.md</strong> in the repository.
    </p>
  `;

  initChat(root, model);
}

function initChat(root, model) {
  const log = root.querySelector('#chat-log');
  const form = root.querySelector('#chat-form');
  const input = root.querySelector('#chat-input');
  const sendBtn = root.querySelector('#chat-send');
  const suggestions = root.querySelector('#chat-suggestions');

  const history = [];

  function appendMessage(role, contentHtml, isStreaming) {
    const wrap = document.createElement('div');
    wrap.className = `chat-msg chat-msg--${role}`;
    wrap.innerHTML = `
      <div class="chat-msg__role">${role === 'user' ? 'You' : 'Resolve'}</div>
      <div class="chat-msg__body">${contentHtml}</div>
    `;
    if (isStreaming) wrap.dataset.streaming = 'true';
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  function setStreamingDots(el) {
    const body = el.querySelector('.chat-msg__body');
    body.innerHTML = `
      <span class="ai-thinking__dots" aria-hidden="true"><span></span><span></span><span></span></span>
      <span class="meta" style="margin-left:8px">Asking ${escapeHtml(model)}…</span>
    `;
  }

  function paintAssistant(el, text) {
    const body = el.querySelector('.chat-msg__body');
    body.innerHTML = renderMarkdown(text || '');
    log.scrollTop = log.scrollHeight;
  }

  async function ask(question) {
    const trimmed = question.trim();
    if (!trimmed) return;
    input.value = '';
    suggestions.style.display = 'none';

    appendMessage('user', `<p>${escapeHtml(trimmed)}</p>`, false);
    const assistantEl = appendMessage('assistant', '', true);
    setStreamingDots(assistantEl);

    history.push({ role: 'user', content: trimmed });

    let buf = '';
    let firstChunk = true;

    await withButtonLoading(
      sendBtn,
      () =>
        new Promise((resolve) => {
          api.ai
            .aboutChat(history, (evt) => {
              if (evt.chunk) {
                if (firstChunk) {
                  firstChunk = false;
                  assistantEl.querySelector('.chat-msg__body').innerHTML = '';
                }
                buf += evt.chunk;
                paintAssistant(assistantEl, buf);
              }
              if (evt.error) {
                paintAssistant(assistantEl, `> Error: ${evt.error}`);
                toast(evt.error, 'error');
                resolve();
              }
              if (evt.done) {
                if (!buf.trim()) paintAssistant(assistantEl, '_(empty response)_');
                history.push({ role: 'assistant', content: buf });
                delete assistantEl.dataset.streaming;
                resolve();
              }
            })
            .catch((err) => {
              paintAssistant(assistantEl, `> Error: ${escapeHtml(err.message)}`);
              toast(err.message, 'error');
              resolve();
            });
        })
    );
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });

  suggestions.addEventListener('click', (e) => {
    const chip = e.target.closest('.chat-chip');
    if (!chip) return;
    ask(chip.dataset.q || chip.textContent);
  });
}

function escape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
