# FSL API & embedded-context reference

Sources: pulsar-sdk `src/pulsar.js` (the authority for signatures/behavior; line numbers refer
to it) and wiki "Salesforce Field Service API", "Pulsar SFS UI Customizations", "Pulsar
Platform - JS Bridge API" (authority for shapes and platform behavior). Verified 2026-07-03.
All wiki JS examples in this domain are pre-SDK raw-bridge callback style — never copy them.

Terminology: the wiki uses "SFS", "FSL", "Field Service Lightning", "Pulsar for SFS", and
"Pulsar FSL application" interchangeably. They all mean the same embedded host.

## The embedded context, precisely

- Pulsar for SFS renders custom documents inside iframes of its own HTML shell. The iframe
  shares the parent document's bridge: it is already initialized before your code runs.
- `Pulsar#init()` (src/pulsar.js 15-56) checks `window.parent?.pulsar?.bridge` first. If
  present (embedded): stores the parent object on the instance (`this.pulsar`), stores its
  bridge, resolves immediately, and **skips `bridge.init()` entirely** — the wiki says there
  is "no need to call the **init** method as this will have already been done by the Pulsar
  FSL application". If absent
  (native): waits for `WebViewJavascriptBridgeReady` with a 5-second timeout rejection.
- Context test after init: `pulsarInstance.pulsar` is the parent SFS object when embedded,
  `null` when native. Guard all SFS-shell calls on it.
- The same `.pulsarapp` can therefore run unmodified in both contexts — branch features on
  `pulsar.pulsar`, not on user agents or URL sniffing.

## Sync/event handlers in embedded context

`registerHandler(handlerName, handlerFn)` (src/pulsar.js 66-89) and
`deregisterHandler(handlerName)` (97-120) auto-select the safe path:

| Event | Native path | Embedded path |
| --- | --- | --- |
| `syncDataUpdate` | `bridge.registerHandler` | parent `pulsar.addSyncDataUpdateHandler(fn)`; removal `removeSyncDataUpdateHandler()` (no args) |
| `syncDataFinished` | `bridge.registerHandler` | parent `pulsar.addSyncFinishedHandler(fn)`; removal `removeSyncFinishedHandler()` (no args) |
| `syncDataStarted`, `syncDataCoreFinished` | `bridge.registerHandler` | **falls through to the raw shared bridge — no embedded-safe path, no warning emitted.** Do not use in embedded apps |
| `dispatchToHomeApp`, `invalidateLayout`, `custom_oauth` | `bridge.registerHandler` | raw shared bridge (registration works; deregistration is dangerous — below) |

Critical wiki warnings ("Pulsar Platform - JS Bridge API", verbatim):

> "When working in an **Embedded Context** do **NOT** register for any of the syncData
> methods - e.g. `syncDataUpdate` or `syncDataFinished`. Instead, you can make use of special
> methods attached to the `pulsar` object obtained when you acquired the bridge."

(The SDK does this delegation for you — which is why you must go through
`registerHandler`/`deregisterHandler`, never the bridge or the parent object directly.)

> "Because you are using the exact same PulsarJSBridge as the parent document, calling
> deregisterHandler will remove all registered handlers from the parent document as well.
> Bridges provided through the **Native Context** are stamped with different identifiers that
> allow Pulsar to avoid this conflict."

The SDK does NOT mitigate this for non-sync events: in embedded context,
`deregisterHandler('invalidateLayout')` (or any other non-sync name) still calls the raw
`bridge.deregisterHandler` and nukes the parent shell's handlers for that event.

Additional rules:

- **One handler per sync event in embedded context.** Removal via the parent object takes no
  arguments, so you cannot remove one specific function. Register a single dispatcher if you
  need multiple listeners.
- FSL host vs SDK — two layers, not a conflict: the two-argument *named* handlers the wiki
  documents — `addSyncFinishedHandler('myHandler', fn)` / `addSyncUpdateHandler('myHandler', fn)`
  — belong to Luminix's **FSL host shell** (a separate Luminix product offering), exposed on the parent
  `pulsar` object. They are **not** the pulsar.js SDK API, and a custom `.pulsarapp` never calls
  them. Use the SDK's `registerHandler`/`deregisterHandler`, which bridges to the host
  internally. (The SDK's own internal delegation calls the host's `addSyncDataUpdateHandler(fn)`
  / `addSyncFinishedHandler(fn)` — an SDK↔host integration detail, not something app code
  touches; do not assume a named multi-handler registry.)
