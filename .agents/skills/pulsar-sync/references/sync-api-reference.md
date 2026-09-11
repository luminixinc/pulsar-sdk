# Data Sync API reference (SDK signatures + JSAPI shapes)

Sources: pulsar-sdk `src/pulsar.js` (commit `eddf62d`, the authority for signatures/behavior)
and wiki "Data Sync API" / "Pulsar Platform - JS Bridge API" / "Pulsar Error Code Information"
(authority for request/response shapes and platform behavior). Verified 2026-07-03. Line numbers
refer to `src/pulsar.js`.

## Boolean conventions in this domain (memorize — they are inconsistent by design)

| Value | Type |
| --- | --- |
| `syncData` option flags (`miniSyncEnabled`, `singleObjectSyncEnabled`, `pushChangesSyncEnabled`, `useComposite`, `useCompositeGraph`) | **real** JS `true` |
| `syncDataFinished` payload `success` | **real** boolean |
| `interruptSync()` resolved value | **real** boolean |
| `syncstatus` → `syncrunning` | STRING `'TRUE'`/`'FALSE'` |
| `syncinfo` flags (`lastsyncsuccess`, `metadatasyncperformed`, …) | STRING `'YES'`/`'NO'` |
| `getAutosyncStatus`/`setAutosyncStatus` data | STRING `'TRUE'`/`'FALSE'` |
| `syncDataUpdate` payload (`syncpass`, `syncpercent`) | numeric STRINGS |

## syncData (SDK) / `syncdata` (JSAPI)

```js
await pulsar.syncData(options = {});   // lines 823-845; bridge type 'syncdata' (lowercase)
```

