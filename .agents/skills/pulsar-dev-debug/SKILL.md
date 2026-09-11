---
name: pulsar-dev-debug
description: Set up the Pulsar local development server, debug .pulsarapp JavaScript on device, capture logs, and automate testing. Use when iterating on a Pulsar web app without re-uploading bundles (org dev settings, Android adb reverse, Windows loopback exemption, iOS ipaddr:port, the sticky in-app toggle), when debugging on device (Android console-to-logcat, Windows Edge DevTools and log.txt, pulsar.logMessage), when detecting dev mode or platform at runtime (getDevServerEnabled, getPlatform), or when setting up Appium automated tests against Pulsar.
---

# Develop, debug, and test a .pulsarapp

The local development server serves your app into Pulsar's WebView straight from your machine,
replacing the slow upload-to-Content-Library-and-resync loop (available since Pulsar 3.8 for
Android/Windows). Debugging is platform-specific — **no debugger can attach on Android or
iOS** — so plan a log-based strategy early. Sources: wiki "Local Development Server" + "Best
Practices for Developers", verified 2026-07-03; SDK line numbers refer to `src/pulsar.js`
(commit `eddf62d`).

Prerequisite: `const pulsar = new Pulsar(); await pulsar.init();` exactly once (see
`create-pulsarapp`); wrap every SDK call in `try/catch` (AGENTS.md global rules).

## The dev loop

1. One-time org setup (below) — **testing orgs only**. 2. Serve your app locally. 3. One-time
device plumbing. 4. Toggle the dev server inside Pulsar. 5. Edit code → hit Pulsar's **page
refresh** button to reload. No re-zip, no re-upload.

## Org setup (one-time, testing orgs only)

| Pulsar Setting | Value |
| --- | --- |
| `pulsar.developer.enableDevelopmentServer` | `TRUE` |
| `pulsar.developer.users{.DocId}` | Developer usernames (e.g. `you@yourorg`), separated by comma, semicolon, or newline. `{.DocId}` scopes the list to one document; leave it off for an org-global list ("for all documents!") |

Verbatim wiki warning: "We recommend that you only have these setup for your testing orgs, and
never for your production orgs!"

## Serve your code

Any static HTTP server works — e.g. `npx http-server -p 3002` — and React/Angular framework dev
servers work as-is. Verbatim wiki rule:

> You **must** use relative paths for all resources you wish to serve from your development
> server-- this includes stylesheets, javascript files, images, and anything referenced in your
> code that does not exist inside of Pulsar. For example, use this:
> `<script src='static/js/mycode.js' />` and **not** this: `<script src='/static/js/mycode.js' />`

## Connect the device (per platform)

| Platform | Server address | One-time plumbing |
| --- | --- | --- |
| Android | **Locked to `127.0.0.1:3002`** | Developer Options + ADB debugging on the device, then `adb reverse tcp:3002 tcp:3002`. The reverse rule is **purged when ADB re/connects** — recreate it; verify with `adb reverse --list` |
| Windows (Pulsar 12+) | Any `ipaddr:port`, WiFi OK (pre-12 was locked to `127.0.0.1:3002` like Android) | For localhost only: `CheckNetIsolation.exe LoopbackExempt -a -n="E3D1A000.PulsarforSalesforce_ta6n8xy84gcpg"` once per Pulsar install; verify with `CheckNetIsolation.exe LoopbackExempt -s` |
| iOS | `ipaddr:port` entered on the Settings page | Device must reach your machine over the network. Apple-silicon Macs can run the App Store Pulsar app and test there |

## Enable inside Pulsar — the sticky toggle

- First, log in and make sure the org is **fully synced at least once, including Content
  Library documents** — Pulsar opens the synced document, then swaps in your dev-server code.
- Settings → advanced → toggle the development server on; set *ipaddr:port* as needed.
- Toggle not visible? The org isn't configured for **your specific username** — after adding
  yourself to `pulsar.developer.users`, use **Refresh Settings**.
- The toggle is **sticky per-session only**: re-toggle after every logout or app restart. If
  you forget, Pulsar silently loads the org-synced copy and you debug stale code.
- Open the document from the Content Library; toggle ON loads from *ipaddr:port*, toggle OFF
  loads the org version.

## Detect dev mode / platform at runtime

