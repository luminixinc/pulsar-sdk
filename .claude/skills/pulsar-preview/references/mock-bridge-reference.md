# Mock bridge reference (`assets/pulsar-browser-mock.js`)

Response envelopes and value typing verified against pulsar-sdk `src/pulsar.js` @ commit
`eddf62d` (init lines 15-56, handlers 66-120, `_send` 2514-2526, schema JSON-string
requirement 730-738) and validated by the kit's headless smoke test against the real SDK in
both install modes; verified 2026-07-03. **Dev-only. Never bundle into a .pulsarapp.**

## Install modes

| Mode | How the SDK finds the bridge | Use for |
| --- | --- | --- |
| `embedded-parent` (default) | `preview.html` defines `window.pulsar = { bridge, addSyncDataUpdateHandler, removeSyncDataUpdateHandler, addSyncFinishedHandler, removeSyncFinishedHandler }` on its own window; the app loads in an **iframe** and the SDK's first check (`window.parent?.pulsar?.bridge`) resolves synchronously | Previewing a real app unmodified |
| `native` | Dispatches `WebViewJavascriptBridgeReady` (event carries `.bridge` with a defined `.version`, so the SDK skips legacy `bridge.init()`), **and** patches `document.addEventListener` so late listener registrations still fire (module scripts defer) | Direct-load test pages, interactive tier-1 mockups that want real SDK calls |

- Embedded caveat: the SDK instance gets `this.pulsar` set → apps branching on
  embedded-vs-native context take the **embedded** path in previews.
- Native caveat: never define a `window.pulsar` global in this mode — at top level
  `window.parent === window`, so the SDK would misdetect embedded context (the mock warns).

## Public surface (`window.__pulsarMock`)

