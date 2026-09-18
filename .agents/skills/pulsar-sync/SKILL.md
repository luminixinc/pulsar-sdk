---
name: pulsar-sync
description: Run data syncs and build sync-aware UX in a .pulsarapp. Use to start a sync (standard, mini, single-object, push), track syncDataUpdate/syncDataFinished, check syncstatus or diagnose syncinfo errors, toggle autosync, or handle online/offline state.
---

# Sync & online status in a .pulsarapp

Pulsar syncs the device-local database with Salesforce. `pulsar.syncData()` resolves when the
sync request is **accepted**, never when the sync finishes — completion arrives only through
handlers. Prerequisite: `await pulsar.init()` once, `try/catch` everywhere (Always rules above).

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

## The only correct sync workflow

```js
// 1. Register handlers FIRST — one handler per event name.
pulsar.registerHandler('syncDataUpdate', ({ syncpass, syncpercent }) => {
  // Both STRINGS. syncpercent is per-PASS: it can reach '100.00' more than
  // once — never treat 100% as "done".
  showProgress(Number(syncpercent), Number(syncpass));
});
pulsar.registerHandler('syncDataFinished', ({ success }) => {   // success: REAL boolean
  pulsar.deregisterHandler('syncDataUpdate');
  pulsar.deregisterHandler('syncDataFinished');
  success ? onSyncSuccess() : onSyncFailure();  // NEVER call syncData() in here
});
// 2. Then start the sync; keep the UI blocked until syncDataFinished fires.
try {
  await pulsar.syncData();   // resolves when the request is ACCEPTED — sync still running
} catch (err) { console.error('Sync request rejected:', err.message); }
```

Verbatim (wiki "Data Sync API", verified 2026-07-03): "Since syncdata returns immediately after
initiating sync, **handlers must be set up before calling** syncdata." — "**Avoid issuing a sync
request from within a sync handler, as this can create an infinite loop.**" — "Only one handler
can be assigned per handler name."

- `registerHandler`/`deregisterHandler` auto-select the embedded-safe (SFS/FSL) delegation for
  these two events (src/pulsar.js:66-120) — never call `bridge.addHandler`,
  `bridge.registerHandler`, or `pulsar.addSync*Handler` yourself.
- Two more sync events exist (`syncDataStarted`, `syncDataCoreFinished`) but have **no
  embedded-safe path** (the SDK silently routes them onto the shared parent bridge) — never use
  them in embedded (SFS) apps (see `pulsar-sfs-embedded`); `syncDataCoreFinished` ≠ done
  (documents/images may still sync). Deregister handlers when your view unmounts.

## Choosing a sync variant

| Goal | Call |
| --- | --- |
| Standard / catch-up sync (default) | `await pulsar.syncData()` |
| Upload local changes only, download nothing | `await pulsar.syncData({ pushChangesSyncEnabled: true })` |
| One record + 1 level of parents/children | `await pulsar.syncData({ singleObjectSyncEnabled: true, rootObjectId: id, ... })` |
| Subset of object types (mini sync) | **Not reachable via the SDK** — raw request below |
| Pick Salesforce API | add `useComposite: true` **or** `useCompositeGraph: true` |

- syncData option flags are **real JS booleans** (`true`) — unlike CRUD args' `'TRUE'`/`'FALSE'`
  strings. Verbatim constraints the SDK does **not** validate: "singleObjectSyncEnabled cannot be
  used with pushChangesSyncEnabled." and "useComposite cannot be used with useCompositeGraph."
- `syncData()` whitelists exactly: `singleObjectSyncEnabled`, `rootObjectId`,
  `parentIdFieldList`, `childRelationshipList`, `pushChangesSyncEnabled`, `useComposite`,
  `useCompositeGraph` (src/pulsar.js:824-839). **Anything else is silently dropped** — a typo'd
  key degrades to a full standard sync with no warning; `miniSyncEnabled`, `miniSyncObjectList`,
  and `childStartDatetime` are stripped too:

```js
// SDK gap: syncData() strips miniSyncEnabled/miniSyncObjectList — raw request required.
await pulsar._send({
  type: 'syncdata',
  data: { miniSyncEnabled: true, miniSyncObjectList: ['Account', 'Contact'] },
});
```

Mini sync auto-expands (object types of pending offline changes are added to the list) and keeps
its own per-object sync window — only a standard sync moves the standard sync windows.

## Single object sync specifics

- Defaults are greedy: omitting `parentIdFieldList`/`childRelationshipList` pulls **all** parents
  one level up and **all** children one level down (of already-synced types). Pass `['NONE']` to
  disable either direction. Only one relationship level is traversed.
- Custom child relationships — verbatim: "SFDC does not show the complete name - you will need to
  add the suffix '\_\_r' (two underscores and an 'r') to the child relationship name shown."
- `childStartDatetime` (raw request only) is **destructive** — it removes local data, not just
  fetches less — verbatim: "any existing child records older than the childStartDatetime are
  also cleared from the device."

