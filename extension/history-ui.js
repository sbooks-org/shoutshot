// Copyright (C) 2026 Simplebooks Foundation
// Copyright (C) 2026 Josh Rodd
// SPDX-License-Identifier: MIT-0
// Renders upload history rows (used by popup and options page).
function renderHistory(ul, entries, { onChange } = {}) {
  const { api, HOSTS } = self.SS;
  ul.textContent = '';
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Nothing uploaded yet.';
    ul.append(li);
    return;
  }
  for (const h of entries) {
    const li = document.createElement('li');
    const thumb = document.createElement('img');
    thumb.loading = 'lazy';
    thumb.src = h.url;
    thumb.alt = '';
    thumb.onerror = () => (thumb.style.visibility = 'hidden');
    const info = document.createElement('div');
    info.className = 'info';
    const link = document.createElement('a');
    link.href = h.url;
    link.target = '_blank';
    link.textContent = h.url.replace(/^https?:\/\//, '');
    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.style.fontSize = '11px';
    const who = h.mode === 'web' ? (h.account ? ` (${h.account})` : ' (guest)') : '';
    meta.textContent = `${HOSTS[h.host]}${who} · ${new Date(h.time).toLocaleString()}`;
    info.append(link, meta);

    const btns = document.createElement('div');
    btns.className = 'btns';
    const copy = document.createElement('button');
    copy.className = 'small';
    copy.textContent = 'Copy';
    copy.title = h.text;
    copy.onclick = async () => {
      await navigator.clipboard.writeText(h.text);
      copy.textContent = 'Copied ✓';
      setTimeout(() => (copy.textContent = 'Copy'), 1500);
    };
    const del = document.createElement('button');
    del.className = 'small';
    del.textContent = 'Delete';
    del.title = h.host === 'imgur' ? 'Delete from Imgur' : 'Open ImgBB delete page';
    del.onclick = async () => {
      if (h.host === 'imgur' && !confirm('Delete this image from Imgur? Links to it will stop working.')) return;
      const r = await api.runtime.sendMessage({ type: 'delete', id: h.id });
      if (!r?.ok) alert(r?.error || 'Delete failed');
      else onChange?.();
    };
    btns.append(copy, del);
    li.append(thumb, info, btns);
    ul.append(li);
  }
}
