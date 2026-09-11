---
name: pulsar-metadata
description: Read Salesforce metadata offline in a Pulsar .pulsarapp — object schema (DescribeSObjectResult), page layouts, compact layouts, picklists, list views, and fieldsets — through the Pulsar JS SDK to build dynamic, org-configurable UI. Use when rendering record detail/edit forms that mirror org page layouts, building picklist or dependent-picklist inputs, reproducing org list views against the local database, driving displayed fields from fieldsets or compact layouts, or looking up field types, record types, and child relationships from schema.
---

# Metadata-driven UI in a .pulsarapp

Pulsar syncs org metadata to the device alongside data, so schema, layouts, picklists, and list
views are all readable **offline** through the SDK. Drive your UI from this metadata instead of
hardcoding field lists — admins then reconfigure the org without an app redeploy.

Prerequisite: `const pulsar = new Pulsar(); await pulsar.init();` exactly once (see
`create-pulsarapp`). Wrap every call in `try/catch`.

## Choosing a metadata API

| Need | Use |
| --- | --- |
| Field types/lengths, raw picklist values, record types, child relationships | `await pulsar.getSObjectSchema('Account')` → parsed DescribeSObjectResult |
| Full layout model (sections → rows → items, related lists, quick actions) | `await pulsar.getLayout(obj, recordTypeId, recordTypeName)` |
| Section headings / order / header visibility only | `await pulsar.getLayoutSections(obj, rtId, rtName, mode)` |
| Flat field list to build a form | `await pulsar.getLayoutFields(obj, rtId, rtName, mode)` |
| Highlight/header-card fields | `await pulsar.getCompactLayoutFields(obj, rtId, rtName)` → `string[]` |
| Picklist options the user should actually see (layout/RT/dependency filtered) | `await pulsar.getPicklist(obj, field, rtId?, ctrlField?, ctrlValue?)` |
| Every picklist value, ignoring layout filtering | `await pulsar.getUnfilteredPicklist(obj, field, rtId?)` |
| Which list views exist for an object | `await pulsar.listviewInfo(obj)` → `{ '<listviewId>': '<label>' }` |
| A list view's columns + SQLite filter clauses | `await pulsar.listviewMetadata(obj, listviewId)` |
| Open the native Pulsar list view screen | `await pulsar.viewList(obj, listViewId)` |
| FieldSets | **No SDK wrapper** — raw `pulsar._send` escape hatch below |
| Display/edit a single `reference` field | Schema `referenceTo` → target's `nameField` → `read`; edit via `lookupObject` — pattern in `references/field-display-rules.md` (do NOT use `resolveSOQLFieldPath` for this) |
| Resolve `Owner.Alias`-style relationship paths | `await pulsar.resolveSOQLFieldPath(record, path, obj)` — multi-hop paths only, cached (see `pulsar-data-access`) |
| How to render/edit each field TYPE (dates, currency, phone, multipicklist, …) | Per-type contract in `references/field-display-rules.md`, incl. locale precedence from `userInfo()` |

## Record type & layout mode — the silent foot-guns

1. **Record-type precedence flips between sibling methods** (src/pulsar.js, verified
   2026-07-03): `getLayout` sends **RecordTypeId** when both id and name are given (lines
   430-433; JSDoc: "If both are provided, recordTypeId takes precedence"), while
   `getLayoutSections` (482-486), `getLayoutFields` (552-553), and `getCompactLayoutFields`
   (599-600) send **RecordTypeName** when both are given. Rule: **pass exactly one, never
   both.** (The wiki "Object Layout Information" and the SDK's own `docs/pulsar-sdk.md` claim
   name-precedence for `getLayout` — the code is authoritative.)
2. Signatures are positional: `(objectName, recordTypeId, recordTypeName, layoutMode?)`. To
   use a record type **developer name** (not its label), pass `undefined` in the id slot:
   `pulsar.getLayoutFields('Contact', undefined, 'Support', 'edit')`.
3. `layoutMode` defaults to `'display'` — forgetting `'edit'` when building an edit form
   silently returns display-mode metadata (`getLayoutSections`/`getLayoutFields` only;
   `getLayout` and `getCompactLayoutFields` take no mode).
4. Never pass the wiki's "required" `data.ObjectType` to `getCompactLayoutFields` — the SDK
   injects it from `objectName` automatically (line 598).
5. Never write the wiki's `typeof data === 'string' ? JSON.parse(data) : data` shim: the SDK
   normalizes Pulsar ≤11.0 JSON strings vs 12.0+ objects for `getLayout`/`getLayoutSections`/
   `getLayoutFields` (`getCompactLayoutFields` has no shim — it throws on any non-array), and
   `getSObjectSchema` resolves an **already-parsed** object — never `JSON.parse` SDK results.

## Value typing varies by API — do not mix conventions

| API | Booleans/numbers arrive as |
| --- | --- |
| `getLayoutSections` / `getLayoutFields` | **Strings**: `'TRUE'`/`'FALSE'`, `'1'` — compare `field.required === 'TRUE'`; plain truthiness is always true |
| `getSObjectSchema` | Real JSON booleans/numbers (`createable: true`, `length: 80`) |
| `getFieldSets` members | Real JSON booleans (`required: false`, `dbRequired: true`) |

## Schema and full-layout notes

- `getSObjectSchema` resolves a parsed DescribeSObjectResult: `fields[]` (types, lengths,
  `picklistValues[]`, `referenceTo`, `controllerName`), `recordTypeInfos[]`,
  `childRelationships[]`. The SDK sends request type `getSObjectSchema` (capital O,
  src/pulsar.js:724); the wiki page "Object Schema Information" shows lowercase
  `getSobjectSchema` — the SDK is authoritative.
