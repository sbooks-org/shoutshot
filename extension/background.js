// Copyright (C) 2026 Simplebooks Foundation
// Copyright (C) 2026 Josh Rodd
// SPDX-License-Identifier: MIT-0
// Shoutshot background worker.
// Right-click image / screenshot → (save a copy) → upload → BBCode → clipboard.
'use strict';

importScripts('defaults.js', 'shared.js', 'inject.js');

const { api, HOSTS, getSettings, applyTemplate } = self.SS;
const menus = api.contextMenus ?? api.menus;

// ---------------------------------------------------------------- menus

async function setupMenus() {
  await menus.removeAll();
  const add = (item) => menus.create(item, () => void api.runtime.lastError);
  add({ id: 'img-imgur', title: 'Upload to Imgur', contexts: ['image'] });
  add({ id: 'img-imgbb', title: 'Upload to ImgBB', contexts: ['image'] });
  add({ id: 'sep-1', type: 'separator', contexts: ['image'] });
  add({ id: 'region-imgur', title: 'Screenshot an area → Imgur', contexts: ['all'] });
  add({ id: 'region-imgbb', title: 'Screenshot an area → ImgBB', contexts: ['all'] });
  add({ id: 'visible-imgur', title: 'Screenshot visible page → Imgur', contexts: ['all'] });
  add({ id: 'visible-imgbb', title: 'Screenshot visible page → ImgBB', contexts: ['all'] });
}

api.runtime.onInstalled.addListener((details) => {
  setupMenus();
  if (details.reason === 'install') api.runtime.openOptionsPage();
});
api.runtime.onStartup?.addListener(setupMenus);

menus.onClicked.addListener((info, tab) => {
  const [kind, host] = String(info.menuItemId).split('-');
  if (!HOSTS[host]) return;
  if (kind === 'img') uploadImage(info.srcUrl, host, tab, info.frameId);
  else if (kind === 'region') startRegion(tab, host);
  else if (kind === 'visible') captureVisible(tab, host);
});

api.commands?.onCommand.addListener(async (command, tab) => {
  const { defaultHost } = await getSettings();
  tab = tab ?? (await api.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!tab) return;
  if (command === 'region-screenshot') startRegion(tab, defaultHost);
  else if (command === 'visible-screenshot') captureVisible(tab, defaultHost);
});

// ---------------------------------------------------------------- messages

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return;
  let job;
  switch (msg.type) {
    case 'region-selected':
      job = regionSelected(sender.tab, msg.host, msg.rect);
      break;
    case 'action':
      job = api.tabs.get(msg.tabId).then((tab) =>
        msg.action === 'region' ? startRegion(tab, msg.host) : captureVisible(tab, msg.host));
      break;
    case 'upload-data':
      job = run(null, msg.host, async () => ({
        blob: dataUrlToBlob(msg.dataUrl),
        base: msg.base || 'pasted',
      }));
      break;
    case 'delete':
      job = deleteUpload(msg.id);
      break;
    case 'test':
      job = testHost(msg.host, msg.mode, msg.key);
      break;
    default:
      return;
  }
  Promise.resolve(job).then(
    (r) => sendResponse(r ?? { ok: true }),
    (e) => sendResponse({ ok: false, error: String(e?.message || e) }),
  );
  return true;
});

// ---------------------------------------------------------------- entry points

async function uploadImage(srcUrl, host, tab, frameId) {
  await run(tab, host, async () => {
    const base = baseNameFromUrl(srcUrl);
    const blob = await fetchImage(srcUrl, tab, frameId);
    if (blob) return { blob, base };
    // Couldn't download it ourselves: both hosts can fetch a public URL.
    if (/^https?:/i.test(srcUrl)) return { url: srcUrl, base };
    throw new Error("Couldn't read that image from the page.");
  });
}

async function captureVisible(tab, host) {
  await run(tab, host, async () => {
    await hideToast(tab);
    return { blob: await captureTab(tab), base: screenshotBase(tab) };
  });
}

async function startRegion(tab, host) {
  if (!(await requireKey(tab, host))) return;
  await hideToast(tab);
  try {
    await api.scripting.executeScript({ target: { tabId: tab.id }, func: ssRegionSelect, args: [host] });
  } catch (e) {
    // Browser-internal pages (settings, extension store…) block scripts.
    await report(tab, { kind: 'error', title: "Can't select an area on this page", text: 'The browser blocks extensions here.' });
  }
}

