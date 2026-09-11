# SFS customization surfaces & settings reference

Sources: wiki "Pulsar SFS UI Customizations", "Pulsar SFS Lightning Bolt Menu Customizations",
"Pulsar SFS Toolbar Item Visibility on Native Screens", "Pulsar SFS Screens and the data that
feeds them", "Configuring Pulsar to run Salesforce Field Service (SFS)", "Pulsar Widget" — all
verified 2026-07-03. Rules marked *verbatim* are quoted from the wiki. All settings are Pulsar
Settings created in the org; devices pick up changes only after a sync and/or Refresh Settings.

Setting values use the **strings** `TRUE`/`FALSE` (never real booleans). Document Ids in
setting values appear as both 15- and 18-character forms in wiki examples; no page states
which is required.

## Tab bar — `pulsar.fsl.layout.tabs`

Newline-separated entries; each is either a reserved standard-tab keyword or
`label : documentId` (optionally `label : documentId : key=value&…`, query params 15.0+).

*Verbatim (critical):* "You **must** add all tabs that you wish to see on the tab bar to this
setting. Failure to add a tab will exclude it from the app. This includes the standard SFS
tabs."

- Documented reserved keywords: **Schedule, Inventory, Notifications, Profile**. (The wiki's
  own example also lists a bare `Time Sheet` line — apparently a fifth undocumented keyword;
  test before relying on it.)
- The 4th tab is always labeled **More**; entries after the third land in a modal behind it.

```
Schedule
Inventory
Create Order:0696A000005Yr7i
Display Task:0696A000005Yw1V:param1=value1&param2=other+value+with%20space
Profile
```

## Cards on an object page — `pulsar.fsl.{objectType}.{optionalRecordTypeDeveloperName}.order`

Defines **all** cards, top to bottom, for that object type / record type pair. *Verbatim:*
"Failure to include a card in the value of the setting will result in it not being displayed."

- Entries: standard card names, custom documents (`Title : DocumentId [: queryParams]`,
  params 15.0+), or generic related-list object developer names.
- Standard cards: **ServiceAppointment, Contact, Asset, WorkOrderLineItem, KnowledgeArticle,
  ServiceReport, ProductRequestLineItem, ProductTransfer, Parent, TimeSheetEntry**.
  *Verbatim:* "If the object context does not contain a relation to the standard card object,
  it may display no data."
- Generic related-list cards: "The object must be related to the pages WorkOrder or
  WorkOrderLineItem and must be synchronized within Pulsar." An unsynced object yields an
  empty card.
- Key-form inconsistency: the wiki prose defines `pulsar.fsl.{objectType}.{recordType}.order`
  but its worked example is titled `pulsar.fsl.layout.workorder.order` (extra `layout`
  segment). Which form is canonical is unverified — test in your org.

## Lightning Bolt Menu — `pulsar.fsl.layout.{objectType}.{recordTypeDevName}.lightningbolt.listitems`

The setting value is **PSL** (see the pulsar-psl skill), ending in a `SetResult` action whose
`Result` is a newline-separated entry list. PSL variables interpolate via `%%VarName%%` (e.g.
dynamic flow labels).

Primary object context rules:

- Every SFS page has a **single primary object context** (shown in the LBM modal header).
  *Verbatim:* "If the header shows both a Service Appointment and Work Order/Work Order Line
  Item, then it is a Service Appointment Context." Pages opened from the Schedule calendar
  have **ServiceAppointment** context.
- On Pulsar 12.0 and prior, WorkOrder/WorkOrderLineItem-scoped settings "will not likely see
  them appear in Pulsar SFS" — use `parent` entries instead. 13.0+ respects WO/WOLI-scoped
  settings. Since the parent may be WO or WOLI, *verbatim:* "you may want to write two
  entries to cover both cases".
- Object type `Global` (no record type): applies to pages not derived from a specific object;
  the root page of each SFS tab has Global context; only Global-layout Quick Actions are
  available. Global section items come from `pulsar.fsl.layout.global.lightningbolt.listitems`.

Entry types (12.0: `default, qa, flow, parent, custom, link`, plus `parent_cc`; 13.0+ adds
platform links):