- Resolves with the immediate acknowledgment payload when the sync request is **accepted** (the
  wiki never documents the `syncDataResponse` data shape — don't rely on it); never resolves at
  sync completion. Register handlers first (see Sync events below).
- SDK whitelist (lines 824-839): `singleObjectSyncEnabled`, `rootObjectId`, `parentIdFieldList`,
  `childRelationshipList`, `pushChangesSyncEnabled`, `useComposite`, `useCompositeGraph`. Any
  other key — including a typo of a valid one — is **silently dropped**, degrading the call to a
  standard sync (confirmed by SDK tests). `miniSyncEnabled`, `miniSyncObjectList`, and
  `childStartDatetime` are therefore unreachable through `syncData()`.
- Neither wiki constraint is validated by the SDK — verbatim: "`singleObjectSyncEnabled`
  **cannot** be used with `pushChangesSyncEnabled`." and "`useComposite` **cannot** be used with
  `useCompositeGraph`."

### Full option table (raw JSAPI `data` node)

| Key | Type | Variant | Via SDK? | Notes |
| --- | --- | --- | --- | --- |
| `miniSyncEnabled` | real boolean | mini | **NO — dropped** | catch-up sync for a subset of object types |
| `miniSyncObjectList` | string array | mini | **NO — dropped** | e.g. `['Account','Contact']`; pending offline changes' types are auto-added |
| `singleObjectSyncEnabled` | real boolean | single | yes | root record + 1 level of parents/children |
| `rootObjectId` | string | single | yes | Id of the record to sync (prefer 18-char) |
| `parentIdFieldList` | string array | single | yes | reference-field names on the root; omit = ALL referenced objects of already-synced types; `['NONE']` disables |
| `childRelationshipList` | string array | single | yes | child relationship names; omit = ALL child relationships of synced types; `['NONE']` disables; custom relationships need the `__r` suffix |
| `childStartDatetime` | ISO 8601 string | single | **NO — dropped** | children modified since then are queried AND "any existing child records older than the childStartDatetime are also cleared from the device" (verbatim — destructive) |
| `pushChangesSyncEnabled` | real boolean | push | yes | "bypasses standard sync steps and only pushes local changes" |
| `useComposite` | real boolean | any | yes | force Salesforce Composite API; XOR with `useCompositeGraph` |
| `useCompositeGraph` | real boolean | any | yes | force Salesforce Composite Graph API; XOR with `useComposite` |

### Sync windows

Only a **standard** sync affects the sync windows used by standard sync. Mini sync maintains its
own per-object window, "initially informed by the most recent standard sync"; consecutive mini
syncs rely on the per-object mini-sync window.

### Finding relationship names (single object sync)

- `parentIdFieldList`: Salesforce Setup → Object Manager → *root* object → Fields &
  Relationships → use the FIELD NAME column value.
- `childRelationshipList`: Setup → Object Manager → *child* object → Fields & Relationships →
  open the relationship field. Standard relationships show the child relationship name; verbatim:
  "For custom relationships (most common situation), SFDC does not show the complete name - you
  will need to add the suffix '\_\_r' (two underscores and an 'r') to the child relationship name
  shown."
- Single object sync traverses only ONE level of parent/child relationships.

### Worked examples

```js
// Standard sync (empty data is required by the API; the SDK sends it for you)
await pulsar.syncData();

// Push-changes-only sync over the Composite Graph API
await pulsar.syncData({ pushChangesSyncEnabled: true, useCompositeGraph: true });

// Single object sync: one Contact + selected parents/children
await pulsar.syncData({
  singleObjectSyncEnabled: true,
  rootObjectId: '003d0000032lc1ZAAQ',
  parentIdFieldList: ['AccountId', 'ReportsToId'],
  childRelationshipList: ['Cases', 'Events', 'Notes', 'Tasks', 'Custom_Objects__r'],
});

// Single object sync, root record ONLY (['NONE'] disables each direction)
await pulsar.syncData({
  singleObjectSyncEnabled: true,
  rootObjectId: '001234567890123AAA',
  parentIdFieldList: ['NONE'],
  childRelationshipList: ['NONE'],
});

// Mini sync — SDK gap: syncData() strips miniSyncEnabled/miniSyncObjectList,
// so this MUST go through the raw request envelope.
await pulsar._send({
  type: 'syncdata',
  data: { miniSyncEnabled: true, miniSyncObjectList: ['Account', 'Contact'] },
});

// Single object sync with childStartDatetime — SDK gap again (key is dropped by
// syncData()). DESTRUCTIVE: local child records older than the datetime are cleared.
await pulsar._send({
  type: 'syncdata',
  data: {
    singleObjectSyncEnabled: true,
    rootObjectId: '001234567890123AAA',
    childRelationshipList: ['Cases'],
    childStartDatetime: '2020-01-01T00:00:00.000Z',
  },
});
```

## Sync events (handlers, not request types)

Register with `pulsar.registerHandler(name, fn)`, remove with `pulsar.deregisterHandler(name)`
(lines 66-120). Critical rules (wiki "Data Sync API", verbatim): "Since syncdata returns
immediately after initiating sync, handlers must be set up before calling syncdata." — "If the
sync process completes quickly, missing handler registration may result in lost sync progress
updates." — "Only one handler can be assigned per handler name." — "Avoid issuing a sync request
from within a sync handler, as this can create an infinite loop."

| Event | Payload | Embedded (SFS)-safe? |
| --- | --- | --- |
| `syncDataStarted` | undocumented | **NO** — SDK routes it to the shared parent bridge; do not use in embedded apps |
| `syncDataUpdate` | `{ syncpass: string, syncpercent: string }` | yes — SDK delegates to the parent `pulsar.addSyncDataUpdateHandler(fn)` |
| `syncDataCoreFinished` | undocumented | **NO** — same problem as `syncDataStarted` |
| `syncDataFinished` | `{ success: boolean }` — **real** boolean | yes — SDK delegates to `pulsar.addSyncFinishedHandler(fn)` |

- `syncpercent` is a floating-point string (0–`'100.00'`) for the **current pass**; sync may run
  multiple passes, so it "may reach 100.00 more than once" (verbatim). Only `syncDataFinished`
  means done. `syncpass` is the pass number, also a string.
- `syncDataCoreFinished` fires when core data is done but "additional content (e.g., documents,
  images) may still be syncing" (wiki "Pulsar Platform - JS Bridge API") — it is not completion.
- Embedded (SFS/FSL) context: the wiki forbids registering syncData events on the shared bridge;
  the SDK's `registerHandler`/`deregisterHandler` handle that split automatically for
  `syncDataUpdate`/`syncDataFinished` — never call `bridge.addHandler`, `bridge.registerHandler`,
  or the parent `pulsar.addSync*Handler`/`removeSync*Handler` yourself. Note the embedded removal
  path takes no function argument — deregistration removes *the* handler for that event.
- Also in embedded context, `deregisterHandler` on a **non-sync** event removes the parent
  document's handlers for that event too (shared bridge) — see the `pulsar-sfs-embedded` skill.

## syncstatus — is a sync running? (NO SDK wrapper)

```js
// SDK gap: no wrapper for 'syncstatus' as of commit eddf62d.
const status = await pulsar._send({ type: 'syncstatus', data: {} });
if (status.syncrunning === 'TRUE') { /* block UI, wait for syncDataFinished */ }
```

- Request: `{ type: 'syncstatus', data: {} }` (the wiki example omits `data`, but include the
  empty object — the safest shape for raw calls, per the JS Bridge API contract).