async function regionSelected(tab, host, rect) {
  await run(tab, host, async () => {
    const full = await captureTab(tab);
    const blob = rect ? await crop(full, rect, tab) : full;
    return { blob, base: screenshotBase(tab) };
  });
}

// ---------------------------------------------------------------- pipeline

async function requireKey(tab, host) {
  const s = await getSettings();
  if (modeFor(host, s) === 'web' || keyFor(host, s)) return true;
  await report(tab, {
    kind: 'error',
    title: `No ${HOSTS[host]} key set`,
    text: `Add your ${HOSTS[host]} ${host === 'imgur' ? 'Client ID' : 'API key'} on the settings page (opening it now).`,
  });
  api.runtime.openOptionsPage();
  return false;
}

/**
 * getImage() → { blob?, url?, base }. Runs the whole flow and reports progress
 * in the page. Resolves { ok, text?, copied?, error? }.
 */
async function run(tab, host, getImage) {
  if (!(await requireKey(tab, host))) return { ok: false, error: `No ${HOSTS[host]} key set` };
  const s = await getSettings();
  setBadge('…', '#3b82f6');
  try {
    const img = await getImage();
    await toast(tab, { kind: 'busy', title: `Uploading to ${HOSTS[host]}…` });

    if (img.blob) {
      img.blob = await normalizeImage(img.blob);
      img.name = `${stamp()}_${img.base}.${extFor(img.blob.type)}`;
    } else {
      img.name = `${stamp()}_${img.base}${extFromUrl(img.url)}`;
    }

    if (s.saveLocal) {
      saveLocal(img, s).catch((e) => console.warn('Shoutshot: local save failed', e));
    }

    const res = await (host === 'imgur' ? uploadImgur : uploadImgbb)(img, s);
    await verifyUploadLinks(res);
    const text = applyTemplate(s.template, res);
    const copied = await copyText(text, tab);

    await addHistory({ host, ...res, text, name: img.name, time: Date.now() });
    const who = res.mode === 'web' ? (res.account ? ` to ${res.account}` : ' as guest') : '';
    await report(tab, { kind: 'done', title: `Uploaded${who}${copied ? ', BBCode copied!' : '!'}`, text, copied });
    setBadge('✓', '#16a34a', 4000);
    return { ok: true, text, url: res.url, copied };
  } catch (e) {
    console.error('Shoutshot:', e);
    const error = String(e?.message || e);
    await report(tab, { kind: 'error', title: `${HOSTS[host]} upload failed`, text: error });
    setBadge('!', '#dc2626', 8000);
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------- getting the image

async function fetchImage(srcUrl, tab, frameId) {
  if (srcUrl.startsWith('data:')) return dataUrlToBlob(srcUrl);

  if (!srcUrl.startsWith('blob:')) {
    try {
      const res = await fetch(srcUrl, { credentials: 'include' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size && !/^text\/html/i.test(blob.type)) return blob;
      }
    } catch (e) {
      /* try from inside the page instead */
    }
  }

  if (tab?.id != null) {
    try {
      const [r] = await api.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [frameId || 0] },
        func: ssPageFetch,
        args: [srcUrl],
      });
      if (r?.result) return dataUrlToBlob(r.result);
    } catch (e) {
      /* give up */
    }
  }
  return null;
}

async function captureTab(tab) {
  return dataUrlToBlob(await api.tabs.captureVisibleTab(tab.windowId, { format: 'png' }));
}

async function crop(blob, r, tab) {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    const [res] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: ssPageCrop,
      args: [await blobToDataUrl(blob), r],
    });
    return dataUrlToBlob(res.result);
  }
  const bmp = await createImageBitmap(blob);
  const scale = bmp.width / r.vw; // device pixel ratio × zoom
  const sx = Math.round(r.x * scale);
  const sy = Math.round(r.y * scale);
  const sw = Math.max(1, Math.min(bmp.width - sx, Math.round(r.w * scale)));
  const sh = Math.max(1, Math.min(bmp.height - sy, Math.round(r.h * scale)));
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  bmp.close?.();
  return canvas.convertToBlob({ type: 'image/png' });
}

const UPLOADABLE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];

