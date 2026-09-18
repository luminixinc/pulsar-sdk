# Metadata API reference (SDK signatures + JSAPI shapes)

Sources: pulsar-sdk `src/pulsar.js` (the authority for signatures and behavior; all line
numbers below refer to it) and the wiki pages "Object Schema Information", "Object Layout
Information", "Compact Layout Information", "Picklist Information", "List View Metadata",
"FieldSet Metadata", "Pulsar Platform - JS Bridge API", "Best Practices for System Admins"
(authority for platform behavior and shapes). Verified 2026-07-03.

## getSObjectSchema

```js
const schema = await pulsar.getSObjectSchema('Account');   // lines 722-739
```

- Sends `{ type: 'getSObjectSchema', object: objectName, data: {} }`. **Casing:** the wiki
  page shows request type `getSobjectSchema` (lowercase "o"); the SDK sends capital-O
  `getSObjectSchema` (line 724, confirmed by the SDK's own tests). The SDK is authoritative.
- The bridge returns the DescribeSObjectResult as a **JSON string**; the SDK parses it and
  resolves the parsed object — **never `JSON.parse` the result again**.
- Parsing quirk (unlike `getLayout`, there is **no object path**): malformed JSON throws
  `Failed to parse schema response`; a non-string bridge response throws
  `Unexpected return type. Expected JSON string but received <type>.` (lines 729-738). If a
  future Pulsar version starts returning objects here (as 12.0+ does for `getLayout`), this
  method would throw — catch and report rather than assuming success.
- Shape (JSDoc typedefs, lines 613-709; matches the Salesforce DescribeSObjectResult REST
  format the JSDoc links):
  - Object level: `name`, `label`, `labelPlural`, `keyPrefix`, `custom`, `createable`,
    `updateable`, `deletable`, `queryable`, `searchable`, `layoutable`, `compactLayoutable`,
    `feedEnabled`, …
  - `fields[]` (typedef `Field`, lines 663-709): `name`, `label`, `type` (e.g. `'string'`,
    `'picklist'`, `'reference'`), `length`, `precision`, `scale`, `nillable`, `createable`,
    `updateable`, `calculated`, `formula`, `defaultedOnCreate`, `defaultValueFormula`,
    `inlineHelpText`, `picklistValues[]`, `restrictedPicklist`, `dependentPicklist`,
    `controllerName` (controlling field for dependent picklists), `referenceTo[]`,
    `relationshipName`, `nameField`, `sortable`, `filterable`, `unique`, …
  - `recordTypeInfos[]` — the object's record types; `childRelationships[]` — child objects
    pointing at this one (what drives related lists). The SDK does not re-declare these
    nested typedefs — for their exact keys (`recordTypeId`, `developerName`,
    `defaultRecordTypeMapping`, `available`; `childSObject`, `field`, `relationshipName`)
    consult the Salesforce DescribeSObjectResult reference the SDK JSDoc links.
- **Typing:** real JSON booleans/numbers here (`createable: true`, `length: 80`) — the
  opposite convention from `getLayoutFields`/`getLayoutSections`.
- Raw picklist values (unfiltered by layout/record type):
  `schema.fields.find(f => f.name === 'Type')?.picklistValues` — entries follow the
  Salesforce PicklistEntry shape (`value`, `label`, `active`, `defaultValue`, `validFor`).

## getLayout

```js
const layout = await pulsar.getLayout('Account', recordTypeId, recordTypeName); // lines 426-449
```

- Sends `{ type: 'getLayout', object, data }` where `data` contains **at most one** of
  `RecordTypeId` / `RecordTypeName`. Precedence in code: `RecordTypeId` wins; `RecordTypeName`
  is sent only when `recordTypeId` is falsy (lines 430-433). This **contradicts** both the
  wiki ("RecordTypeName will take precedence") and the SDK's own `docs/pulsar-sdk.md` (which
  also wrongly claims at least one record-type param is required — the SDK happily sends
  `data: {}` with neither, confirmed by tests). Pass exactly one.
- `RecordTypeName` is the record type **developer name** (e.g. `'Business_Account'`), not the
  label.
- Version shim built in: Pulsar ≤11.0 returns a JSON string (parsed for you); 12.0+ returns
  an object (passed through) — lines 436-448. Never hand-shim.
