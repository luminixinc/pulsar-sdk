# Dynamic UI patterns — building org-configurable screens from metadata

Worked patterns combining the metadata APIs. Sources: pulsar-sdk `src/pulsar.js` (line numbers
refer to it) and wiki "Object Layout Information", "Picklist Information", "List View
Metadata", "Best Practices for System Admins". Verified 2026-07-03. All patterns assume
`await pulsar.init()` has completed once (see `create-pulsarapp`).

The theme of every pattern: **ask the org, don't hardcode.** Field lists, requiredness,
picklist options, list view columns, and filters all come from metadata the admin controls.

## Pattern 1: metadata-driven edit form (getLayoutFields + getPicklist)

Render an edit form for a record that mirrors the org's page layout for its record type,
honoring required flags and picklist filtering.

```js
async function buildEditForm(pulsar, objectName, record) {
  // 1. Schema: field types + dependent-picklist controllers (real booleans here).
  const schema = await pulsar.getSObjectSchema(objectName);
  const fieldInfo = new Map(schema.fields.map((f) => [f.name, f]));

  // 2. Layout fields for THIS record type in EDIT mode.
  //    Positional: (objectName, recordTypeId, recordTypeName, layoutMode).
  //    'edit' is mandatory here — the default 'display' silently gives view-mode metadata.
  const layoutFields = await pulsar.getLayoutFields(
    objectName, record.RecordTypeId || undefined, undefined, 'edit');

  const controls = [];
  for (const lf of layoutFields) {
    if (lf.placeHolder === 'TRUE') continue;          // blank layout slot — render nothing
    const isNew = !record.Id;
    // Layout metadata is STRING-typed: compare === 'TRUE', never truthiness.
    const editable = (isNew ? lf.editableForNew : lf.editableForUpdate) === 'TRUE';
    const info = fieldInfo.get(lf.name);              // may be undefined for subcomponents

    const control = {
      name: lf.name,
      label: lf.label,
      required: lf.required === 'TRUE',               // convert once, at the boundary
      readOnly: !editable,
      displayLines: parseInt(lf.displayLines, 10) || 1,
      type: info?.type ?? 'string',                   // schema types are real values
      maxLength: info?.length,
      value: record[lf.name] ?? '',
    };

    if (info?.type === 'picklist' || info?.type === 'multipicklist') {
      control.options = await loadPicklistOptions(pulsar, objectName, info, record);
    }
    controls.push(control);
  }
  return controls;
}
```

Notes:

- All record values read from the local DB are **strings** — checkbox fields hold
  `'TRUE'`/`'FALSE'`; render a checkbox from `record.Field === 'TRUE'`.
- Fields on the layout but not in `schema.fields` (compound subcomponents like address parts)
  still render — fall back to a text input.
- `required === 'TRUE'` is the *layout* requiredness; the org may also enforce validation
  rules at save time — always `try/catch` the eventual `create`/`update` (see
  `pulsar-data-access`) and surface `err.message`.

## Pattern 2: picklist options, dependent picklists, and fallbacks

```js
async function loadPicklistOptions(pulsar, objectName, fieldSchema, record) {
  try {
    // Dependent picklist? Schema tells us the controlling field (real boolean + name).
    const ctrlName = fieldSchema.dependentPicklist ? fieldSchema.controllerName : undefined;
    const ctrlValue = ctrlName ? record[ctrlName] : undefined;

    // BOTH name and value must be truthy or the SDK silently drops the pair
    // (src/pulsar.js:2433) and returns values unfiltered by the controller.
    const { itemIds, itemLabels } = await pulsar.getPicklist(
      objectName, fieldSchema.name, record.RecordTypeId || undefined,
      ctrlValue ? ctrlName : undefined, ctrlValue || undefined);

    if (itemIds.length > 0) {
      return itemIds.map((value, i) => ({ value, label: itemLabels[i] })); // parallel arrays
    }

    // Empty result: the wiki warns the field must be "visible and editable for the layout".
    // Fall back to the complete, unfiltered list.
    const all = await pulsar.getUnfilteredPicklist(
      objectName, fieldSchema.name, record.RecordTypeId || undefined);
    return all.itemIds.map((value, i) => ({ value, label: all.itemLabels[i] }));
  } catch (err) {
    console.error(`Picklist ${fieldSchema.name} failed:`, err.message);
    // Last resort: raw values straight from schema (never layout/record-type filtered).
    return (fieldSchema.picklistValues ?? [])
      .filter((p) => p.active)
      .map((p) => ({ value: p.value, label: p.label }));
  }
}
```