// Fix up missing/wrong content types and convert formats the hosts reject
// (AVIF, HEIC, ICO…) to PNG.
async function normalizeImage(blob) {
  const type = (await sniffType(blob)) || blob.type;
  if (type === 'image/svg+xml') throw new Error("SVG images can't be uploaded to Imgur or ImgBB.");
  if (/^text\//i.test(type)) throw new Error("That link didn't return an image (the site may block downloads).");
  if (UPLOADABLE.includes(type)) return type === blob.type ? blob : new Blob([blob], { type });
  try {
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    return await canvas.convertToBlob({ type: 'image/png' });
  } catch (e) {
    throw new Error(`Unsupported image format (${type || 'unknown'}).`);
  }
}

async function sniffType(blob) {
  const b = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 2) === 'BM') return 'image/bmp';
  if (ascii(0, 4) === 'II*\0' || ascii(0, 4) === 'MM\0*') return 'image/tiff';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand.startsWith('avi')) return 'image/avif';
    if (/^(heic|heix|mif1|msf1)$/.test(brand)) return 'image/heic';
  }
  if (/^\s*(<\?xml|<svg)/i.test(ascii(0, 32)) && /svg/i.test(blob.type)) return 'image/svg+xml';
  if (/^\s*</.test(ascii(0, 32))) return 'text/html';
  return '';
}

// ---------------------------------------------------------------- uploading
//
// 'web' mode sends the same request the site's own upload page sends, with the
// browser's cookies: if you're logged in to imgur.com / imgbb.com in this
// browser the image goes to that account, otherwise it's a guest upload.
// 'api' mode uses your own API key instead.

// imgur.com's own front-end client id. Refreshed automatically from the site
// if Imgur ever changes it.
const IMGUR_WEB_CLIENT_ID = 'd70305e7c3ac5c6';

function keyFor(host, s) {
  return (host === 'imgur' ? s.imgurClientId : s.imgbbApiKey)?.trim();
}

function modeFor(host, s) {
  return (host === 'imgur' ? s.imgurMode : s.imgbbMode) === 'api' ? 'api' : 'web';
}

async function imgurWebClientId(refresh = false) {
  if (!refresh) {
    const { imgurWebClientId: saved } = await api.storage.local.get('imgurWebClientId');
    return saved || IMGUR_WEB_CLIENT_ID;
  }
  const html = await (await fetch('https://imgur.com/upload', { credentials: 'include' })).text();
  const src = html.match(/https:\/\/s\.imgur\.com\/desktop-assets\/js\/main\.\w+\.js/)?.[0];
  const js = src ? await (await fetch(src)).text() : '';
  const id = js.match(/apiClientId:"(\w+)"/)?.[1];
  if (id) await api.storage.local.set({ imgurWebClientId: id });
  return id || null;
}

function imgurError(j, res) {
  const err = j?.data?.error;
  return (typeof err === 'string' ? err : err?.message) || `HTTP ${res.status}`;
}

async function uploadImgur(img, s) {
  const form = () => {
    const fd = new FormData();
    if (img.blob) {
      fd.append('image', img.blob, img.name);
      fd.append('type', 'file');
    } else {
      fd.append('image', img.url);
      fd.append('type', 'url');
    }
    fd.append('name', img.name);
    return fd;
  };
  const mode = modeFor('imgur', s);
  let res, j;
  if (mode === 'api') {
    res = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: { Authorization: `Client-ID ${keyFor('imgur', s)}` },
      body: form(),
    });
    j = await res.json().catch(() => null);
  } else {
    const post = async (clientId) => {
      const r = await fetch(`https://api.imgur.com/3/upload?client_id=${clientId}`, {
        method: 'POST',
        credentials: 'include',
        body: form(),
      });
      return [r, await r.json().catch(() => null)];
    };
    [res, j] = await post(await imgurWebClientId());
    if ((res.status === 401 || res.status === 403) && /client/i.test(imgurError(j, res))) {
      const fresh = await imgurWebClientId(true).catch(() => null);
      if (fresh) [res, j] = await post(fresh);
    }
  }
  if (!res.ok || !j?.success || !j.data?.link) {
    throw new Error(`Imgur said: ${imgurError(j, res)}${res.status === 429 ? ' (rate limited, try again later)' : ''}`);
  }
  return {
    url: j.data.link,
    viewer: `https://imgur.com/${j.data.id}`,
    deleteHash: j.data.deletehash,
    mode,
    account: j.data.account_url || null,
  };
}