- Resolves a `DescribeLayout` (rich JSDoc typedefs at lines 213-404, including which
  Salesforce fields are annotated "UNUSED BY PULSAR"): `detailLayoutSections[]` /
  `editLayoutSections[]` (each `DescribeLayoutSection`: `heading`, `columns`, `rows`,
  `layoutRows[]` → `layoutItems[]` → `layoutComponents[]`), `relatedLists[]`,
  `quickActionList`, `id`, …
- **Related-list naming traps** (SDK docs drift — the docs' own RelatedList example uses the
  wrong names and throws):
  - The DescribeLayout property is `relatedLists` (**plural**, line 226) — not `relatedList`.
  - Each RelatedList's row object type is `sobject` (line 273) — not `sobjectName`.
  - Each entry in `columns[]` (RelatedListColumn) uses `fieldApiName` as the SOQL-compatible
    path — not `apiFieldName`. Verbatim SDK docs: "we should use **always** use the
    fieldApiName and retrieve the value with `resolveSOQLFieldPath`".
  - Other RelatedList keys: `field` (FK field on the child, e.g. `AccountId`), `name`
    (ChildRelationship name), `label`, `limitRows`, `sort[]`, `buttons[]`, `custom`.

## getLayoutSections

```js
const sections = await pulsar.getLayoutSections('Account', rtId, rtName, 'edit'); // 476-510
```

- Signature `(objectName, recordTypeId, recordTypeName, layoutMode = 'display')`; validates
  `objectName` (non-empty string) and throws otherwise.
- **Precedence flip vs getLayout:** sends `RecordTypeName` when both name and id are given
  (lines 482-486). `LayoutMode` is always sent (default `'display'`; pass `'edit'` for edit
  forms — display and edit return different metadata).
- Pulsar <12.0 JSON-string shim included (lines 497-503) even though the wiki documents no
  version note for this endpoint.
- Resolves an array of (typedef lines 452-458, all values **strings**):

```js
[{ display: 'TRUE',   // 'TRUE' if a header should be shown for this section
   heading: 'Address Information',
   section: '0' }]    // 0-indexed top-to-bottom order, as a string
```

## getLayoutFields

```js
const fields = await pulsar.getLayoutFields('Account', rtId, rtName, 'edit'); // 543-571
```

- Same signature/validation pattern as `getLayoutSections`; **RecordTypeName precedence**
  when both are given (lines 552-553); Pulsar <12.0 string shim (lines 558-564).
- Resolves a flattened array of every layout field, including subcomponents of compound
  fields (e.g. address parts). Per-entry keys (SDK typedef lines 514-524 plus the wiki's
  example, which additionally shows `editableForUpdate`/`editableForNew`):

```js
[{ tabOrder: '1', editableForUpdate: 'FALSE', editableForNew: 'FALSE',
   placeHolder: 'FALSE',        // 'TRUE' = placeholder slot, render blank
   label: 'Account Name', type: 'Field', required: 'FALSE',
   displayLines: '1', name: 'Name' }]
```

- **Everything is a string** (`'TRUE'`/`'FALSE'`, `'1'`). `if (f.required)` is always true —
  compare `f.required === 'TRUE'`.

## getCompactLayoutFields

```js
const names = await pulsar.getCompactLayoutFields('Contact', undefined, 'Business_Contact');
// lines 589-609 → ['Name', 'Email', 'Phone', 'MobilePhone', 'Title']
```

- The wiki documents a **required** `data.ObjectType` duplicating the top-level object; the
  SDK auto-injects `ObjectType: objectName` (line 598) — never pass it yourself.
- **RecordTypeName precedence** when both are given (lines 599-600) — flip vs `getLayout`.
- Resolves a plain `string[]` of field API names; throws
  `Unexpected response format from getCompactLayoutFields…` if the response is not an array
  (lines 604-606). No JSON-string shim here, unlike the other layout methods.
- Use for highlight panels / header cards / list-row summaries.

## getPicklist

```js
const { itemIds, itemLabels } = await pulsar.getPicklist(
  objectName, fieldName, recordTypeId, controllerFieldName, controllerFieldValue); // 2430-2442
```

- Sends `{ type: 'getPicklist', object, fieldName, data }` — **`fieldName` travels top-level
  in the request envelope**, not inside `data` (line 2439). `data` carries optional
  `RecordTypeId` and, for dependent picklists, one `{ [controllerFieldName]:
  controllerFieldValue }` pair.
