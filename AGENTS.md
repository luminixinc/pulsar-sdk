# Pulsar for Salesforce — custom .pulsarapp development

You are building or modifying a custom web app for **Pulsar for Salesforce**
(<https://luminixinc.com/pulsar/>), Luminix's offline-first mobile/desktop app. Pulsar syncs
Salesforce data into a **local SQLite database on the device**. Custom web apps — plain
HTML/CSS/JS bundled as a `.pulsarapp` zip — run inside Pulsar's WebView and read/write that
local database through the Pulsar JS Bridge ("JSAPI"), fully offline. Changes sync to
Salesforce when the device next syncs.

## Rule zero: always use the Pulsar JS SDK

Use the official **Pulsar JS SDK** (`pulsar.js` from
<https://github.com/luminixinc/pulsar-sdk>) for **every** JSAPI interaction.

- **Never** hand-roll `bridge.send(...)` calls, register `WebViewJavascriptBridgeReady`
  listeners yourself, or grab `window.parent.pulsar.bridge` directly — `pulsar.init()` handles
  bridge acquisition for both native and embedded (Salesforce Field Service) contexts.
- **Never copy JavaScript examples from the Pulsar wiki verbatim.** Many wiki pages predate the
  SDK and show raw-bridge callback style. Wiki pages are authoritative for request/response
  *shapes*, platform behavior, settings, and PSL — but the SDK is the authority for how to
  *call* the JSAPI from JavaScript.
- In the SDK repo, trust `src/pulsar.js` (JSDoc + implementation) over `docs/pulsar-sdk.md`
  when they disagree; several doc examples are known-broken (wrong `mail()` signature,
  `displayUrl({url})` instead of `{fullUrl}`, `scanBarcode` shown resolving to
  `{ text, format }` when it actually resolves to the bare barcode string, and the "Public
  Method Categories" intro list has ~a dozen wrong signatures).
- Rare JSAPI requests have **no SDK wrapper yet** (notably `soqlquery` — online SOQL against
  the org — and `readDocument` for the legacy Document object). For those only, send the
  documented request envelope through the initialized instance: `pulsar._send({ type, object,
  data })`, and leave a comment noting the SDK gap.

## Bootstrapping the SDK (the only correct pattern)

```html
<script type="module">
  import { Pulsar } from './myapp/pulsar.js'; // vendor pulsar.js under an app-unique dir (bundle rules below)

  (async () => {
    try {
      const pulsar = new Pulsar();
      await pulsar.init();           // once per page load; rejects after 5s if no bridge
      // ... your app starts here
    } catch (err) {
      console.error('Pulsar init failed:', err);
      // Show a friendly error — you are probably running outside Pulsar.
    }
  })();
</script>
```

- Call `init()` **exactly once** per page load and `await` it before any other SDK call.
  Double-init rejects (and, due to a known SDK bug, still re-runs detection side effects).
- Every SDK method returns a promise that **rejects with `Error`** on JSAPI errors — wrap all
  calls in `try/catch`. Some "failures" resolve normally and must be checked in the result
  (batch `summary.success === 'FALSE'`, `getSetting` → `Exists: 'FALSE'`).

## Non-negotiable platform constraints

A condensed version of these ships *inside every skill*, so the rules survive when a skill is
installed on its own and this file is nowhere in sight.

1. **Everything is a string.** All values in the local SQLite database — and most JSAPI
   results — are strings: booleans are `'TRUE'`/`'FALSE'`, numbers are `'42.0'`, and
   `getLocation()` returns string coordinates. Compare and convert explicitly; never trust a
   value to be a real boolean/number unless the SDK converts it (`getOnlineStatus()` →
   boolean).
2. **Never run create/update/delete concurrently — and never call a write without `await`.**
   A bare `save();` statement is a bug (`await save();`). No `Promise.all` over writes, no
   fire-and-forget loops. Awaiting inside one event handler is NOT enough: two handlers that
   each `await` still race each other — route every UI-triggered write through one shared
   single-flight queue (canonical snippet in `pulsar-data-access`). For bulk work use the
   batch endpoints instead: `deleteBatch`, `createSFFileBatch`,
   `createSFFileFromFilePathBatch`, `deleteSFFile(documentIdList)`.
3. **Use 18-character Salesforce IDs** in code, not 15-character IDs.
4. **Dates must be valid Salesforce formats**: `YYYY-MM-DD` for date fields,
   `YYYY-MM-DDThh:mm:ss.sssZ` (UTC) for datetimes. SQLite stores them as strings; format
   before writing.
5. **Don't assume the org is synced.** On startup, check sync state / register sync handlers
   (`registerHandler('syncDataFinished', ...)` **before** `syncData()` — `syncData` resolves
   when the request is *accepted*, not when sync completes). Block your UI during an active
   sync, especially for home-screen apps.
6. **JSON values may arrive pre-parsed or as strings** depending on Pulsar version. Check
   `typeof` before `JSON.parse` (the SDK's layout/schema helpers already do this for you).
7. **Avoid default form submits.** A `<button type="submit">` reloads the page inside Pulsar,
   re-running your init and killing in-flight async work. Use `type="button"` +
   `preventDefault()`.
8. **`updateQuery` is a loaded gun**: raw local SQL UPDATE that bypasses Salesforce validation
   rules, formula recalculation, and roll-up summaries — and the changes **still sync to
   Salesforce** (offline edits push on the next sync; online they push immediately, with
   server errors not reflected in the response), so unvalidated writes reach the org. Prefer
   `update()`; if you must use `updateQuery`, test in a sandbox first.
9. **Record-type picklist defaults don't exist offline** unless the field is on the layout —
   Pulsar only downloads schema- and layout-level defaults. Don't rely on record-type defaults
   for offline-created records.
10. **Offline is the default assumption.** Reads hit the local DB; `soqlquery` and some file
    downloads need connectivity. Check `getOnlineStatus()` / `getNetworkStatus()` before
    online-only operations and provide offline fallbacks.
11. **Never call `read()` without filters.** Unfiltered reads return the whole table and "can
    easily fail" on real data volumes (field-tested rule). For browse/list screens use
    `select()` with `ORDER BY … LIMIT/OFFSET` pagination.
12. **Never assume fields exist on an SObject.** Check `getSObjectSchema()` (or ask the user)
    before referencing custom fields or relationships — org schemas differ.

## .pulsarapp bundle rules

- The bundle is a zip named `<AppName>.pulsarapp` with **`index.html` at the zip root** (Pulsar
  renames it to `<DocumentId>.html` at runtime). `cd dist && zip -r ../MyApp.pulsarapp .`
- Bundle **everything** the app needs (including `pulsar.js`, CSS, fonts, images): no CDN or
  network dependencies at runtime. Use **relative paths** for all resources.
- **File paths must be unique across all of your org's .pulsarapp bundles** (except
  `index.html`) — Pulsar unzips every app into one shared directory per user. **Never create
  generic directories (`js/`, `css/`, `lib/`, `assets/`) or root-level assets**; put
  everything under one app-unique directory (verify before zipping — `create-pulsarapp` has
  the check), or move shared libs into the global `resources/` mechanism
  (`pulsar.docs.enableHTMLResources` setting).
- Windows imposes severe total-path-length limits — keep file names and folder nesting short.
- Deploy by uploading the `.pulsarapp` to a Salesforce Content Library folder (permissions
  control access); users get it on next sync. During development use the Local Development
  Server instead of re-uploading (see the `pulsar-dev-debug` skill).

## Skills

Task-specific instructions live in Agent Skills. The canonical home is `.agents/skills/` — read
natively by Codex CLI and Gemini CLI, and the folder `npx skills add` installs from. Claude Code
reads only `.claude/skills/` and Qwen Code only `.qwen/skills/`, so both hold a byte-identical
copy of every skill folder.

| Skill | Use when |
| --- | --- |
| `create-pulsarapp` | Scaffolding a new app; bundling/deploying; wiring launch points (home tab, record button, home-page replacement, deep link) |
| `pulsar-data-access` | Reading/writing records: CRUD, local SQL `select`, online `soqlquery`, dates, IDs, error handling |
| `pulsar-sync` | Sync orchestration, sync progress UX, online/offline status, autosync |
| `pulsar-files` | Salesforce Files, camera/file pickers, images, content library, Chatter, PDF generation (`saveAs`) |
| `pulsar-metadata` | Schema/layout/picklist/listview/fieldset metadata → building dynamic, org-configurable UI |
| `pulsar-native-ui` | Opening native Pulsar screens, barcode scan, mail composer, location, custom labels/i18n, exit/leave-page guards, external URLs, deep links |
| `pulsar-dev-debug` | Local dev server setup, on-device debugging, logs, automated testing |
| `pulsar-sfs-embedded` | Salesforce Field Service (embedded iframe) apps, FSL flows, service reports |
| `pulsar-psl` | Pulsar Settings Language: triggers, custom buttons, sync triggers, special value variables |
| `pulsar-preview` | Visual previews of UI work: static mockups, the real app in a desktop browser via the bundled mock Pulsar bridge, headless screenshots; propose-first workflow for non-trivial UI changes |

Visual previews are **opt-in per project**: the `pulsar-preview` skill asks once and records
the choice (`visual-previews: mockups | dev-server | none`) under a `## Project preferences`
section at the end of this file — respect it. Developers iterating on the local development
server usually skip previews.
