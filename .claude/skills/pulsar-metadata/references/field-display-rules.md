# Field display & entry rules — the per-type rendering contract

How to display and edit each SObject field type, driven by `getSObjectSchema` metadata.
Source: the Pulsar Copilot GPT knowledge base (field-tested by Pulsar developers, ~2025),
reconciled against pulsar-sdk @ `eddf62d` and the wiki; verified 2026-07-03. **Always adhere
to the formatting defined by the SObject schema** — never guess formats.

Remember: values from the local DB arrive as **strings** for every type below; the schema
(`fields[]` entries) carries real JSON types (`length: 80`, `nillable: true`).

## Flags common to all field types

| Property (source) | UI obligation |
| --- | --- |
| `inlineHelpText` (schema Field) | When present, show a small info icon with a clickable tooltip next to the field |
| required — from **layout metadata**, not the schema Field entry: `getLayoutFields` `required === 'TRUE'` / `getLayout` item `required === 'TRUE'` (strings). Schema-derived approximation: `createable && !nillable && !defaultedOnCreate` | Edit mode: mark the field required (e.g. red indicator). Display mode: nothing |
| `nillable` (schema Field) | Especially for picklists: provide an empty option when editing |
| `updateable` (schema Field) | `false` → no editable input when **editing** an existing record |
| `createable` (schema Field) | `false` → no editable input when **creating** a record |

## Per-type rules

| Type | Display | Edit |
| --- | --- | --- |
| `string` | As-is, single line | Text input; enforce schema `length` |
| `textarea` | Fixed-height element that scrolls with content. `extraTypeInfo` distinguishes `plaintext` vs `richtextarea` — if rendering rich text without a renderer, surface that limitation rather than dumping raw HTML | Multi-line input |
| `double` | Format with `precision` (total digits) and `scale` (decimal digits); no extra leading zeros | Numeric input constrained to precision/scale |
| `int` | Format with `digits`; integers never show decimals or leading zeros | Numeric input limited to `digits` |
| `boolean` | Non-modifiable checkbox; checked = the STRING `'TRUE'` | Interactive checkbox; write back `'TRUE'`/`'FALSE'` strings |
| `date` | Formatted date, **no time portion**, per locale (below) | Date picker |
| `datetime` | Formatted date + time per locale; stored value is ISO 8601 UTC (`Z`) — convert to local for display, back to UTC on save (`pulsar-data-access`) | Combined date+time picker |
| `picklist` | Show the **label** matching the stored value (via `picklistValues[]`) | Dropdown — see picklist table below |
| `multipicklist` | Semicolon-joined string as stored (`Red;Blue;Green`) | Dual-list UI (available ↔ selected); store back as one `;`-delimited string |
| `currency` | Localized number + currency symbol; `precision`/`scale` as for double; a record `CurrencyIsoCode` value takes precedence over locale defaults | Numeric input |
| `percent` | Number + `%`, `scale` decimals, locale separators, no leading zeros (`5%`, not `005.00%`) | Numeric input constrained to precision/scale |
| `phone` | Clickable `tel:` link; format per locale where possible; stored as a plain string with no schema-enforced format | Text input accepting digits, parens, spaces, dashes; don't over-enforce format |
| `url` | Clickable `<a target="_blank" rel="noopener noreferrer">`; if no protocol, prepend `https://`; fallback text for malformed values | Text input with URL validation/warning |
| `email` | Clickable `mailto:` link with basic format validation | `<input type="email">`; no forced lowercasing |
| `location` | `Latitude, Longitude` decimal pair, `scale` decimals, locale-formatted; optionally a map pin | Two numeric inputs; validate lat ∈ [-90, 90], lng ∈ [-180, 180]; either may be blank if `nillable` |
| `base64` | **Do not display** |
| `id` | **Do not display** (use it, don't show it) |
| `reference` | Resolve to the related record's name field — pattern below | Searchable lookup via `lookupObject` — pattern below |

## Picklist rendering (what drives what)

| Behavior | Controlled by |
| --- | --- |
| Dropdown options | `picklistValues[].label` |
| Stored value | `picklistValues[].value` |
| Initial value | `picklistValues[].defaultValue` |
| Availability | `picklistValues[].active` |
| Blank option shown | `nillable` |
| User must select | layout `required === 'TRUE'` (see common flags above) |
| Controlled by another field | `dependentPicklist` (boolean) + `controllerName` (the controlling field's API name — src/pulsar.js:669; the Copilot notes call it `controllingField`, which does not exist in the SDK schema). Fetch filtered options with `getPicklist` — `dynamic-ui-patterns.md` Pattern 2 |

A **combobox** (text input + dropdown) is a rendering pattern, not a schema type — use it for
`picklist` (type-ahead filter), `multipicklist` (searchable multi-select), and `reference`
(lookup, powered by `lookupObject`).

## Reference fields — the field-tested pattern

Golden rule from the Copilot knowledge base: **do not use `resolveSOQLFieldPath` to display a
reference field.** Resolve it schema-aware instead (one extra read, no per-segment schema
fetches, no polymorphic guessing):

```js
// DISPLAY: AccountId on a Contact, resolved to the Account's name field.
const schema = await pulsar.getSObjectSchema('Contact');
const refField = schema.fields.find((f) => f.name === 'AccountId');
const [target] = refField.referenceTo;          // several entries? pick by context or ask
const targetSchema = await pulsar.getSObjectSchema(target);
const nameField = targetSchema.fields.find((f) => f.nameField)?.name ?? 'Name';
const [related] = await pulsar.read(target, { Id: contact.AccountId });  // filters OBJECT
renderValue(related?.[nameField] ?? '');
```

- Polymorphic lookups (`referenceTo.length > 1`): choose by context — e.g.
  `ServiceAppointment.ParentRecordType` names the type for `ParentRecordId` (see the
  `pulsar-sfs-embedded` skill's FSL data patterns) — or prompt the user; never silently guess.
- Cache both schemas; resolve visible rows only (lazy) when rendering lists.
- `resolveSOQLFieldPath` remains acceptable **only** for multi-hop dot paths you cannot join
  yourself (e.g. list-view relationship columns), cached — see its caveats in
  `pulsar-data-access`.

```js
// EDIT: searchable lookup dialog; returns an ARRAY even for one selection.
const [selected] = await pulsar.lookupObject(target);   // always destructure (SDK ⚠️)
if (selected) contact.AccountId = selected.Id;          // then sequential update()
```

## Locale rules for all formatting (field-tested)

From `userInfo()` (all values strings):

1. General formatting locale: `userlanguage` if present, else `devicelanguage`, else `en_US`.
2. Currency **locale**: `orgDefaultCurrencyLocale` if present, else the general locale above.
3. Currency **symbol/code**: `userDefaultCurrencyIsoCode` takes precedence over
   `orgDefaultCurrencyIsoCode`; a per-record `CurrencyIsoCode` (multi-currency orgs)
   overrides both for that record.

`Intl.NumberFormat`/`Intl.DateTimeFormat` accept these locales after `_` → `-` conversion
(`en_US` → `en-US`).
