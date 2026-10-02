// Copyright (C) 2026 Simplebooks Foundation
// Copyright (C) 2026 Josh Rodd
// SPDX-License-Identifier: MIT-0
'use strict';
const { api, HOSTS, getSettings, saveSettings, getHistory } = self.SS;
const $ = (id) => document.getElementById(id);

let host = 'imgbb';

function setHost(h) {
  host = h;
  for (const b of document.querySelectorAll('#hostSeg button')) {
    b.setAttribute('aria-pressed', String(b.dataset.host === h));
  }
}

function showStatus(kind, title, text) {
  const el = $('status');
  el.style.display = 'block';
  el.textContent = '';
  const t = document.createElement('div');
  t.className = kind;
  t.textContent = title;
  el.append(t);
  if (text) {
    const m = document.createElement('div');
    m.className = 'mono';
    m.textContent = text;
    el.append(m);
  }
}

async function activeTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function screenshot(action) {
  const tab = await activeTab();
  if (!tab) return;
  api.runtime.sendMessage({ type: 'action', action, host, tabId: tab.id });
  window.close();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function uploadBlob(blob, base) {
  if (!blob.type.startsWith('image/')) {
    showStatus('err', "That isn't an image.");
    return;
  }
  showStatus('muted', `Uploading to ${HOSTS[host]}…`);
  const r = await api.runtime.sendMessage({
    type: 'upload-data',
    host,
    dataUrl: await blobToDataUrl(blob),
    base: (base || 'pasted').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w.\- ]+/g, '_').slice(0, 60),
  });
  if (!r?.ok) {
    showStatus('err', 'Upload failed', r?.error);
    return;
  }
  let copied = r.copied;
  if (!copied) {
    try {
      await navigator.clipboard.writeText(r.text);
      copied = true;
    } catch (e) {
      /* user can copy from the status box */
    }
  }
  showStatus('ok', copied ? 'Uploaded, BBCode copied!' : 'Uploaded! (copy it below)', r.text);
  refreshHistory();
}

async function pasteFromClipboard() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) return uploadBlob(await item.getType(type), 'clipboard');
    }
    showStatus('err', 'No image on the clipboard.', 'Tip: on a Mac, ⌘⇧⌃4 puts a screenshot straight on the clipboard.');
  } catch (e) {
    showStatus('err', "Couldn't read the clipboard.", 'Press ⌘V / Ctrl+V in this popup instead.');
  }
}

async function refreshHistory() {
  renderHistory($('hist'), (await getHistory()).slice(0, 5), { onChange: refreshHistory });
}

document.addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (file) {
    e.preventDefault();
    uploadBlob(file, 'clipboard');
  }
});

const drop = $('drop');
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
document.addEventListener('dragleave', () => drop.classList.remove('over'));
document.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const file = [...(e.dataTransfer?.files || [])][0];
  if (file) uploadBlob(file, file.name);
});

for (const b of document.querySelectorAll('#hostSeg button')) {
  b.onclick = () => {
    setHost(b.dataset.host);
    saveSettings({ defaultHost: host });
  };
}
$('region').onclick = () => screenshot('region');
$('visible').onclick = () => screenshot('visible');
$('paste').onclick = pasteFromClipboard;
$('pick').onclick = () => $('file').click();
$('file').onchange = () => {
  const f = $('file').files[0];
  if (f) uploadBlob(f, f.name);
};
$('settings').onclick = (e) => {
  e.preventDefault();
  api.runtime.openOptionsPage();
  window.close();
};

(async () => {
  const s = await getSettings();
  setHost(s.defaultHost);
  const missing = Object.keys(HOSTS).filter(
    (h) => s[h + 'Mode'] === 'api' && !(h === 'imgur' ? s.imgurClientId : s.imgbbApiKey),
  );
  if (missing.length) {
    showStatus('err', `${missing.map((h) => HOSTS[h]).join(' & ')} is set to use an API key, but none is entered.`, 'Open Settings.');
  }
  const cmds = (await api.commands?.getAll?.()) || [];
  const area = cmds.find((c) => c.name === 'region-screenshot')?.shortcut;
  if (area) $('hint').textContent = `Area shortcut: ${area}`;
  refreshHistory();
})();