```js
try {
  const isDev = (await pulsar.getDevServerEnabled()) === 'TRUE'; // 'TRUE'/'FALSE' STRING
  const platform = await pulsar.getPlatform();  // e.g. 'windows' | 'android' | 'ios' (SDK JSDoc example list)
  if (isDev) enableDebugPanel(platform);
} catch (err) {
  console.error('Dev-mode detection failed:', err.message);
}
```

`getDevServerEnabled(docId?)` (src/pulsar.js:1692-1698) returns a **string** — compare against
`'TRUE'`, never truthiness. Branch platform-specific behavior on `getPlatform()`
(src/pulsar.js:1706-1711), not user-agent sniffing. Gate debug UI on dev mode so it never
ships to users.

## Debugging (platform decision table)

| Platform | Attach a debugger? | What you get instead |
| --- | --- | --- |
| Android | **No** — Google restricts WebViews in released apps | Console → logcat: enable the `webview-log-js-console-messages` flag in Android WebView DevTools, then read with `adb logcat` |
| iOS | **No** — Apple restricts WebViews in released apps; the wiki documents no console fallback | `pulsar.logMessage()` + your own dev-mode-gated on-screen debug UI |
| Windows | **Yes** (Pulsar 11.0.0.0+) — full Edge DevTools remote debugging, gated by `pulsar.developer.users` | Also a plain log file: `C:\Users\<You>\AppData\Local\Packages\E3D1A000.PulsarforSalesforce_ta6n8xy84gcpg\LocalState\Library\Application Support\log.txt` |

The Windows DevTools setup (Developer Mode + Device Portal + Remote Tools + `edge://inspect`)
is step-by-step in `references/debugging-and-testing.md`. Windows runs your code in
**WebView2**, whose version varies with the OS — same reference has the version check for when
a web feature misbehaves on one machine only.

## Logging into the Pulsar log

```js
try {
  await pulsar.logMessage(`Order ${orderId} failed local validation`, 'error');
} catch (err) {
  console.error('logMessage failed:', err.message);
}
```

- `logMessage(message, level = 'info')` (src/pulsar.js:1763-1775): `message` must be a
  non-empty string (the SDK throws otherwise); levels are `'info'`, `'warn'`, `'error'`,
  `'debug'` (appears only when debug logging is enabled in Pulsar — prefer `'info'`/`'error'`),
  `'Verbose'` (capital V per both SDK JSDoc and wiki). Entries are prefixed `JSAPI:` in
  the Pulsar log. Never invent a `'logging'` or `'log'` request type.
- The `pulsar.logs.email.cc` Pulsar Setting adds extra email recipients for logs sent by users.
- To auto-ship sync-failure logs to Salesforce (no device access needed), use an After Sync
  Trigger whose `SFCreate` sets `AttachLogFile=TRUE` — full pattern in the `pulsar-psl` skill.

## Testing

- "We encourage the use of a Salesforce Sandbox to test your code in the Pulsar environment" —
  never develop straight against production.
- Automated E2E: Luminix recommends **Appium** (one code base drives Android, iOS, and
  Windows). Exact bundle/package/activity identifiers per platform:
  `references/debugging-and-testing.md`.

## Small on-device polish rules (from "Best Practices for Developers")

- iOS scrolling: wherever you use `overflow: scroll;`, also set
  `-webkit-overflow-scrolling: touch;` ("This will ensure that your scrolling performance is
  smooth").
- Hide Pulsar's chrome around your page: `pulsar.docs.hideDoneButton` = `TRUE` (Done button);
  `pulsar.docs.hideNavigation` or per-document `pulsar.docs.<docID>.hideNavigation` = `TRUE`
  (Back/Forward/Refresh). Both default `FALSE`; iOS/Windows/Android. Caution: the Refresh
  button hideNavigation removes appears to be the same one the dev loop relies on — leave
  navigation visible while developing.

## References

- `references/dev-server-setup.md` — verbatim per-platform walkthroughs (org settings, Android
  ADB, Windows loopback, iOS, in-app toggle), development flow, troubleshooting checklist.
- `references/debugging-and-testing.md` — Android logcat steps, Windows Edge DevTools
  walkthrough + log paths, `logMessage` details, getting logs off devices, WebView2 version
  check, Appium identifiers, hide-chrome setting tables.
