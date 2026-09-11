# PSL language reference

Sources: wiki "Pulsar Settings Language - Overview", "PSL Execution Triggers", "Sync Triggers",
"Before Sync Trigger", "After Sync Trigger", "Special Value Variables", "Custom Buttons" — all
verified 2026-07-03 (live wiki: <https://luminix.atlassian.net/wiki/spaces/PD/>). SDK
cross-references cite `src/pulsar.js` line numbers. Statements marked *verbatim* quote the wiki.

PSL contains **no JavaScript**. Wiki PSL pages are authoritative for PSL itself; where they
name raw JSAPI request types, use the SDK method instead (mapping tables at the end).

## Where PSL is accepted

PSL is typed into the value of a Pulsar Setting. Settings that accept PSL (per the Overview,
plus the sync-trigger and button-visibility settings documented on their own pages):

- Field default values and field formulas
- Object validations and triggers (execution triggers below)
- Custom buttons (`pulsar.buttonActions.…`) and button visibility (`…buttons.listitems`)
- Sync triggers (`pulsar.sync.beforeSyncTrigger` / `pulsar.sync.AfterSyncTrigger`)

Note: the Overview's trigger list also names `beforeConvert`, which appears on no other page
(the "PSL Execution Triggers" page omits it) — treat it as unverified.

## Blocks

- A setting is one or more blocks; execution starts at `DEFAULT{ … }`. Custom blocks are
  allowed ("any block name you would like") but "you will still need your 'DEFAULT' block in
  order to start your setting off".
- Block names: **ALL CAPS, no spaces**. A block contains only actions (no nested blocks),
  executed in order, separated by `|`.

## Action syntax

- Each action is one or more `key=value;` lines; the first must be `Action=<Type>;`.
- **Every `key=value` pair is terminated by `;`.** Escape a literal semicolon inside a value as
  `\;` (*verbatim*: "presently semicolon needs to be escaped"). Also supported: `\r`, `\n`,
  `\t`, `\\`.
- Literal values are surrounded by **double quotes**; bare values are interpreted as field
  references or expressions depending on the key.

## Flow control

| Mechanism | How | Notes |
| --- | --- | --- |
| `Action=__BLOCKNAME;` | Unconditional jump | **Two underscores** + block name; stops executing the current block — put it last |
| `SqlQuery` + `QueryTest` | Conditional branch | `QueryTestTrue=` / `QueryTestFalse=` name the target block **without** underscore prefix; if the matching branch key is missing, flow continues to the next action |
| `SqlQuery` + `QueryLoop` | Per-row iteration | Named block runs once per SELECT row; `QueryReturnFields` aliases refresh each row |
| `Action=Loop;` | Counted loop | `BlockName`, `CountVar` (starts at **1**, increments at the START of each subsequent iteration), `CountTo` (max iterations) |
| `Action=BreakLoop; Condition=…;` | Early loop exit | Used in the wiki's nested-loop example but **never formally documented** — verify in a sandbox |
| `Alert` `AlertType=BranchChoice` | Two-button branch | `YesButtonTitle`/`NoButtonTitle` + `YesButtonAction`/`NoButtonAction` (block names). *Verbatim*: "no matter which choice is selected, it will not continue executing actions on the current block" — must be the LAST action |
| `Alert` `AlertType=ChoiceAlert` | Confirm/continue | Yes = continue current block; No = stop. Optional Yes/No button titles |
| `Action=SetResult;` | Return a result | `Result=<string>`, `ResultValid=TRUE\|FALSE`. Used to: fail validation with a message (`ResultValid=false`), emit the button list for `buttons.listitems`, and cancel a pending sync (`Result=FALSE` in the before-sync trigger) |

Alert validation defaults are **asymmetric** (source of accidental save-blocking):

- `DismissAlert` (the default one-button alert) — *verbatim*: "this will by default
  *invalidate* the PSL trigger"; override with `AlertShouldValidate=TRUE`.
- `DismissCurrentWindow` — default `AlertShouldValidate=TRUE`; *verbatim*: "Use this wisely
  because you would not want to dismiss an edit window but perhaps upon successful execution of
  a setting, e.g.: onBarcodeScan setting."
- The `Title=` key appears in several wiki Alert examples but is not in Alert's documented
  parameter list.

## Variables (`SetVar`) and interpolation

`Action=SetVar; VarName=X; VarValue=<expr>;` stores a value; read it anywhere in the setting
(all blocks) as `%%X%%`. `VarName`: no spaces, no special characters besides underscore.
*Verbatim*: variable names are "case sensitive but the best practice is to NOT rely on this (in
other words having both `somevariable1` and `SomeVariable1` is NOT RECOMMENDED)".