- Response data: `{ syncrunning: 'TRUE' | 'FALSE' }` — a STRING, never a boolean.

## syncinfo — diagnostics for the most recent sync (NO SDK wrapper)

```js
// SDK gap: no wrapper for 'syncinfo' as of commit eddf62d.
const info = await pulsar._send({ type: 'syncinfo', data: {} });
```

Request: `{ type: 'syncinfo', data: {} }` (the wiki example omits `data`; include the empty
object as the safest raw-call shape). Response data: an object
where **every value is a string** — numbers (`'44.9'`, `'4304'`), booleans (`'YES'`/`'NO'`),
dates (ISO 8601). `pulsar.userInfo()` overlaps slightly (it exposes only
`lastsuccessfulsync`/`lastfailedsync`).

| Field | Meaning |
| --- | --- |
| `lastsuccessfulsync` | Datetime of last successful sync; `'1970-01-01T00:00:00.000Z'` = never |
| `lastfailedsync` | Datetime of last failed sync; epoch sentinel = never failed |
| `previoussynctime` | Datetime of most recent sync; epoch sentinel = never synced |
| `lastsyncduration` | Seconds the last sync took (string) |
| `lastsyncsuccess` | `'YES'`/`'NO'` |
| `localchangespendingcount` | Local changes not yet synced |
| `localcreatedcount` / `localdeletedcount` / `localupdatedcount` / `localupdateduniquecount` | Local records pushed during the last sync, by kind |
| `metadatasyncduration` / `metadatasyncperformed` | Seconds / `'YES'`-`'NO'` for the metadata portion |
| `reachabilitysyncduration` / `reachabilitysyncperformed` | Same, reachability portion |
| `refreshduration` / `refreshperformed` | Same, settings-refresh portion |
| `schemachanged` | `'YES'` if the last sync altered the local schema |
| `serverintegratedcount` | Retrieved records actually added/updated locally |
| `serverprocessedcount` | Full/partial records retrieved from the server (all types) |
| `serverprocessedobjectcountmap` | Comma-separated string, e.g. `'Account: 4000,Contact: 400,Case: 85'` — parse it yourself, it is not JSON |
| `syncdomaintype` | `'all'` (standard/catch-up), `'mini'`, `'single'`, `'push'` |
| `syncgeneration` | Total sync count since install (wiki wording is ambiguous: "number of total sync passes since app was installed") |
| `syncpasscount` | Passes performed in the last sync |
| `syncresumed` | `'YES'` if the sync continued an interrupted/incomplete sync |
| `syncwindowtype` | `'initial'` (first sync after install), `'catchup'` (later, non-complete), `'complete'` (full re-sync forced by a setting change) |
| `lastfailedsynccurlerrorcode` / `lastfailedsynccurlerrormessage` | CURL error (1-2 digit string, `'0'` = none) + message |
| `lastfailedsyncerrorcode` | 3-4 digit Pulsar error code string, `'0'` if sync never failed — look up in the table below |
| `lastfailedsynchttpresponsecode` | 3-digit HTTP code + text; only reported when CURL errored or Salesforce's response had no body |
| `lastfailedsyncsferrorcode` / `lastfailedsyncsferrormessage` | Salesforce error code + message, when applicable |
| `lastsyncdownloadspeed` / `lastsyncuploadspeed` | MBps strings measured at sync start; `'0.0'` may mean the user has never synced |

## interruptsync

```js
const interrupted = await pulsar.interruptSync();   // lines 855-866 → REAL boolean
```

- Sends `{ type: 'interruptsync', data: {} }` (empty data object required). Response type is
  camelCase `'interruptSyncResponse'` (unlike lowercase `'syncstatusResponse'`).
- Resolves `true` = a sync was interrupted; **`false` = no active sync to interrupt — not an
  error** (errors reject separately). Throws `'Unexpected response format from interruptSync.'`
  if the response lacks a `success` key.
- An explicit interrupt surfaces as Pulsar error code **139** in later sync error reporting (the
  wiki documents this for the interrupt-sync button; an `interruptSync()` call presumably
  surfaces the same code — not documented); an implicit interrupt (e.g. app backgrounded) is
  **138**.
- SDK caveat: it returns `Boolean(response.success)` — if the native side ever returned the
  string `'FALSE'` (the convention elsewhere), that would coerce to `true`. Documented payload is
  a real boolean, but don't build inverted logic on this flag.

## getAutosyncStatus / setAutosyncStatus

