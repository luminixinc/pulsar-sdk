# FSL data patterns — relationships, traversals, launch context, report templates

Field-tested patterns from the Pulsar Copilot GPT knowledge base (~2025, used by Pulsar
developers in production), reconciled against pulsar-sdk @ `eddf62d`; verified 2026-07-03.

## Reference-field maps for the core FSL objects

Which object(s) each lookup field points to (`referenceTo`). Use these instead of guessing —
and for anything not listed, check `getSObjectSchema` or ask the user.

### ServiceAppointment

**`ParentRecordType` contains the object type referenced by `ParentRecordId`** — the sanctioned
way to resolve that polymorphic lookup (no guessing).

| Field | ReferenceTo |
| --- | --- |
| OwnerId | Group, User |
| RecordTypeId | RecordType |
| CreatedById / LastModifiedById | User |
| ParentRecordId | Account, Asset, Case, Lead, Opportunity, WorkOrder, WorkOrderLineItem |
| AccountId | Account |
| WorkTypeId | WorkType |
| ContactId | Contact |
| ServiceTerritoryId | ServiceTerritory |
| RelatedBundleId | ServiceAppointment |
| BundlePolicyId | ApptBundlePolicy |

### WorkOrder

| Field | ReferenceTo |
| --- | --- |
| OwnerId | Group, User |
| CreatedById / LastModifiedById | User |
| AccountId | Account |
| ContactId | Contact |
| CaseId | Case |
| EntitlementId | Entitlement |
| ServiceContractId | ServiceContract |
| AssetId | Asset |
| RootWorkOrderId / ParentWorkOrderId | WorkOrder |
| Pricebook2Id | Pricebook2 |
| BusinessHoursId | BusinessHours |
| ServiceTerritoryId | ServiceTerritory |
| LocationId | Location |
| MaintenancePlanId | MaintenancePlan |
| ServiceReportTemplateId | ServiceReportTemplate |
| ReturnOrderId / ReturnOrderLineItemId | ReturnOrder / ReturnOrderLineItem |

### WorkOrderLineItem

| Field | ReferenceTo |
| --- | --- |
| CreatedById / LastModifiedById | User |
| WorkOrderId | WorkOrder |
| ParentWorkOrderLineItemId / RootWorkOrderLineItemId | WorkOrderLineItem |
| ParentRecordId | Account, Asset, Case, Lead, Opportunity, WorkOrder, WorkOrderLineItem |
| Product2Id | Product2 |
| AssetId | Asset |
| OrderId | Order |
| PricebookEntryId | PricebookEntry |
| WorkTypeId | WorkType |
| ServiceTerritoryId | ServiceTerritory |
| LocationId | Location |
| ServiceReportTemplateId | ServiceReportTemplate |
| ReturnOrderId / ReturnOrderLineItemId | ReturnOrder / ReturnOrderLineItem |

### AssignedResource · ServiceResource · User (the assignment chain)

| Object | Field | ReferenceTo |
| --- | --- | --- |
| AssignedResource | ServiceAppointmentId | ServiceAppointment |
| AssignedResource | ServiceResourceId | ServiceResource |
| ServiceResource | RelatedRecordId | **User** (a User appears in at most one ServiceResource) |
| ServiceResource | OwnerId | Group, User |
| ServiceResource | LocationId / ServiceCrewId | Location / ServiceCrew |
| User | ManagerId / DelegateApproverId | User / Group, User |
| User | ContactId / AccountId / ProfileId / UserRoleId | Contact / Account / Profile / UserRole |

## Traversal queries (local SQLite JOINs via `select`)

The relationship chain for "the logged-in user's work": **User → ServiceResource
(`RelatedRecordId`) → AssignedResource → ServiceAppointment → parent (WorkOrder/WOLI via
`ParentRecordId`)**. JOINs work in `pulsar.select` — tables are named by the object API name
(singular). (The Copilot notes' first example used plural table names — that is an error;
its own WorkOrder example and reality use singular.)

