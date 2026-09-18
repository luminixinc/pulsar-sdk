---
name: create-pulsarapp
description: Scaffold, bundle, and deploy a Pulsar for Salesforce web app (.pulsarapp). Use when starting a new Pulsar app, setting up pulsar.js and the init pattern, zipping and deploying the bundle to Salesforce, or wiring launch points (tab, record button, deep link).
---

# Create a .pulsarapp

A `.pulsarapp` is a zip of plain HTML/CSS/JS that runs inside Pulsar's WebView and talks to the
device-local Salesforce data through the Pulsar JS SDK. No build step is required (any framework
that emits static files works); assume no network at runtime — the device may be offline at any
moment, so the bundle must not depend on CDNs or any network-loaded resource.

<!-- BEGIN pulsar-non-negotiables (generated block — edit the canonical skill, not this copy) -->

## Always — Pulsar platform rules

These apply to every `.pulsarapp`, in every skill. They are not style preferences; each one
corresponds to a way real apps break on device.

1. **Use the Pulsar JS SDK for every JSAPI call** (`pulsar.js` from
   <https://github.com/luminixinc/pulsar-sdk>). Never hand-roll `bridge.send(...)`, never listen for
   `WebViewJavascriptBridgeReady`, never touch `window.parent.pulsar.bridge`. Wiki JS examples
   predate the SDK — trust them for request/response *shapes*, never for calling style.
2. **`await pulsar.init()` exactly once per page load**, before any other SDK call, and wrap every
   call in `try/catch` — SDK methods reject with `Error`. Some failures resolve *normally* and must
   be checked in the result (batch `summary.success === 'FALSE'`, `getSetting` → `Exists: 'FALSE'`).
3. **Everything is a string.** Local-database values and most JSAPI results are strings: booleans
   are `'TRUE'`/`'FALSE'`, numbers are `'42.0'`, coordinates are strings. Compare and convert
   explicitly; never rely on truthiness or `===` against a number or boolean.
4. **Never run create/update/delete concurrently, and never call a write without `await`.** A bare
   `save();` is a bug. No `Promise.all` over writes. Awaiting inside one event handler is not
   enough — route every UI-triggered write through one shared single-flight queue, and use the
   batch endpoints (`deleteBatch`, `createSFFileBatch`, …) for bulk work.
5. **18-character Salesforce IDs** in code. Dates are `YYYY-MM-DD`; datetimes are
   `YYYY-MM-DDThh:mm:ss.sssZ` (UTC). Format before writing — SQLite stores them as strings.
6. **Offline is the default.** Reads hit the local database. Check `getOnlineStatus()` before
   anything online-only and provide a fallback. Don't assume the org is synced at startup. Never
   call `read()` without filters — it returns the whole table; paginate with `select()` +
   `ORDER BY … LIMIT/OFFSET`.
7. **Never assume a field exists.** Org schemas differ — check `getSObjectSchema()` or ask the user
   before referencing a custom field or relationship. JSON values may arrive pre-parsed or as
   strings depending on Pulsar version: check `typeof` before `JSON.parse`.
8. **Bundle rules.** Ship everything inside the zip (no CDN, no network at runtime), use relative
   paths, put `index.html` at the zip root, and namespace every other file under one app-unique
   directory — never `js/`, `css/`, `lib/`, `assets/`, or root-level assets, because all of a
   user's bundles unzip into one shared directory. Avoid `<button type="submit">`: a default form
   submit reloads the page inside Pulsar and re-runs your init.

<!-- END pulsar-non-negotiables -->

## Scaffold

```
myapp/
├── index.html      # REQUIRED at bundle root — Pulsar's single entry point
├── myapp/          # namespace ALL other assets under an app-unique directory (see rule 3)
│   ├── app.js
│   ├── pulsar.js   # the SDK, vendored into the bundle
│   └── styles.css
```

1. Get the SDK: download `src/pulsar.js` from <https://github.com/luminixinc/pulsar-sdk> (clone
   or fetch the raw file) and vendor it into the bundle. It must ship inside the zip — there is
   no CDN at runtime.
2. `index.html` loads everything with **relative paths** (`myapp/app.js`, never
   `/myapp/app.js`). Note Pulsar renames `index.html` to `<DocumentId>.html` on device, so
   never link to `index.html` by name.
3. **Namespace every asset path — never create generic directories (`js/`, `css/`, `lib/`,
   `assets/`) or root-level assets.** All of a user's `.pulsarapp` bundles unzip into ONE
   shared directory per login user; only `index.html` is exempt (renamed). Two apps both
   bundling `js/lib.js` (or `lib/pulsar.js` at different SDK versions) silently overwrite each
   other — the wiki calls the same-version case "a ticking timebomb". Everything except
   `index.html` lives under one app-unique directory, or use Global Shared Resources
   (`references/bundling-and-deploy.md`). The Bundle step below verifies this.
