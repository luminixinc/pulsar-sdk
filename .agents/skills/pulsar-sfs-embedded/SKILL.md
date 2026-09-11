---
name: pulsar-sfs-embedded
description: Build for Pulsar's Salesforce Field Service (SFS/FSL) environment — custom documents embedded in the SFS shell (iframe/embedded context), Field Service Mobile Flows (executeFSLFlow), service reports (getFSLTemplate, saveAs + createServiceReportFromFilePath), SFS shell navigation, SFS UI customization settings (tab bar, cards, Lightning Bolt Menu, toolbar visibility), and the native Appointments Widget. Use when a Pulsar web app runs inside Pulsar for SFS, when launching FSL flows or generating service reports, or when wiring/configuring SFS launch surfaces and screens.
---

# Pulsar for Salesforce Field Service (embedded apps + FSL APIs)

Pulsar for SFS replaces Pulsar's home screen with an HTML Field Service shell (Schedule,
Inventory, Notifications, Profile). Custom documents plug into that shell — tab bar, object
cards, Lightning Bolt Menu (LBM) — and render **inside iframes**: the "embedded context",
where your page shares the PARENT document's already-initialized JS bridge.

## Embedded context: what changes

- `await pulsar.init()` handles it: it detects `window.parent.pulsar.bridge`, captures the
  parent `pulsar` object, and **never calls `bridge.init()`** — the parent already did (wiki
  "Pulsar Platform - JS Bridge API", verified 2026-07-03; src/pulsar.js 15-56). Never
  hand-acquire the bridge or copy the wiki's "hybridized bridge set up function" advice.
- After init, `pulsar.pulsar` is the parent SFS object in embedded context and **`null` in
  native context** — that's the context test. Guard every SFS-shell call with it.
- All global .pulsarapp rules (AGENTS.md) still apply: init once, try/catch every call,
  string-typed values, sequential writes.

## Event handlers in embedded context (danger zone)

| Event | Embedded behavior |
| --- | --- |
| `syncDataUpdate`, `syncDataFinished` | Safe via SDK: `registerHandler` auto-delegates to the parent pulsar object (src/pulsar.js 66-89) |
| `syncDataStarted`, `syncDataCoreFinished` | **No embedded-safe path** — the SDK silently falls through to the shared bridge; do not register these in embedded apps |
| Others (`dispatchToHomeApp`, `invalidateLayout`, …) | Registered on the raw shared bridge — see the deregister warning |

- Verbatim (wiki "Pulsar Platform - JS Bridge API"): "Because you are using the exact same
  PulsarJSBridge as the parent document, calling deregisterHandler will remove all registered
  handlers **from the parent document as well**." The SDK does NOT mitigate this for non-sync
  events — deregister them in embedded apps only if you accept breaking the parent shell.
- Use only `pulsar.registerHandler(name, fn)` / `pulsar.deregisterHandler(name)`. Never call
  `window.parent.pulsar.addSyncFinishedHandler(...)` yourself. Assume **one handler per sync
  event** in embedded context (removal is by event name, with no arguments).

## FSL API calls

| Task | Call | Key rule |
| --- | --- | --- |
| Launch a Field Service Mobile Flow | `executeFSLFlow(flowName, flowId, actionLabel, id, userId, parentId)` | Six POSITIONAL params — pass `undefined` placeholders; throws unless flowName OR flowId given |
| List service report templates | `getFSLTemplate()` (no args) | Resolves a `{ 'Template Name': 'Id', … }` dictionary |
| Fetch one template's full tree | `getFSLTemplate(templateId)` or `getFSLTemplate(undefined, templateName)` | `templateId` takes precedence if both passed |
| Generate + attach a service report | `saveAs({ filename })` → `createServiceReportFromFilePath(parentId, filePath, templateId, documentName, contentType)` | All five args validated as non-empty strings; resolves the new ServiceReport Id string |

- executeFSLFlow — SDK JSDoc verbatim: "⚠️ This feature requires Field Service Lightning to
  be enabled and updated flow metadata to be synced." Wiki verbatim ("Salesforce Field
  Service API", verified 2026-07-03): "Pulsar only supports Flows of type 'Field Service
  Mobile Flow' and will only sync the currently activated version of each flow"; "syncing
  updated flows requires first using the Refresh Settings button on Pulsar's Settings screen".
- `result.executed` is true if the flow window was **presented** to the user — NOT a
  completion signal; no flow output variables are returned.
- getFSLTemplate — SDK JSDoc verbatim: "⚠️ This API requires Field Service Sync to be enabled
  in the current Pulsar context." Expect empty data otherwise.

```js
try {
  const templates = await pulsar.getFSLTemplate();            // { 'Name': 'Id', ... }
  const templateId = templates['Standard Report'];
  const filePath = await pulsar.saveAs({ filename: 'report.pdf' });  // pulsar-files skill
  const reportId = await pulsar.createServiceReportFromFilePath(
    serviceAppointmentId, filePath, templateId, 'report.pdf', 'application/pdf');
} catch (err) { console.error('Service report failed:', err.message); }
```

Which template? Use the field-tested resolution hierarchy — `SA.ServiceReportTemplateId` →
the parent's (via `ParentRecordId` + `ParentRecordType`) → `getFSLTemplate('')` for the org
default — and pick the subtemplate by `subTemplateType` (`WO_SA`/`WOLI_SA`/object type):
worked code in `references/fsl-data-patterns.md`.

## SFS shell functions — NOT SDK methods

