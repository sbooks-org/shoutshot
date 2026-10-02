// Copyright (C) 2026 Simplebooks Foundation
// Copyright (C) 2026 Josh Rodd
// SPDX-License-Identifier: MIT-0
// Functions injected into web pages with scripting.executeScript({ func }).
// Each one must be fully self-contained: it is serialized and run in the page,
// so it can't reference anything outside its own body.
//
// They run in the extension's isolated world: variables on `globalThis` here
// are invisible to the page's own scripts. Anything Shoutshot puts in the page
// lives in a *closed* shadow root on an element with no id/class, so the page
// can't read its contents (e.g. the uploaded link) or tell it's Shoutshot.

/* eslint-disable no-unused-vars */

// Small status card in the bottom-right corner of the page.
// state: { kind: 'busy' | 'done' | 'error', title, text?, copied? }
function ssToast(state) {
  let t = globalThis.__ssToast;
  if (!t || !t.host.isConnected) {
    const host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;';
    const root = host.attachShadow({ mode: 'closed' });
    (document.body || document.documentElement).appendChild(host);
    t = globalThis.__ssToast = { host, root, timer: 0 };
  }
  const { host, root } = t;
  const remove = () => {
    host.remove();
    if (globalThis.__ssToast === t) globalThis.__ssToast = null;
  };
  clearTimeout(t.timer);
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .box { font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f4f4f5; background: #18181b; border: 1px solid #3f3f46; border-radius: 10px;
        box-shadow: 0 8px 30px rgba(0,0,0,.35); padding: 12px 14px; width: 320px; max-width: calc(100vw - 32px);
        box-sizing: border-box; animation: in .15s ease-out; }
      @keyframes in { from { transform: translateY(8px); opacity: 0; } }
      .row { display: flex; align-items: center; gap: 10px; }
      .title { font-weight: 600; flex: 1; }
      .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
      .busy .dot { background: #60a5fa; animation: pulse 1s infinite alternate; }
      .done .dot { background: #4ade80; }
      .error .dot { background: #f87171; }
      @keyframes pulse { to { opacity: .3; } }
      .x { all: unset; cursor: pointer; color: #a1a1aa; font-size: 16px; padding: 0 2px; }
      .x:hover { color: #fff; }
      .text { margin-top: 8px; font: 12px/1.4 ui-monospace, Menlo, monospace; background: #27272a;
        border-radius: 6px; padding: 6px 8px; word-break: break-all; user-select: all; color: #e4e4e7; }
      .error .text { font-family: inherit; background: transparent; padding: 0; color: #fca5a5; user-select: text; }
      .copy { all: unset; cursor: pointer; margin-top: 8px; background: #3b82f6; color: #fff;
        border-radius: 6px; padding: 5px 10px; font-weight: 600; font-size: 12px; }
      .copy:hover { background: #2563eb; }
    </style>`;
  const box = document.createElement('div');
  box.className = 'box ' + state.kind;
  const row = document.createElement('div');
  row.className = 'row';
  const dot = document.createElement('span');
  dot.className = 'dot';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = state.title;
  const close = document.createElement('button');
  close.className = 'x';
  close.textContent = '×';
  close.title = 'Dismiss';
  close.onclick = remove;
  row.append(dot, title, close);
  box.append(row);

  if (state.text) {
    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = state.text;
    box.append(text);
  }

  let life = state.kind === 'busy' ? 60000 : state.kind === 'error' ? 20000 : 6000;
  if (state.kind === 'done' && !state.copied) {
    // Background copy failed (usually Safari). Try once more from here, and
    // offer a button: a real click always counts as a user gesture.
    life = 20000;
    const btn = document.createElement('button');
    btn.className = 'copy';
    btn.textContent = 'Copy';
    const doCopy = async () => {
      try {
        await navigator.clipboard.writeText(state.text);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = state.text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
        root.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (!ok) throw e;
      }
      title.textContent = 'Uploaded, BBCode copied!';
      btn.textContent = 'Copied ✓';
    };
    btn.onclick = () => doCopy().catch(() => { btn.textContent = 'Copy failed: select the text above'; });
    box.append(btn);
    navigator.clipboard?.writeText(state.text).then(() => {
      title.textContent = 'Uploaded, BBCode copied!';
      btn.textContent = 'Copied ✓';
    }, () => {});
  }

  root.appendChild(box);
  box.onmouseenter = () => clearTimeout(t.timer);
  box.onmouseleave = () => { t.timer = setTimeout(remove, 3000); };
  t.timer = setTimeout(remove, life);
  return true;
}

function ssHideToast() {
  const t = globalThis.__ssToast;
  if (t) {
    clearTimeout(t.timer);
    t.host.remove();
    globalThis.__ssToast = null;
  }
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))));
}

// Drag-to-select overlay. When done, it messages the background worker with
// the rectangle (in CSS pixels) plus the viewport size used to scale it.
function ssRegionSelect(host) {
  const ext = globalThis.browser ?? globalThis.chrome;
  if (window.__ssRegionActive) return;
  window.__ssRegionActive = true;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
  const shadow = wrap.attachShadow({ mode: 'closed' });
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;cursor:crosshair;background:rgba(0,0,0,.3);';
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;display:none;outline:2px solid #3b82f6;box-shadow:0 0 0 100vmax rgba(0,0,0,.35);pointer-events:none;';
  const hint = document.createElement('div');
  hint.textContent = 'Drag to select an area  ·  Click for the whole visible page  ·  Esc to cancel';
  hint.style.cssText =
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#18181b;color:#fff;' +
    'font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:8px 14px;border-radius:8px;' +
    'pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.3);white-space:nowrap;';
  const size = document.createElement('div');
  size.style.cssText =
    'position:fixed;display:none;background:#18181b;color:#fff;font:11px ui-monospace,Menlo,monospace;' +
    'padding:2px 6px;border-radius:4px;pointer-events:none;';
  overlay.append(box, hint, size);
  shadow.appendChild(overlay);
  document.documentElement.appendChild(wrap);

  let start = null;
  let rect = null;

  const cleanup = () => {
    wrap.remove();
    window.removeEventListener('keydown', onKey, true);
    window.__ssRegionActive = false;
  };
  const finish = (r) => {
    cleanup();
    // Wait for the overlay to actually disappear from the screen before capturing.
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      ext.runtime.sendMessage({
        type: 'region-selected',
        host,
        rect: r && { ...r, vw: window.innerWidth, vh: window.innerHeight },
      });
    }, 40)));
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    }
  };
  window.addEventListener('keydown', onKey, true);

  // Keep the drag to ourselves: don't let these events bubble on to the page.
  for (const type of ['mousedown', 'mousemove', 'mouseup', 'click', 'contextmenu']) {
    overlay.addEventListener(type, (e) => e.stopPropagation());
  }
  overlay.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    rect = null;
  });
  overlay.addEventListener('mousemove', (e) => {
    if (!start) return;
    const x = Math.min(start.x, e.clientX);
    const y = Math.min(start.y, e.clientY);
    const w = Math.abs(e.clientX - start.x);
    const h = Math.abs(e.clientY - start.y);
    rect = { x, y, w, h };
    overlay.style.background = 'transparent';
    hint.style.display = 'none';
    Object.assign(box.style, { display: 'block', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    Object.assign(size.style, {
      display: 'block',
      left: x + 'px',
      top: Math.max(0, y - 22) + 'px',
    });
    size.textContent = `${Math.round(w)} × ${Math.round(h)}`;
  });
  overlay.addEventListener('mouseup', (e) => {
    if (!start || e.button !== 0) return;
    start = null;
    // A plain click (or a tiny accidental drag) means "whole visible page".
    finish(rect && rect.w > 4 && rect.h > 4 ? rect : null);
  });
}

// Fetch an image from inside the page, so it uses the page's own cookies and
// can read blob: URLs. Returns a data: URL, or null.
async function ssPageFetch(url) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
}

// Clipboard fallback for browsers without offscreen documents (Safari).
async function ssPageCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    /* fall through */
  }
  try {
    // The text box sits in a closed shadow root so the page can't read the link.
    const active = document.activeElement;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'all:initial;position:fixed;left:-9999px;top:0;';
    const ta = document.createElement('textarea');
    ta.value = text;
    wrap.attachShadow({ mode: 'closed' }).appendChild(ta);
    document.documentElement.appendChild(wrap);
    ta.select();
    const ok = document.execCommand('copy');
    wrap.remove();
    active?.focus?.();
    return ok;
  } catch (e) {
    return false;
  }
}

// Crop fallback for browsers without OffscreenCanvas in the worker.
async function ssPageCrop(dataUrl, r) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const s = img.naturalWidth / r.vw;
  const sx = Math.round(r.x * s);
  const sy = Math.round(r.y * s);
  const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(r.w * s)));
  const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(r.h * s)));
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c.toDataURL('image/png');
}
