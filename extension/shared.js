// Copyright (C) 2026 Simplebooks Foundation
// Copyright (C) 2026 Josh Rodd
// SPDX-License-Identifier: MIT-0
// Settings + helpers shared by the background worker, popup and options page.
(function (g) {
  'use strict';

  const api = g.browser ?? g.chrome;

  const HOSTS = { imgur: 'Imgur', imgbb: 'ImgBB' };

  // 'web'  = upload the same way the website does (no key; uses your browser's
  //          login if you're signed in to that site, otherwise a guest upload)
  // 'api'  = official API with your own key
  const BUILTIN = {
    imgurMode: 'web',
    imgbbMode: 'web',
    imgurClientId: '',
    imgbbApiKey: '',
    defaultHost: 'imgbb',
    template: '[img]{url}[/img]',
    saveLocal: true,
    saveFolder: 'Shoutshot',
    imgbbExpiration: '', // ISO 8601 duration like PT5M / P1D; '' = never
    showToast: true,
  };

  const TEMPLATES = [
    { label: 'BBCode image', value: '[img]{url}[/img]' },
    { label: 'BBCode image linked to its page', value: '[url={viewer}][img]{url}[/img][/url]' },
    { label: 'Direct link only', value: '{url}' },
    { label: 'Markdown', value: '![]({url})' },
    { label: 'HTML', value: '<img src="{url}">' },
  ];

  // Same choices as the ImgBB upload page.
  const IMGBB_EXPIRATIONS = [
    ['', 'Never'], ['PT5M', '5 minutes'], ['PT15M', '15 minutes'], ['PT30M', '30 minutes'],
    ['PT1H', '1 hour'], ['PT3H', '3 hours'], ['PT6H', '6 hours'], ['PT12H', '12 hours'],
    ['P1D', '1 day'], ['P2D', '2 days'], ['P3D', '3 days'], ['P1W', '1 week'], ['P2W', '2 weeks'],
    ['P1M', '1 month'], ['P2M', '2 months'], ['P3M', '3 months'], ['P6M', '6 months'],
  ];

  async function getSettings() {
    const { settings = {} } = await api.storage.local.get('settings');
    const merged = { ...BUILTIN, ...(g.SHOUTSHOT_DEFAULTS || {}) };
    for (const [k, v] of Object.entries(settings)) {
      if (v !== '' && v !== undefined && v !== null) merged[k] = v;
    }
    return merged;
  }

  async function saveSettings(patch) {
    const { settings = {} } = await api.storage.local.get('settings');
    for (const [k, v] of Object.entries(patch)) {
      // Empty = "back to default" (the built-in value or defaults.js).
      if (v === '' || v == null) delete settings[k];
      else settings[k] = v;
    }
    await api.storage.local.set({ settings });
  }

  async function getHistory() {
    const { history = [] } = await api.storage.local.get('history');
    return history;
  }

  function applyTemplate(template, r) {
    return (template || '[img]{url}[/img]')
      .replaceAll('{url}', r.url)
      .replaceAll('{viewer}', r.viewer || r.url);
  }

  g.SS = { api, HOSTS, BUILTIN, TEMPLATES, IMGBB_EXPIRATIONS, getSettings, saveSettings, getHistory, applyTemplate };
})(self);