| Entry | Meaning |
| --- | --- |
| `default` | Insert all items that would appear without the setting. De-duplication is by order of appearance — entries listed AFTER `default` may never show if already in the default set; on 12.0 combining `default` with explicit entries can duplicate |
| `qa : <quickActionName>` | One quick action on the primary object context; invalid-for-context entries silently don't render |
| `flow : <launchValue> [: label]` | One flow on the primary context, identified by **launchValue**; optional 3rd param is the menu label |
| `parent : <qa\|flow\|link\|custom\|platform> : …` | Item defined on the PARENT of the primary context (13.0+ for link/custom/platform under parent) |
| `parent_cc : …` | Places the action in the parent section but runs it with the CHILD object context. *Verbatim:* "Currently, this option is only available for modifying custom actions." |
| `custom : <label> : <ContentDocumentId> [: queryParams]` | Launch a custom document (query params 15.0+) — the main LBM launch point for .pulsarapp pages |
| `link : <AppExtensionName>` | Launch a URI defined in Field Service Mobile Settings > App Extensions |
| `iOS \| windows \| android \| allPlatforms : <url> : <label>` | 13.0+ web/deep links filtered by platform. WARNING: the wiki's descriptions of `windows` and `android` are swapped ("windows … will only show on Android devices" and vice versa) — almost certainly a wiki error, but verify on-device before shipping |

Screen-context filtering — prefix any entry line with:

- `all` (default) — native Pulsar object detail screens AND SFS screens
- `record` — native Pulsar object detail screens only (or the Global LBM)
- `fsl` — SFS screens only

Additional settings:

| Setting | Notes |
| --- | --- |
| `pulsar.fsl.lightningbolt.menuitems.enableSectionHeaderDetails` | 13.0+, default `FALSE`; `TRUE` adds object display names to section headers and widens the LBM |
| `pulsar.fsl.{ObjectType}.lightningbolt.menuitems.sectionOrder` | 14.0+; list of `parent, record, more, global` — *verbatim:* "sections may be omitted but may not be repeated" |

## Native-screen toolbar visibility — `pulsar.layout.toolbar.fslVisibleItems`