- **Silent-drop rule:** the controlling pair is included only when **both**
  `controllerFieldName` and `controllerFieldValue` are truthy (line 2433) — an empty-string
  controller value is silently dropped (confirmed by SDK test "omits controlling field if
  value is missing") and the result is not filtered by the controller. A falsy controlling
  value cannot be expressed; only one controlling pair per call.
- No client-side validation of `objectName`/`fieldName` (unlike `getUnfilteredPicklist`).
- Resolves `{ itemIds: string[], itemLabels: string[] }` — **parallel arrays** matched by
  index (values / labels), not `{value,label}` objects.
- Filtering semantics (wiki, verbatim): returns "the available picklist values and labels for
  the supplied field, or an empty array"; "the field needs to be visible and editable for the
  layout in order for the API to return the applicable values. If you wanted the raw values
  for this field, please user schema API [sic — use the schema API] to parse for this field
  and all of its values."
- Record types (wiki, verbatim, applies to both picklist methods): "You should provide the
  Record Type if your object's Record Types use different layouts with different picklist
  labels." Only `RecordTypeId` is documented/supported here — record-type *names* are a
  layout-method feature.
- Offline caveat (wiki "Best Practices for System Admins"): record-type-level picklist
  defaults exist on device **only if the field is on the layout** — "the metadata that Pulsar
  queries only contains defaults at the schema and the layout level." The server fills the
  default in after sync; don't rely on it for offline-created records.

## getUnfilteredPicklist

```js
const { itemIds, itemLabels } = await pulsar.getUnfilteredPicklist(objectName, fieldName,
                                                                   recordTypeId); // 2458-2472
```

- Validates both `objectName` and `fieldName` (throws on missing/non-string). Sends
  `data: { RecordTypeId }` or `{}`.
- Returns **all** defined values/labels regardless of layout visibility or dependency
  filtering — same `{ itemIds, itemLabels }` parallel-array shape.
- Raw-bridge note: both picklist endpoints answer with the identical response type string
  `'picklistResponse'` — indistinguishable by type. Irrelevant through the SDK (each promise
  is bound to its own request).

## listviewInfo

```js
const views = await pulsar.listviewInfo('Account');   // lines 2058-2068
// { '00Bxx0000001abc': 'All Accounts', '00Bxx0000001def': 'My New Accounts' }
```

- Validates `objectName`; sends `data: {}` (SDK comment: "currently no additional parameters
  supported", matching the wiki's "no parameters available at the moment").
- Resolves a `ListviewLabelMap` — labels keyed by ListView Id. **Ids only, no columns**: pair
  with `listviewMetadata` for structure and `select`/`read` for row data.

## viewList

```js
await pulsar.viewList('Account', listViewId);   // lines 2092-2098
```

- Navigates the **native** Pulsar UI to that list view (leaves your app's screen). Resolves
  when navigation is initiated.
- Sends `data: { listViewId }` — **camelCase** key, unlike `listviewMetadata`'s all-lowercase
  `listviewid`. The SDK sends the right key per endpoint; never hand-roll.
- No client-side validation of either parameter (inconsistent with siblings) — a bad Id
  surfaces as a native error/rejection.

## listviewMetadata

```js
const lv = await pulsar.listviewMetadata('Account', listviewId);   // lines 2130-2143
```

- Validates both params. Sends `{ type: 'listviewmetadata' /* all-lowercase */, object,
  data: { listviewid: listviewId } }` (line 2141). The wiki documents a magic
  `'@@listviewid'` key — **the SDK sends `'listviewid'` with no `@@` prefix**; only the SDK
  form is tested. Treat the wiki key as legacy.
- Resolves a `ListviewLayout` (typedef lines 2100-2108) — a shape the wiki never documents:

```js
{
  fields: ['Name', 'Industry', 'OwnerId'],   // column field API names — THE columns list
  labels: ['Account Name', 'Industry', 'Owner'],  // parallel display labels
  whereClause: "...",                        // SQLite WHERE body (no 'WHERE' keyword)
  filters: ["..."],                          // individual SQLite filter clauses
  orderBy: "...",                            // SQLite ORDER BY body
  listId: '00B...'
}
```

- Verbatim SDK docs: "The columns for the listview are defined by the `fields` property.
  There is no `columns` property." And: "Do not reference `.columns` or `.displayColumns` in
  this context."
- `whereClause`/`filters`/`orderBy` are **SQLite syntax** — feed them into `pulsar.select`
  against the local DB (see `pulsar-data-access`), not into SOQL.

## getFieldSets — missing from SDK (raw escape hatch)

No wrapper exists in `src/pulsar.js` (grep for `fieldset|getFieldSets` across the SDK repo
returns zero hits, verified 2026-07-03). Use the raw JSAPI envelope through the initialized
instance:

```js
// SDK gap: no getFieldSets wrapper — raw JSAPI request (wiki "FieldSet Metadata").
try {
  const fieldSets = await pulsar._send({
    type: 'getFieldSets',
    object: 'Account',
    args: { fieldSetName: 'my_field_set_name' },  // optional filter; NON-STANDARD 'args' key
  });
  const members = fieldSets?.my_field_set_name?.members ?? [];
} catch (err) {
  console.error('getFieldSets failed:', err.message);
}
```

- **`args`, not `data`:** this endpoint uniquely documents its parameter under `args`
  (`{ fieldSetName }`). Whether `data` also works is unverified — keep `args`.
- `pulsar._send` resolves `response.data` for any non-`'error'` type and rejects
  `Error(response.data)` on `type === 'error'` (lines 2514-2526), so no manual
  `'fieldSetsResponse'` type check is needed. (If you ever use `pulsar.bridge.send`
  callbacks directly instead, check `responseData.type === 'fieldSetsResponse'` —
  case-sensitive.)
- Org prerequisite (wiki, verbatim): "Pre-processing of FieldSets using PulsarSettings
  Manager on Salesforce Web is required for this metadata to be available." An empty/missing
  response is often a configuration issue, not a code bug.
- Response shape: dictionary keyed by fieldset API name →
  `{ members: [{ type: 'STRING'|'TEXTAREA'|…, required: false, dbRequired: true,
  name, label, apiPath }] }`.
  - `required`/`dbRequired` are **real JSON booleans** (unlike layout metadata) —
    `required` is the fieldset-level flag, `dbRequired` the database-level one.
  - `apiPath` may traverse relationships (`'Owner.Alias'`, `'LastModifiedBy.Name'`); for such
    members `name` is unreliable (the wiki's sample shows `name: 'Modified Name'`, not a
    valid API name) — **key rendering and queries on `apiPath`**, resolving values with
    `resolveSOQLFieldPath`.

## invalidateLayout event

```js
pulsar.registerHandler('invalidateLayout', () => rebuildMetadataCaches());
```

- Wiki ("Pulsar Platform - JS Bridge API", verbatim): "Triggered when Salesforce layout
  metadata changes. Use this to re-fetch layout/schema info and re-render affected
  components."
- The SDK passes this event name straight to the bridge (registerHandler, lines 66-89).
  Embedded (SFS) caveat: `deregisterHandler('invalidateLayout')` in embedded context hits the
  **shared** parent bridge and can remove the host app's handlers — see the
  `pulsar-sfs-embedded` skill before deregistering.

## Raw response-type table (raw-bridge code only)

Only needed when using `pulsar.bridge.send` callbacks (e.g. around the fieldset fallback).
Response type strings are case-sensitive and follow **no consistent naming rule** — copy,
never guess:

| Request type sent | Success response type |
| --- | --- |
| `getSObjectSchema` (SDK) / `getSobjectSchema` (wiki) | `sobjectschemaResponse` |
| `getLayout` | `layoutResponse` |
| `getLayoutSections` | `layoutSectionsResponse` |
| `getLayoutFields` | `layoutFieldsResponse` |
| `getCompactLayoutFields` | `getCompactLayoutFieldsResponse` (keeps the `get` prefix) |
| `getPicklist` / `getUnfilteredPicklist` | `picklistResponse` (identical for both) |
| `listviewInfo` | `listviewInfoResponse` |
| `listviewmetadata` (all-lowercase request) | `listviewMetadataResponse` (camelCase M) |
| `getFieldSets` | `fieldSetsResponse` |

Failures arrive as `{ type: 'error', data: '<message>' }`. The SDK's `_send` already maps
that to a rejected `Error` — which is why SDK code never touches this table.
