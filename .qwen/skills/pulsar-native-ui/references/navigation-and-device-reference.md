# Navigation & device reference (SDK signatures + JSAPI shapes)

Sources: pulsar-sdk `src/pulsar.js` (the authority for signatures/behavior; line numbers refer
to it) and wiki "Native Pulsar UI Interaction API", "Pulsar General Information API", "Pulsar
System Interaction API", "Pulsar Configuration API", "Language Support in Pulsar for Salesforce
App" (authority for request/response shapes and platform behavior). Verified 2026-07-03.
Prerequisite everywhere: one initialized `pulsar` instance; every call in `try/catch`.

## Native-screen timing

Verbatim wiki (Native Pulsar UI Interaction API intro): "The calls that support Pulsar native
screen interaction need to know that you will only see the response when the native screen is
dismissed by the user. For example, if your code calls `viewObject` in edit mode, when the user
types the data on the screen and hits save or cancel, you will see the JSAPI response."

Consequences: never race UI updates against a pending navigation promise; after it resolves,
re-read any records the user may have edited (`pulsar.read`, see `pulsar-data-access`).

## viewObject

```js
await pulsar.viewObject(objectName, Id, editmode = 'FALSE');   // lines 2194-2210
```

- `editmode` is the **string** `'TRUE'`/`'FALSE'` (SDK default `'FALSE'`); the wiki also
  accepts `'true'`, but standardize on `'TRUE'`/`'FALSE'`. Validates objectName and Id.
- Resolves after the user dismisses the native screen; the success payload is undocumented (do
  not rely on it to detect saved-vs-cancelled — re-read the record instead).
- The wiki's optional `returnAfterDisplay` ('true' = resolve immediately after the window is
  displayed) is **not exposed by the SDK**. Raw escape hatch:

```js
// SDK gap: viewObject() does not support returnAfterDisplay.
await pulsar._send({
  type: 'viewObject',
  object: 'Account',
  data: { Id: id, editmode: 'FALSE', returnAfterDisplay: 'true' },  // all strings
});
```

## viewRelated

```js
await pulsar.viewRelated(objectName, parentId, relationshipName);  // lines 2221-2240
```

- Verbatim wiki: "Note: You should use the API name of the child relationship. You can get this
  information from Workbench by doing a describe object call and expanding ChildRelationships
  element." (e.g. `'Contacts'` for Account→Contact.)
- KNOWN DISCREPANCY: the wiki documents the data key as `Id`; the SDK sends `parentId`
  (src 2236, covered by SDK tests). Prefer the SDK; if a target Pulsar build rejects it, fall
  back to `pulsar._send({ type: 'viewRelated', object, data: { Id: parentId, relationshipName } })`.
- Validates all three params as non-empty strings.

## viewList + listviewInfo

```js
const views = await pulsar.listviewInfo(objectName);   // lines 2058-2068 → { listviewId: label }
await pulsar.viewList(objectName, listViewId);         // lines 2092-2098
```

- `listviewInfo` returns a map of ListView Id → label; it is the documented source of ids for
  both `viewList` and `lookupObject`'s `@@listviewid` (do not use `listviewMetadata` for id
  discovery — that returns one view's field/filter definition; see `pulsar-metadata`).
- KNOWN DISCREPANCY: the wiki documents the data key as `@@listviewid`; the SDK sends
  `listViewId` (src 2096). Same fallback rule as viewRelated.
- `viewList` validates nothing — a wrong id surfaces only as a native error.

## lookupObject

```js
const [selected] = await pulsar.lookupObject(objectName, data = {});  // lines 2255-2261
```

- Verbatim SDK JSDoc: "⚠️ WARNING: This returns an array of selected objects. Even if you
  expect only one selection, always destructure the array (e.g., `const [selected] = await
  pulsar.lookupObject(...);`)."
- Three documented filter forms for `data` (passed through raw, unvalidated):
  1. Field/value pairs — simple AND equality: `{ Type: 'Prospect', Industry: 'Energy' }`
  2. `{ '@@listviewid': '<ListView Id>' }` (ids from `listviewInfo`)
  3. `{ '@@whereClause': "Account.Name = 'Apple'" }` (SOQL-style where clause)
- Do NOT copy the `{ filter: 'MyAccounts' }` key shown in the SDK docs/JSDoc examples — it is
  not a filter form; it would be treated as equality on a field literally named `filter`.
- The selected record's field set and the cancel behavior are undocumented — guard for an
  empty/undefined result and treat all field values as strings.

## showCreate