`goBack, goHome, goBackToTab, displayContentDocument, showSpinner/hideSpinner, setTitle,
hideNavBar/showNavBar` live on the parent pulsar object. SDK gap — call them through the
reference `init()` captured, always guarded:

```js
if (pulsar.pulsar) pulsar.pulsar.goHome();  // SDK gap: SFS shell fn, embedded context only
```

- `displayContentDocument(id, title, params, cb)` — wiki verbatim: "you must specify a
  document Id or title. If both are null, this method will fail, if you want to open by
  title, pass null for the Id". Callback-based; no promise wrapper exists.
- Pair strictly: every `showSpinner()` needs a `hideSpinner()` (including error paths); after
  `hideNavBar()`, "Your page is responsible for re-displaying the navigation bar."
- Call `setTitle(...)` — custom pages have an EMPTY title otherwise. `goBack` is ignored on
  tab-root pages; `goHome` is the safe exit from a stack of chained custom documents.
- Prefer the SDK's context-independent navigation when intent is generic: `exit()`,
  `viewObject()`, `viewList()`, `viewRelated()` (src/pulsar.js 2092-2098 for viewList,
  2165-2240 for the rest) work in both contexts; reserve the shell functions for SFS
  tab-stack semantics.
- iFrame sizing has NO SDK helper — the raw postMessage is the documented mechanism:
  `window.parent.postMessage({ type: 'refresh', height: '800px' }, '*')`; height `'*'` fills
  the available viewport. **Re-send it on every content-height change** (async loads, DOM
  updates, expand/collapse) — FSL only sizes the iframe at load. The `'*'` origin is
  acceptable: the message carries no sensitive data.

## Getting your document into the SFS shell

| Surface | Setting | Gotcha |
| --- | --- | --- |
| Tab bar | `pulsar.fsl.layout.tabs` | Verbatim: "You **must** add all tabs that you wish to see on the tab bar to this setting. Failure to add a tab will exclude it from the app. This includes the standard SFS tabs." 4th entry onward lands in the "More" modal |
| Card on an object page | `pulsar.fsl.{objectType}.{recordType}.order` | Defines ALL cards for that pair — "Failure to include a card in the value of the setting will result in it not being displayed" |
| Lightning Bolt Menu | `pulsar.fsl.layout.{objectType}.{recordType}.lightningbolt.listitems` | Value is PSL ending in a SetResult (see the pulsar-psl skill); `custom : label : DocId [: params]` entries |
| Native detail-screen toolbar | `pulsar.layout.toolbar.fslVisibleItems` | SFS hides most native toolbar buttons by default; enable `documents` to expose doclist-launched apps |

- Custom-document query parameters (`label : docId : key=value&…`) require **Pulsar 15.0+**
  (tabs, cards, and LBM `custom` entries alike).
- **Pulsar also injects launch-context query params automatically** (field-tested): LBM
  launches carry `id`, `objectType`, `docId`, and (when present) `parentId`/`parentType`;
  overview-screen cards carry `id`, `objectType`, and `saId` on a WorkOrder overview with an
  associated ServiceAppointment. Read with `new URLSearchParams(window.location.search)` —
  full table in `references/fsl-data-patterns.md`. (Native record-button launches use
  `ref_id` instead — `create-pulsarapp`.)
- Pages opened from the Schedule calendar have **ServiceAppointment** as their primary object
  context even when they display Work Order data — scope LBM settings accordingly (`parent`
  entries; details in references).

## Org configuration your app depends on

- Install order verbatim (wiki "Configuring Pulsar to run Salesforce Field Service (SFS)"):
  "It is a requirement that you first install the Pulsar Premium AppExchange package before
  you proceed with the install of the Pulsar for SFS AppExchange package."
- Verbatim: "Pulsar will sync core SFS objects out of the box. If you have other standard or
  custom objects in related lists or have quick actions and flows using them, please make
  sure to add these to the pulsar.sync.objects setting that was created when you installed
  the Pulsar for SFS package." Otherwise your offline queries return nothing.
- Server-side changes (settings, flows, list views) reach devices only after a sync and/or
  Refresh Settings — never assume immediate propagation.
- Check FSL availability programmatically with `getPlatformFeatures()` (src/pulsar.js
  922-926) before calling the FSL APIs.

## The Appointments Widget is NOT an embed surface

The "Pulsar Widget" (wiki page of that name) is a **native OS home-screen widget** for SFS
users only: it shows the logged-in user's ServiceAppointments that "start, end, or span the
current day in local time", excludes statuses Completed / Cannot Complete / None, displays at
most two plus a link to the rest, and refreshes on every sync plus a 5-minute (default)
heartbeat. It requires Field Service configured, the `pulsar.widget` setting = `TRUE`, and
ServiceAppointment synced. You cannot run a custom web app inside it.

## References

- `references/fsl-api-reference.md` — full request/response shapes for the three FSL methods
  + saveAs, the service report template tree, embedded bridge/handler mechanics, SFS shell
  function signatures, iframe resizing.
- `references/fsl-data-patterns.md` — field-tested FSL data patterns: reference-field maps
  (SA/WO/WOLI/AssignedResource/ServiceResource/User), `ParentRecordType`, user→appointment→
  work-order JOIN traversals, launch-context query params, service-report template resolution.
- `references/sfs-customization-reference.md` — settings tables for every SFS surface (tabs,
  cards, LBM, toolbar, show/hide flags, maps keys, PSL gates), SFS screens + the data feeding
  them, org setup, widget details, known wiki inconsistencies.