In SFS, most toolbar items on **native** object detail screens are hidden by default ("the
primary method of interacting with your data in SFS should be with the SFS HTML interface").
Re-enable per object / record type with newline-separated lines:

```
Account.Customer_Account : lightning
Contact : documents,links
Case : showall
```

- Items: `chatter`, `custom` (PSL actions), `links`, `documents` (custom HTML/JS docs —
  needed if your app launches from the doclist button), `lightning` (quick actions).
  `showall` must be the **sole** list item when used.
- A record-type-specific line overrides an object-only line.
- *Verbatim:* "specifying an item only enables the visibility of the button; The button still
  may not show if it is not valid in the current context."

## Display fields, detail counts, carousel

- **Display Fields** drive most SFS lists: header = FIRST field of the compact/search/related
  list layout; details = the remaining fields (up to 4 by default,
  `pulsar.fsl.layout.detailFieldCount` overrides) joined with " • ". Empty fields are
  silently skipped (shifting what users see). *Verbatim:* "It is important to make sure that
  your **header** fields are required fields or your users may have a confusing UI
  experience."
- Carousel tabs on SObject pages: Overview/Details/Related always present; optional items
  controlled by `pulsar.fsl.layout.carouselItems` (org-wide), 13.0+
  `pulsar.fsl.layout.{objectType}.carouselItems`, 14.0+
  `…{objectType}.carouselItems.excludedItems`. Values: `work-plans, location, products, feed`
  — *verbatim:* "These are case-sensitive so be careful when adding them."
- Work Plans need `WorkPlan` and `WorkStep` (plus their related objects/custom fields) added
  to the sync configuration, then Refresh Settings + Sync.

## Show/hide settings — read the KEY name, not the section title

Wiki section titles say "Hide X" even for keys named `display*` that usually default `TRUE`
(set `FALSE` to hide; `displayFutureTimeSheets` is the documented exception: default `FALSE`).
Conversely `hide*` keys default `FALSE` (set `TRUE` to hide). Trust the key:

| Key (all values `TRUE`/`FALSE` strings) | Default | Effect |
| --- | --- | --- |
| `pulsar.fsl.layout.serviceappointment.displayCreateServiceReportButton` | TRUE | Create Service Report button on SA screens; `.dynamic` PSL variants (13.0+, also `workorder`/`workorderlineitem` scopes) take precedence over the static key |
| `pulsar.fsl.layout.schedule.displayMap`, `…serviceappointment.displayMap` | TRUE | Map on schedule / SA overview |
| `pulsar.fsl.layout.serviceappointment.displayDrivingDirectionsButton` | TRUE | Driving directions button |
| `pulsar.fsl.layout.timesheets.displaysubmitbutton` | TRUE | Time Sheet submit button — the wiki's own table contradicts itself on the toggle sense; verify in a sandbox |
| `pulsar.fsl.layout.timesheets.displayFutureTimeSheets` | FALSE | Future time sheets in the Time Sheets dropdown |
| `pulsar.fsl.layout.WorkStep.displayCompleteStep`, `…displayMarkNotApplicableStep` | TRUE (13.0+) | Work Step action buttons |
| `pulsar.fsl.layout.profile.hideAddResourceAbsence` | FALSE | `TRUE` hides Add Resource Absence |
| `pulsar.fsl.layout.productRequest.hideAddProductRequestLineItem`, `…productRequest.hideAddButton`, `…productTransfer.hideAddButton` | FALSE | `TRUE` hides the respective add buttons |
| `pulsar.fsl.layout.serviceReport.hideServiceNote`, `…hideMarkNotPresent` | FALSE | Service report screen elements |
| `pulsar.fsl.layout.serviceReport.hideEmptySections`, `…hideEmptyRelatedLists` | FALSE | Hide normal/related-list template sections when all fields empty / no rows. Templates have three section types (normal, related list, signature); these settings never hide signature sections |
| `pulsar.fsl.layout.schedule.hideDirections` | FALSE | Directions on schedule |
| `pulsar.fsl.layout.showAssignContactButton` | TRUE | `show*` keys: `TRUE` shows |
| `…layout.showIncludeOutOfStock`, `…layout.schedule.showResourceAbsences`, `…schedule.showGanttLabelForResourceAbsences`, `…schedule.showLightningButton` | FALSE | `show*` keys: `TRUE` shows |
| `pulsar.fsl.layout.enableAssetHierarchy` | FALSE | *Verbatim:* "SFS Mobile app requires the Field Service Asset Service Lifecycle Management Add-On enabled for this feature to work. Pulsar doesn't enforce this requirement but test and confirm this works in your environment." |

Schedule/calendar tuning: `pulsar.fsl.schedule.numDaysBefore` / `numDaysAfter` (can exceed
Salesforce's 45-day mobile-settings limit), `pulsar.fsl.calendar.enableworkweekonly`,
`pulsar.fsl.calendar.firstdayofweek` (0=Sunday, 1=Monday — overrides every user's locale
org-wide), `pulsar.fsl.schedule.ignoreAbsenceRecordTypes`. The wiki is self-contradictory on RA calendar
dots: the `showResourceAbsences` section says RAs do NOT display as SA-style dots, while the
`ignoreAbsenceRecordTypes` section says all RAs display a red dot by default (suppressible per
record type via that setting) — verify on-device. RAs appear in the day list / full calendar,
labeled "RA: <unique RA #>" unless `showGanttLabelForResourceAbsences` = `TRUE`.

## PSL gates (dynamic behavior)

- `pulsar.beforeView.<Object API Name>` (14.0+, e.g. `pulsar.beforeView.ServiceAppointment`)
  — PSL runs before a record is viewed; a `SetResult` with `ResultValid=false` blocks viewing
  and `Result` becomes the denial message shown to the user.
- `pulsar.fsl.layout.serviceReport.beforeCreate` — PSL gate on service report creation; on
  validation failure the error shows in an alert window.
- Dynamic PSL settings take precedence over their static counterparts (e.g.
  `…displayCreateServiceReportButton.dynamic` overrides the static key; 13.0+).
- See the pulsar-psl skill for PSL syntax.

## Maps configuration

Schedule-screen map provider resolution order (fixed): `pulsar.fsl.azureMapsAPIKey`, else
`pulsar.fsl.appleMapKitJSAPIKey`, else `pulsar.fsl.googleMapsAPIKey`, else a shared Luminix
Google key. Azure/Apple keys require Pulsar 15.0+.

- *Verbatim (shared default key, critical):* "This is a single pool of requests and will
  frequently run out before the end of the month and disable maps for all users using the
  shared pool until the next month." Always connect your own key for production.
- *Verbatim:* "Only one API key should be defined. Choose the appropriate type of API key for
  your users' devices running Pulsar." And: "Google Maps must be used if you are implementing
  this feature on both Windows and Android devices."
- The **Service Appointment overview map only uses the Google key** — *verbatim:*
  "`pulsar.fsl.azureMapsAPIKey` and `pulsar.fsl.appleMapKitJSAPIKey` settings have no effect
  on this screen."
- Google Cloud: enable Maps JavaScript API, Geocoding API, Directions API; billing required
  ("Maps services will not work without billing setup"); restrict the key. Azure: set usage
  limits/IP restrictions. Apple MapKit `.p8` private key: "You won't be able to download it
  again, so store it securely."
- `pulsar.fsl.layout.mapsProvider` accepts only `maps.google.com`, `bing.com`, `cn.bing.com`
  ("Others are not supported at this time") and *disables all map UI components in SFS*,
  redirecting Get Directions to the provider.

## SFS screens and the data that feeds them

Useful when replicating or extending native screens in a custom document, and when diagnosing
"missing data" offline. Source: wiki "Pulsar SFS Screens and the data that feeds them".

- **Schedule screen** shows a ServiceAppointment only if BOTH: (1) its scheduled start date
  falls on the selected day, and (2) an AssignedResource record references the ServiceResource
  of the currently logged-in user. A custom schedule replacement must apply both filters.
  13.0+ can use a custom list view via Field Service Mobile Settings > "Default List View
  Developer Name"; Pulsar logs debug entries prefixed `FSL Schedule:` confirming which layout/
  list view it used (missing / valid / invalid-typo / field-less cases are distinguishable).
- **Service Appointment / Work Order page**: header shows WO number, description, Case info;
  carousel items; sections for Service Appointment, Contact, Asset Service History (up to 4
  WOs, fields from the WorkOrder related list on the Asset layout), Work Order Line Items (up
  to 4), Linked Articles (up to 4), Product Requests.
- **Products Consumed**: header = first non-empty Search Layout field; details = first 3
  non-empty ProductConsumed Related List fields AFTER the first non-empty field, plus
  Quantity. *Verbatim:* "If the fields in the Search Layout are empty when the user is in
  Offline Mode, Products Consumed may appear to be missing information. The information will
  appear when the user goes online and syncs Pulsar."
- **Price Book entries**: Price Books must be associated with the work order or nothing
  shows; entries filter by WO currency code, falling back to the Price Book currency code; if
  neither has one, nothing displays; only 10 entries display by default (search for more).
- **Inventory tab**: Product Items, Product Requests, Product Transfers (pending vs received
  lists); inventory availability follows the SFS mobile setup (user location + WO assignments).
- **Time Sheets**: *verbatim:* "The clock icon will show up on the Profile screen if you have
  enabled time sheets in the Field Service Mobile Settings… Please also make sure the service
  resource has time sheets and has proper permission to view them. And make sure time sheets
  are in the related list for the service resource."

## Org configuration (developer-relevant essentials)

From wiki "Configuring Pulsar to run Salesforce Field Service (SFS)":

1. *Verbatim:* "It is a requirement that you first install the Pulsar Premium AppExchange
   package before you proceed with the install of the Pulsar for SFS AppExchange package."
   (Sandboxes: use AppExchange's "Try it" option, not Get It Now.)
2. Enable via the **Pulsar for SFS tab** > Enable/Update Pulsar for SFS.
3. Permissions: read access on the **PulsarFSL** Content Library for all user groups; the
   **Pulsar Settings Read Only** permission per user; licenses via Setup > Installed
   Packages > Pulsar Settings > Assign Licenses.
4. *Verbatim (critical for custom apps):* "Pulsar will sync core SFS objects out of the box.
   If you have other standard or custom objects in related lists or have quick actions and
   flows using them, please make sure to add these to the pulsar.sync.objects setting that
   was created when you installed the Pulsar for SFS package." Alternative:
   `pulsar.sync.relationship.directives` (see the pulsar-sync skill). Objects missing from
   sync config make your offline queries return empty results with no error.
5. If the SFS home screen doesn't appear after login/sync: Settings icon > **Refresh
   Settings**.
6. Quick Status Change flow: set the Flow Name under Setup > Field Service Mobile Settings;
   it appears on the schedule screen or the SA's LBM after the user's next sync.

## The Appointments Widget (native — not an embed surface)

From wiki "Pulsar Widget": a native OS home-screen widget, "only meaningful for users running
Salesforce Field Service". It is not a place to run custom web content.

- Shows the logged-in user's ServiceAppointments; *verbatim:* "Includes all service
  appointments that start, end, or span the current day in local time." and "Excludes service
  appointments with a status of Completed, Cannot Complete, or None."
- Displays up to two appointments at a time, plus possibly a link to any others for that day.
- Updates on every sync and on a 5-minute (default) heartbeat; shows a log-in prompt while
  logged out.
- Shows an invalid-configuration screen if ANY of: the org is not configured for Field
  Service; the `pulsar.widget` Pulsar setting is not `TRUE`; ServiceAppointment is not synced.

## Known wiki inconsistencies in this domain (verify before relying)

- LBM platform-link descriptions for `windows` and `android` are swapped in the wiki text.
- Card-order setting key: prose `pulsar.fsl.{objectType}.{recordType}.order` vs example
  `pulsar.fsl.layout.workorder.order`.
- `Time Sheet` appears in the tab-bar example but not in the reserved-keyword list.
- `pulsar.fsl.layout.timesheets.displaysubmitbutton`: key name implies TRUE shows, the wiki
  description implies TRUE hides.
- The wiki's "Optionally Displaying a Native Detail Screen for Service Appointments" table
  reuses the `displayFutureTimeSheets` key by copy-paste error — the real key is undocumented.
- The named two-arg sync handlers on the wiki (`addSyncUpdateHandler`/`addSyncFinishedHandler`)
  are the **FSL host** API (a separate Luminix product offering), exposed on the parent `pulsar` object —
  not the pulsar.js SDK. A custom `.pulsarapp` uses `registerHandler`/`deregisterHandler` and
  never calls the host methods directly.