- Related lists in a `getLayout` result: the property is **`relatedLists`** (plural,
  src/pulsar.js:226), each entry's row type key is **`sobject`** (not `sobjectName`, line
  273), and each column's query path is **`fieldApiName`** (not `apiFieldName`; per the SDK
  docs' RelatedListColumn table — `src/pulsar.js` never declares that typedef). The SDK
  docs' own RelatedList example uses all three wrong names and crashes — trust the
  `src/pulsar.js` typedefs for `relatedLists`/`sobject` and the docs' column table for
  `fieldApiName`. Resolve column values with `resolveSOQLFieldPath`.

## Picklists

```js
try {
  const { itemIds, itemLabels } = await pulsar.getPicklist(
    'Case', 'Sub_Status__c', recordTypeId, 'Status', currentStatus);
  const options = itemIds.map((v, i) => ({ value: v, label: itemLabels[i] }));
} catch (err) { console.error('Picklist failed:', err.message); }
```

- Results are two **parallel arrays** (`itemIds` = stored values, `itemLabels` = labels),
  matched by index — not `{value, label}` objects.
- `getPicklist` is layout-filtered. Verbatim wiki ("Picklist Information"): "the field needs
  to be visible and editable for the layout in order for the API to return the applicable
  values." If it comes back empty, fall back to `getUnfilteredPicklist` or the raw
  `schema.fields[i].picklistValues` from `getSObjectSchema`.
- Verbatim wiki: "You should provide the Record Type if your object's Record Types use
  different layouts with different picklist labels."
- Dependent picklists: pass **both** `controllerFieldName` and `controllerFieldValue`. If
  either is falsy (even `''`), the SDK **silently drops the pair** (src/pulsar.js:2433) and
  you get results unfiltered by the controller. One controlling pair per call; re-fetch when
  the controlling input changes.
- **Record-type picklist defaults don't exist offline** unless the field is on the layout —
  Pulsar downloads only schema- and layout-level defaults (wiki "Best Practices for System
  Admins"). Offline-created records may lack them until they round-trip through the server.

## List views

```js
// try/catch omitted for brevity — required in real code
const views = await pulsar.listviewInfo('Account');             // { id: label }
const [listviewId] = Object.keys(views);
const lv = await pulsar.listviewMetadata('Account', listviewId);
const rows = await pulsar.select('Account',
  `SELECT ${lv.fields.join(', ')} FROM Account` +
  (lv.whereClause ? ` WHERE ${lv.whereClause}` : '') +   // whereClause can be empty
  (lv.orderBy ? ` ORDER BY ${lv.orderBy}` : ''));
```

- Columns come from **`lv.fields`** (labels index-aligned in `lv.labels`). Verbatim SDK docs:
  "Do not reference `.columns` or `.displayColumns`" — "There is no `columns` property."
- `whereClause` / `filters` / `orderBy` are **SQLite** syntax for `pulsar.select` against the
  local DB — not SOQL for the server.
- The old wiki shows a magic `'@@listviewid'` data key; the SDK sends `'listviewid'` (no
  `@@`, all lowercase, src/pulsar.js:2141). `viewList` sends camelCase `listViewId` instead.
  Never hand-roll these requests — call the SDK methods and the keys are handled.
- `viewList(objectName, listViewId)` navigates to the **native** list view screen (leaves
  your app UI; see `pulsar-native-ui` for native-screen patterns).

## FieldSets — no SDK wrapper (raw escape hatch)

```js
// SDK gap: no getFieldSets wrapper in pulsar.js (verified 2026-07-03) — raw JSAPI envelope.
// NOTE the non-standard 'args' key (not 'data'), per wiki "FieldSet Metadata".
// try/catch omitted for brevity — required in real code
const fieldSets = await pulsar._send({
  type: 'getFieldSets',
  object: 'Account',
  args: { fieldSetName: 'my_field_set_name' },   // omit for all fieldsets of the object
});
```

- Org prerequisite, verbatim wiki: "Pre-processing of FieldSets using PulsarSettings Manager
  on Salesforce Web is required for this metadata to be available." An empty result may be a
  configuration gap, not a code bug.
- Result is keyed by fieldset API name; each has `members[]`: `{ type, required, dbRequired,
  name, label, apiPath }` with **real** booleans. `apiPath` may traverse relationships
  (`'Owner.Alias'`) — key rendering and queries on `apiPath` (via `resolveSOQLFieldPath`),
  never on `name`.

## Keeping metadata fresh

- Cache schema/layout/picklist results in app state, but register
  `pulsar.registerHandler('invalidateLayout', refetch)` to drop caches — the event fires when
  "Salesforce layout metadata changes. Use this to re-fetch layout/schema info and re-render
  affected components" (verbatim wiki "Pulsar Platform - JS Bridge API"). Also refresh after
  `syncDataFinished` (see `pulsar-sync`).
- `resolveSOQLFieldPath` issues one uncached `getSObjectSchema` per path segment — keep it
  out of tight render loops.
- In SDK-based code, never branch on response type strings (`'layoutResponse'`,
  `'picklistResponse'`, …): the SDK rejects on `type === 'error'` and resolves `data`
  otherwise. Type strings matter only in raw code like the fieldset fallback (see reference).

## References

- `references/metadata-api-reference.md` — every method: signature, SDK line numbers, exact
  request sent, response shape, quirks; schema/layout field maps; raw response-type table.
- `references/dynamic-ui-patterns.md` — worked patterns: metadata-driven edit form
  (`getLayoutFields` + `getPicklist` honoring `'TRUE'` flags), full `getLayout`
  section/row/item rendering algorithm, list view reproduction, compact-layout header card,
  caching + `invalidateLayout`.
- `references/field-display-rules.md` — field-tested per-type display/entry contract for
  every schema field type, the reference-field display/edit pattern, and locale rules.
