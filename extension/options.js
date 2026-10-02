// Copyright (C) 2026 Simplebooks Foundation
// Copyright (C) 2026 Josh Rodd
// SPDX-License-Identifier: MIT-0
'use strict';
const { api, TEMPLATES, IMGBB_EXPIRATIONS, getSettings, saveSettings, getHistory, applyTemplate } = self.SS;
const $ = (id) => document.getElementById(id);

let savedTimer;
async function save(patch) {
  await saveSettings(patch);
  clearTimeout(savedTimer);
  $('saved').classList.add('show');
  savedTimer = setTimeout(() => $('saved').classList.remove('show'), 1200);
}

function setHost(h) {
  for (const b of document.querySelectorAll('#hostSeg button')) {
    b.setAttribute('aria-pressed', String(b.dataset.host === h));
  }
}

function updatePreview() {
  const t = $('template').value;
  $('preview').textContent = applyTemplate(t, { url: 'https://i.ibb.co/abc123/cat.png', viewer: 'https://ibb.co/abc123' });
  const preset = TEMPLATES.find((p) => p.value === t);
  $('templatePreset').value = preset ? preset.value : '__custom';
}

async function refreshHistory() {
  renderHistory($('hist'), await getHistory(), { onChange: refreshHistory });
}

(async () => {
  const s = await getSettings();
  $('version').textContent = api.runtime.getManifest().version;

  for (const id of ['imgbbApiKey', 'imgurClientId', 'saveFolder']) {
    $(id).value = s[id] || '';
    $(id).addEventListener('change', () => save({ [id]: $(id).value.trim() }));
  }
  for (const id of ['imgbbApiKey', 'imgurClientId']) {
    $(id).addEventListener('focus', () => ($(id).type = 'text'));
    $(id).addEventListener('blur', () => ($(id).type = 'password'));
  }
  for (const id of ['saveLocal', 'showToast']) {
    $(id).checked = !!s[id];
    $(id).addEventListener('change', () => save({ [id]: $(id).checked }));
  }
  for (const host of ['imgbb', 'imgur']) {
    const key = host + 'Mode';
    const card = document.querySelector(`.host-card[data-host=${host}]`);
    const show = (mode) => {
      card.querySelector('.when-web').hidden = mode !== 'web';
      card.querySelector('.when-api').hidden = mode !== 'api';
    };
    for (const r of card.querySelectorAll(`input[name=${key}]`)) {
      r.checked = r.value === s[key];
      r.onchange = () => {
        show(r.value);
        $('test-' + host).textContent = '';
        save({ [key]: r.value });
      };
    }
    show(s[key]);
  }

  for (const [value, label] of IMGBB_EXPIRATIONS) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    $('imgbbExpiration').append(o);
  }
  $('imgbbExpiration').value = typeof s.imgbbExpiration === 'string' ? s.imgbbExpiration : '';
  $('imgbbExpiration').onchange = () => save({ imgbbExpiration: $('imgbbExpiration').value });

  setHost(s.defaultHost);
  for (const b of document.querySelectorAll('#hostSeg button')) {
    b.onclick = () => {
      setHost(b.dataset.host);
      save({ defaultHost: b.dataset.host });
    };
  }

  for (const p of [...TEMPLATES, { label: 'Custom…', value: '__custom' }]) {
    const o = document.createElement('option');
    o.value = p.value;
    o.textContent = p.label;
    $('templatePreset').append(o);
  }
  $('template').value = s.template;
  updatePreview();
  $('templatePreset').onchange = () => {
    const v = $('templatePreset').value;
    if (v === '__custom') return $('template').focus();
    $('template').value = v;
    updatePreview();
    save({ template: v });
  };
  $('template').oninput = updatePreview;
  $('template').onchange = () => {
    if (!$('template').value.includes('{url}')) $('template').value = '[img]{url}[/img]';
    updatePreview();
    save({ template: $('template').value });
  };

  for (const b of document.querySelectorAll('[data-test]')) {
    b.onclick = async () => {
      const host = b.dataset.test;
      const out = $('test-' + host);
      out.className = 'result muted';
      out.textContent = 'Testing…';
      const key = $(host === 'imgur' ? 'imgurClientId' : 'imgbbApiKey').value.trim();
      const mode = document.querySelector(`input[name=${host}Mode]:checked`)?.value || 'web';
      const r = await api.runtime.sendMessage({ type: 'test', host, mode, key });
      out.className = 'result ' + (r?.ok ? 'ok' : 'err');
      out.textContent = r?.ok ? r.info : `Didn't work: ${r?.error || 'unknown error'}`;
    };
  }

  if (!api.downloads) {
    $('saveField').classList.add('disabled');
    $('saveHelp').textContent = "This browser (Safari) doesn't let extensions save files, so local copies are off.";
    $('saveDialogHelp').hidden = true;
    $('saveLocal').checked = false;
  } else {
    // chrome://settings/downloads also opens Brave's own download settings.
    $('openDownloadSettings').onclick = () => api.tabs.create({ url: 'chrome://settings/downloads' });
  }

  const cmds = (await api.commands?.getAll?.()) || [];
  $('shortcuts').textContent = '';
  for (const c of cmds) {
    const d = document.createElement('div');
    d.innerHTML = '<code></code> <span></span>';
    d.firstChild.textContent = c.shortcut || '(not set)';
    d.lastChild.textContent = c.description || 'Open popup';
    $('shortcuts').append(d);
  }
  if (!cmds.length) $('shortcuts').textContent = 'Not available in this browser.';
  const extUrl = api.runtime.getURL('');
  if (extUrl.startsWith('chrome-extension://')) {
    $('openShortcuts').onclick = (e) => {
      e.preventDefault();
      api.tabs.create({ url: 'chrome://extensions/shortcuts' });
    };
  } else {
    $('shortcutHelp').textContent = extUrl.startsWith('safari-web-extension://')
      ? 'Change them in Safari → Settings → Extensions → Shoutshot.'
      : "Change them in your browser's extension settings.";
  }

  $('clearHistory').onclick = async () => {
    if (!confirm('Forget all upload links? (The images stay online.)')) return;
    await api.storage.local.set({ history: [] });
    refreshHistory();
  };
  refreshHistory();
  api.storage.onChanged.addListener((changes) => {
    if (changes.history) refreshHistory();
  });
})();
