# Well Photo Log

A field tool for photographing paper well logs and filing them straight into
Google Drive, one folder per well. This is a static-hosted rebuild of an
earlier Google Apps Script version (kept in `reference/` for comparison).

The Apps Script sandbox blocks `getUserMedia`, so its only in-page camera
option was `<input capture>`, which hands off to the Android camera app —
and Android kills the backgrounded Chrome tab roughly half the time, losing
the photo. This version runs on ordinary static hosting so a live
`getUserMedia` viewfinder can run inside the page instead. Nothing
backgrounds, nothing gets killed.

**Visual parity is the point.** This app looks and behaves identically to
the Apps Script version — same CSS, same screens, same copy — apart from the
camera screen, which is new. See `reference/Index.html` and
`reference/Code.gs` for the original.

## Architecture

| Layer | Choice |
|---|---|
| Hosting | GitHub Pages or Cloudflare Pages — static only |
| Auth | Google Identity Services, token-client flow, in-browser |
| Storage | Google Drive API v3, called directly from the page |
| Framework | None — vanilla JS, single page, no build step |
| Well list | `wells.json`, edited by hand |

There is no server and no Apps Script. The page talks to the Drive API
directly using a short-lived OAuth access token held in memory.

## Files

- `index.html` — markup + the CSS ported verbatim from the reference app,
  plus the new camera chrome
- `config.js` — the OAuth client ID (see setup below) and Drive constants
- `auth.js` — Google Identity Services token-client flow, silent refresh,
  401-retry wrapper
- `drive.js` — Drive API v3 calls: folder lookup/create, batched recursive
  status read, upload, folder link. Naming/sanitizing conventions match
  `reference/Code.gs` exactly so existing photos keep counting
- `resize.js` — shared resize pipeline (long edge capped at 2000px, JPEG
  quality 0.82) used by every capture source
- `camera.js` — the in-page live camera (new)
- `storage.js` — `localStorage` for "last well viewed", IndexedDB for
  pending review captures (survives a reload mid-review)
- `app.js` — the screens, ported from `reference/Index.html`
- `wells.json` — the well list and the three photo slots
- `manifest.json`, `sw.js`, `icons/` — PWA shell (installable, offline app
  shell; uploads still need connectivity)

## Human setup steps

These sit behind your own Google login, so an agent cannot do them for you.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create a new project.
2. **APIs & Services → Library** — enable the **Google Drive API**.
3. **Google Auth Platform → Branding** — set an app name, support email, and
   developer contact.
4. **Audience** — set publishing status to **Testing**, and add your own
   Gmail address as a test user. (Testing mode skips Google's verification
   review entirely. The seven-day refresh-token expiry that applies to
   testing mode doesn't matter here — this app uses the browser token flow,
   which issues one-hour access tokens and never uses refresh tokens.)
5. **Data access** — add the scope `https://www.googleapis.com/auth/drive`.
   (The narrower `drive.file` scope only sees files the app itself created —
   your existing `Well Photos` folder tree from the Apps Script version would
   read as empty. Full `drive` is required to see it.)
6. **Credentials → Create OAuth client ID → Web application**
   - Authorized JavaScript origins: your Pages origin, e.g.
     `https://<user>.github.io` — origin only, no path, no trailing slash.
   - No redirect URI is needed; this uses the token-client flow.
7. Copy the client ID into `config.js` (`GOOGLE_CLIENT_ID`). It's not a
   secret and is safe to commit.

## Deploying

Any static host works. For GitHub Pages: enable Pages for this repo
(Settings → Pages → deploy from a branch), point it at the branch/folder
containing these files, then set that Pages URL as the authorized JavaScript
origin in step 6 above.

For local testing, serve the folder over HTTP (not `file://`, since
`fetch('./wells.json')` and the service worker both need a real origin):

```
python3 -m http.server 8080
```

then open `http://localhost:8080`. Note `getUserMedia` requires a secure
context — `localhost` is exempt from the HTTPS requirement, but any other
host needs HTTPS.

## Editing the well list

Edit `wells.json` by hand. `slots[].id` values are baked into filenames
already sitting in Drive — don't rename them. Add wells by copying a row
under `wells`; `id` just needs to be unique.

## Out of scope

- Any redesign or restyling
- Any framework or build tooling beyond what static hosting needs
- Multi-user support, sharing, or auth beyond the single owner
- Offline uploading
- Editing the well list in-app
