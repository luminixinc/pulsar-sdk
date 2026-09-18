# CRUD & query reference (SDK signatures + JSAPI shapes)

Sources: pulsar-sdk `src/pulsar.js` (commit `eddf62d`, the authority for signatures/behavior)
and wiki "Local Database API (CRUD requests)" / "Salesforce Data Query (SOQL)" (authority for
request/response shapes). Verified 2026-07-03. Line numbers refer to `src/pulsar.js`.

## read

```js
const records = await pulsar.read(objectName, filters = {});   // lines 132-138
```

- Sends `{ type: 'read', object, data: filters }`. Filters are exact-match, case-sensitive,
  AND-combined equality — no LIKE/OR/ranges.
- Resolves to an **array of records**; all field values are strings. Empty `filters` returns
  all rows of the type — **never do that** (field-tested: unfiltered `read` "can easily fail"
  on real data volumes; use a paginated `select` instead).
- No client-side validation of `objectName`.

## create

```js
const newId = await pulsar.create(objectName, fields = {}, args = {});  // lines 147-154
```

- Sends `{ type: 'create', object, data: fields, args }` (args always included).
- `args` (string values!): `allowEditOnFailure: 'TRUE'|'FALSE'` (default `'TRUE'` — native
  create screen pops over your app on failure; pass `'FALSE'` for programmatic control),
  `skipLayoutRequiredFieldCheck: 'TRUE'|'FALSE'` (default `'FALSE'`).
- Resolves with the response's data payload — per SDK JSDoc the new record Id string. (The
  SDK's own test mocks an object here; trust runtime = Id string per wiki `createResponse`,
  but don't destructure without checking.)
- Side effects when enabled: PSL object triggers, validation rules, formula recalculation,
  parent roll-up recalculation.

## update

```js
await pulsar.update(objectName, fields);   // fields.Id REQUIRED — lines 162-173
```

- Throws locally `"Update requires 'Id' field."` if `fields.Id` is missing (calling with
  `undefined` fields throws a raw TypeError — always pass an object).
- Single record only. **No `args` parameter** — `skipLayoutRequiredFieldCheck` is unreachable
  through the SDK; fall back to `pulsar._send({ type: 'update', object, data, args })` if
  genuinely required, and comment why.

## delete / deleteBatch

```js
await pulsar.delete(objectName, id);            // bare Id string — lines 181-188
const res = await pulsar.deleteBatch(objectName, idList);   // lines 1352-1368
```

- `delete`: single record; SDK builds `data: { Id: id }`; throws if `id` falsy.
- `deleteBatch`: sends `{ type: 'deletebatch', object, data: { objectIdList } }`; validates a
  non-empty all-string array. Response:

```js
{
  summary: { success: 'TRUE' },          // 'TRUE' only if ALL succeeded — STRING
  results: {
    '<Id>': { objectId: '<Id>', success: 'TRUE'|'FALSE', error: '<msg or "">' }, ...
  }
}
```

- Partial success is normal; iterate `results` (an object keyed by Id, not an array).
- Salesforce rules (e.g. dependent children without cascade delete) can block individual
  deletions.

## select (local SQLite, read-only)

```js
const rows = await pulsar.select(objectName, query);   // lines 199-211
```

- Sends `{ type: 'select', object, data: { query } }`. Dialect is **SQLite** (SDK JSDoc; the
  wiki says only "SQL-like"). The `object` param is still required even though the SQL names
  the table.
- Read-only; executes against the local cache (last sync + local edits). All values strings.
- SQLite notes: `LIKE` is case-insensitive for ASCII; quote string literals with single
  quotes; there is no documented parameterization — build strings carefully and escape
  user-supplied `'` as `''`.
- **JOINs work** (tables are named by object API name, singular) — the field-tested way to
  traverse relationships in one query, e.g.
  `SELECT c.* FROM Contact c JOIN Account a ON c.AccountId = a.Id WHERE a.Industry = 'Energy'`.
- **Paginate browse lists**: `ORDER BY <field> LIMIT <pageSize> OFFSET <page * pageSize>` —
  never load a whole large table into the WebView.

## soqlquery (online SOQL — NO SDK wrapper)

```js
// SDK gap: no wrapper for 'soqlquery' as of commit eddf62d.
const result = await pulsar._send({
  type: 'soqlquery',
  data: { query: "SELECT Id, Name FROM Account WHERE Name = 'Edge Communications'" },
});
```

- Documented only on the wiki page "Salesforce Data Query (SOQL)" (page 2838003722; missing
  from the original wiki export — see the supplement). Read-only. Queries **the org**, implying an online round-trip — check
  `getOnlineStatus()`/`getNetworkStatus()` first and provide an offline fallback (usually
  `select` over synced data).
- Response is "Salesforce SOQL query response format" — the standard REST query shape
  (`totalSize`, `done`, `records[]` with `attributes`).
- The wiki page's own example is broken (unescaped quotes, missing closing quote, typo) — do
  not copy it.

## updateQuery (raw local UPDATE — dangerous)

```js
const status = await pulsar.updateQuery(objectName, query);  // lines 1310-1326 → 'success'
```

- Sends `{ type: 'updateQuery', object, data: { query } }`. Bypasses validation rules, formula
  recalculation, roll-up summaries; can desynchronize local data from Salesforce.
- Behavior (wiki): offline → changes stored and synced later; online → pushed to Salesforce,
  but server errors are NOT in the main response — they arrive in a top-level `errors` array
  *sibling* of `data`… which the SDK's `_send` discards. Via the SDK you can only observe
  local success (`'success'`). (The SDK doc's claim that you must call `syncData()` yourself
  contradicts the wiki; trust the wiki for native behavior.)
- Boolean-ish local fields in SQL: use string literals, e.g. `SET Active__c = 'TRUE'`.

## resolveSOQLFieldPath (client-side relationship walk)

```js
const val = await pulsar.resolveSOQLFieldPath(record, 'Owner.Manager.Name', 'Case');
```

- Pure-JS helper chaining `getSObjectSchema` + `read` per path segment (lines 750-802).
- Caveats: returns `null` indistinguishably for "not found" and "legitimately null";
  polymorphic lookups fall back to guessing `referenceTo[0]`; one schema fetch per segment
  (slow on long paths/loops — cache results).

## Response envelope (what the SDK hides)

Native responses are `{ type: '<requestType>Response' | 'error', object, data }`. The SDK's
`_send` resolves `response.data` only and rejects `Error(response.data)` when
`type === 'error'` — `response.type`, `response.object`, and any extra top-level keys (e.g.
`updateQuery.errors`, `getOnlineStatus.args`) are **discarded**. When a wiki page documents
payload outside `data`, the SDK cannot deliver it; use `pulsar.bridge.send(request, cb)` raw
for those cases only.

## Worked example: safe sequential writes

```js
async function saveLineItems(pulsar, orderId, items) {
  const created = [];
  try {
    for (const item of items) {              // sequential — NEVER Promise.all writes
      const id = await pulsar.create(
        'OrderItem__c',
        {
          Order__c: orderId,
          Qty__c: String(item.qty),                          // strings!
          Delivery_Date__c: item.date.toISOString().substring(0, 10),
        },
        { allowEditOnFailure: 'FALSE' },
      );
      created.push(id);
    }
    return created;
  } catch (err) {
    console.error('Save failed after', created.length, 'items:', err.message);
    throw err;    // caller decides whether to deleteBatch the partial set
  }
}
```
