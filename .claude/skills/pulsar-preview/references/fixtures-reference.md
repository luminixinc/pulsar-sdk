# Fixtures reference (`mockups/fixtures.js`)

One ES module per app: `export default { … }`, imported by `preview.html`. Every key is
optional — an empty file boots most apps (schemas/layouts are synthesized from your rows).
Worked example with every key: the skill's `assets/fixtures.example.js`.

## Sample-data rules (the mock does NOT convert for you)

These mirror the kit's platform rules — fixture data must look like real local-DB data:

1. **Every field value is a string**: `'TRUE'`/`'FALSE'` booleans, `'42.0'` numbers,
   ISO-string dates (`'2026-07-03'`, `'2026-07-03T14:30:00.000Z'`).
2. **18-character Ids** with realistic prefixes: `001` Account, `003` Contact, `500` Case,
   `005` User, `0WO` WorkOrder, `08p` ServiceAppointment, `069` ContentDocument.
3. **Realistic display values** — "Edge Communications", not "Test 1"; previews are for
   judging UI, and lorem-ipsum data hides layout problems (truncation, wrapping, alignment).
4. **Enough rows to exercise the UI**: if the app pages at 25, provide 30+; include long
   names, empty optional fields, and both `'TRUE'`/`'FALSE'` states.

## Key-by-key

| Key | Shape | Feeds |
| --- | --- | --- |
| `userInfo` | partial override of the built-in mock user (all string values, lowercase keys like `userfullname`) | `userInfo()` |
| `platform` | `'ios' \| 'android' \| 'windows'` | `getPlatform()` |
| `online` | boolean (initial state) | `getOnlineStatus`/`getNetworkStatus` |
| `settings` | `{ '<key>': '<string value>' }` | `getSetting` (`Exists: 'TRUE'` + value; unknown keys → `Exists: 'FALSE'`) |
| `settingAttachments` | `{ '<key>': { FileName, FilePath, content } }` | `getSettingAttachment` |
| `customLabels` | `{ Name: 'value' }` (unknown labels echo their name) | `getCustomLabels` |
| `location` | `{ latitude, longitude, locationAccuracy }` strings | `getLocation` |
| `barcode` | string | `scanBarcode` |
| `objects` | `{ Account: { rows: [ { Id, … } ] } }` — THE core key | `read`/`select`/CRUD, schema & layout synthesis |
| `schemas` | `{ Account: DescribeSObjectResult }` — paste real device JSON for fidelity (picklistValues, referenceTo, nameField, controllerName) | `getSObjectSchema` and everything synthesized from it |
| `layouts` | `{ 'Account' or 'Account:<RecordTypeId>': DescribeLayout }` | `getLayout`/`getLayoutSections` |
| `compactLayouts` | `{ 'Account': ['Name','Phone'] }` (same optional `:RecordTypeId` keying) | `getCompactLayoutFields` |
| `relatedLists` | `{ Account: [{ sobject, field, label, columns: [{ fieldApiName, label }] }] }` | synthesized `getLayout().relatedLists` |
| `picklists` | `{ 'Case.Status': { itemIds: [], itemLabels: [] } }` (parallel arrays) | `getPicklist`/`getUnfilteredPicklist` |
| `listviews` | `{ Account: { '<00B…Id>': { label, fields, labels, whereClause, orderBy, filters } } }` | `listviewInfo`/`listviewmetadata` |
| `files` | `[{ Id(068…), ContentDocumentId(069…), Title, LinkedEntityIds: [], FileURL?, ThumbURL? }]` — omit URLs for labeled placeholder SVGs | `queryContent`/`readSFFile`/file creates append here |
| `contentUrls` | `{ '<Id or Title>': { url, title } }` | `getContentUrl` (unknown → placeholder) |
| `chatter` | `{ '<parentId>': [feed items] }` | `chattergetfeed`/`chatterpostfeed` |
| `queryOverrides` | ordered `[{ match: substring \| RegExp, rows \| fn(request), type? }]`, matched against the whitespace-normalized SQL/filter — for `read` the probe is the JSON-serialized filters object; add `type: 'select' \| 'read' \| 'queryContent'` to scope an entry; checked BEFORE the SQL interpreter | `select`/`queryContent`/`read` escape hatch (JOIN/OR/subselects) |
| `responses` | `{ '<request type>': (request) => data }` — full override; `throw 'msg'` produces an error envelope | anything, including types the mock rejects (`soqlquery`, FSL) or doesn't know |
| `autoSimulateSync` | boolean (default true) — a `syncdata` request runs `startSync()` | sync-aware UIs show their progress overlay in previews |

## Generation workflow

1. **Derive the object list and field usage from the app itself** — grep the app's JS for
   object names and field references per object; write 5–30 rows per object obeying the
   sample-data rules above. This alone renders most list/detail UIs.
2. **Let synthesis carry the metadata**: don't hand-write schemas/layouts unless the app
   reads something specific (e.g. `relatedLists`, `picklistValues`, `nameField` on a custom
   object) — then add only that key.
3. **Run the preview, read the console.** Every `[pulsar-mock]` warning names a missing
   fixture (`queryOverrides` entry, `responses` handler, picklist key). Add one fixture per
   warning and reload — the loop converges in a few iterations.
4. **Optional fidelity pass**: ask the user to capture real `getSObjectSchema` / `getLayout`
   JSON on a device (log-based capture patterns: `pulsar-dev-debug` skill) and paste it into
   `schemas` / `layouts` verbatim — picklists, reference targets, and layout order then match
   the org exactly.

## Query overrides — worked example

```js
queryOverrides: [
  {
    // The mock SQL subset has no JOIN — pin this app's assigned-work query.
    match: 'JOIN AssignedResource',
    rows: [
      { Id: '08pMOCK00000000001', Status: 'Scheduled',
        SchedStartTime: '2026-07-06T15:00:00.000Z', ParentRecordId: '0WOMOCK00000000001' },
    ],
  },
  { match: /COUNT\(\s*Id\s*\)\s+AS\s+total/i, fn: () => [{ total: '12' }] },
],
```

Keep overrides **next to a comment quoting the app code** that issues the query, so future
edits to the query and the override move together.