async function deleteImgur(deleteHash, mode, s) {
  const web = mode === 'web';
  const res = await fetch(
    `https://api.imgur.com/3/image/${deleteHash}` + (web ? `?client_id=${await imgurWebClientId()}` : ''),
    {
      method: 'DELETE',
      credentials: web ? 'include' : 'omit',
      headers: web ? {} : { Authorization: `Client-ID ${keyFor('imgur', s)}` },
    },
  );
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.success) throw new Error(`Imgur refused to delete it: ${imgurError(j, res)}`);
}

// ---- ImgBB "web" mode
//
// Same requests imgbb.com's upload page makes: read the page's auth_token from
// https://imgbb.com/, then POST the file to https://imgbb.com/json.
//
// CORS matters here. Chrome/Brave let an extension with host permissions read
// any cross-origin response. Safari's extension background doesn't for
// imgbb.com, even with the extension allowed on every website (confirmed
// 2026-10-02), so there its fetches are ordinary CORS requests.
// imgbb.com's home page sends no Access-Control-Allow-Origin at all (can't be
// read), and /json sends "Access-Control-Allow-Origin: *" without
// Allow-Credentials, so its reply is readable only when no cookies are sent.
// (api.imgur.com allows everything, which is why Imgur works either way.)
// So when imgbb.com blocks us, fall back to a cookieless guest upload, which
// /json accepts (it doesn't need the token for guests) and lets us read.
// The ImgBB API (api.imgbb.com, "With my API key") isn't affected, and its
// uploads go into the key owner's account.

const IMGBB_HELP =
  'To upload into your ImgBB account instead, log in at api.imgbb.com, get an API key, and switch ImgBB to “With my API key” in Shoutshot’s settings.';

let imgbbSession = null; // { token, at }
let imgbbNoCookies = false; // set once cookie-carrying requests to imgbb.com turn out to be blocked

// fetch() that marks "the browser blocked / couldn't make the request"
// (TypeError: "Failed to fetch" in Chrome, "Load failed" in Safari) so it can be
// told apart from HTTP errors.
async function imgbbFetch(url, init) {
  try {
    return await fetch(url, init);
  } catch (e) {
    const err = new Error(String(e?.message || e));
    err.blocked = true;
    throw err;
  }
}

// The upload page embeds a per-session auth token; fetch it like the page would.
// Resolves { token } or { token: null, blocked?, why } and never throws.
async function imgbbToken(refresh = false) {
  if (!refresh && imgbbSession && Date.now() - imgbbSession.at < 10 * 60e3) return { token: imgbbSession.token };
  let res, html;
  try {
    res = await imgbbFetch('https://imgbb.com/', { credentials: imgbbNoCookies ? 'omit' : 'include' });
    html = await res.text();
  } catch (e) {
    return { token: null, blocked: true, why: `couldn't read imgbb.com (blocked by the browser, likely CORS: ${e.message})` };
  }
  const token = html.match(/auth_token\s*=\s*"(\w+)"/)?.[1];
  if (!token) {
    const title = html.match(/<title[^>]*>([^<]{0,80})/i)?.[1]?.trim();
    return { token: null, why: `no upload token found on imgbb.com (HTTP ${res.status}${title ? `, page “${title}”` : ''})` };
  }
  imgbbSession = { token, at: Date.now() };
  return { token };
}

