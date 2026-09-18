# Local development server — per-platform setup reference

Source: wiki "Local Development Server" (whole page) and "Best Practices for Developers"
(Debugging section), verified 2026-07-03. Text marked *verbatim* is quoted from the wiki.

## What it is / availability

Run and debug your HTML/JS from an HTTP server on your development machine instead of
uploading a new `.pulsarapp` to Salesforce and resyncing on every change. Available "Beginning
with Pulsar 3.8 for Android and Windows" (Best Practices for Developers); iOS is documented on
the current wiki page without a stated minimum version. Windows support for arbitrary
`ipaddr:port` (beyond `127.0.0.1:3002`) is new in Pulsar 12.

## Salesforce org setup

| Pulsar Setting | Value |
| --- | --- |
| `pulsar.developer.enableDevelopmentServer` | `TRUE` |
| `pulsar.developer.users{.DocId}` | "List of developer usernames (e.g., you@yourorg), separated by comma, semicolon, or newlines for a specific document. Note that ***{.DocId}*** can be empty, in which case this is an org-global list of developers (for all documents!)" *(verbatim)* |

*Verbatim:* "We recommend that you only have these setup for your testing orgs, and never for
your production orgs!"

Note `pulsar.developer.users` also gates Windows Edge DevTools remote debugging (see
`debugging-and-testing.md`) — another reason to keep it out of production orgs.

## Serving your code

- Any HTTP server that serves a directory works; the wiki suggests
  [http-party/http-server](https://github.com/http-party/http-server). React/Angular apps can
  use their frameworks' built-in dev servers.
- *Verbatim:* "You **must** use relative paths for all resources you wish to serve from your
  development server-- this includes stylesheets, javascript files, images, and anything
  referenced in your code that does not exist inside of Pulsar. For example, use this:
  `<script src='static/js/mycode.js' />` and **not** this:
  `<script src='/static/js/mycode.js' />`" — this matches the relative-paths rule the bundle
  itself must follow (see `create-pulsarapp`), so code that works on the dev server also works
  when bundled.
- Remember Android's fixed port: serve on **3002** (e.g. `npx http-server -p 3002`) if Android
  is one of your targets.

## Android setup

1. Run your HTTP server on **localhost (127.0.0.1) port 3002** of your development machine —
   this address is fixed; the in-app *ipaddr:port* field cannot change it for Android.
2. On the device: enable Developer Options and ADB debugging; connect over USB or WiFi ADB.
3. Set up reverse port forwarding: `adb reverse tcp:3002 tcp:3002`.
4. **The ADB client/server can get disconnected and the reverse rule purged.** Recreate the
   rule after every re/connection to the device; double-check with `adb reverse --list`.
   Symptom of a purged rule: Pulsar loads the org-synced copy (or nothing) instead of your
   local code.

Walkthrough video: <https://youtu.be/jePx-S2N7o8>.

## Windows setup

1. Run your HTTP server on your development machine.
2. Pulsar 12+: connect to any `ipaddr:port` — including a server elsewhere on your WiFi; you
   are not restricted to `127.0.0.1:3002` as on Android. Type the *ipaddr:port* into the
   configuration block on Pulsar's Settings page.
3. If connecting to **localhost** fails, enable loopback exemption (once per Pulsar
   installation, per machine), from PowerShell or CMD:

   ```
   CheckNetIsolation.exe LoopbackExempt -a -n="E3D1A000.PulsarforSalesforce_ta6n8xy84gcpg"
   ```

   Verify Pulsar appears in the exemption list: `CheckNetIsolation.exe LoopbackExempt -s`

Walkthrough video: <https://youtu.be/mZNP5tE1LjQ>.

## iOS setup

1. Run your HTTP server on your development machine; the device must be able to reach it over
   the network.
2. Configure the *ipaddr:port* in the configuration block on Pulsar's Settings page (on iOS
   this is mandatory — there is no default address).
3. *Verbatim:* "NOTE that if your development machine is a *Mac with Apple silicon* (not
   Intel) you can download Pulsar from the App Store and run and do all your testing there" —
   the closest thing to desktop-speed iteration for the iOS build.

## Pulsar app setup (all platforms)

1. Log in to Pulsar and **make sure your organization is fully synced at least once, including
   your Content Library documents** — the dev server swaps content for a document that must
   already exist on the device.
2. From the Settings page, advanced section, toggle the development server on and change the
   *ipaddr:port* as needed.
3. *Verbatim:* "If you do not see the toggle, then it is likely that your org is not
   configured correctly for development mode (for your specific username) – you might need to
   *Refresh Settings* if you just added your account to the developers list."
4. *Verbatim:* "Note that once the development server toggle is on, it is *sticky
   per-session*. You will need to re-toggle it if you logout of the session and/or restart the
   Pulsar app." — forgetting this is the classic trap: everything appears to work, but you are
   silently testing the org-synced copy, and none of your local edits show up.

## Development flow

1. In Pulsar, find the specific HTML/`.pulsarapp` document in your Content Library and
   download/open it.
   - Development server OFF → Pulsar loads the document/bundle synced from your org.
   - Development server ON → Pulsar loads from the configured *ipaddr:port* (on Android always
     `127.0.0.1:3002` forwarded over ADB).
2. After changing HTML/JS served by your dev server, **hit the page refresh button in Pulsar**
   to reload. (Page reload re-runs your `pulsar.init()` bootstrap from scratch — that is
   expected here, unlike the accidental reloads caused by `<button type="submit">`.)

## Detecting dev mode from code

```js
// Optional docId: ask about a specific document's dev-server state.
try {
  const enabled = await pulsar.getDevServerEnabled(); // 'TRUE' | 'FALSE' — STRING
  if (enabled === 'TRUE') showDevBanner();
} catch (err) {
  console.error('getDevServerEnabled failed:', err.message);
}
```

- `getDevServerEnabled(docId?)` — src/pulsar.js:1692-1698 (commit `eddf62d`). Returns the
  string `'TRUE'`/`'FALSE'`, never a boolean.
- SDK quirk: this method passes its parameter through the request's top-level `args` key
  (`args: { docId }`, `data: {}`) — a shape otherwise used only by `create()`'s optional
  `args` — irrelevant when calling the SDK, but don't imitate the shape for other endpoints.
- Use it to gate debug panels, verbose logging, and mock shortcuts so they can never activate
  for real users (in production orgs the dev settings shouldn't exist at all).

## Troubleshooting checklist

| Symptom | Fix |
| --- | --- |
| No dev-server toggle in Settings → advanced | Org not configured for *your username*: check `pulsar.developer.enableDevelopmentServer` = `TRUE` and your username in `pulsar.developer.users{.DocId}`; then **Refresh Settings** |
| Local edits don't appear (Android) | `adb reverse` rule purged — rerun `adb reverse tcp:3002 tcp:3002`, confirm with `adb reverse --list` |
| Local edits don't appear (any platform) | Toggle is sticky **per-session** — re-enable after logout/app restart; also confirm you hit Pulsar's page refresh |
| Windows can't reach `127.0.0.1` server | Loopback exemption missing — run the `CheckNetIsolation.exe LoopbackExempt -a` command above |
| Some resources 404 only via dev server | Absolute paths (`/static/...`) — every resource reference must be relative |
| App loads but is the org version | Development server toggle OFF, or (Android) port forwarding down |