```js
const { userid } = await pulsar.userInfo();   // lowercase key; string

// The user's ServiceAppointments
const sas = await pulsar.select('ServiceAppointment', `
  SELECT sa.*
  FROM ServiceAppointment sa
  JOIN AssignedResource ar ON sa.Id = ar.ServiceAppointmentId
  JOIN ServiceResource sr ON ar.ServiceResourceId = sr.Id
  WHERE sr.RelatedRecordId = '${userid}'`);

// The user's ASSIGNED WorkOrders (assignment linkage runs through ServiceAppointments;
// ownership is separate — filter WorkOrder.OwnerId directly for "owned by")
const wos = await pulsar.select('WorkOrder', `
  SELECT wo.*
  FROM WorkOrder wo
  JOIN ServiceAppointment sa ON wo.Id = sa.ParentRecordId
  JOIN AssignedResource ar ON sa.Id = ar.ServiceAppointmentId
  JOIN ServiceResource sr ON ar.ServiceResourceId = sr.Id
  WHERE sr.RelatedRecordId = '${userid}'`);
```

- All returned values are strings; `select` is read-only local data (last sync + local edits).
- Interpolated values: escape single quotes (`'` → `''`); `userid` from `userInfo()` is safe.
- The `object` first argument is still required even though the SQL names the tables.

## Launch context: query parameters Pulsar adds to your document's URL

When the SFS shell opens a custom document, it appends context as URL query parameters — read
them with `new URLSearchParams(window.location.search)`:

| Launched from | Parameters |
| --- | --- |
| Lightning Bolt Menu | `id` (launching record), `objectType`, `docId` (this document's ContentDocument Id), `parentId` (when present), `parentType` (when present) |
| Card component on an overview screen | `id` (record of the overview screen), `objectType`, and — on a WorkOrder overview with an associated ServiceAppointment — `saId` (that ServiceAppointment's Id) |

- These are distinct from the **configured** `key=value` params (Pulsar 15.0+) you add in the
  tabs/cards/LBM settings — both arrive in the same query string.
- Native (non-SFS) record-button launches pass `ref_id` instead (see `create-pulsarapp`).
- Remember Schedule-calendar pages have ServiceAppointment as primary context even when they
  display WorkOrder data.

## iFrame sizing (re-send on every content change)

FSL sizes your iframe once at load. Any dynamic/async content change needs a re-send:

```js
window.parent.postMessage({ type: 'refresh', height: '800px' }, '*');
// height: any CSS height value ('50px', '50%', '2em') or '*' = fill the viewport.
```

Send it after initial async load AND whenever the content height changes (DOM updates,
expand/collapse). The `'*'` target origin is acceptable here — the message carries no
sensitive data.

## Service report template resolution (field-tested hierarchy)

1. `ServiceAppointment.ServiceReportTemplateId` — top priority.
2. Else the parent's `ServiceReportTemplateId` — read the parent via `ParentRecordId` +
   `ParentRecordType`.
3. Else `getFSLTemplate('')` — the empty string passes the SDK's `typeof === 'string'` check
   (src/pulsar.js:1920-1921), sending `TemplateId: ''`, which returns only the **default**
   template.

```js
const [sa] = await pulsar.read('ServiceAppointment', { Id: appointmentId });
let template;
if (sa?.ServiceReportTemplateId) {
  template = (await pulsar.getFSLTemplate(sa.ServiceReportTemplateId))
    ?.serviceReportTemplates?.[0];
} else if (sa?.ParentRecordId && sa?.ParentRecordType) {
  const [parent] = await pulsar.read(sa.ParentRecordType, { Id: sa.ParentRecordId });
  if (parent?.ServiceReportTemplateId) {
    template = (await pulsar.getFSLTemplate(parent.ServiceReportTemplateId))
      ?.serviceReportTemplates?.[0];
  }
}
if (!template) {
  template = (await pulsar.getFSLTemplate(''))?.serviceReportTemplates?.[0];  // default
}
```

### Choosing the subtemplate

`template.subTemplates[]` — pick by `subTemplateType`:

| Situation | subTemplateType |
| --- | --- |
| ServiceAppointment whose `ParentRecordType` is `WorkOrder` | `WO_SA` |
| ServiceAppointment whose `ParentRecordType` is `WorkOrderLineItem` | `WOLI_SA` |
| No ServiceAppointment (report directly on the object) | `WorkOrder` or `WorkOrderLineItem` |

(The Copilot notes wrote `WO_LISA` for the WOLI case; the SDK typedef — src/pulsar.js:1793 —
and this skill's `fsl-api-reference.md` define it as `WOLI_SA`. Trust the SDK; if being
defensive, log the observed `subTemplateType` values before filtering.)

**The chosen subtemplate's `regions` property is the service report layout** — build the
report document from it, then `saveAs({ filename })` →
`createServiceReportFromFilePath(...)` (see SKILL.md and `fsl-api-reference.md`).