`VarValue` forms:

| Form | Example |
| --- | --- |
| Literal (double quotes, all field types) | `VarValue="Literal Value";` |
| Field on the current object | `VarValue=FirstName;` |
| Related field (SOQL relationship syntax) | `VarValue=Account.Name;` |
| Numeric formula (`+ - * /`, numeric fields only) | `VarValue=Quantity * UnitPrice;` |
| Special value | `VarValue=@@CurrentUserId;` |
| Another variable / mix | `VarValue=%%X%% + 1;`, `VarValue="%%X%%bar";` |
| SFDC formula functions | `VarValue=TEXT('Current ') + SUBSTITUTE(…);` |

Quoting trap (wiki example): `VarValue='"%%X1%%"'` silently yields a wrong value "due to this
resulting in an SFDC formula syntax error" — concatenate quote characters explicitly instead:
`VarValue='"' + "%%Var%%" + '"';`

Geolocation: a variable set from `@@CurrentLocation` exposes coordinates via suffixes:
`%%Name__Latitude__s%%` / `%%Name__Longitude__s%%` (two underscores each side).

## Action catalog

### Navigation / record UI

| Action | Keys | Notes |
| --- | --- | --- |
| `Create` | `ObjectType` | Opens the create screen, no pre-population |
| `CreateAndMapFields` | `ObjectType`; `ActionShouldComplete` (default FALSE; TRUE = auto-save); `ActionShouldDisplay` (default TRUE); `RecordTypeName`; `<TargetField>=<source field \| "literal" \| %%var%%>` … | "recommended over the 'Create' action". With multiple record types, set `RecordTypeName` (prose also mentions `RecordTypeId=`) "Otherwise, Pulsar will prompt the user to select a record type". *Verbatim*: "If your PSL is creating multiple objects, you should set [ActionShouldDisplay] to FALSE." |
| `CloneCurrentObject` | `ExcludeFields` (comma list) | Create mode pre-filled from current object; "not intended to be used on an object that's currently in edit or create mode" — buttons are the good home |
| `CloneRecentObject` | `ObjectType`, `SortClause` (no `ORDER BY` text), `MatchFields`, `ExcludeFields` | Intended for `onCreate` (overrides related-list Add) |
| `Display` | `ObjectType`; `ObjectId` or `ObjectIdField` | One of the two Id keys required; `ObjectId` wins if both |
| `Delete` | `ObjectType`, `ObjectId` | Local delete |
| `LaunchDocument` | `DocumentId` (e.g. `069i0000001i3wP`) | Launches an HTML/Content Library document. Available for onSave, onDelete, onCreate, custom buttons. Passes **ObjectID + ObjectType of the current page** plus any `SetVar` variables as URL parameters — `SetVar` "must be before the LaunchDocument Action". onSave/onDelete: document opens AFTER the action; onCreate: "the HTML document will replace the existing UI pathway for the creation of that object" |
| `QuickAction` | `Name` (Quick Action API name), `ContextId` (optional for global QAs) | JS twin: `await pulsar.executeQuickAction(name, contextId, fields)` (src/pulsar.js:2281-2290) |
| `DisplayURL` | `URL`; `OpenInExternalBrowser` (TRUE / default FALSE = opens **inside** Pulsar) | *Verbatim*: "PSL OpenURL is deprecated in 18.0+, but will continue to work." Custom URL schemes are whitelisted (`yourekamobile`, `skype`, `augment`, `sharinpix`, `prontoforms`) or Universal Links; contact Luminix for new schemes. JS twin: `pulsar.displayUrl({ fullUrl, externalBrowser })` — see `pulsar-native-ui` |

### Field / data mutation