// 'PT5M', 'P1D', 'P2W', 'P1M' → seconds (the API wants seconds).
function isoToSeconds(iso) {
  const m = String(iso || '').match(/^P(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m) return 0;
  const [, mo, w, d, h, mi] = m.map((x) => Number(x) || 0);
  return Math.min(15552000, Math.max(60, mo * 2592000 + w * 604800 + d * 86400 + h * 3600 + mi * 60));
}

function imgbbExpiration(s) {
  return typeof s.imgbbExpiration === 'string' ? s.imgbbExpiration : '';
}

async function uploadImgbb(img, s) {
  if (modeFor('imgbb', s) === 'api') return uploadImgbbApi(img, s);
  try {
    return await uploadImgbbWeb(img, s);
  } catch (e) {
    // The website route failed but there's a saved API key: use that instead.
    if (s.noFallback || !keyFor('imgbb', s)) throw e;
    console.warn('Shoutshot: ImgBB web upload failed, using the API key instead:', e.message);
    try {
      return await uploadImgbbApi(img, s);
    } catch (e2) {
      throw new Error(`${e.message} (API key fallback also failed: ${e2.message})`);
    }
  }
}

async function uploadImgbbApi(img, s) {
  const expiration = imgbbExpiration(s);
  const params = new URLSearchParams({ key: keyFor('imgbb', s) });
  if (expiration) params.set('expiration', String(isoToSeconds(expiration)));
  const fd = new FormData();
  if (img.blob) fd.append('image', img.blob, img.name);
  else fd.append('image', img.url);
  fd.append('name', img.name.replace(/\.[a-z0-9]+$/i, ''));
  let res;
  try {
    res = await fetch(`https://api.imgbb.com/1/upload?${params}`, { method: 'POST', body: fd });
  } catch (e) {
    throw new Error(`Couldn't reach api.imgbb.com (${e?.message || e}).`);
  }
  const j = await res.json().catch(() => null);
  const url = j?.data?.image?.url || j?.data?.url;
  if (!res.ok || !url) throw new Error(`ImgBB rejected the upload: ${j?.error?.message || `HTTP ${res.status}`}`);
  return { url, viewer: j.data.url_viewer, deleteUrl: j.data.delete_url, mode: 'api', account: null };
}

async function uploadImgbbWeb(img, s) {
  const expiration = imgbbExpiration(s);

  const post = async (token, cookies) => {
    const fd = new FormData();
    if (img.blob) {
      fd.append('source', img.blob, img.name);
      fd.append('type', 'file');
    } else {
      fd.append('source', img.url);
      fd.append('type', 'url');
    }
    fd.append('action', 'upload');
    fd.append('timestamp', String(Date.now()));
    if (token) fd.append('auth_token', token);
    if (expiration) fd.append('expiration', expiration);
    const r = await imgbbFetch('https://imgbb.com/json', {
      method: 'POST',
      credentials: cookies ? 'include' : 'omit',
      body: fd,
    });
    const text = await r.text().catch(() => '');
    let j = null;
    try {
      j = JSON.parse(text);
    } catch (e) {
      /* not JSON */
    }
    return { r, j, text };
  };

  // Upload with the browser's imgbb.com cookies (so it lands in the logged-in
  // account); if the browser blocks that (CORS), upload as a guest without them.
  const attempt = async (token) => {
    if (!imgbbNoCookies) {
      try {
        return await post(token, true);
      } catch (e) {
        if (!e.blocked) throw e;
        imgbbNoCookies = true;
        console.warn('Shoutshot: request to imgbb.com with cookies was blocked; uploading as guest:', e.message);
      }
    }
    return post(token, false);
  };

  const describe = ({ r, j, text }) => {
    const msg = j?.error?.message || (typeof j?.error === 'string' ? j.error : '') || j?.status_txt;
    if (msg) return `ImgBB rejected the upload: ${msg}`;
    if (!j) {
      const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
      return `ImgBB sent an unexpected reply (HTTP ${r.status}${snippet ? `: ${snippet}` : ''}).`;
    }
    return `ImgBB rejected the upload (HTTP ${r.status}, no image link in the reply).`;
  };

  let tok = await imgbbToken();
  // Couldn't even read the token page: cookie-carrying requests will be blocked
  // too, so skip straight to the cookieless upload (a blocked POST would still
  // reach ImgBB and leave a stray duplicate behind).
  if (tok.blocked) imgbbNoCookies = true;

  let out;
  try {
    out = await attempt(tok.token);
    if (!out.j?.image?.url && tok.token) {
      // Token may have gone stale; get a fresh one and try once more.
      const fresh = await imgbbToken(true);
      if (fresh.token) out = await attempt(fresh.token);
      else tok = fresh;
    }
  } catch (e) {
    if (!e.blocked) throw e;
    throw new Error(
      `Couldn't reach imgbb.com: ${tok.why ? `${tok.why}, and ` : ''}the upload request was blocked (${e.message}). ${IMGBB_HELP}`,
    );
  }

  const j = out.j;
  if (!j?.image?.url) throw new Error(describe(out) + (tok.why ? ` Also: ${tok.why}.` : ''));
  return {
    url: j.image.url,
    viewer: j.image.url_viewer,
    deleteUrl: j.image.delete_url,
    mode: 'web',
    account: j.image.user?.username || null,
  };
}

// Does a real tiny upload (ImgBB: auto-deletes in 5 min; Imgur: deleted right
// away) and reports which account it landed in.
async function testHost(host, mode, key) {
  const s = {
    ...(await getSettings()),
    [host + 'Mode']: mode,
    [host === 'imgur' ? 'imgurClientId' : 'imgbbApiKey']: key?.trim() || '',
    imgbbExpiration: 'PT5M',
    noFallback: true, // test the mode that was picked, not the fallback
  };
  if (mode === 'api' && !keyFor(host, s)) return { ok: false, error: 'Enter a key first.' };
  const img = { blob: await testImage(), name: 'shoutshot-test.png' };
  const res = await (host === 'imgur' ? uploadImgur : uploadImgbb)(img, s);
  try {
    await verifyUploadLinks(res);
  } finally {
    if (host === 'imgur') await deleteImgur(res.deleteHash, mode, s).catch(() => {});
  }
  const where =
    mode === 'api'
      ? 'Uploading with your API key.'
      : res.account
        ? `Uploading into your ${HOSTS[host]} account “${res.account}”.`
        : host === 'imgbb' && imgbbNoCookies
          ? `Uploading as a guest: this browser (Safari) doesn't let extensions use your imgbb.com login. ${IMGBB_HELP}`
          : `Uploading as a guest (you're not logged in to ${host}.com in this browser).`;
  return { ok: true, info: `Works! ${where}` };
}

// A small random-colored PNG, so the host doesn't hand back an old duplicate.
async function testImage() {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(8, 8);
    const ctx = c.getContext('2d');
    ctx.fillStyle = `hsl(${Math.floor(Math.random() * 360)} 70% 50%)`;
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.floor(Math.random() * 8), Math.floor(Math.random() * 8), 1, 1);
    return c.convertToBlob({ type: 'image/png' });
  }
  return (await fetch(api.runtime.getURL('icons/icon16.png'))).blob();
}

