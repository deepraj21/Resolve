import { api } from './api.js';
import { escapeHtml, renderMarkdown, el, modal, toast } from './components.js';

export async function render(root, params) {
  const articles = await api.knowledge.list();
  const projects = await api.projects.list();
  const pmap = Object.fromEntries(projects.map((p) => [p.id, p]));

  if (params.id) {
    const k = await api.knowledge.get(params.id);
    root.innerHTML = `
      <p class="eyebrow">Knowledge</p>
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start">
        <h1 class="display">${escapeHtml(k.title)}</h1>
        <button type="button" class="btn btn-ghost" id="edit-k">Edit</button>
      </div>
      <p class="meta">${escapeHtml(k.category)} · ${escapeHtml(pmap[k.project_id]?.name || '')}</p>
      <div class="card" style="margin-top:24px">
        ${renderMarkdown(k.content)}
      </div>
    `;
    root.querySelector('#edit-k').addEventListener('click', () => {
      const form = document.createElement('form');
      form.innerHTML = `
          <div class="field"><label>Title</label><input name="title" /></div>
          <div class="field"><label>Category</label>
            <select name="category">
              ${['runbook', 'postmortem', 'architecture', 'sop', 'known_issue']
                .map((c) => `<option value="${c}">${c}</option>`)
                .join('')}
            </select>
          </div>
          <div class="field"><label>Content (Markdown)</label><textarea name="content" rows="14"></textarea></div>
          <button type="submit" class="btn btn-primary">Save</button>`;
      form.querySelector('[name="title"]').value = k.title;
      form.querySelector('[name="category"]').value = k.category;
      form.querySelector('[name="content"]').value = k.content;
      const { element, close } = modal({ title: 'Edit article', body: form });
      document.body.appendChild(element);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          await api.knowledge.update(k.id, {
            title: fd.get('title'),
            category: fd.get('category'),
            content: fd.get('content'),
          });
          toast('Saved');
          close();
          location.hash = `#/knowledge/${k.id}`;
          location.reload();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    return;
  }

  root.innerHTML = `
    <p class="eyebrow">Library</p>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
      <h1 class="display">Knowledge base</h1>
      <button type="button" class="btn btn-primary" id="new-k">New article</button>
    </div>
    <div class="grid grid--3" style="margin-top:24px">
      ${articles
        .map(
          (a) => `
        <div class="card" data-id="${a.id}" style="cursor:pointer">
          <span class="badge">${escapeHtml(a.category)}</span>
          <h2 class="heading-sm" style="margin-top:12px">${escapeHtml(a.title)}</h2>
          <p class="meta">${escapeHtml(pmap[a.project_id]?.name || 'Global')}</p>
        </div>`
        )
        .join('')}
    </div>
  `;

  root.querySelectorAll('.card[data-id]').forEach((c) => {
    c.addEventListener('click', () => {
      location.hash = `#/knowledge/${c.getAttribute('data-id')}`;
    });
  });

  root.querySelector('#new-k').addEventListener('click', () => {
    const form = el(`
      <form>
        <div class="field"><label>Title</label><input name="title" required /></div>
        <div class="field"><label>Category</label>
          <select name="category">
            <option value="runbook">runbook</option>
            <option value="postmortem">postmortem</option>
            <option value="architecture">architecture</option>
            <option value="sop">sop</option>
            <option value="known_issue">known_issue</option>
          </select>
        </div>
        <div class="field"><label>Project (optional)</label>
          <select name="project_id">
            <option value="">—</option>
            ${projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Content</label><textarea name="content" rows="10" required></textarea></div>
        <div class="field"><label>Tags (JSON array)</label><input name="tags" value="[]" /></div>
        <button type="submit" class="btn btn-primary">Create</button>
      </form>
    `);
    const { element, close } = modal({ title: 'New article', body: form });
    document.body.appendChild(element);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      let tags = [];
      try {
        tags = JSON.parse(fd.get('tags') || '[]');
      } catch {
        tags = [];
      }
      try {
        const row = await api.knowledge.create({
          title: fd.get('title'),
          category: fd.get('category'),
          content: fd.get('content'),
          project_id: fd.get('project_id') || null,
          tags,
        });
        close();
        location.hash = `#/knowledge/${row.id}`;
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}
