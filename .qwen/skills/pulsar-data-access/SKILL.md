---
name: pulsar-data-access
description: Read and write Salesforce records from a .pulsarapp through Pulsar's local offline database. Use for read/select/soqlquery queries, create/update/delete writes, batch deletes, dates and 18-char IDs, string-typed values, or diagnosing data errors.
---

# Data access in a .pulsarapp

All reads and writes go through the Pulsar JS SDK against the **device-local SQLite copy** of
the org's data (offline-first; changes sync to Salesforce later). Pulsar locally enforces
Salesforce validation rules, triggers, and workflow logic — writes can fail offline for
org-config reasons, surfacing as rejected promises.

Prerequisite: `const pulsar = new Pulsar(); await pulsar.init();` exactly once (see
`create-pulsarapp`). Wrap every call in `try/catch`.

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

## Choosing a read API

| Need | Use |
| --- | --- |
| Exact-match lookup (field = value, ANDed, case-sensitive) | `await pulsar.read('Account', { Name: 'ACME' })` |
| LIKE / OR / ranges / ordering / joins / aggregates | `await pulsar.select('Account', "SELECT Id, Name FROM Account WHERE Name LIKE '%ACME%' ORDER BY Name")` — raw **SQLite** SELECT against the local DB, read-only |
| Display a single `reference` field (e.g. `AccountId` → Account name) | Schema `referenceTo` → target `nameField` → `read(target, { Id })` — field-tested pattern, spelled out in the `pulsar-metadata` skill (`references/field-display-rules.md`); do **not** use `resolveSOQLFieldPath` for this |
| Multi-hop dot-path you can't JOIN (`Owner.Manager.Name`) | `await pulsar.resolveSOQLFieldPath(record, path, sObjectType)` (client-side helper; cache it; returns `null` for missing *and* legitimately-null — ambiguous) |
| Live SOQL against the org (online only) | No SDK wrapper. Send raw: `await pulsar._send({ type: 'soqlquery', data: { query: "SELECT Id FROM Account WHERE Name = 'ACME'" } })` — response follows the Salesforce query REST shape (`records`, `totalSize`, `done`). Queries the org, implying an online round-trip (offline behavior undocumented) — check online status first and always provide an offline fallback. Comment the SDK gap. |

- `read`/`select` results: **every field value is a string** (`'TRUE'`, `'42.0'`, ISO date
  strings). Parse explicitly; never rely on truthiness or `===` against numbers/booleans.
- **Never call `read` without filters.** Empty filters `{}` returns **all** records of the
  type, and field experience (Pulsar Copilot golden rule) is that unfiltered `read` "can
  easily fail" on real data volumes. For browse/list screens use `select` with
  `ORDER BY … LIMIT <n> OFFSET <page*n>` and paginate.
- `select` supports full SQLite — including **JOINs across objects** (tables are named by the
  object API name); see the FSL traversal examples in the `pulsar-sfs-embedded`
  skill (`references/fsl-data-patterns.md`).
- `select`/local data reflect the **last sync plus local edits**, never live server state.

## Writes

```js
const id = await pulsar.create('Account', { Name: 'ACME' },
                               { allowEditOnFailure: 'FALSE' });
await pulsar.update('Account', { Id: id, Phone: '867-5309' });  // fields MUST include Id
await pulsar.delete('Account', id);                             // bare id string
const res = await pulsar.deleteBatch('Account', [id1, id2]);    // never loop delete()
```

Rules:

1. **Sequential writes only** (verbatim wiki: "Create, update, or delete requests must NOT run
   concurrently"). Never call a write without `await` (a bare `persist();` statement is a
   bug); never `Promise.all` over writes. For bulk deletes use one `deleteBatch` call.
   Awaiting inside one event handler is NOT enough — two handlers that each `await` (a status
   tap racing a note-blur) still put two writes in flight. In event-driven UI, route every
   write through one single-flight queue:

   ```js
   let writeChain = Promise.resolve();
   function enqueueWrite(fn) {            // ALL create/update/delete calls go through here
     writeChain = writeChain.then(fn, fn); // keep the chain alive after a failure
     return writeChain;                    // resolves/rejects with THIS write's outcome
   }
   // Callers still catch — the queue serializes, it doesn't swallow errors:
   // statusChip.onclick = () =>
   //   enqueueWrite(() => pulsar.update('WorkOrder', {...})).catch(showSaveError);
   ```

   Disable (or debounce) the triggering control until its enqueued write settles, so rapid
   taps coalesce instead of queueing stale intermediate states.
2. `create` **defaults to popping Pulsar's native record-creation screen over your app when
   the write fails** (`allowEditOnFailure` defaults to `'TRUE'`). Headless/programmatic
   creates must pass `{ allowEditOnFailure: 'FALSE' }`. Args values are the **strings**
   `'TRUE'`/`'FALSE'`, not booleans. `skipLayoutRequiredFieldCheck: 'TRUE'` skips
   layout-required-field checks.
3. `update`/`delete` are single-record. The SDK's `update()` has **no args parameter** — if
   `skipLayoutRequiredFieldCheck` is needed on update, send a raw
   `pulsar._send({ type: 'update', object, data, args })` and comment the SDK gap.
4. `deleteBatch` can partially succeed: check `result.summary.success === 'TRUE'` (string!),
   then inspect `result.results[id].success`/`.error` per record.
5. Writes run local equivalents of server logic: PSL object triggers, validation rules,
   formula recalculation, parent roll-up recalculation (when enabled).

## `updateQuery` — use only with explicit justification

Raw local SQLite UPDATE. It bypasses validation rules, formula recalculation, roll-up
summaries, and can desynchronize data from Salesforce (verbatim wiki: "We strongly recommend
using the standard CRUD Update API (see above) whenever possible" … "Test carefully in a
sandbox environment before using in production"). Additional SDK trap: the wiki-documented
`errors` array (server-side rejections like `ENTITY_IS_LOCKED`) arrives **outside**
`response.data`, and the SDK discards it — via the SDK you only ever see `'success'`. If you
must detect server rejections, use a raw bridge call or check sync diagnostics afterwards.

## Values: dates, IDs, booleans

- **Datetimes**: Salesforce ISO 8601 UTC — `new Date().toISOString()` (`Z` suffix).
  **Dates**: first 10 chars — `new Date().toISOString().substring(0, 10)`.
  Never write locale or non-ISO strings; they silently corrupt data.
- **IDs**: use 18-character IDs in code. Data may contain 15-char IDs; handle both.
- **Booleans in field data**: write checkbox fields as `'TRUE'`/`'FALSE'` strings (matches the
  local storage convention).
- Values that traversed the bridge may be **pre-parsed objects or JSON strings** depending on
  Pulsar version — check `typeof x === 'string'` before `JSON.parse`.

## Error handling

- Every SDK method rejects with `Error` whose `.message` is the native error string — always
  `try/catch`. Never branch on `response.type`; the SDK already did.
- Some failures resolve *normally* and must be checked in the result: batch
  `summary.success === 'FALSE'`, per-record `results[...].error`.
- Sync-related failure diagnostics (numeric Pulsar error codes) come from the `syncinfo`
  endpoint — see the `pulsar-sync` skill.

## References

- `references/crud-and-query-reference.md` — full request/response shapes, SDK signatures with
  quirks, select/SQLite notes, soqlquery details, worked examples.