## Is a sync running? What happened last sync?

Neither endpoint has an SDK wrapper — use the raw escape hatch and note the gap:

```js
// SDK gap: no wrappers for 'syncstatus' / 'syncinfo'.
const { syncrunning } = await pulsar._send({ type: 'syncstatus', data: {} }); // 'TRUE'|'FALSE' STRING
const info = await pulsar._send({ type: 'syncinfo', data: {} });              // ~30 fields, ALL strings
```

- **Every** syncinfo value is a string: flags are `'YES'`/`'NO'`, counts/durations are numeric
  strings, and `'1970-01-01T00:00:00.000Z'` is the "never happened" sentinel on the date fields —
  don't render the epoch as a real sync time (speeds `'0.0'` can also mean never synced).
- After a failed sync, `info.lastfailedsyncerrorcode` maps to the Pulsar error-code table
  (`references/sync-api-reference.md`). Notable: 5/9 = retry; 137 = client timeout (retry on a
  good network); 138/139 = implicit/explicit interrupt; 157/158 = low disk; 244/245 = complete
  resync / local DB reset needed; 253 = Pulsar version past the maximum allowed.

Interrupting: `await pulsar.interruptSync()` returns a **real boolean** — `false` means *no
active sync to interrupt*, not an error. An explicit interrupt surfaces later as error code 139
(documented for the interrupt-sync button; an `interruptSync()` call presumably surfaces the
same code — not documented; 138 = implicit, e.g. app backgrounded).

## Online mode vs network connectivity — not the same thing

Verbatim (wiki "Pulsar Online Status API", verified 2026-07-03): "Online Status refers to
Pulsar's current 'online' status, not the device's network status." — and getOnlineStatus "will
also return "FALSE" if there are pending changes that need to be pushed to the server", so a
fully connected device legitimately reports offline mode.

| Question | Use | Returns |
| --- | --- | --- |
| Is Pulsar in online mode? | `await pulsar.getOnlineStatus()` | **real boolean** (SDK converts) |
| Why offline? Can I sync now? | raw `pulsar.bridge.send` (below) | `args` block, all strings |
| Device connectivity (as Pulsar sees it) | `await pulsar.getNetworkStatus()` | `{ isConnected: 'TRUE'\|'FALSE' STRING, connectionType }` |
| Switch online/offline mode | `await pulsar.setOnlineStatus(bool)` — throws on non-boolean | **real boolean** = the RESULTING state (a successful `setOnlineStatus(false)` resolves `false` — not a failure) |
| Plain browser-level check | `window.navigator.onLine` | boolean |

- `getNetworkStatus`: `connectionType` casing is disputed (wiki `'Wifi'/'Cellular'/'Unknown'` vs
  SDK docs `'wifi'/'cellular'/'none'`) — **compare case-insensitively**. Verbatim caveat: "If
  wifi is off, cell data is enabled on the device, but the Pulsar App itself is not enabled for
  cell data, the return 'isConnected' value will show "FALSE"."
- The diagnostics (`canSync`, `hasConnectivity`, `numUnpushedChanges`, `onlineEnabled`,
  `offlineWithSync`, `autosyncEnabled`, `syncUserInteractionNeeded`) live in the response's
  `args` block, which the SDK's `_send` **discards** — the one place a raw bridge call is needed:

```js
// SDK gap: getOnlineStatus() discards the response's args diagnostics block.
pulsar.bridge.send({ type: 'getOnlineStatus', data: {} }, (res) => {
  const { canSync, numUnpushedChanges } = res.args;   // every value a STRING
});
```

## Autosync

`await pulsar.getAutosyncStatus()` / `await pulsar.setAutosyncStatus(true)` both resolve to the
**string** `'TRUE'`/`'FALSE'` — compare `=== 'TRUE'`. Footgun (src/pulsar.js:1652): only `true`
or `'TRUE'` enable; **anything else — including `'true'` lowercase or `1` — silently coerces to
`'FALSE'` and disables autosync**. Pass a real boolean; the resolved post-attempt status may
differ from what you requested — check it.

## Startup: don't assume the org is synced

Every app — and **especially** home-page-replacement apps, which can launch mid-sync — should
check for an ongoing sync at startup (wiki: "We highly recommend that your app blocks your own
UI when sync is running"): run the `syncstatus` check above; if `syncrunning === 'TRUE'`,
register `syncDataFinished`, block the UI, load data only after `success` (`create-pulsarapp`
covers home-app launch behavior; `pulsar-psl` covers admin-configured sync triggers).

## References

- `references/sync-api-reference.md` — full request/response shapes for syncdata (all variants),
  syncstatus, syncinfo (full field table), interruptsync, autosync, sync-event payloads, and the
  condensed Pulsar error-code table.
- `references/online-status-reference.md` — getOnlineStatus args table, setOnlineStatus and
  getNetworkStatus quirks, choosing the right check per situation.
