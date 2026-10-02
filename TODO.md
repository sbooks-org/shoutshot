# Shoutshot: to do

## 1. Test the iPhone shortcut (biggest open item)

`ios/make-shortcut.py` builds and signs `ios/Shoutshot to Imgur.shortcut`. Both are **not committed yet**; commit them once the shortcut works on a real iPhone. It can't be tested in the iOS Simulator, which has no Shortcuts app and no Back Tap.

What it should do: take a screenshot (not saved to Photos), upload it to Imgur as a guest, copy `[img]link[/img]` to the clipboard, and show a "BBCode copied" notification. If the upload fails, it should show Imgur's error instead.

- [ ] AirDrop the `.shortcut` file to the iPhone and add it. Does it import without "unknown action" errors?
- [ ] Settings → Accessibility → Touch → Back Tap → Double Tap → **Shoutshot to Imgur**.
- [ ] Double-tap the back in some app: allow the connection to `api.imgur.com` and allow notifications.
- [ ] Paste: is the BBCode there, and does the link open the screenshot?
- [ ] Check the error path, e.g. in Airplane Mode: is the notification readable?
- [ ] Optional: try it from the Action Button (iPhone 15 Pro and later).
- [ ] Fix anything that fails in `ios/make-shortcut.py`. The parts most likely to need adjusting, since they were written without a device to test on:
  - the Take Screenshot action identifier;
  - the If/Otherwise condition format;
  - the JSON body built from the Base64-encoded image.
- [ ] Add an iPhone section to `README.md`, then commit `ios/`.

Possible follow-ups: an ImgBB version; also accepting images from the Share sheet (existing photos and screenshots).

## 2. Confirm uploads into a logged-in account

Uploading as a guest has been tested. Uploading into a logged-in account hasn't: there was no account to test with.

- [ ] Brave: log in to imgur.com and imgbb.com, then press **Test** in Shoutshot's settings. Does it say "Uploading into your … account"? If it says "guest", check whether Brave Shields is blocking the sites' cookies.
- [ ] Safari: same check. ImgBB is expected to go in as a guest in Safari, but Imgur is unknown.

## 3. Safari after the rename

- [ ] Safari → Settings → Extensions: enable **Shoutshot**, and set **Edit Websites… → Other Websites** to **Allow**.
- [ ] Quit and reopen Safari: Shoutshot should still be listed and enabled with **Allow unsigned extensions** off. There should be no leftover QuickImgur entry.
- [ ] Try right-click → Upload to Imgur and Upload to ImgBB, and an area screenshot.
- [ ] Safari shows ⚠️ warnings next to the three keyboard shortcuts (⌥⇧U, ⌥⇧S, ⌥⇧V). Find out why, perhaps a clash with another shortcut, and pick different defaults if needed.

## 4. Other browsers

- [ ] Edge hasn't been tested at all. Check that it loads, uploads work, and the wording of the "ask where to save" instructions in Settings matches Edge's actual option.
- [ ] Optional: plain Chrome, and an older Chrome such as 116 on High Sierra, which the README claims works.

## 5. Housekeeping

- [ ] Delete the old `quickimgur-v1` branch. It still has the old name in its history:
  `git branch -D quickimgur-v1`
- [ ] Rename the project folder `~/quickimgur` to `~/shoutshot` (not during a Claude session that's working in it). Brave will then see it as a new extension: load it again with **Load unpacked**. Its settings and history start fresh.
- [ ] Optional: clear Xcode-beta leftovers now that the released Xcode is installed: `~/Library/Developer/Xcode/DerivedData` and `~/Library/Developer/CoreSimulator`.

## Known limitations (decided, not to do)

- **Save As dialog in Chrome/Brave/Edge** when "Save a copy" is on and the browser asks where to save each file. Extensions can't override that setting. The settings page explains how to turn it off.
  - Rejected alternatives: a folder picker, which Brave disables without a flag, and a native helper program, which needs an extra install step.
- **Sharing the Safari app** with other Macs needs a paid Apple Developer account. Without one, each person builds it themselves with their own bundle-ID variant (see README).
- **The "like the website" uploads aren't official APIs.** If Imgur or ImgBB change their upload pages, switch that host to **With my API key** and update `extension/background.js`.