- Wiki verbatim (sync handlers): "IMPORTANT: Please clean up your handler as shown below." —
  always `deregisterHandler('syncDataFinished')` / `deregisterHandler('syncDataUpdate')` when
  the page unloads.
- The payload shapes of the sync-finished and sync-update callbacks (`syncFinishedInfo`,
  `updateInfo`) are undocumented in both wiki and SDK. In native context `syncDataUpdate`
  carries "fields like syncpercent and syncpass". Log the object before relying on fields.
- `dispatchToHomeApp` — verbatim wiki: "Emitted when Pulsar wants to send a message to a
  custom home screen (e.g., Pulsar for SFS)." Payload undocumented. Chiefly relevant to home-page-replacement
  apps (see the create-pulsarapp skill); in embedded context treat it as raw-bridge with the
  deregistration foot-gun above.

## executeFSLFlow

```js
// src/pulsar.js 1961-1977
const result = await pulsar.executeFSLFlow(
  'Sales_Funnel_Flow1',   // flowName  — required if flowId omitted (Flow's Salesforce API name)
  undefined,              // flowId    — required if flowName omitted (Id of the Flow VERSION)
  'Pre-sale Form Flow',   // actionLabel — optional label shown in the Flow window
  recordId,               // id        — optional record the flow is launched from
  undefined,              // userId    — optional; defaults to current user Id natively
  parentWorkOrderId,      // parentId  — optional parent record (e.g. SA's parent WO/WOLI)
);
if (result.executed) { /* the Flow window was PRESENTED to the user */ }
```

- Bridge request: `{ type: 'executeFSLFlow', data: { FlowName?, FlowId?, ActionLabel?, Id?,
  UserId?, ParentId? } }`. Falsy optional args are omitted from `data` (spread-guard), so the
  native UserId-defaults-to-current-user behavior applies as the wiki describes.
- Rejects immediately if BOTH `flowName` and `flowId` are missing (async throw — catch with
  await/try-catch): `'executeFSLFlow requires either flowName or flowId.'`
- Six positional optional parameters — pass `undefined` placeholders for skipped slots. There
  is no options-object form.
- Resolves with the response's data object: `{ executed }` — per the wiki (quote lightly
  normalized), "the execution state of the flow- true if the flow was presented to the user.
  false otherwise". It is a
  **presentation** signal, never a completion signal; no flow output variables are exposed
  anywhere.
- Type note: `executed` is documented (wiki + SDK docs) as a real boolean — one of the few
  JSAPI values that is not a `'TRUE'`/`'FALSE'` string. `getPlatformFeatures()` results and
  all SFS Pulsar Settings, by contrast, use the string convention. Template metadata booleans
  (`defaultTemplate`, `isAscending`, `hideTitle`, …) are real booleans per the SDK typedefs.
- Prerequisites (wiki "Salesforce Field Service API", verbatim): "**Please note: This feature
  is only available if Pulsar for Field Service Lightning is enabled for the user. Also,
  syncing updated flows requires first using the Refresh Settings button on Pulsar's Settings
  screen to force Pulsar to look for the updated Flow Metadata.**" And: "Pulsar only supports
  Flows of type 'Field Service Mobile Flow' and will only sync the currently activated
  version of each flow."
- Screen Flows are a separate mechanism: they additionally require
  `pulsar.sync.enableScreenFlows` = `TRUE` and an SFS tech license, cannot be configured as
  LBM app extensions, and are set up "by using lightning actions on the 'Salesforce Mobile
  and Lightning Experience Actions' section of the SObject's page layout" (wiki "Pulsar SFS
  UI Customizations").
- Related setting caveat — `pulsar.fsl.enableFlowBackButton` (verbatim): "Salesforce data
  changes that occur before displaying a screen are committed to the database and will not be
  rolled back when the **Back** button is clicked. - Flows retain variable values after
  they're entered."

