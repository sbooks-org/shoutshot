# Shoutshot

Shoutshot is a browser extension for Chrome, Brave, Edge and Safari (Mac). Right-click any image, or take a screenshot, and it uploads the picture to **Imgur** or **ImgBB** and puts a ready-to-paste BBCode link on your clipboard:

```
[img]https://i.imgur.com/AbCd123.png[/img]
```

It's meant for personal use and sharing with family and friends. It's installed by hand ("sideloaded"), not from an extension store, and needs no accounts or API keys.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installing](#installing)
  - [Chrome, Brave or Edge](#chrome-brave-or-edge)
  - [Safari (Mac)](#safari-mac)
- [Using Shoutshot](#using-shoutshot)
- [Settings](#settings)
- [How uploading works](#how-uploading-works)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Building and development](#building-and-development)
- [License](#license)

## Features

- **Right-click any image → Upload to Imgur / Upload to ImgBB.**
- **Screenshots:** drag a box around part of the page, or capture everything visible in the tab.
- **Anything else on your screen:** take a Mac screenshot to the clipboard (**⌘⇧⌃4**), then paste it into the Shoutshot popup with **⌘V**. You can also pick an image file.
- **BBCode on your clipboard** automatically, plus a small status card on the page. The clipboard format can also be a linked image, a plain link, Markdown or HTML.
- **No API keys needed.** Uploads go through the same way they do on imgur.com and imgbb.com. If you're logged in to one of those sites in your browser, uploads go into that account; otherwise they're anonymous guest uploads. Using your own API key is optional.
- **A local copy** of every upload in `Downloads/Shoutshot/` (Chrome, Brave and Edge only).
- **Upload history** with Copy and Delete buttons. Imgur guest uploads can be deleted too.
- **Keyboard shortcuts** for screenshots and the popup.

## Requirements

| Browser | Needs |
|---|---|
| Chrome, Brave, Edge | A current version, or at least Chrome 109 or the equivalent. Any operating system the browser runs on, including older Macs: Chrome 116, the last version for macOS 10.13 High Sierra, works. |
| Safari | macOS 12 Monterey or later, with Safari 15.4 or later. The app is universal, running natively on Apple Silicon and Intel Macs. |

Older Macs can't run the Safari version. Safari only supports this kind of extension from Safari 14 on, Shoutshot needs 15.4, and current Xcode can't build for anything older than macOS 12. Chrome or Brave work on those Macs instead.

## Installing

### Chrome, Brave or Edge

1. Get the `extension` folder: either this repository, or unzip `Shoutshot-chrome.zip` somewhere permanent, since the browser loads it from that spot.
2. Open `chrome://extensions` (Brave: `brave://extensions`, Edge: `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the `extension` folder.
5. Optional: pin the Shoutshot icon from the puzzle-piece menu.

The settings page opens on first install. Press **Test** next to each host to check uploads work.

Chrome may remind you on startup that a "developer mode" extension is installed. That's normal for sideloaded extensions.

To update, replace the folder's contents and click the ↻ reload button on Shoutshot's card in the extensions page.

### Safari (Mac)

Safari extensions have to be wrapped in a small Mac app, which you build with Xcode on your own Mac. The Xcode project is in `safari/` and uses the same `extension/` folder as the other browsers.

**One-time setup:**

1. Install Xcode, open it, and sign in with your Apple ID under **Xcode → Settings → Accounts**. Any Apple ID works and it's free; you don't need a paid developer account.
2. Open `safari/Shoutshot/Shoutshot.xcodeproj`. For both targets, **Shoutshot** and **Shoutshot Extension**, set **Signing & Capabilities → Team** to your **(Personal Team)**, then save and quit Xcode.

The app's bundle ID is `org.sbooks.shoutshot`, and the extension's is `org.sbooks.shoutshot.Extension`. Apple only lets one team use a given bundle ID. If Xcode says the ID isn't available, which happens for anyone other than the original developer, give both targets a variant such as `org.sbooks.shoutshot.yourname` and `org.sbooks.shoutshot.yourname.Extension`. Put the same extension ID in `extensionBundleIdentifier` in `safari/Shoutshot/Shoutshot/ViewController.swift`.

**Build and install:**

```sh
./scripts/build-safari.sh
```

This builds a universal app (Apple Silicon and Intel, macOS 12 or later), installs it as `/Applications/Shoutshot.app`, and opens it once so Safari notices it. Then in Safari:

1. **Settings → Extensions:** check **Shoutshot**.
2. Select it, click **Edit Websites…**, and set **Other Websites** to **Allow**.

Run the same command again after changing anything in `extension/`, then quit and reopen Safari.

Differences in Safari:

- **No local copy.** Safari doesn't let extensions save files.
- **Clipboard.** If Safari blocks the automatic copy, the status card shows the BBCode with a **Copy** button.
- **ImgBB may upload as a guest** even when you're logged in to imgbb.com. See [Troubleshooting](#troubleshooting).

Safari can only load a team-signed app on the Mac that built it, so friends and family who use Safari need to build it themselves. Sharing a ready-made app for Safari requires a paid Apple Developer account.

## Using Shoutshot

| To… | Do this |
|---|---|
| Upload an image on a web page | Right-click it → **Shoutshot** → **Upload to Imgur** or **Upload to ImgBB** |
| Screenshot part of the page | Right-click the page → **Screenshot an area → …**, then drag a box. A plain click captures the whole visible page, and **Esc** cancels |
| Screenshot the whole visible page | Right-click → **Screenshot visible page → …** |
| Upload anything else on your screen | Press **⌘⇧⌃4** (Mac) to put a screenshot on the clipboard, open the Shoutshot popup, and press **⌘V** |
| Upload a file | Popup → **Choose file…** |
| Copy an earlier link again | Popup → **Recent**, or **Settings → History** → **Copy** |

The popup's **Imgur / ImgBB** switch picks the default host, which the keyboard shortcuts use.

**Keyboard shortcuts** (on a Mac, Alt is ⌥ Option):

| Shortcut | Does |
|---|---|
| `Alt+Shift+S` | Screenshot an area → upload to the default host |
| `Alt+Shift+V` | Screenshot the visible page → upload to the default host |
| `Alt+Shift+U` | Open the Shoutshot popup |

Change them at `chrome://extensions/shortcuts`, or in Safari under **Settings → Extensions → Shoutshot**.

## Settings

Open them from the popup (**Settings & all uploads**) or from the extensions page.

| Setting | What it does |
|---|---|
| **Accounts** (per host) | **Like the website** (the default) uploads the way the site itself does: into your account if you're logged in there in this browser, otherwise as a guest. **With my API key** uses the official API with your own key. **Test** does a tiny real upload, deletes it again, and tells you which account it landed in. |
| **Default host** | Which host the keyboard shortcuts upload to. |
| **What goes on the clipboard** | `[img]{url}[/img]` by default. `{url}` is the direct image link and `{viewer}` is the image's page on Imgur or ImgBB. There are presets for a linked image, a plain link, Markdown and HTML. |
| **Save a copy of every upload** | Saves into `Downloads/<folder>/`. If you get a Save As dialog for every upload, see [Troubleshooting](#troubleshooting). |
| **ImgBB: auto-delete uploads after** | Never, or anything from 5 minutes to 6 months. |
| **Show a status card** | The small card in the corner of the page. Errors always show. |
| **History** | Your recent uploads, with Copy and Delete. **Clear list** only forgets the links; the images stay online. |

Settings are stored separately in each browser.

### Pre-filled settings for builds you share

`extension/defaults.js` can pre-fill any setting for everyone you give a build to, including API keys if you want shared builds to use **With my API key**. Anyone with the build can read that file, so don't publish a build with keys in it.

## How uploading works

Shoutshot sends the same requests the sites' own upload pages send:

- **Imgur:** one upload to `api.imgur.com/3/upload`, using the client ID imgur.com's website uses. If Imgur changes that ID, Shoutshot reads the new one from imgur.com automatically.
- **ImgBB:** it reads the upload token from imgbb.com, then uploads to `imgbb.com/json`. If the token can't be read, it uploads as a guest, which ImgBB accepts.

These routes aren't official APIs, so a site redesign could break them. If that happens, switch that host to **With my API key**:

- **ImgBB key:** log in at <https://api.imgbb.com/> and click **Get API key**. Uploads go into the account that owns the key.
- **Imgur Client ID:** register at <https://api.imgur.com/oauth2/addclient> and choose **OAuth 2 authorization without a callback URL**. Uploads are anonymous.

If the website route fails and an ImgBB API key is saved, Shoutshot uses the key automatically.

Images in formats the hosts reject (AVIF, HEIC, ICO and so on) are converted to PNG first. SVG images can't be uploaded.

**Link check.** Before anything goes on your clipboard, Shoutshot checks the link the host returned. It must be a plain `https` link with no characters that could break out of the `[img]…[/img]` tag, and a quick request to it (a `HEAD` request) must answer with an actual image. Deleted images, missing images and non-image pages are refused, and the status card shows why.

## Privacy

- Images go only to the host you pick (Imgur or ImgBB), and only when you ask Shoutshot to upload them.
- Your settings and upload history stay in your browser's extension storage. Nothing is sent anywhere else, and there's no analytics.
- Uploads are public to anyone who has the link. Guest uploads aren't tied to any account.
- **Web pages can't tell what Shoutshot is doing.** The status card and the area selector are sealed off from the page's scripts (closed shadow roots, with no Shoutshot names or ids), so a page can't read your link or see that it came from Shoutshot. A page can only notice that an unnamed box appeared while it's on screen. When you right-click an image, Shoutshot downloads it from the extension's background, not from inside the page. Copies to the clipboard happen outside the page in Chrome, Brave and Edge.
- Imgur isn't available in the UK; Imgur blocks UK visitors. Use ImgBB there.

## Troubleshooting

**ImgBB doesn't work in Safari, or always uploads as a guest.** Safari limits what extensions can do on sites you haven't visited yourself. Open <https://imgbb.com> in a normal Safari tab once, then try again. Safari may still not let the extension use your imgbb.com login, so uploads go in as a guest. They still work, and **Test** shows which you're getting.

**A Save As dialog pops up for every upload (Chrome, Brave, Edge).** That's the browser's own setting, and extensions can't override it. Turn it off under **Settings → Downloads**: *Ask where to save each file before downloading* in Brave and Chrome, or the option that asks where to save each file in Edge. Shoutshot's settings have an **Open download settings** button that goes straight there. This changes it for every download in that browser. If you'd rather keep the browser asking, untick **Save a copy of every upload** instead.

**Shoutshot appears more than once in Safari's extension list.** Every copy of `Shoutshot.app` on your Mac shows up as a separate entry. Keep only `/Applications/Shoutshot.app`: delete other copies, then quit and reopen Safari. `scripts/build-safari.sh` removes its own build copy for this reason.

**Shoutshot disappears from Safari after a restart.** The app was built without a team signature. Do the one-time setup under [Safari (Mac)](#safari-mac) and rebuild. A build made with `ADHOC=1` only shows while **Settings → Developer → Allow unsigned extensions** is on, and Safari turns that off every time it quits.

**macOS asks to let Terminal (or another app) "change apps on this computer".** That's the build script replacing `/Applications/Shoutshot.app`. Allow it, or install the app by hand from a `NO_INSTALL=1` build.

**The status card says the upload failed.** It shows the host's actual message, such as a rate limit or a file that's too large. For ImgBB it also says whether imgbb.com couldn't be reached, sent an unexpected reply, or rejected the upload.

**Nothing happens on some pages.** Browsers don't let extensions run on their own internal pages, such as settings or extension stores. Errors there appear as a system notification instead of the status card (Chrome, Brave and Edge only).

## Building and development

| Command | Does |
|---|---|
| `./scripts/package-chrome.sh` | Writes `dist/Shoutshot-chrome.zip` (the extension plus LICENSE) to share with Chrome, Brave or Edge users |
| `./scripts/build-safari.sh` | Builds the Safari app, installs it to /Applications, and writes `dist/Shoutshot-safari.zip`. `NO_INSTALL=1` skips the install; `ADHOC=1` signs without a team |
| `python3 scripts/make-icons.py` | Regenerates the icons in `extension/icons/`, with no dependencies |

There's no build step for the extension itself; it's plain JavaScript. After editing `extension/`, reload Shoutshot in `chrome://extensions`, or re-run `build-safari.sh` for Safari.

### Project layout

| Path | What |
|---|---|
| `extension/manifest.json` | Manifest V3 for Chrome, Brave, Edge and Safari |
| `extension/background.js` | Background worker: menus, shortcuts, fetching images, screenshots and cropping, uploading, saving, clipboard, history |
| `extension/inject.js` | Functions run inside web pages: status card, area selector, fetching and copying from within the page |
| `extension/popup.*` | Toolbar popup |
| `extension/options.*` | Settings page and history |
| `extension/history-ui.js` | History list shared by the popup and settings page |
| `extension/shared.js` | Setting defaults, clipboard templates, storage helpers |
| `extension/defaults.js` | Optional pre-filled settings for builds you share |
| `extension/offscreen.*` | Hidden page Chrome uses to write to the clipboard |
| `extension/ui.css` | Shared styles for the popup and settings page, light and dark |
| `safari/Shoutshot/` | Xcode project for the Safari app; it uses `extension/` directly |
| `scripts/` | Build, packaging and icon scripts |

## License

Shoutshot is released under the [MIT No Attribution (MIT-0)](LICENSE) license. You may use, copy, modify and share it freely, without having to keep the copyright notice.

Copyright (C) 2026 Simplebooks Foundation
Copyright (C) 2026 Josh Rodd

Shoutshot isn't affiliated with Imgur or ImgBB.