| Action | Keys | Notes |
| --- | --- | --- |
| `SetFieldInMemory` | `FieldType` (`General` default \| `Timestamp` ignores FieldValue, uses now \| `Image` + `ImageType=ImageResource`), `FieldName`, `FieldValue` | Updates one field on the current object **in edit/create mode**; resolved value is treated as a literal |
| `SetField` | same | **Auto-saves and refreshes** the displayed object. *Verbatim*: "it is only recommended to use this action in custom buttons, and not for object triggers and validation rules, to avoid unintended side effects." |
| `SetLocationInMemory` | `FieldName`, `LocationType=DeviceLocation`, `LocationAccuracy` (`Fine` 10 m \| `Medium` 100 m default \| `Coarse` 1000 m) | Geolocation field, edit/create mode. First fix can be slow — tune `pulsar.location.updateFrequencySeconds` |
| `SetLocation` | same | Auto-saves; "only recommended to use this action while in display mode. A custom button is a good place" |
| `SFCreate` | `ObjectType`; `AttachLogFile` (TRUE/FALSE — attach a zip of Pulsar logs to the created record); field mappings as in CreateAndMapFields (no ActionShould\* keys) | **Writes directly to Salesforce, bypassing the local DB** (critical caveat in SKILL.md). The wiki's own example has a `LoWhoId` typo (should be `WhoId`) — don't copy blindly |
| `SFUpdate` | `ObjectType`; `Id` (required); `AttachLogFile`; field mappings | Same direct-to-Salesforce caveat |
| `SqlQuery` | `QueryString`; `QueryReturnFields` (*verbatim*: "required for SELECT queries"); `QueryTest`; `QueryTestTrue`/`QueryTestFalse`; `QueryLoop` | Full caveat below. SELECT column aliases become PSL variables. String concat: *verbatim* "Use the printf function instead of the '\|\|' concatenation operator". `@@QueryCount` is used in a wiki example inside `QueryReturnFields` to get the row count but is documented nowhere |

`SqlQuery` caveat — *verbatim* ("Caveat Programmer!", PSL Overview): "`SqlQuery` is the most
powerful Action as it allows you to directly access Pulsar's underlying Sqlite database, and
extreme care should be taken with its use. Although you may run data manipulation queries, we
recommend that you limit your access here to 'SELECT' or read type queries." For UPDATE
queries, *verbatim*: "Pulsar will not process ValidationRules for the record(s) in question;
Pulsar will not re-calculate and save formula fields for the record(s) in question; Pulsar will
not re-calculate roll-up summary fields on parent object(s) records(s) for record(s) in
question; It is possible to write values to the Db offline that will not sync cleanly to
Salesforce or may damage your Salesforce instance when synced; It is possible to write values
to the Db that will break functionality across the Pulsar app".

### State, variables, values

| Action | Keys | Notes |
| --- | --- | --- |
| `SetVar` | `VarName`, `VarValue` | See Variables section |
| `SetResult` | `Result`, `ResultValid` | See Flow control |
| `IsChanged` | `FieldName` (field or numeric formula), `ReturnValue` | Stores the **strings** `"TRUE"`/`"FALSE"` |
| `IsNew` | `ReturnValue` | Stores `"TRUE"`/`"FALSE"` (strings) |
| `GetObjectType` | `ObjectId` (accepts "15 or 18 character ID"), `VarName` | JS code should still use 18-char Ids (AGENTS.md) |
| `GetCustomLabels` | `Locale` (e.g. `en_US`), `Labels` (comma list of label API names), `ReturnLabels` (variable names, **must match Labels in count and order**) | JS twin: `await pulsar.getCustomLabels(['Name1'], 'en_US')` — array, NOT a comma string (src/pulsar.js:1742-1753) |
| `SetOffline` / `SetOnline` | — | Exactly the user's 'Force work offline' toggle. When online-enabled, changes push immediately only "if a valid network connection exists and there are no pending local changes" |

### Device / system