- **Re-fetch on controller change:** when the user edits the controlling field, call
  `loadPicklistOptions` again with the new value and reset the dependent field if its current
  value is no longer in `itemIds`.
- **Defaults offline:** when pre-selecting a default for a new record, use schema-level
  defaults (`defaultedOnCreate`, PicklistEntry `defaultValue`) — record-type-level picklist
  defaults are on the device **only if the field is on the layout** (wiki "Best Practices for
  System Admins": "the metadata that Pulsar queries only contains defaults at the schema and
  the layout level"). Don't block on a default that will only appear after the record
  round-trips through the server.
- Writes: save picklist values by writing the `itemIds` value (not the label), sequentially,
  as strings — see `pulsar-data-access`.

## Pattern 3: sectioned detail page (getLayoutSections + getLayoutFields)

```js
const sections = await pulsar.getLayoutSections('Account', undefined, undefined, 'display');
for (const s of [...sections].sort((a, b) => Number(a.section) - Number(b.section))) {
  if (s.display === 'TRUE') renderSectionHeader(s.heading);   // string boolean!
  // getLayoutSections has no per-section field list — getLayoutFields is flat.
  // For true section->field grouping, walk getLayout()'s detailLayoutSections instead:
  // section.layoutRows[].layoutItems[].layoutComponents[].
}
```

`section` is a string number (`'0'`, `'1'`) — `Number()` it before sorting.

## Pattern 4: header card from the compact layout

```js
const names = await pulsar.getCompactLayoutFields('Contact', undefined, recordTypeName);
// e.g. ['Name', 'Email', 'Phone', 'MobilePhone', 'Title'] — plain field API names
const card = names.map((n) => ({ name: n, value: contact[n] ?? '' }));
```

Never pass `ObjectType` — the SDK injects it (src/pulsar.js:598). Pair with
`getSObjectSchema` for labels (`fields[].label`) since the compact layout returns names only.

## Pattern 5: reproduce an org list view against the local DB

```js
async function renderListView(pulsar, objectName, preferredLabel) {
  const views = await pulsar.listviewInfo(objectName);        // { id: label }
  const entry = Object.entries(views).find(([, label]) => label === preferredLabel)
             ?? Object.entries(views)[0];
  if (!entry) throw new Error(`No list views for ${objectName}`);
  const [listviewId] = entry;

  const lv = await pulsar.listviewMetadata(objectName, listviewId);
  // Columns: lv.fields + lv.labels (parallel). "Do not reference .columns or
  // .displayColumns" (verbatim SDK docs) — there is no columns property.

  // whereClause/orderBy are SQLite, ready for pulsar.select against the local DB.
  const sql =
    `SELECT Id, ${lv.fields.join(', ')} FROM ${objectName}` +
    (lv.whereClause ? ` WHERE ${lv.whereClause}` : '') +
    (lv.orderBy ? ` ORDER BY ${lv.orderBy}` : '');
  const rows = await pulsar.select(objectName, sql);           // all values strings

  return { columns: lv.fields.map((f, i) => ({ field: f, label: lv.labels[i] })), rows };
}
```

- Relationship columns (e.g. `Owner.Alias`-style paths) won't exist as local table columns.
  Best: JOIN them into the SQL yourself when you know the relationship (see the JOIN patterns
  in `pulsar-data-access`); for single reference fields use the schema/nameField pattern in
  `field-display-rules.md`. `pulsar.resolveSOQLFieldPath(row, path, objectName)` is the
  fallback for arbitrary multi-hop paths — cache it: one uncached `getSObjectSchema` per path
  segment (src/pulsar.js:750-802).
- To hand the user off to Pulsar's built-in list UI instead of rendering your own:
  `await pulsar.viewList(objectName, listviewId)` (navigates away from your app).
- No list view chosen? Salesforce's "Search Layout" default columns are **not retrievable** —
  no JSAPI method exists for them (field-tested Copilot note: "a new JSAPI method must be
  implemented"). Fall back to the compact layout (Pattern 4) or a hardcoded minimal column
  set.

## Pattern 5b: rendering a full `getLayout` result (field-tested algorithm)

When you need the complete detail/edit page (sections → rows → items → components), walk
`getLayout()`'s `detailLayoutSections`/`editLayoutSections` with these rules (Pulsar Copilot
knowledge base, reconciled against the SDK typedefs):

- **Section**: show `heading` unless `useHeading` is false; a section is collapsible when
  `useCollapsibleSection` is true, with initial state from `collapsed`. Its `layoutRows` are
  split into `columns` columns — **below ~400 px viewport width, stack columns vertically**
  instead of side-by-side.
- **Row**: `numItems` matches the section's `columns`; render each entry of `layoutItems`.
- **Item**: display `label` as a de-emphasized element beside the component value(s).
  `placeholder` marks an intentionally blank slot — render empty space, not a control. Per
  the SDK LayoutItem typedef it is **string-typed** (`'TRUE'`, src/pulsar.js:328-329) though
  the field-tested notes report a boolean — accept both (`p === 'TRUE' || p === true`); note
  the casing differs from `getLayoutFields`' `placeHolder`. `required` (same string typing)
  drives the edit-mode required indicator.
- **Components** (`layoutComponents[]`): a single `Field` component with an empty
  `components` array renders directly — format it per the schema info in its `details`
  property (see `field-display-rules.md`). Multiple components render by **concatenating the
  Field values with any Separator components' values** (e.g. "City, State"). `fieldType`
  `address`, `location`, and `name` are compound — their sub-`components` need a grouped
  layout, not naive concatenation.
- Always request the layout with the record's record type when it has one (record-type
  precedence foot-gun: `getLayout` sends `RecordTypeId` when both id and name are given —
  pass exactly one; see SKILL.md "Record type & layout mode").

