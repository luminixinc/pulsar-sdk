---
name: pulsar-native-ui
description: Drive native Pulsar screens and device features from a .pulsarapp. Use to open native record view/edit/create/list screens or quick actions, scan barcodes, compose mail, read location or user info, fetch Settings and Custom Labels, or build pulsar:// deep links.
---

# Native Pulsar UI & device features from a .pulsarapp

Everything here goes through the Pulsar JS SDK on an initialized instance (`const pulsar = new
Pulsar(); await pulsar.init();` exactly once — see the `create-pulsarapp` skill). Wrap every
call in `try/catch`. Sources: wiki "Native Pulsar UI Interaction API",
"Pulsar General Information API", "Pulsar System Interaction API", "Pulsar Configuration API",
"Pulsar Deep Links", "Language Support in Pulsar for Salesforce App", verified 2026-07-03; line
numbers refer to SDK `src/pulsar.js`.

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

## The one timing rule

Verbatim wiki: "The calls that support Pulsar native screen interaction need to know that you
will only see the response when the native screen is dismissed by the user." Navigation
promises (`viewObject`, `showCreate`, `lookupObject`, `executeQuickAction`, `scanBarcode`)
resolve only after the user saves/cancels/closes the native screen — `await` them, then refresh
your local data. Only exception: `viewObject`'s raw `returnAfterDisplay` flag, which the SDK
does not expose (raw escape hatch in `references/navigation-and-device-reference.md`).

## Choosing an API

| Task | Call |
| --- | --- |
| Open a record (view / native edit) | `await pulsar.viewObject('Account', id, 'TRUE')` — editmode is the STRING `'TRUE'`/`'FALSE'` (default `'FALSE'`), never a boolean (lines 2194-2210) |
| Native create screen, prefilled | `await pulsar.showCreate('Account', { Name: 'ACME' })` → `{ createResult: 'TRUE'\|'FALSE', createId? }` — string flag; treat anything other than `'TRUE'` (including cancel — exact cancel signal undocumented) as not-created, and keep the try/catch (2178-2184) |
| Record's related list | `await pulsar.viewRelated('Account', parentId, 'Contacts')` — child-relationship API name (2221-2240) |
| Open a Salesforce list view | `await pulsar.viewList('Account', listViewId)` — ids from `await pulsar.listviewInfo('Account')` (2092-2098, 2058-2068) |
| Let the user pick a record | `const [sel] = await pulsar.lookupObject('Account', { Type: 'Prospect' })` — ALWAYS an array (2255-2261) |
| Launch a quick action | `await pulsar.executeQuickAction('NewContact', contextId, { Field1: 'v' })` (2281-2290) |
| Scan a barcode | `const code = await pulsar.scanBarcode()` → the barcode STRING (2267-2272) |
| Compose an email draft | `await pulsar.mail(['a@x.com'], [], [filePath], 'Subject', 'Body')` (2490-2501) |
| Device GPS position | `await pulsar.getLocation('Fine')` → `{ latitude, longitude, locationAccuracy }` — all STRINGS (1727-1732) |
| User / environment info | `userInfo()` (900-905), `userPhoto()` (1678-1683), `getPlatform()` (1706-1711), `getPlatformFeatures()` (922-926), `getDevServerEnabled(docId)` (1692-1698) |
| Pulsar Setting / attached file | `getSetting(key)` (1543-1552), `getSettingAttachment(key)` (1578-1587) |
| Translated Custom Labels | `await pulsar.getCustomLabels(['My_Label'], 'es_MX')` (1742-1753) |
| Guard page exit / close app | `setLeavePageMessage(msg)` (2153-2159), `exit()` (2165-2170) |
| Open a web URL | `displayUrl({ fullUrl, externalBrowser })` (2350-2361) |
| Write to the Pulsar log | `logMessage(msg, 'error')` — levels `info`(default)/`warn`/`error`/`debug` (1763-1775) |
| Enter Pulsar from OUTSIDE (email, another app, OAuth redirect) | `pulsar://` deep link — `references/deep-links-reference.md` |

## Navigation rules

- Verbatim SDK JSDoc on `lookupObject`: "⚠️ WARNING: This returns an array of selected objects.
  Even if you expect only one selection, always destructure the array (e.g., `const [selected]
  = await pulsar.lookupObject(...);`)." Filter forms: field/value pairs (ANDed),
  `{'@@listviewid': id}`, `{'@@whereClause': "Account.Name = 'Apple'"}`. Never copy the
  `{filter: ...}` key from the SDK docs — it is not a filter form. Cancel behavior is
  undocumented; guard for an empty result.
- `executeQuickAction`: field defaults spread at the TOP level of data next to `ActionName`
  (not nested). Response `{ executed, quickActionResult }` are REAL booleans — a rare exception
  to the string-flag convention; check both. Requires the PulsarSetting
  `pulsar.sync.enableQuickActions`; only 'Create' and 'Update' quick actions are supported.
- `getQuickActions` has NO SDK wrapper — raw escape hatch in `references/navigation-and-device-reference.md`;
  `(await pulsar.getLayout(obj)).quickActionList` is a partial alternative (`pulsar-metadata`).
