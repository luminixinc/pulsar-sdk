---
name: pulsar-psl
description: Pulsar Settings Language (PSL) — the declarative action language the Pulsar client runs natively, not JavaScript. Use for native custom buttons, execution triggers (beforeSave, onBarcodeScan, afterLogin…), sync triggers, @@ special value variables, and LaunchDocument.
---

# Pulsar Settings Language (PSL)

PSL is a declarative action language typed into the **value of a Pulsar Setting** (org-side;
synced to devices). It runs **natively inside the Pulsar client — it is not JavaScript** and
never executes in your WebView. It still matters to a .pulsarapp: PSL buttons/triggers can
**launch your web app** (`LaunchDocument`) with variables; your app's `create`/`update`/`delete`
SDK calls **fire admin-configured PSL object triggers** locally; and PSL `@@` values map to SDK
methods (below). Prefer platform features first: "we recommend that you use Salesforce
validation rules if possible" and SFDC Quick Actions over new PSL buttons (wiki "PSL Execution
Triggers" / "Custom Buttons" Spring 2019 note, verified 2026-07-03); the JS button-equivalent
is `await pulsar.executeQuickAction(name, contextId, fields)` (src/pulsar.js:2281-2290).

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

## Syntax in one screen

```
DEFAULT{                            <- REQUIRED entry block; block names ALL CAPS, no spaces
Action=SetVar;                      <- each key=value line ends with ';' (escape ';' in values as \;)
VarName=UserId;
VarValue=@@CurrentUserId;           <- @@... built-in value; "..." literal; Field / Rel.Field reads current object
|                                   <- '|' separates sequential actions
Action=SqlQuery;
QueryString=SELECT COUNT() AS N FROM Contact WHERE OwnerId = '%%UserId%%';  <- %%Var%% interpolates
QueryReturnFields=N;                <- required for SELECT; column aliases become PSL variables
QueryTest=%%N%%>0;
QueryTestTrue=HAS_CONTACTS;         <- branch target: block name with NO underscore prefix
|
Action=__EMPTY;                     <- unconditional jump: '__' + block name; stops this block
}
HAS_CONTACTS{ Action=Alert; Message=%%N%% contacts found; }
EMPTY{ Action=Alert; Message=No contacts; }
```

(wiki "Pulsar Settings Language - Overview", verified 2026-07-03.) Non-obvious rules:

- Variable names are case sensitive, "but the best practice is to NOT rely on this" (verbatim).
- A plain `Alert` inside a validation trigger **invalidates it by default** (blocks the save):
  `DismissAlert` defaults `AlertShouldValidate=FALSE`, `DismissCurrentWindow` defaults `TRUE` —
  asymmetric. `BranchChoice` alerts must be the LAST action in a block.
- SqlQuery is raw SQLite access — "extreme care should be taken with its use … limit your
  access here to 'SELECT' or read type queries" (full caveat in `references/psl-language-reference.md`); UPDATE
  skips validation rules, formula and roll-up recalc — same hazards as JS `updateQuery`.
- Full action catalog, quoting traps, Loop/BreakLoop: `references/psl-language-reference.md`.

## Execution triggers — what fires when

Key format `pulsar.<executionPoint>.<Object API Name>` (wiki "PSL Execution Triggers", verified
2026-07-03):