## getFSLTemplate

```js
// src/pulsar.js 1918-1930; bridge type is all-lowercase 'getfsltemplate'
const dict = await pulsar.getFSLTemplate();                     // { 'Template Name': 'Id', ... }
const tpl  = await pulsar.getFSLTemplate('0TTxx0000000001');    // by Id
const tpl2 = await pulsar.getFSLTemplate(undefined, 'Report Template A');  // by name
```

- Dual mode: no args → dictionary mapping Service Report template **names to Ids**; with an
  arg → the full template metadata object. `templateId` takes precedence when both are
  passed (else-if in the SDK — exactly the wiki's documented precedence).
- SDK JSDoc verbatim: "⚠️ This API requires Field Service Sync to be enabled in the current
  Pulsar context." (Wiki: "This request will only return data if Field Service Sync is
  enabled.") Returns no data otherwise — handle the empty case.
- Single-template response structure (the wiki never documents it; the SDK JSDoc typedefs at
  src/pulsar.js 1777-1896 are the only authority):
  - `GetFSLTemplateResponse` = `{ serviceReportTemplates: ServiceReportTemplate[] }`
  - `ServiceReportTemplate` = `{ defaultTemplate (boolean), error, language (locale, e.g.
    'en_US'), templateId, subTemplates: ServiceReportSubTemplate[] }`
  - `ServiceReportSubTemplate` = `{ subTemplateType: 'WorkOrder' | 'WorkOrderLineItem' |
    'WO_SA' | 'WOLI_SA', regions: SubTemplateRegion[] }`
  - `SubTemplateRegion` = `{ type: 'HEADER' | 'FOOTER' | 'BODY', sections: [...] }`
  - Section variants (discriminated by `type`): `'section'` (field grid: items, columns,
    hideFieldLabels, hideTitle, rightAlign), `'relatedList'` (entityName, relatedEntityName,
    relatedListName, `filterCriteria[]` `{ field, operation, position, values }`,
    `sortCriteria[]` `{ field, isAscending, position }`, column items), `'signature'`
    (signatureType, signatureTypeLabel, items, columns).
  - Item variants (discriminated by `type`): `'entityField'` (entityName, position
    `{ row, col }`), `'rta'` (richText), `'blank'`. All items carry `label`, `name`, and
    `otherLabels` (ISO-639 language → label map).
- The SDK JSDoc `@returns {Promise<GetFSLTemplateResponse>}` is misleading for no-arg mode,
  which returns the plain name→Id dictionary.

## saveAs → createServiceReportFromFilePath (the service report chain)

`saveAs(options)` (src/pulsar.js 956-970) renders the current document to a file and resolves
with the **FilePath string** (the SDK extracts `response.FilePath`; it throws
`'Unexpected response from saveAs.'` if missing). Requires `options.filename`. Full option
surface (`displayresult`, `datauri`, `docnode`/`headernode`/`footernode` as string DOM
expressions, `printoptions{topmargin,leftmargin,bottommargin,rightmargin,papersize,
headerheight,footerheight,useEdge}`) is covered in the pulsar-files skill.

```js
// src/pulsar.js 2003-2030; bridge type 'createservicereportfromfilepath'
const filePath = await pulsar.saveAs({ filename: 'report.pdf' });
const reportId = await pulsar.createServiceReportFromFilePath(
  parentId,            // Id of the record to attach the ServiceReport to
  filePath,            // MUST come from saveAs
  templateId,          // service report template Id used to generate this report
  'report.pdf',        // desired document file name
  'application/pdf',   // content type of the file
);
```

- All five parameters are individually validated as non-empty strings — each missing/wrong
  one throws its own `'createServiceReportFromFilePath requires a valid … string.'` The SDK
  is stricter than the wiki here.
- Resolves with the new **ServiceReport Id as a plain string** (`response.data` is the bare
  Id, not a wrapper object).

## Response-type casing (raw-bridge trivia — do not code against it)

Bridge response `type` strings are not derivable from request types by any uniform rule:
`executeFSLFlow` → `executefslflowResponse` (lowercased), `getfsltemplate` →
`fslTemplateResponse` (camelCase, drops "get"), `createservicereportfromfilepath` →
`createServiceReportResponse` (camelCase, drops "fromfilepath"). Irrelevant through the SDK:
`_send` (src/pulsar.js 2514-2526) strips the envelope, resolves `response.data`, and rejects
`Error(response.data)` on `type === 'error'`. Never branch on response type strings.

## SFS shell functions (parent pulsar object; no SDK wrappers)

All of these exist only in the embedded context. After `await pulsar.init()`, call via the
captured reference and guard: `if (pulsar.pulsar) { … }`. Source: wiki "Pulsar SFS UI
Customizations" (verified 2026-07-03).

| Function | Behavior / rules |
| --- | --- |
| `goBack()` | Back to the previous Pulsar page. Only relevant to pages launched from an SObject page; "Tab bar pages will be the 'root' of that tab, so back will be ignored" |
| `goHome()` | Go to the Schedule page — the safe way to exit a stack of chained custom documents |
| `goBackToTab()` | Back to the last non-custom-document in this tab's navigation history — dismisses a whole chain of custom documents at once |
| `displayContentDocument(id, title, params, cb)` | Opens another custom document. Verbatim: "Important - you must specify a document Id or title. If both are null, this method will fail, if you want to open by title, pass null for the Id". Callback fires after display. How `params` reaches the target document is undocumented |
| `showSpinner()` / `hideSpinner()` | Blocks/unblocks the SFS UI. You must call `hideSpinner()` yourself — including on error paths |
| `setTitle(title)` | "Custom pages will have an empty title unless set explicitly." |
| `hideNavBar()` / `showNavBar()` | Verbatim: "Your page is responsible for re-displaying the navigation bar." |

```js
// SDK gap: displayContentDocument is an SFS shell function with no SDK wrapper (callback API).
if (pulsar.pulsar) {
  pulsar.pulsar.displayContentDocument(null, 'My Doc Title', { param: 'value' }, () => {
    console.log('displayed');
  });
}
```

- When your goal is *rendering* a ContentDocument rather than navigating the shell to it,
  `getContentUrl({ Id, Title })` (src/pulsar.js 1610-1623) is the context-independent SDK
  alternative — it resolves `{ url, title }`; load `result.url` (an offline URL).
- For generic record/list navigation prefer the SDK's `viewObject(objectName, Id, editmode)`,
  `viewList(objectName, listViewId)`, `viewRelated(objectName, parentId, relationshipName)`,
  and `exit()` (closes the current document, "acts like pressing Done") — src/pulsar.js
  2092-2098 (viewList) and 2165-2240 (exit/viewObject/viewRelated); they work in both
  contexts (see the pulsar-native-ui skill).

## iFrame resizing (raw postMessage — no SDK helper)

Custom documents render inside iframes sized to their initial content. When content is
dynamic, tell the shell the new height (wiki "Pulsar SFS UI Customizations"):

```js
// SDK gap: no wrapper exists; this raw postMessage is the documented mechanism.
window.parent.postMessage({ type: 'refresh', height: '800px' }, '*');
```

- `height` is a CSS-formatted string. Verbatim: "sending '*' as the height tells FSL to size
  the iFrame to fill the available space in the view port" — use `height: '*'` for full-page
  documents.
- Verbatim: "sending '*' as the origin is acceptable since this will never carry sensitive
  data".

## Pre-flight checks before FSL calls

- `getPlatformFeatures()` (src/pulsar.js 922-926) resolves
  `[{ featureName, isAvailable: 'TRUE'|'FALSE', value? }]` — note **string** `'TRUE'`/
  `'FALSE'`, not booleans. Use it to verify FSL availability before calling
  `executeFSLFlow`/`getFSLTemplate` rather than letting the call fail.
- Flows: only the currently ACTIVATED version of each 'Field Service Mobile Flow' is synced;
  after activating/updating a flow, users must tap **Refresh Settings** on Pulsar's Settings
  screen and sync.
- Objects your app reads must be in the org's sync configuration (`pulsar.sync.objects` or
  `pulsar.sync.relationship.directives`) — see `references/sfs-customization-reference.md`.