| Action | Keys | Notes |
| --- | --- | --- |
| `Alert` | `Message` (required); `AlertType`; per-type keys | See Flow control |
| `Log` | `Message` | INFO level, format `[PSL] Log Action: <your message>`. JS twin: `await pulsar.logMessage(message, level)` — JS entries are prefixed `JSAPI:` instead (src/pulsar.js:1763-1775) |
| `RegisterNotification` | `Message`, `AfterTimeDelay` | Local reminder. `AfterTimeDelay` is in **MINUTES**, not seconds |
| `ReadBluetooth` | `Type` (`string`\|`number`), `Device`, `Service` (UUID), `Characteristic` (UUID), `VarName` | If Device not found in range, Pulsar prompts with all available devices |
| `SyncNow` | `SyncType` (`PUSH` \| `SINGLE`; omit = standard sync); push: `UseComposite`/`UseCompositeGraph` (TRUE/FALSE — override the org-wide Composite settings); single (14.0+): `RootObjectId` (required), `ParentIdFieldList`/`ChildRelationshipList` (default = download ALL referenced/child objects; pass `NONE` to skip), `ChildStartDatetime` (ISO 8601) | *Verbatim*: "Pulsar data sync is asynchronous. Using the SyncNow action will start the data sync process in the background … It is NOT recommended to use this action within an onsave and other sobject triggers as there is potential for conflicts between the running sync and the save process in progress." One wiki afterSave example uses `SyncType="single"` (quoted, lowercase) contradicting the documented unquoted `PUSH`/`SINGLE` — prefer the documented form. JS twin: `await pulsar.syncData(options)` — see `pulsar-sync` |

## Execution trigger keys (full reference)

General format: `pulsar.<executionPoint>.<Object API Name>`. Ten execution points:
`beforeView` (14.0+), `beforeEdit`, `beforeSave`, `beforeDelete`, `onCreate`, `onSave`,
`onDelete`, `onBarcodeScan`, `afterSave`, `afterLogin` — plus sync triggers and field triggers.

| Trigger | Key | Context / notes |
| --- | --- | --- |
| After login | `pulsar.afterLogin` | "executes upon navigating to the home screen after signing in or tapping the username to start your session" — no object segment |
| onCreate (listviews) | `pulsar.onCreate.<Object>` | Context = "the newly initialized object itself (in memory only)". Does NOT imply the related-list override |
| onCreate (related list) | `pulsar.onCreate.<Parent>.<Child>` | Context = "the parent of the object to create" |
| afterSave | `pulsar.afterSave.<Object>` | *Verbatim*: "only run when the online save has been successfully pushed to Salesforce" |
| Field afterUpdate | `pulsar.<Object>.<Field>.afterUpdate` (optionally `pulsar.<Object>.<RecordTypeDeveloperName>.<Field>.afterUpdate`) | *Verbatim*: "Currently we only support the 'After Update' trigger type for **reference fields only**" |
| Before sync | `pulsar.sync.beforeSyncTrigger` | Can cancel the pending sync: end with `SetResult; Result=FALSE;` (TRUE or no result = proceed) |
| After sync | `pulsar.sync.AfterSyncTrigger` | Note the different casing vs beforeSyncTrigger — copy each exactly; key case-insensitivity is undocumented |
| File meta object | `pulsar.beforeView.File`, `pulsar.beforeSave.File`, `pulsar.onSave.File` | Pulsar 9.0+; merged ContentDocument/ContentVersion/ContentDocumentLink view (below) |