```js
const res = await pulsar.showCreate(objectName, fields = {});  // lines 2178-2184
if (res.createResult === 'TRUE') { /* res.createId is the new record Id */ }
```

- Opens the native create screen prefilled with `fields`. Resolves when the user saves;
  `createResult` is documented only as a success flag (a **string**) — the exact cancel signal
  is undocumented, so treat anything other than `'TRUE'` as not-created and keep the
  try/catch.
- Contrast with `pulsar.create(...)` (`pulsar-data-access`): `showCreate` is user-driven UI;
  `create` is a programmatic write.

## executeQuickAction + getQuickActions

```js
const { executed, quickActionResult } =
  await pulsar.executeQuickAction(ActionName, contextId, fields = {});  // lines 2281-2290
```

- Request data is `{ ActionName, ContextId?, ...fields }` — field defaults are spread at the
  **top level** of data next to ActionName, exactly as the wiki documents.
- Response booleans are **real booleans** (exception to the string convention): `executed` =
  the action UI was presented; `quickActionResult` = the target object was actually
  saved/created. Check both.
- Verbatim wiki: "This depends on the PulsarSetting *pulsar.sync.enableQuickActions,* and
  should be used in conjunction with the *getQuickActions* API if the API name of the desired
  Quick Action is not known. Please note that only Quick Actions of type 'Update' and 'Create'
  are supported by Pulsar."
- `getQuickActions` has **no SDK wrapper**. Raw escape hatch (response is an array of
  Salesforce DescribeQuickActionListItemResult metadata; the raw response type is
  `quickactionsResponse`, irrelevant through `_send`):

```js
// SDK gap: no getQuickActions wrapper — raw JSAPI request.
const actions = await pulsar._send({
  type: 'getQuickActions',
  object: 'Account',                       // or 'Global' for global quick actions
  data: { RecordTypeName: 'CustomRecordType' },  // optional; RecordTypeId also accepted
});
```

- Partial SDK alternative for per-object discovery:
  `(await pulsar.getLayout(objectName)).quickActionList.quickActionListItems` — does not cover
  Global actions or the RecordType params (`pulsar-metadata` skill).

## scanBarcode

```js
const barcode = await pulsar.scanBarcode();   // lines 2267-2272 → STRING
```

- The SDK unwraps the response's `data.barcode` and resolves the barcode **string** directly.
  The SDK doc's claimed `{text, format}` return shape is wrong (contradicts source and wiki).
- Native-screen call: resolves after the scanner UI closes. If the native side returns no
  data, the unwrap throws a raw TypeError — another reason for `try/catch`.

## mail

```js
await pulsar.mail(to, cc, attach, subject, body);   // lines 2490-2501 — POSITIONAL
await pulsar.mail(['a@x.com', 'b@x.com'], [], ['/path/to/report.pdf'], 'Subject', 'Body');
```

- `to`, `cc`, `attach` must be **arrays of strings** (recipient addresses / file paths);
  `subject` and `body` are strings. All params optional.
- **Silent-drop foot-gun**: wrong-typed args (a bare string address, a non-array attach) are
  silently discarded and the composer opens empty — no error, no warning. Always pass arrays.
- The SDK doc example uses a wrong order — `mail(to, subject, body, cc, bcc)` — which sends a
  broken email with no recipient; there is **no bcc parameter**. Trust the source signature.
- Opens a pre-populated draft; the user edits and sends manually, then returns to your app.
  Resolves when the composer launches; neither wiki nor SDK documents a sent-vs-cancelled
  signal. Attachment paths typically come from `saveAs`/camera/file APIs (`pulsar-files`).

## displayUrl

```js
await pulsar.displayUrl({ fullUrl, externalBrowser, scheme, path, queryParams } = {});
// lines 2350-2361
await pulsar.displayUrl({ fullUrl: 'https://example.com/page?x=1' });          // embedded
await pulsar.displayUrl({ scheme: 'https://', path: 'example.com/p',
                          queryParams: { a: '1' }, externalBrowser: true });   // system browser
```

- CODE TRUTH: the option keys are `fullUrl`, `externalBrowser`, `scheme`, `path`,
  `queryParams`. The SDK doc's `displayUrl({ url })` is **wrong** — `url` is ignored and an
  empty request is sent silently.
- `fullUrl` overrides `scheme`/`path`/`queryParams`. `scheme` defaults to `'https://'`;
  `queryParams` is a key/value object serialized to a query string. `externalBrowser` is a
  **real boolean** (default false = Pulsar's embedded browser; it is sent whenever not
  undefined, so `false` is transmitted explicitly).