// ---------------------------------------------------------------- saving a local copy

async function saveLocal(img, s) {
  if (!api.downloads) return; // Safari has no downloads API
  const folder =
    String(s.saveFolder || 'Shoutshot')
      .split(/[\\/]+/)
      .map(safeName)
      .filter(Boolean)
      .join('/') || 'Shoutshot';
  const url = img.blob ? await blobToDataUrl(img.blob) : img.url;
  await api.downloads.download({
    url,
    filename: `${folder}/${img.name}`,
    conflictAction: 'uniquify',
    saveAs: false,
  });
}

// ---------------------------------------------------------------- clipboard

let creatingOffscreen = null;

async function ensureOffscreen() {
  const url = api.runtime.getURL('offscreen.html');
  if (api.runtime.getContexts) {
    const found = await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
    if (found.length) return;
  } else if (await api.offscreen.hasDocument?.()) {
    return;
  }
  creatingOffscreen ??= api.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Copy the uploaded image link to the clipboard',
    })
    .finally(() => (creatingOffscreen = null));
  await creatingOffscreen;
}

async function copyText(text, tab) {
  if (api.offscreen) {
    try {
      await ensureOffscreen();
      const r = await api.runtime.sendMessage({ target: 'offscreen', type: 'copy', text });
      if (r?.ok) return true;
    } catch (e) {
      console.warn('Shoutshot: offscreen copy failed', e);
    }
  }
  if (tab?.id != null) {
    try {
      const [r] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: ssPageCopy, args: [text] });
      if (r?.result) return true;
    } catch (e) {
      /* not scriptable */
    }
  }
  return false;
}

// ---------------------------------------------------------------- feedback

async function toast(tab, state) {
  if (tab?.id == null) return false;
  const { showToast } = await getSettings();
  if (!showToast && state.kind !== 'error' && !(state.kind === 'done' && !state.copied)) return true;
  try {
    await api.scripting.executeScript({ target: { tabId: tab.id }, func: ssToast, args: [state] });
    return true;
  } catch (e) {
    return false;
  }
}

async function hideToast(tab) {
  if (tab?.id == null) return;
  try {
    await api.scripting.executeScript({ target: { tabId: tab.id }, func: ssHideToast });
  } catch (e) {
    /* nothing to hide */
  }
}

// Toast in the page if possible, otherwise a system notification.
async function report(tab, state) {
  if (await toast(tab, state)) return;
  if (tab == null) return; // started from the popup, which shows its own result
  api.notifications?.create({
    type: 'basic',
    iconUrl: api.runtime.getURL('icons/icon128.png'),
    title: `Shoutshot: ${state.title}`,
    message: state.text || '',
  });
}