File meta object fields: `ContentDocument_{Id, FileExtension, FileMimeType, ContentSize,
ContentSizeMB, Base64ContentSize, Base64ContentSizeMB, Title, Description}`,
`ContentVersion_{Id, ContentDocumentId, FileExtension, FileMimeType, ContentSize, ContentSizeMB,
Base64ContentSize, Base64ContentSizeMB, Title, Description, Origin, PathOnClient}`,
`ContentDocumentLink_{ContentDocumentId, LinkedEntityId, SystemModstamp, ShareType, Visibility}`
(link fields also work without the `ContentDocumentLink_` prefix). In **beforeSave** the Id
fields "will be empty" (records don't exist yet) — gate on `ContentVersion_*` size/extension.
`Base64ContentSize` exists because upload size (≈4/3 of raw) is what hits Salesforce limits.

Version gates in this domain: `beforeView` and `SyncNow SINGLE` need Pulsar 14.0+; the File
meta object needs 9.0+; `OpenURL` is deprecated in 18.0+ (use `DisplayURL`).

## Special value variables (full tables)

### User / session / app (JS: `await pulsar.userInfo()`, src/pulsar.js:900-905)

| PSL | userInfo field | Notes |
| --- | --- | --- |
| `@@CurrentUserId` | `userid` | |
| `@@CurrentUsername` | `username` | |
| `@@CurrentUserLocale` | `locale` | |
| — | `userlanguage` | Language and region (JSAPI only) |
| `@@CurrentUserFullName` | `userfullname` | |
| `@@CurrentProfileId` / `@@CurrentProfileName` | `userprofileid` / `userprofilename` | Name "requires the user to have access to the 'Profile' SObject" |
| `@@CurrentRoleId` / `@@CurrentRoleName` | `userroleid` / `userrolename` | Name requires access to the 'UserRole' SObject |
| `@@CurrentOrganizationId` | `organizationid` | |
| `@@AppVersion` | `version` | The PULSAR app's version, e.g. "4.1.0.101" — the src JSDoc calling it a Salesforce version is wrong |
| — | `devicelanguage`, `instanceurl`, `sessionid` | JSAPI only. Wiki says devicelanguage is "a 2-digit code"; the SDK example is `'en-US'` — one is stale |
| `@@currentuser.<FieldAPIName>` | — | Any field on the current user's record (e.g. `@@currentuser.FirstName`). JS: `pulsar.read('User', { Id: userid })` |

`userInfo()` also returns fields the wiki omits: `lastsuccessfulsync`, `lastfailedsync`,
`orgDefaultCurrencyIsoCode`, `orgDefaultCurrencyLocale`, `userDefaultCurrencyIsoCode`,
`userFullPhoto`, `userSmallPhoto` (src/pulsar.js:870-892). Every value is a string.
`await pulsar.userPhoto()` returns `{ fullphoto, smallphoto }` (all-lowercase,
src/pulsar.js:1662-1683) — the wiki's `userFullPhoto`/`userSmallPhoto` rows conflate it with
the userInfo response; reuse userInfo's fields if you already have them.

### Date / time / capture

| PSL | JS | Notes |
| --- | --- | --- |
| `@@Today` | `new Date().toISOString().substring(0, 10)` | Current date |
| `@@Now` | `new Date().toISOString()` | "formatted for the Salesforce API" |
| `@@ConvertToSFTime` | — | Converts a SQLite timestamp to an SFDC timestamp; "Requires using the TimeString parameter of the SetVar Action" — that parameter is documented nowhere; verify before relying on it |
| `@@CurrentScanCode` | `await pulsar.scanBarcode()` → plain string | SDK unwraps the bridge's `{ barcode }` (src/pulsar.js:2267-2272); ignore the `{text, format}` shape in the SDK's own docs — it's wrong |
| `@@CurrentLocation` | `await pulsar.getLocation(accuracy)` | PSL value is fixed **medium** accuracy; use `SetLocation/InMemory` for Fine/Coarse. JS accuracy: `'Fine'\|'Medium'\|'Coarse'` (default Medium); lat/long come back as STRINGS — `parseFloat` (src/pulsar.js:1714-1732) |
| `@@CreatedObjectId` | — | onSave trigger only: Id of the just-created object. PSL-only |

### Device / platform (mostly PSL-only)

| PSL | JS | Notes |
| --- | --- | --- |
| `@@OperatingSystemType` | `await pulsar.getPlatform()` → `'windows'\|'android'\|'ios'` (src/pulsar.js:1706-1711) | The wiki's empty JSAPI column predates the SDK |
| `@@FSLVersion`, `@@OperatingSystemVersion`, `@@DeviceBrand`, `@@DeviceType`, `@@ProxyServer` | — | PSL-only; no SDK method — never invent one (`getPlatformFeatures()` covers capability detection) |

### Sync stats (JS: raw `syncinfo` — SDK gap; see `pulsar-sync` for the full field table)

All `@@LastSync*`, `@@LastFailedSync*`, `@@Local*Count`, `@@Server*`, `@@Sync*`, `@@Metadata*`,
`@@Reachability*`, `@@Refresh*`, `@@PreviousSyncTime` values map 1:1 to lowercase `syncinfo`
response fields (e.g. `@@LastSyncSuccess` → `lastsyncsuccess`). Exceptions: `@@LastSyncTime`
→ `lastsuccessfulsync` and `@@LastFailedSyncTime` → `lastfailedsync` (the same names
`userInfo()` carries); `@@SyncRunning` lives in `syncstatus`, not `syncinfo`. Key facts:

```js
// SDK gap: no wrappers for 'syncinfo' / 'syncstatus' as of commit eddf62d.
try {
  const info = await pulsar._send({ type: 'syncinfo', data: {} });   // ~30 fields, ALL strings
  const { syncrunning } = await pulsar._send({ type: 'syncstatus', data: {} }); // 'TRUE' | 'FALSE'
} catch (err) { console.error(err.message); }
```

- **String-boolean split**: `@@LastSyncSuccess` (PSL) is `'TRUE'`/`'FALSE'` (Special Value
  Variables page), but the `syncinfo` response field `lastsyncsuccess` is `'YES'`/`'NO'` (Data
  Sync API — the two wiki pages disagree; in JS test for `'YES'`). `@@SyncRunning`/`syncrunning`
  and `@@CanSync` are `'TRUE'`/`'FALSE'`; `@@SyncResumed`, `@@SchemaChanged`,
  `@@MetadataSyncPerformed`, `@@ReachabilitySyncPerformed`, `@@RefreshPerformed` map to
  `'YES'`/`'NO'` syncinfo fields. `IsChanged`/`IsNew` store `"TRUE"`/`"FALSE"`.
- **Sentinels, not null**: datetimes return `'1970-01-01T00:00:00.000Z'` when a sync never
  completed/failed; durations and numeric error codes return `0`; SF error code/message and
  HTTP response code are strings where **blank = no error**; network speeds `0.0` "may be that
  the user has not synced at all yet".
- **'Last Failed' stats are sticky** — *verbatim*: they "continue to be reported with
  information from the last time an error was encountered even if subsequent syncs are
  successful". Compare `lastfailedsync` against `lastsuccessfulsync` before alarming users.
- `@@PreviousSyncTime` is the sync-window end of the sync BEFORE the current one (epoch until
  two syncs complete); `@@SyncedDataTime` "can be different from the last completed sync time,
  especially if last sync was resuming an older interrupted or failed sync".
- `@@ServerProcessedObjectCountMap` is one comma-separated STRING (`"Account: 1000,Contact:500"`),
  not JSON.
- `@@LastFailedSyncDuration` is PSL-only (no syncinfo field). `@@LocalChangesPendingCount`
  maps to syncinfo `localchangespendingcount` (the Special Value Variables page's empty JSAPI
  cell notwithstanding — the Data Sync API documents it).
  `@@CanSync` → `await pulsar.getOnlineStatus()` resolves a **real boolean** — the
  bridge data is a bare `'TRUE'`/`'FALSE'` string, not a `{canSync}` object (src/pulsar.js:2369-2373).
- `synceddatatime` appears in the wiki's JSAPI column with no `(see …)` reference and does not
  exist in the SDK; its actual bridge request type is unverified — treat `@@SyncedDataTime` as
  PSL-only.

## Known-broken wiki examples (do not copy verbatim)

- **Alert Example 2** (PSL Overview): `NoButtonAction=INCORRECT` but the block is named
  `BLOCK_TWO` — the No branch targets a nonexistent block.
- **SFCreate example**: field `LoWhoId=%%ContactId%%` — typo for `WhoId`. The **SFUpdate**
  example's caption says "create an Event object" — it updates.
- **Simple Loop example**: `Message="Loop Total is: %%LoopTotal%%` is missing its closing quote
  and semicolon; `BlockName=LOOP_BLOCK` lacks its terminating semicolon.
- **onSave Order Line Item example** ("PSL Execution Triggers"): uses typographic curly quotes
  (`‘%%Order_Id%%’`) in SQL — retype as straight `'` or the PSL/SQL breaks.
- **beforeEdit example**: uses `QueryReturnFields=@@QueryCount` / `%%QueryCount%%` — a useful
  row-count idiom, but `@@QueryCount` is documented nowhere.
- **afterSave example**: key `pulsar.afterSave.servicereport` (lowercase object name) and
  `SyncType="single"` (quoted, lowercase) both deviate from the documented formats; it also
  reads `@@CurrentObject.ParentId`, a syntax documented nowhere — verify before relying on it.
- The Overview's "Full List of Special Values" is **not** full — the "Special Value Variables"
  page and "After Sync Trigger" page add the whole sync-stat family, device values, and
  `@@currentuser.fieldname`.