4. Keep file names short and nesting shallow — Windows "imposes severe restrictions on total
   file path length" (verbatim wiki warning).
5. Styling: SLDS is fine — include it inside the bundle (root level), never from a CDN.

## Initialization (the only correct pattern)

```html
<script type="module">
  import { Pulsar } from './myapp/pulsar.js';

  (async () => {
    try {
      const pulsar = new Pulsar();
      await pulsar.init();   // handles native + embedded (SFS) detection; 5s timeout
      window.myApp = start(pulsar);   // start() = your app's entry function
    } catch (err) {
      console.error('Pulsar init failed:', err);
      document.body.textContent =
        'This app must run inside Pulsar for Salesforce.';
    }
  })();
</script>
```

- Call `init()` **exactly once**. A second call rejects with "Pulsar is already initialized."
  (and, due to a known SDK bug — missing `return` after the reject — still re-runs detection
  side effects).
- Never listen for `WebViewJavascriptBridgeReady`, never call `bridge.init()`, never touch
  `window.parent.pulsar.bridge` yourself — `init()` does all of it, including the pre-12.0
  legacy `bridge.init()` call.
- Every SDK method called before `init()` completes fails with "Pulsar bridge not
  initialized. Call init() first." (promise methods reject; `registerHandler`/
  `deregisterHandler` throw synchronously) — gate app startup on the awaited init.
- If launched from a record button, the record Id arrives as a URL query parameter:
  `new URLSearchParams(window.location.search).get('ref_id')` (do not copy the wiki's ES5
  `getQueryVariable` loop).
- Don't assume the org is synced at startup — check for an ongoing sync and block your UI
  while one runs (see the `pulsar-sync` skill). This is mandatory for home-page-replacement
  apps, which can launch mid-sync.
- Avoid `<button type="submit">` / default form submission: it reloads the page inside Pulsar,
  re-running init and killing in-flight async work. Use `type="button"` handlers.

## Demo / mock-data mode (legitimate — structure it, don't ban it)

Demo and pre-sales apps rightly use hard-coded mock data and can fall back to seed data when
launched outside Pulsar. Mock data changes **what feeds the UI — never the platform rules**:
writes stay awaited and serialized, the bundle stays namespaced and offline, form submits stay
banned. Structure it as one data interface with two implementations, chosen once at boot:

```js
let data;
try {
  const pulsar = new Pulsar();
  await pulsar.init();
  data = liveData(pulsar);   // every SDK call lives inside this implementation
} catch {
  data = mockData();         // seeded constants — label the UI as preview/demo
}
```

Keep SDK calls out of the mock path entirely (to exercise real bridge behavior in a desktop
browser, use the `pulsar-preview` skill's mock bridge instead), and make mock mode visibly
labeled so a demo device that failed `init()` is never mistaken for live data.

## Bundle

Verify namespacing first, then zip. Every file except `./index.html` must live under the
app-unique directory (rule 3) — the check prints violators:

```bash
cd myapp
find . -type f ! -path './index.html' ! -path './myapp/*'   # MUST print nothing — fix any hit
zip -r ../MyApp.pulsarapp .
```

Two hard requirements: the extension is `.pulsarapp`, and `index.html` sits at the **zip root**
(zip the directory *contents*, not the directory). To inspect an existing bundle, rename it to
`.zip` and unzip.

## Deploy

1. Upload the `.pulsarapp` to a Salesforce **Content Library** folder; folder permissions
   control which users get the app.
2. If the app won't load, check the Salesforce File Detail page shows File Extension exactly
   `pulsarapp`.
3. Users receive new/updated bundles on their next sync.
4. Wire up how users launch it — home-page tab, record-detail button, full home-page
   replacement, or a `launchdocument` deep link. Exact setting keys, values, and icon specs
   are in `references/launch-points.md`.

During development, don't re-upload on every change — use the local development server instead
(`pulsar-dev-debug` skill).

## Iterating

- Development loop: local dev server + Pulsar's page-refresh button (`pulsar-dev-debug` skill).
- Sibling skills cover the rest: the `pulsar-data-access`, `pulsar-sync`, `pulsar-files`,
  `pulsar-metadata`, `pulsar-native-ui`, `pulsar-psl`, `pulsar-sfs-embedded`,
  `pulsar-dev-debug` and `pulsar-preview` skills. Each one restates the Always rules above,
  so those hold whether or not the others are installed.

## References

- `references/bundling-and-deploy.md` — full bundling rules, multi-app namespacing detail,
  Global Shared Resources, Windows path-length notes, troubleshooting.
- `references/launch-points.md` — every launch surface with its Pulsar Setting keys, value
  formats, and icon requirements (verbatim from the wiki).
