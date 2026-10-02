// Copyright (C) 2026 Simplebooks Foundation
// Copyright (C) 2026 Josh Rodd
// SPDX-License-Identifier: MIT-0
// Chrome-only hidden page whose only job is writing to the clipboard
// (service workers can't touch the clipboard themselves).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'copy') return;
  const ta = document.getElementById('ta');
  ta.value = msg.text;
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {
    ok = false;
  }
  ta.value = '';
  sendResponse({ ok });
});