let badgeTimer;
function setBadge(text, color, clearAfter) {
  clearTimeout(badgeTimer);
  api.action.setBadgeText({ text });
  api.action.setBadgeBackgroundColor?.({ color });
  if (clearAfter) badgeTimer = setTimeout(() => api.action.setBadgeText({ text: '' }), clearAfter);
}

// ---------------------------------------------------------------- history

async function addHistory(entry) {
  const { history = [] } = await api.storage.local.get('history');
  history.unshift({ id: crypto.randomUUID(), ...entry });
  await api.storage.local.set({ history: history.slice(0, 200) });
}

async function deleteUpload(id) {
  const { history = [] } = await api.storage.local.get('history');
  const entry = history.find((h) => h.id === id);
  if (!entry) return { ok: false, error: 'Not found' };
  if (entry.host === 'imgur' && entry.deleteHash) {
    await deleteImgur(entry.deleteHash, entry.mode || 'api', await getSettings());
  } else if (entry.host === 'imgbb' && entry.deleteUrl) {
    // ImgBB only allows deleting through its web page.
    await api.tabs.create({ url: entry.deleteUrl });
    return { ok: true, opened: true };
  }
  await api.storage.local.set({ history: history.filter((h) => h.id !== id) });
  return { ok: true };
}

// ---------------------------------------------------------------- checking the host's links

// Before a link goes into [img]…[/img], make sure it's what it claims to be:
// a plain https URL with nothing that could break out of the BBCode/template,
// and one that actually serves an image right now.
const UNSAFE_LINK_CHARS = /[\s[\]<>"'`\\]/;

function checkLinkShape(url, what) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    throw new Error(`The host returned an invalid ${what} (${String(url).slice(0, 80)}).`);
  }
  if (u.protocol !== 'https:' || UNSAFE_LINK_CHARS.test(url)) {
    throw new Error(`The host returned a suspicious ${what}, so Shoutshot didn't use it (${String(url).slice(0, 80)}).`);
  }
}

async function verifyUploadLinks(res) {
  checkLinkShape(res.url, 'image link');
  if (res.viewer) {
    try {
      checkLinkShape(res.viewer, 'page link');
    } catch (e) {
      res.viewer = res.url; // {viewer} falls back to the image link
    }
  }
  await verifyImageServed(res.url);
}

// HEAD request: must be HTTP 200 with an image/* type. Both CDNs send
// "Access-Control-Allow-Origin: *", so this works without cookies in Safari too.
// Imgur redirects deleted images to a placeholder that *is* an image
// (/removed.png), and ImgBB answers missing ones with 404 + image/png, hence the
// extra checks. A brand-new upload can take a moment to appear, so retry once.
async function verifyImageServed(url) {
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500));
    try {
      const r = await fetch(url, { method: 'HEAD', credentials: 'omit', cache: 'no-store' });
      const type = r.headers.get('content-type') || '';
      const removed = /\/removed\.[a-z]+$/i.test(new URL(r.url).pathname);
      if (r.ok && /^image\//i.test(type) && !removed) return;
      problem = removed ? 'it points to a "removed" placeholder' : `HTTP ${r.status}${type ? `, ${type.split(';')[0]}` : ''}`;
    } catch (e) {
      problem = `couldn't check it: ${e.message}`;
    }
  }
  throw new Error(`The uploaded image's link doesn't serve an image (${problem}), so it wasn't copied: ${url}`);
}

// ---------------------------------------------------------------- utils

function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = header.match(/^data:([^;,]+)/)?.[1] || '';
  if (!/;base64/i.test(header)) return new Blob([decodeURIComponent(body)], { type: mime });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

function safeName(s) {
  return String(s)
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/^[.\s_]+|[.\s_]+$/g, '')
    .slice(0, 60);
}

function baseNameFromUrl(url) {
  if (!/^https?:/i.test(url)) return 'image';
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    return safeName(last.replace(/\.[a-z0-9]{2,5}$/i, '')) || 'image';
  } catch (e) {
    return 'image';
  }
}

function screenshotBase(tab) {
  try {
    return 'screenshot_' + safeName(new URL(tab.url).hostname.replace(/^www\./, ''));
  } catch (e) {
    return 'screenshot';
  }
}

function extFor(type) {
  return { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/tiff': 'tif' }[type] || type.split('/')[1] || 'png';
}

function extFromUrl(url) {
  try {
    return new URL(url).pathname.match(/\.(png|jpe?g|gif|webp|bmp)$/i)?.[0].toLowerCase() || '';
  } catch (e) {
    return '';
  }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