| Key | Fires |
| --- | --- |
| `pulsar.beforeView.<Object>` (14.0+) | Before a record displays; deny with `SetResult` + `ResultValid=false` |
| `pulsar.beforeEdit/beforeSave/beforeDelete.<Object>` | Validation before the edit screen opens / a save commits / a delete |
| `pulsar.onCreate.<Object>` | Plus button on the object's listviews — **replaces** the create UI entirely |
| `pulsar.onCreate.<Parent>.<Child>` | Plus button on a related list — separate setting; PSL context is the **parent** |
| `pulsar.onSave/onDelete.<Object>` | After a local save (`@@CreatedObjectId` holds a new record's Id) / delete |
| `pulsar.afterSave.<Object>` | "only run when the online save has been successfully pushed to Salesforce" — never offline |
| `pulsar.onBarcodeScan.<Object>` | After a barcode scan (`@@CurrentScanCode`) |
| `pulsar.afterLogin` | Home screen after sign-in / session start (no object segment) |
| `pulsar.<Object>.<Field>.afterUpdate` | Field trigger — **reference fields only**; the only supported field-trigger type |
| `pulsar.{beforeView,beforeSave,onSave}.File` (9.0+) | File meta object (ContentDocument+Version+Link merged) — may also veto file saves your app performs (undocumented whether JSAPI file writes run this trigger — verify in a sandbox) |
| `pulsar.sync.beforeSyncTrigger` / `pulsar.sync.AfterSyncTrigger` | Sync triggers (next section; copy this exact casing) |

- `onCreate` PSL "must ultimately handle how to respond to the plus button tap" — end with
  `CreateAndMapFields` for the standard create screen. In `beforeSave.File` the Id fields "will
  be empty" — check size/extension via `ContentVersion_*` (`Base64ContentSize` ≈ 4/3 raw).

## Custom buttons (native record-detail toolbar)

Three settings, all required (wiki "Custom Buttons", verified 2026-07-03):

| Step | Setting key | Value |
| --- | --- | --- |
| 1. Enable | `pulsar.detail.custombuttons.show` | `TRUE` |
| 2. Declare buttons | `pulsar.<Object API Name>[.<Record Type Friendly Name or "default">].buttons` | Newline-separated `button_Id:Label` pairs. Verbatim: "Labels can contain spaces, button id's cannot contain spaces." |
| 3. PSL per button | `pulsar.buttonActions.<Object API Name>.<button_id>` | PSL block(s) |
| Icon (optional) | `pulsar.layout.<sobjectType>.customButtons.icon` | No value — attach a PNG to the setting; default is a "…" ellipsis |
| Visibility (optional) | `pulsar.<Object>[.<RecordType or "default">].buttons.listitems` | PSL ending in `SetResult` whose `Result` is a buttons-format string |

- Use the exact Object API Name casing in every key (the wiki's own example mixes `event` and
  `Event`; case insensitivity is undocumented — wrong case likely = button silently missing).
- Buttons run in display mode, so auto-saving `SetField`/`SetLocation` ("only recommended … in
  custom buttons") are safe here and nowhere else. Recipes: `references/psl-recipes.md`.

## Sync triggers + debug-log upload

- **Before** (`pulsar.sync.beforeSyncTrigger`): runs at sync start; ending with
  `Action=SetResult; Result=FALSE;` cancels the pending sync — this also silently vetoes syncs
  your web app starts with `syncData()`. If syncs mysteriously never run, check this setting.
- **After** (`pulsar.sync.AfterSyncTrigger`): runs when sync completes; the whole `@@` sync-stat
  family is available (same data as the JS `syncinfo` raw request — `pulsar-sync` skill).
- Verbatim (wiki "Sync Triggers"): "Any object your trigger depends on must be available on the
  device. This applies whether the trigger references the object directly or through a
  relationship. This is especially true if you use SFCreate or SFUpdate to write to an object,
  because Pulsar must have that object's schema." Sync schema without records: `Id = null` filter.
- Verbatim (wiki "After Sync Trigger"): "The SFCreate and SFUpdate PSL actions push changes
  directly to Salesforce and will NOT update the local Pulsar database. Any creates and updates
  using these actions will need to be synced to Pulsar at a later time." For local writes use
  `CreateAndMapFields` or `SqlQuery` (UPDATE) instead.
- The standard failure-diagnostics pattern — after-sync PSL branches on `@@LastSyncSuccess` and
  `SFCreate`s an error record with `AttachLogFile=TRUE` (attaches the sync debug log to the new
  record) — is in `references/psl-recipes.md` verbatim, with required Salesforce setup + test.

## Special value variables: `@@` (PSL) ↔ SDK (JS)

`@@X` is a built-in value Pulsar resolves; `%%X%%` reads a variable YOU set (idiom: `SetVar;
VarName=X; VarValue=@@Something;` then `%%X%%`). `@@currentuser.<FieldAPIName>` reads any
current-user field. JS twins (wiki "Special Value Variables" + src/pulsar.js, verified 2026-07-03):

| PSL | From JS |
| --- | --- |
| `@@CurrentUserId`/`Username`/`UserFullName`/`ProfileId`/`RoleId`/`OrganizationId`, `@@AppVersion` | `await pulsar.userInfo()` → `.userid`, `.username`, `.version`, … (src/pulsar.js:900-905) — all STRINGS; `.version` is the PULSAR app version (the src JSDoc saying "salesforce" is wrong) |
| `@@Today` / `@@Now` | `new Date().toISOString()` (+ `.substring(0, 10)` for dates) — `pulsar-data-access` |
| `@@CurrentScanCode` / `@@CurrentLocation` | `await pulsar.scanBarcode()` → plain string; `await pulsar.getLocation('Fine'\|'Medium'\|'Coarse')` → STRING lat/long — `parseFloat` |
| `@@CanSync` | `await pulsar.getOnlineStatus()` → REAL boolean (SDK converts) |
| `@@SyncRunning`; `@@LastSync*`, `@@LastFailedSync*`, `@@LocalChangesPendingCount`, counts, durations | SDK gaps — raw `await pulsar._send({ type: 'syncstatus', data: {} })` → `.syncrunning` `'TRUE'`/`'FALSE'`, and `await pulsar._send({ type: 'syncinfo', data: {} })` (carries `localchangespendingcount`); `userInfo()` also carries `lastsuccessfulsync`/`lastfailedsync`. Details: `pulsar-sync` |
| `@@OperatingSystemType` | `await pulsar.getPlatform()` → `'windows'\|'android'\|'ios'` (the wiki's empty JSAPI column predates the SDK) |
| Custom labels (PSL `Action=GetCustomLabels`) | `await pulsar.getCustomLabels(['Label1'], 'en_US')` — first arg MUST be a non-empty array |
| PSL `Action=Log` | `await pulsar.logMessage(msg, level)` — JS entries prefixed `JSAPI:`, PSL entries `[PSL] Log Action:` |
| `@@FSLVersion`, `@@OperatingSystemVersion`, `@@DeviceBrand`, `@@DeviceType`, `@@ProxyServer`, `@@LastFailedSyncDuration`, `@@CreatedObjectId`, `@@SyncedDataTime` | PSL-only — no verified SDK/bridge equivalent; never invent one |

Full tables, sentinels (`'1970-01-01T00:00:00.000Z'`, `0`, blank = "never happened") and the
`'YES'/'NO'` vs `'TRUE'/'FALSE'` string-boolean split: `references/psl-language-reference.md`.

## PSL and your web app

```js
// Launched via PSL LaunchDocument: current record + any SetVar vars arrive as URL params.
// (JS prerequisites — init once, try/catch everywhere — per the Always rules above.)
const params = new URLSearchParams(window.location.search);
const objectId = params.get('ObjectID');       // ObjectID + ObjectType always included (wiki casing)
try {
  const s = await pulsar.getSetting('pulsar.detail.custombuttons.show');   // inspect PSL config
  const enabled = s.Exists === 'TRUE' && s['pulsar.detail.custombuttons.show'] === 'TRUE';
} catch (err) { console.error(err.message); }
```

- `SetVar` must appear **before** `LaunchDocument` for the variable to arrive. onSave/onDelete
  launch the document AFTER the action; onCreate "will replace the existing UI pathway for the
  creation of that object". PSL cannot be authored from JS — only read
  (`getSetting`/`getSettingAttachment`) and fired indirectly (writes, quick actions).

## Testing PSL

- Use a **Salesforce Sandbox** — SqlQuery UPDATE "may damage your Salesforce instance when
  synced". Debug with `Action=Log;` (`[PSL] Log Action: <msg>`, INFO level) and `Action=Alert;`
  to print `%%vars%%` (`pulsar-dev-debug` skill). Setting changes reach devices only on the
  next sync / Refresh Settings — sync before retesting. Test the after-sync failure path by
  forcing a failure ("invalid data or blocked network"), then confirm record + log on the org.

## References

- `references/psl-language-reference.md` — syntax detail, action catalog with per-action keys,
  trigger-key reference, complete special-values tables, known-broken wiki examples.
- `references/psl-recipes.md` — custom-button recipes (launch-a-.pulsarapp button, dynamic
  visibility), verbatim debug-log-upload recipe + Salesforce setup, before-sync gate, roll-up.