## Pattern 6: fieldset-driven display (raw escape hatch)

Fieldsets let admins curate exactly which fields your app shows, without layout changes:

```js
// SDK gap: no getFieldSets wrapper — raw JSAPI envelope (note 'args', not 'data').
const fieldSets = await pulsar._send({
  type: 'getFieldSets', object: 'Account', args: { fieldSetName: 'mobile_summary' },
});
const members = fieldSets?.mobile_summary?.members ?? [];
for (const m of members) {
  // Real booleans here (required/dbRequired), unlike layout metadata.
  const value = m.apiPath.includes('.')
    ? await pulsar.resolveSOQLFieldPath(account, m.apiPath, 'Account') // 'Owner.Alias' etc.
    : account[m.apiPath];
  renderRow({ label: m.label, value: value ?? '', required: m.required || m.dbRequired });
}
```

Remember the org prerequisite (verbatim wiki): "Pre-processing of FieldSets using
PulsarSettings Manager on Salesforce Web is required for this metadata to be available." Treat
an empty dictionary as a probable config gap and show a graceful fallback.

## Pattern 7: metadata cache with invalidation

Metadata calls cross the JS bridge; don't re-fetch layout/schema per keystroke or per row.
Cache per `(api, objectName, recordType, mode)` and invalidate on the two events that change
metadata:

```js
const metaCache = new Map();
async function cached(key, loader) {
  if (!metaCache.has(key)) metaCache.set(key, await loader());
  return metaCache.get(key);
}
const schema = await cached('schema:Account', () => pulsar.getSObjectSchema('Account'));

// Layout metadata changed on the server (wiki: "Use this to re-fetch layout/schema info
// and re-render affected components"):
pulsar.registerHandler('invalidateLayout', () => { metaCache.clear(); rerender(); });
// New sync may bring new layouts/picklists/list views too:
pulsar.registerHandler('syncDataFinished', () => { metaCache.clear(); rerender(); });
```

Register handlers **before** triggering syncs, and see `pulsar-sync` for sync-event ordering
and `pulsar-sfs-embedded` before calling `deregisterHandler` in an embedded (SFS) app — for
non-sync events like `invalidateLayout` it hits the shared parent bridge.