```js
const on = await pulsar.getAutosyncStatus();          // lines 1634-1640 → 'TRUE' | 'FALSE' STRING
const after = await pulsar.setAutosyncStatus(true);   // lines 1650-1658 → post-attempt STRING
```

- Autosync starts a sync automatically on login and when returning to the app.
- Requests: `{ type: 'getAutosyncStatus', data: {} }`;
  `{ type: 'setAutosyncStatus', data: 'TRUE' }` — the set request's `data` is a **bare string**,
  not an object (the SDK builds it for you). JSAPI type strings use lowercase "sync"
  (`setAutosyncStatus`), though one wiki page name-drops "setAutoSyncStatus".
- Both resolve to the bare STRING `'TRUE'`/`'FALSE'` — the SDK does **not** convert to boolean
  (contrast `getOnlineStatus`). Compare `=== 'TRUE'`.
- **Coercion footgun** (line 1652): `enable === true || enable === 'TRUE' ? 'TRUE' : 'FALSE'` —
  `'true'`, `'True'`, `1`, `'yes'` all silently DISABLE autosync. Pass a real boolean.
- The resolved value is the status **after the attempt** and may differ from what you requested —
  always check it.

## Pulsar error codes (condensed from wiki "Pulsar Error Code Information")

Codes appear in `syncinfo.lastfailedsyncerrorcode` (and Pulsar logs). Categories: SQLite (1-26; code 0 is the Sync Operation success row),
SFDC communication (120-149, 1150-1156), Pulsar database (150-178), Sync Operation (200-253).
Codes **154** and **159** are listed under two categories each — a number alone does not uniquely
identify a category row.

| Code | Meaning | Action |
| --- | --- | --- |
| 0 | Sync completed successfully | — |
| 5 | SQLite: database file locked | Retry the sync |
| 9 | SQLite: operation interrupted | Retry the sync |
| 1-4, 6-8, 10-26 | Other SQLite errors (I/O, full disk, malformed db, …) | "Please email logs" |
| 120-136, 140-141, 147-149 | SFDC communication failures (login, parse, HTTP, session) | Retry; email logs if persistent |
| 128 | Field validation exception | Message comes from Salesforce — fix the data |
| 130 | Network read error | "Sync interrupted due to loss of network; please try syncing again" |
| 137 | Client timeout | Verbatim advice: "we recommend that the user try again on a known good network at least once" |
| 138 | Implicit interrupt (typically app backgrounded) | Retry |
| 139 | Explicit interrupt (wiki documents the interrupt-sync button; an `interruptSync()` call presumably surfaces the same code — not documented) | Expected after user cancel |
| 143 | Entity is deleted | Remove/change the reference to the missing record |
| 145 | Safe mode | Operation not allowed in Safe Mode |
| 152 | App state unavailable (device slept) | Retry |
| 154 | Caller should retry (two categories) | Retry |
| 155 | Schema version too old | — |
| 156 | App initialization failed | Kill and restart the app |
| 157 / 158 | Filesystem space / free nodes too low | Free disk space before syncing again |
| 159 | Sync (already) in progress (two categories) | Wait for the running sync |
| 164 / 176 | Delete blocked by dependency / SF child-relationship restriction | — |
| 167 | A sync is required before this operation | Sync first |
| 173 | Operation is online-only | Go online |
| 177 / 178 | DB change during sync / sync prep during write | Serialize writes vs sync |
| 200-228, 232-234, 242 | Uncommon sync-operation errors | Email logs |
| 205 | Item needs manual resolution | User must resolve in Pulsar UI (`syncUserInteractionNeeded`) |
| 224 | Too many sync retries | Email logs |
| 229 | Salesforce edition unsupported | Contact Salesforce rep / support@luminixinc.com |
| 231 | Table for an offline-created item is missing | Contact the Salesforce admin |
| 235-237 | Create/update/delete rejected by object permissions | Fix permissions |
| 238 | Push sync denied (standard sync incomplete) | Run a standard sync first |
| 241 / 243 | Caller must retry (243: layout now required) | Retry |
| 244 | Complete resync required | Trigger/allow a full re-sync |
| 245 | Local database reset needed | Reset local DB (re-login/reinstall flow) |
| 246 | Pulsar upgrade needed | Update the app |
| 248 / 249 | Device / user blocked (security) | Admin action required |
| 250 | Session refresh required | Re-authenticate |
| 251 | An offline create failed to push | Inspect the record; email logs |
| 253 | Pulsar version is past the maximum allowed | Contact the admin / support (where the maximum is configured is not documented) |

Full table with per-code public/log messages: wiki "Pulsar Error Code Information"
(<https://luminix.atlassian.net/wiki/>, verified 2026-07-03).