- Verbatim wiki: "On Android, Pulsar will always attempt to open unencrypted HTTP URLs
  (\"http://\" without the \"s\") in an external browser app. This is due to security
  restrictions in place for the Android operating system." Prefer https:// for in-app display.
- The success payload is undocumented; only the rejection path is reliable.

## getLocation

```js
const { latitude, longitude, locationAccuracy } = await pulsar.getLocation('Fine');
// lines 1727-1732; accuracy 'Fine' | 'Medium' | 'Coarse' (default 'Medium', unvalidated)
```

- All three result fields are **strings** — `parseFloat` before math.
- Verbatim wiki: "This will not work properly if the user does not grant the app access to the
  device's location services." and "Retrieving location may also be a slow process. Consider
  tuning *pulsar.location.updateFrequencySeconds* Pulsar Setting to adjust the trade off
  between accuracy and speed."

## userInfo / userPhoto

```js
const info = await pulsar.userInfo();     // lines 900-905 (typedef 869-892)
const photos = await pulsar.userPhoto();  // lines 1678-1683 → { smallphoto, fullphoto }
```

- `userInfo` fields (all string values, mostly **all-lowercase keys**): `username`, `userid`,
  `locale`, `userlanguage`, `userfullname`, `userprofileid`, `userprofilename`, `userroleid`,
  `userrolename`, `organizationid`, `sessionid`, `instanceurl`, `lastsuccessfulsync`,
  `lastfailedsync`, `version` (Pulsar version), `devicelanguage`, `userSmallPhoto`,
  `userFullPhoto`, plus SDK-documented currency fields `orgDefaultCurrencyIsoCode`,
  `orgDefaultCurrencyLocale`, `userDefaultCurrencyIsoCode`.
- It is `info.userfullname` — NOT `FullName` (the SDK doc example is wrong).
- Sync timestamps equal to `'1970-01-01T00:00:00.000Z'` mean "never" — an epoch sentinel, not
  null. `lastfailedsync`/`userSmallPhoto`/`userFullPhoto` require Pulsar 9.0+.
- Photo URLs point at a local loopback HTTP server (e.g.
  `http://127.0.0.1:12345/images/userPhoto/full`) — local, not Salesforce-hosted.
- `userPhoto()` returns the same two URLs under **different key names**: `smallphoto`,
  `fullphoto` (lowercase) vs userInfo's `userSmallPhoto`/`userFullPhoto`.
- `userInfo` exposes the live `sessionid` and `instanceurl` — the ingredients for
  authenticated HTTP calls via the `callout` endpoint (no SDK wrapper; other skills).

## getPlatform / getPlatformFeatures / getDevServerEnabled

```js
const platform = await pulsar.getPlatform();          // lines 1706-1711 → 'windows'|'android'|'ios'
const features = await pulsar.getPlatformFeatures();  // lines 922-926
const dev = await pulsar.getDevServerEnabled(docId);  // lines 1692-1698 → 'TRUE'|'FALSE' STRING
```

- `getPlatformFeatures` resolves `[{ featureName, isAvailable: 'TRUE'|'FALSE', value? }]` —
  `isAvailable` is a **string**. Not documented in the wiki; SDK-only capability.
- `getDevServerEnabled` resolves the **string** `'TRUE'`/`'FALSE'`. Its raw request carries a
  top-level `args: { docId }` beside the required empty `data: {}` — the SDK emits this
  correctly (the wiki's JSON example is malformed). Top-level `args` also appears on
  `create`/`update` and the Files-domain `readDocument`; it is not unique to this call. See
  `pulsar-dev-debug`.

## getSetting / getSettingAttachment

```js
const s = await pulsar.getSetting('mycompany.myapp.mode');          // lines 1543-1552
if (s.Exists === 'TRUE') { const value = s['mycompany.myapp.mode']; }

const a = await pulsar.getSettingAttachment('mycompany.myapp.data'); // lines 1578-1587
// a = { FileName, FilePath, 'mycompany.myapp.data': <setting contents> }
```

- `getSetting`: a missing setting **resolves normally** with `Exists: 'FALSE'` — check the
  string flag, then read the value under the **dynamic key** (`result[yourKey]`), not a fixed
  field name.
- `getSettingAttachment`: **rejects** (bridge error) unless the setting exists AND has an
  Attachment or File. Read the file via `FilePath` (full path) / `FileName` (pathless). The SDK
  doc example reads `result.FileURL` — that key **does not exist** on the response.
- Pulsar Settings are the standard way to ship configuration flags and attached resources to
  your app; users must sync (or Refresh Settings) to receive changes.

## getCustomLabels + language support

```js
const labels = await pulsar.getCustomLabels(['Welcome_Msg', 'Err_Required'], 'es_MX');
// lines 1742-1753 → { Welcome_Msg: '<translated or null>', Err_Required: ... }
```

- Throws locally on an empty/non-array `labelNames`. `locale` accepts `lang_Locale` (`es_MX`)
  or bare `lang` (`es`) and is optional.
- Locale fallback (wiki): with an explicit `locale`, a miss returns `null` immediately; with no
  `locale`, Pulsar tries the current user's `lang_Locale`, then `lang`, then `en_US`, then
  returns `null`. Always null-check each label.
- Only works for Custom Labels that were post-processed into auto-generated Pulsar Settings
  (org-side pipeline; if labels come back null everywhere, that processing hasn't happened).
- i18n context (wiki "Language Support in Pulsar for Salesforce App"): Salesforce translations
  (field labels, picklist values, custom labels) flow through automatically; Pulsar localizes
  date/time/currency from device + Salesforce + org + multi-currency settings. Pulsar's own
  chrome is translated by Luminix into: en (base), zh-Hans, zh-TW, zh-Hant, da, nl-NL, fi, fr,
  de, it, ja, ko, nb, no, pl, pt, es, es-MX, tr.
- Testing (wiki recommendations): validate against device + Salesforce user + org + record
  settings; include international users (e.g. German/EUR, Japanese/JPY); review multi-currency
  scenarios (user-level and record-level currency).

## logMessage

```js
await pulsar.logMessage('sync reconciliation started', 'info');   // lines 1763-1775
```

- Levels: `'info'` (default), `'warn'`, `'error'`, `'debug'`. Messages land in the Pulsar log
  prefixed `JSAPI: `. `'debug'` messages appear **only when debug logging is enabled in
  Pulsar** — don't rely on them for production diagnostics.
- A fifth level `'Verbose'` (capital V in both wiki and SDK JSDoc, unlike the four lowercase
  levels) is defined vaguely and omitted from the wiki's own example level list — its runtime
  acceptance is unverified; stick to the four above.
- The SDK enforces the structured `{message, level}` form; the wiki's "message string in place
  of the data object" shortcut is legacy — don't use it.

## setLeavePageMessage / exit

```js
await pulsar.setLeavePageMessage('Discard your unsaved changes?');  // lines 2153-2159
await pulsar.setLeavePageMessage('');                               // disarm
await pulsar.exit();                                                // lines 2165-2170
```

- The prompt intercepts the Done button plus web navigation Refresh, Back, and Forward, showing
  a native yes/no confirmation. Verbatim wiki: "To disable this prompt, call this command again
  with a zero length string."
- Raw quirk (handled by the SDK): data is a **bare string**, not an object, and the request's
  `object` is `''`. Null/undefined messages coerce to `''` (= disarm).
- Arm it when a form becomes dirty; disarm immediately after save/reset — a forgotten message
  blocks every navigation attempt with a stale prompt.
- `exit()` closes the HTML document exactly like pressing Done, and "will work alongside the
  setLeavePageMessage command" (the prompt still fires). Typical pattern: save → disarm → exit.

## String vs boolean flags in this domain

| Value | Type |
| --- | --- |
| `viewObject` editmode (request) | STRING `'TRUE'`/`'FALSE'` |
| `showCreate` → `createResult` | STRING `'TRUE'`/`'FALSE'` |
| `getSetting` → `Exists` | STRING `'TRUE'`/`'FALSE'` |
| `getDevServerEnabled` result | STRING `'TRUE'`/`'FALSE'` |
| `getPlatformFeatures` → `isAvailable` | STRING `'TRUE'`/`'FALSE'` |
| `getLocation` → latitude/longitude/accuracy | STRINGS |
| `scanBarcode` result | STRING |
| `executeQuickAction` → `executed`, `quickActionResult` | **real booleans** |
| `displayUrl` `externalBrowser` (request) | **real boolean** |

## Related endpoints in other skills

- Camera, photo/file pickers, PDF generation (`saveAs`), printing, Salesforce Files →
  `pulsar-files`.
- `getLayout`, `listviewMetadata`, picklists, schema → `pulsar-metadata`.
- Online/offline status, sync orchestration → `pulsar-sync`.
- Home App dispatch (`dispatchtohomeapp`), FSL flows → `pulsar-sfs-embedded`.
- Dev server + logging workflow → `pulsar-dev-debug`.
