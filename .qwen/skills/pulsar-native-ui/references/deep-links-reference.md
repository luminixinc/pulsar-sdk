# Pulsar Deep Links reference

Source: wiki "Pulsar Deep Links"
(<https://luminix.atlassian.net/wiki/spaces/PD/pages/1052966913/Pulsar+Deep+Links>), verified
2026-07-03; SDK cross-checks against `src/pulsar.js` (line numbers). Deep links are the entry
mechanism into Pulsar from OUTSIDE (emails, websites, other apps, OAuth redirect URIs). For
navigation from INSIDE a `.pulsarapp`, use the SDK methods (mapping table below).

## URL forms (Pulsar 13.0.0+)

Two interchangeable forms — every example below works with either prefix:

```
pulsar://{action}/{objectType}[/{objectId}]?parameter1=value1&parameter2=value2
https://www.luminixinc.com/pulsarapp/{action}/{objectType}[/{objectId}]?parameter1=value1
```

- Actions: `view`, `edit`, `update`, `create`, `list`, `quickaction`, `flow`,
  `launchdocument`, `custom_oauth`. (The wiki's action bullet list contains the typo
  `custom_oath` — the correct action, used by its own heading and examples, is
  `custom_oauth`.)
- `{objectType}` must be a Salesforce object type synced with Pulsar; `{objectId}` a valid Id
  for that type. Deep links resolve against the **local synced database** — an unsynced record
  cannot be targeted. Examples use 18-character Ids.
- Verbatim wiki: "The Salesforce object type is case sensitive. For example, please use
  `WorkOrderLineItem` and not `workOrderLineItem` or `workorderlineitem`." and "Parameters are
  also case sensitive!" (that includes `__field`, `qa`, `flow`, `@@listviewid`).

## Object Selectors and Arguments

Object Selectors locate the record the action targets:

| Selector | Meaning |
| --- | --- |
| `Id` | Salesforce Id of the target record (also acceptable as the `{objectId}` path segment) |
| `__field` | Field API name to select by (must exist on the object type) |
| `__value` | Expected value of `__field` — always paired with it |

Arguments alter action behavior:

| Argument | Default | Meaning |
| --- | --- | --- |
| `__show` | false | Display the resulting object after performing the action. Wiki: "relevant for **edit**, **update**, **create, list** and possibly **quickaction**" — the 'possibly' is the doc's own wording; no example uses `__show`, so its per-action effect is unverified |
| `__create` | false | If the selectors find nothing, open a create page populated with the provided values. Ignored by `list` whenever records match the filters |
| `qa` | — | `quickaction` only: the QuickActionName (API Name) of the quick action |
| `flow` | — | `flow` only: the Flow API Name |
| `@@listviewid` | — | `list` only: open a specific Salesforce listview |

## THE core semantics trap: what plain `field=value` params mean per action

| Action | Plain params mean | `__field`/`__value` | No-selector behavior |
| --- | --- | --- | --- |
| `view` | SEARCH criteria — ALL must match | selector | params ARE the search |
| `edit` | CHANGES applied to the record (in the edit screen) | selector | record-picker list; then ALL params — including what you meant as a filter — are applied as changes |
| `update` | CHANGES applied with **no edit screen, no confirmation** | selector | same picker trap as edit |
| `create` | initial field values (no selectors exist) | n/a | blank create page if no params |
| `list` | filters on the object type | **not supported** | all records listed |
| `quickaction` | (use selectors for context) | selector | — |
| `flow` | (use selectors for context) | selector | — |
| `launchdocument` | forwarded to web content as URL params | n/a | `Id` in path or `?Id=` |

Copy-pasting a `view`-style URL into `edit`/`update` silently turns your filter into a data
change. When the user should review changes, prefer `edit`: the `update` deep link "performs
the object update without presenting an edit screen with which to make additional changes"
(verbatim) — a tapped link can silently modify a record.

When selectors match nothing and `__create` is not set, `view`/`edit`/`update` show no
user-facing error — "An error log will be recorded." A bad `@@listviewid`, by contrast, "will
raise an error toast."

## Per-action notes and examples

### view

Verbatim: "All parameters passed in *must* be matched in order to show the object." Multiple
matches present a list for the user to choose from. Supports `__create`.

```
pulsar://view/Account/0018c00002ANfAQAA1
pulsar://view/Account?__field=Name&__value=MyAccount
pulsar://view/Account?Name=DoesNotExist&__create=true    → new Account in create mode, Name prefilled
```

### edit

Opens the record in Edit mode with param values staged as pending changes. Selector matching
uses `Id`/`__field`/`__value`; multiple matches present a picker. (The wiki prose saying
"__field and __value parameters ... will be considered changes" contradicts every example on
the page — in the examples `__field`/`__value` are selectors and plain params are the changes;
trust the examples.)

```
pulsar://edit/Account/0018c00002ANfAQAA1?Description=Edited
pulsar://edit/Account?__field=Name&__value=MyAccount&Description=Edited
```

### update

Headless variant of edit — applies the changes directly, no edit screen. With
`__create=true` and no match, it navigates to a create page instead (the wiki does not say it
creates silently).

```
pulsar://update/Account?__field=Name&__value=MyAccount&Description=Edited
```

### create

No selectors; every param is an initial field value.

```
pulsar://create/Account?Description=hello
```

### list

Params filter the list; `__field`/`__value` are NOT supported. `@@listviewid` opens a specific
listview, and additional params filter within it. `__create` is ignored whenever matches exist.

```
pulsar://list/Account?Name=MyAccount
pulsar://list/ServiceAppointment?@@listviewid=00B0400000AAABBBCC&AppointmentNumber=SA-0063
```

### quickaction

`qa` must match the QuickActionName (API Name) of a quick action defined on the object type;
object selectors must resolve a valid context.

```
pulsar://quickaction/Account/0018c00002ANfAQAA1?qa=NewContact
```

### flow

`flow` must match the Flow API Name; selectors resolve the context record. Verbatim: "Note: The
**flow** action is only available in FSL orgs."

```
pulsar://flow/WorkOrder/0WO6A000001Anr4WAC?flow=Add_Files_Flow_Test
```

### launchdocument

Opens a Content Library document. The Id goes in the path or as `?Id=` — no `{objectType}`
segment. For web content (HTML documents, i.e. `.pulsarapp` bundles), **all extra parameters
are forwarded to the document as URL parameters** — this is the sanctioned way to pass
arguments into a `.pulsarapp` from outside Pulsar:

```
pulsar://launchdocument/0698c00000AWccoAAD
pulsar://launchdocument?Id=0698c00000AWccoAAD&mode=inspection&recordId=a0X8c000001AbCdEFG
```

Inside the launched app, read them the standard way:

```js
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');          // 'inspection'
const recordId = params.get('recordId');
```

Verbatim: "Note: The **launchdocument** action works for Content Library documents, but other
types of documents (Attachments and Salesforce Files not in the shared Content Libraries)
should be opened using the **view** API."

### custom_oauth

"Used solely as a callback/redirect URI related to external or internal custom OAuth 2.0
flows" — not a navigation action. See the OAuth flow section below.

## Doing it from INSIDE a .pulsarapp? Use the SDK instead

| Deep-link action | In-app SDK equivalent |
| --- | --- |
| `view` / `edit` | `pulsar.viewObject(objectName, id, 'FALSE'\|'TRUE')` (2194-2210) |
| `create` | `pulsar.showCreate(objectName, prefillFields)` (2178-2184) |
| `list` (+ `@@listviewid`) | `pulsar.viewList(objectName, listViewId)` (2092-2098), ids from `pulsar.listviewInfo(objectName)` (2058-2068) |
| `quickaction` (`qa=`) | `pulsar.executeQuickAction(actionName, contextId, fields)` (2281-2290) |
| `flow` (`flow=`, FSL only) | `pulsar.executeFSLFlow(flowName, ...)` (1961-1977; see `pulsar-sfs-embedded`) |
| `launchdocument` | `pulsar.getContentUrl({ Id \| Title })` (1610-1623; see `pulsar-files`) |
| `update` (headless apply) | closest analog: `pulsar.update(...)` local write (`pulsar-data-access`) |

The `__field`/`__value`/`__show`/`__create` selector machinery exists ONLY in deep-link URLs —
there is no JSAPI equivalent. In JS, resolve the record first (`pulsar.read`/`select`), then
navigate by Id.

## OAuth callback flow (custom_oauth)

Pattern: register the handler FIRST, then open the authorization URL inside Pulsar's embedded
browser with `redirect_uri` set to a `pulsar://custom_oauth/...` deep link. When the OAuth
server redirects there, Pulsar invokes every registered `custom_oauth` handler.

```js
// 1. Register BEFORE launching the auth URL (SDK wrapper over the bridge handler —
//    never call bridge.registerHandler yourself). src/pulsar.js:66-89.
pulsar.registerHandler('custom_oauth', (oauthParams) => {
  // Each deep-link query parameter arrives as a key:
  //   pulsar://custom_oauth/callback?mytoken=abc  → oauthParams['mytoken'] === 'abc'
  // A hash fragment arrives RAW under 'fragment' — whether the leading '#' is included is
  // undocumented; parse defensively (split('=') handles both):
  //   pulsar://custom_oauth/callback#token=abc → oauthParams['fragment'] contains 'token=abc'
  //   (possibly '#'-prefixed)
  const token = oauthParams['fragment']?.split('=')[1] ?? oauthParams['mytoken'];
  // ... exchange/store the token, update UI
});

// 2. Open the authorization page INSIDE Pulsar so the pulsar:// redirect is intercepted.
try {
  await pulsar.displayUrl({
    fullUrl:
      'https://authorization-server.com/auth?response_type=code' +
      '&client_id=29352735982374239857' +
      '&redirect_uri=pulsar://custom_oauth/callback' +   // ← the deep-link callback
      '&scope=create+delete' +
      '&state=xcoivjuywkdkhvusuye3kch',
    externalBrowser: false,   // keep the flow inside Pulsar's embedded browser
  });
} catch (err) {
  console.error('Could not open the OAuth endpoint:', err.message);
}

// 3. When finished with OAuth, remove the handler — name only, no function argument
//    (src/pulsar.js:97-120; the SDK doc's two-arg deregisterHandler signature is wrong).
pulsar.deregisterHandler('custom_oauth');
```

- `displayUrl` keys are `fullUrl`/`externalBrowser` — never `{url}` (silently ignored; see
  the sibling `navigation-and-device-reference.md`). The wiki's raw
  `bridge.registerHandler` + `bridge.send({type:'displayurl'}, callback)` example is the
  obsolete pre-SDK pattern; note it also uses lowercase `'displayurl'` while the SDK sends
  `'displayUrl'` — the SDK casing is canonical.
- `registerHandler`/`deregisterHandler`/`displayUrl` all throw "Pulsar bridge not initialized.
  Call init() first." before `init()` completes.
- Handler ordering/multiplicity ("Pulsar will call any registered custom_oauth handlers") and
  handler persistence across page reloads are unspecified — re-register on every page load.

## Version and doc caveats

- Both deep-link URL forms require Pulsar 13.0.0+ (wiki). The SDK docs list the
  `custom_oauth` handler event as "Pulsar 12+" — whether the handler predates the 13.0.0
  dual-form deep links is unreconciled; target 13.0.0+ to be safe.
- Platform coverage (iOS/Android/Windows) of deep links — including Universal Links on Windows
  desktop — is not stated in the wiki.
- Matching semantics for plain `field=value` search params (case sensitivity of values, type
  coercion) are unspecified; match against exact stored string values to be safe.