| Member | Behavior |
| --- | --- |
| `install({ fixtures, mode })` | Once, before the app loads. Merges fixtures over defaults |
| `fixtures` | The live merged fixtures — mutate from the console, then re-trigger renders |
| `state` | `{ online, syncRunning, autosync, installed, mode }` |
| `setOnline(bool)` | Flips what `getOnlineStatus`/`getNetworkStatus` report |
| `startSync({ ticks=5, tickMs=300, passes=1, success=true })` | Full sync simulation |
| `fireSyncUpdate(pass, pct)` | One `syncDataUpdate` — payload values are **STRINGS** (`{ syncpass: '1', syncpercent: '40.00' }`) |
| `finishSync(success=true)` | `syncDataFinished` — `success` is a **REAL boolean** (the platform's documented exception) |
| `fireHandler(name, payload)` | Any registered event, e.g. `fireHandler('invalidateLayout', {})` |
| `log` | Ring buffer (last 200) of `{ type, request, response }` — powers `preview.html?debug=1` |
| `bridge` | The raw mock bridge (rarely needed) |
| `placeholderSvg(label, w, h)` | Labeled SVG data-URI, used for all mock images |

## Request dispatch order

1. `fixtures.responses[type]` — full per-app override (`fn(request) → data`; `throw 'msg'`
   for an error envelope).
2. `fixtures.queryOverrides` — for `select` / `queryContent` / `read` only; ordered
   `[{ match: substring|RegExp, rows | fn(request), type? }]`. The match probe is the
   whitespace-normalized SQL (`select`) / filter (`queryContent`) — but for `read` it is the
   **JSON-serialized filters object** (e.g. `{"Id":"001…"}`), and one override list is shared
   across all three types: set `type: 'select' | 'read' | 'queryContent'` on an entry to
   scope it and avoid cross-type matches.
3. Built-in handler table (below).
4. **Loud failure**: `console.warn('[pulsar-mock] unhandled request type …')` + error
   envelope → the SDK promise rejects, exactly like a missing capability on device.

## Built-in coverage (v1)

| Types | Behavior |
| --- | --- |
| `read` | Exact-match filter over `fixtures.objects[obj].rows` (info-logs unfiltered reads — kit rule) |
| `create` / `update` / `delete` / `deletebatch` | Mutate rows in memory; `create` resolves a synthesized 18-char Id (schema `keyPrefix` or built-in prefix map); `deletebatch` returns `{ summary: { success: 'TRUE'\|'FALSE' }, results: { [Id]: … } }` |
| `select` | SQL subset interpreter (below); outside the subset → warn + error |
| `updateQuery`, `soqlquery` | Always error with an explicit message — the mock never pretends raw writes / online SOQL worked; override via `fixtures.responses` if you must |
| `getSObjectSchema` | Fixture schema or synthesized from rows (all-string fields, `nameField` on `Name`); returned as a **JSON string** — the SDK throws on objects (src/pulsar.js:730-738) |
| `getLayout` / `getLayoutSections` / `getLayoutFields` / `getCompactLayoutFields` | Fixture keyed `Obj` or `Obj:RecordTypeId`, else synthesized (two-column single section; string flags `'TRUE'`/`'FALSE'`, `placeHolder` casing per `getLayoutFields`) |
| `getPicklist` / `getUnfilteredPicklist` | `fixtures.picklists['Obj.Field']` → `{ itemIds, itemLabels }`; error when absent (note: `fieldName` is a TOP-LEVEL request key and the mock reads it there) |
| `listviewInfo` / `listviewmetadata` | From `fixtures.listviews`; metadata returns `{ fields, labels, filters, whereClause, orderBy, listId }` |
| `userInfo`, `userPhoto`, `getPlatform`, `getPlatformFeatures`, `getDevServerEnabled`, `getSetting`, `getSettingAttachment`, `getCustomLabels`, `getLocation`, `logMessage` | Fixture-backed with sane defaults (`getSetting` → `{ Exists: 'FALSE' }` when unknown; labels fall back to the label name; all values strings) |
| `getOnlineStatus` / `setOnlineStatus` / `getNetworkStatus` / `syncstatus` / `syncinfo` / `syncdata` / `interruptsync` / `getAutosyncStatus` / `setAutosyncStatus` | Backed by `state`; correct per-endpoint typing (`'TRUE'`/`'FALSE'` strings; `interruptsync` → real boolean `success`; `syncdata` triggers `startSync()` unless `fixtures.autoSimulateSync === false`) |
| `queryContent` / `readSFFile` / `createSFFile*` (single + batch) / `deleteSFFile` / `getContentUrl` / `chattergetfeed` / `chatterpostfeed` | `fixtures.files`-backed; placeholder SVG data-URIs for missing images; batch responses use string `summary.success` + numeric-STRING-keyed `results`; `queryContent` matches fixture files by the **quoted** 15/18-char Ids in the filter (a filter with no quoted Ids returns all fixture files) |
| `saveAs` | No real PDF — resolves `{ FilePath: '/mock/documents/<filename>' }` (shape the SDK requires) |
| `scanBarcode` | `{ barcode: fixtures.barcode }` — the SDK unwraps `data['barcode']` to a string |
| `cameraPhoto` / `cameraPhotoPicker` / `filePicker` | Placeholder photo metadata (correct PascalCase keys) |
| `viewObject`, `showCreate`, `viewRelated`, `viewList`, `lookupObject`, `executeQuickAction`, `displayUrl`, `mail`, `setLeavePageMessage`, `exit` | Ack-log no-ops with shape-correct resolves (`lookupObject` auto-selects the first fixture row and returns an ARRAY; `showCreate` resolves `createResult: 'FALSE'`) |
| FSL types (`getfsltemplate`, `executeFSLFlow`, `createservicereportfromfilepath`), `getFieldSets`, anything unknown | Error envelope via the default path — add `fixtures.responses` entries when needed |

## The SQL subset (what `select` understands)

```
SELECT <projection> FROM <Table> [alias]
  [WHERE <predicate> [AND <predicate>]...]
  [ORDER BY field [COLLATE NOCASE] [ASC|DESC][, ...]]
  [LIMIT n [OFFSET m] | LIMIT m, n]
```

- **projection**: `*` · `alias.*` · `field[, field…]` (with optional `AS out`) ·
  `COUNT(*)` / `COUNT(field)` `[AS alias]` — counts resolve as **strings** (`'10'`).
- **predicates** (AND only, no parentheses, no OR): `f = 'x'` · `f != 'x'` / `f <> 'x'` ·
  `f IN ('a','b')` · `f LIKE 'p' [ESCAPE 'e']` (ASCII case-insensitive, `%`/`_` wildcards) ·
  `f IS [NOT] NULL` (null/empty-string both count as NULL).
- **ordering**: text compare; numeric when both sides are numeric strings; `COLLATE NOCASE`
  lowercases; multi-key supported.
- **Not supported** (→ warn + error): JOIN, OR, parentheses, GROUP BY, subselects, SQL
  functions, arithmetic. Use `fixtures.queryOverrides` — one entry per warned query.
- Divergences from real SQLite (accepted, documented): no type affinity, no BINARY-collation
  subtleties, NULL ordering position not emulated. The interpreter targets *plausible
  rendering*, not SQL correctness.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| App shows its "must run inside Pulsar" fallback | Mock installed after the app loaded — `preview.html` must install before setting the iframe `src`; in native mode load the mock `<script>` before the app module |
| `no fixture rows for object "X"` rejection | The query/read targets an object with no fixtures — add `fixtures.objects.X` (do NOT add a queryOverride: overrides win over built-ins forever, so later `create()`d rows would never appear) |
| `mock: unsupported SQL` rejection | Query outside the subset — copy the SQL from the warning into a `queryOverrides` entry |
| `unhandled request type "x"` | Add `fixtures.responses.x = (req) => …` |
| Dependent picklists unfiltered | The mock's `getPicklist` ignores controller values (v1) — supply the filtered list you want via `fixtures.responses.getPicklist` if it matters to the preview |
| App took the embedded code path unexpectedly | That's the embedded-parent caveat — use `mode: 'native'` with a direct-load page instead |
| ES-module import fails opening preview.html from disk | Serve over HTTP: `node <skill-dir>/scripts/serve.mjs <app-root>` |

## Future work (documented, not promised)

Native-flavor preview without an iframe; SFS/FSL request types; mutation persistence
(localStorage); dependent-picklist filtering; a scripted-interaction DSL for multi-step
screenshots.