- Known discrepancy (state when debugging): the wiki documents viewRelated's data key as `Id`
  and viewList's as `@@listviewid`; the SDK sends `parentId` and `listViewId` (src 2236, 2096).
  Prefer the SDK methods; if a target Pulsar build rejects them, fall back to a wiki-shaped
  raw request.

## Device & composer foot-guns

- `scanBarcode()` resolves the scanned barcode **string** (the SDK unwraps `data.barcode`).
  The SDK doc's `{text, format}` return shape is wrong — ignore it.
- `mail(to, cc, attach, subject, body)` is POSITIONAL and `to`/`cc`/`attach` must be ARRAYS of
  strings. Wrong-typed args (e.g. a bare string address) are **silently dropped** — the
  composer opens empty with no error. The SDK doc example's `(to, subject, body, cc, bcc)`
  order is wrong; there is no bcc. Resolves when the composer opens; sent-vs-cancelled is not
  reported.
- `displayUrl` option keys are exactly `{ fullUrl, externalBrowser, scheme, path, queryParams }`
  — there is NO `url` key; `{url: ...}` silently sends an empty request (SDK docs are wrong).
  `externalBrowser` is a real boolean (default false = embedded browser). Verbatim wiki: "On
  Android, Pulsar will always attempt to open unencrypted HTTP URLs (\"http://\" without the
  \"s\") in an external browser app."
- `getLocation`: verbatim wiki — "This will not work properly if the user does not grant the
  app access to the device's location services." Accuracy `'Fine'|'Medium'|'Coarse'` (default
  `'Medium'`); can be slow — tune the `pulsar.location.updateFrequencySeconds` Pulsar Setting.

## Settings, labels, i18n

- `getSetting(key)` resolves `{ Exists: 'TRUE'|'FALSE', [key]: value }` — a missing setting
  RESOLVES normally with `Exists: 'FALSE'` (not a rejection); read the value via `result[key]`.
- `getSettingAttachment(key)` resolves `{ FileName, FilePath, [key]: contents }` and REJECTS if
  the setting or its Attachment/File is missing. Read the file via `FilePath` — the SDK doc
  example's `FileURL` does not exist on the response.
- `getCustomLabels(labelNames[], locale?)`: explicit locale returns `null` on a miss; omitted
  locale falls back user `lang_Locale` → `lang` → `'en_US'` → `null`. Labels must have been
  post-processed into auto-generated Pulsar Settings to be retrievable. Get the user's locale
  from `userInfo()` (`locale`, `userlanguage`, `devicelanguage` — all-lowercase keys). Pulsar's
  own chrome ships in 19 languages; Salesforce translations flow through automatically
  (language-ID table in `references/navigation-and-device-reference.md`).

## Page lifecycle

- `setLeavePageMessage(msg)` arms a native yes/no prompt on Done, Refresh, Back, and Forward
  (data is a bare string — the SDK handles it). Disarm with `setLeavePageMessage('')` as soon
  as the form is clean, or navigation stays blocked.
- `exit()` closes the document like the Done button — and still honors the leave-page prompt.

## Deep links (Pulsar 13.0.0+)

`pulsar://{action}/{objectType}[/{objectId}]?params` or the equivalent
`https://www.luminixinc.com/pulsarapp/...` Universal Link. Verbatim wiki: "The Salesforce
object type is case sensitive." and "Parameters are also case sensitive!"

- Semantics trap: plain `field=value` params are SEARCH criteria in `view` but CHANGES to apply
  in `edit`/`update`. `update` "performs the object update without presenting an edit screen" —
  no user confirmation. Full per-action tables: `references/deep-links-reference.md`.
- `launchdocument` forwards all extra params to web content as URL parameters — the sanctioned
  way to pass arguments into a `.pulsarapp` from outside.
- Inside a `.pulsarapp`, navigate with the SDK methods above, not deep links (mapping table in
  the reference). Deep links resolve against the local synced database.
- OAuth: `pulsar.registerHandler('custom_oauth', fn)` BEFORE
  `await pulsar.displayUrl({ fullUrl: authUrl, externalBrowser: false })` with
  `redirect_uri=pulsar://custom_oauth/callback` — full flow in `references/deep-links-reference.md`.

## Worked example (barcode → lookup → native edit)

```js
async function scanAndEdit(pulsar) {
  try {
    const barcode = await pulsar.scanBarcode();          // resolves a STRING
    const [asset] = await pulsar.lookupObject('Asset', { SerialNumber: barcode });
    if (!asset) return;                                  // cancel/empty — undocumented, guard
    await pulsar.viewObject('Asset', asset.Id, 'TRUE');  // editmode is a STRING
    // resolves only after the user saves or cancels the native edit screen
  } catch (err) {
    await pulsar.logMessage(`scanAndEdit failed: ${err.message}`, 'error');
  }
}
```

## References

- `references/navigation-and-device-reference.md` — per-method signatures, request/response
  shapes, quirks, raw escape hatches (`getQuickActions`, `returnAfterDisplay`), userInfo field
  list, language-ID table.
- `references/deep-links-reference.md` — every deep-link action with parameter semantics,
  selector/argument tables, launchdocument argument passing, custom_oauth flow.
