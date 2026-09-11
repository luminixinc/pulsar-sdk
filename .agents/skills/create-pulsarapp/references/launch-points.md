# Launch points — how users open your .pulsarapp

Source: wiki "Pulsar as a Platform" + "Pulsar Widget", verified 2026-07-03. All configuration
is Pulsar Settings (created in the org; Pulsar syncs them to devices). Document Ids may be 15
or 18 characters; ID lists may be separated by newlines, commas, or semicolons.

## 0. Content Library tab (zero config)

Users can always open the app from Pulsar's Content Library tab. Works out of the box; hardest
for users to discover.

## 1. Home-page tab icon

Three settings:

| Step | Setting key | Value |
| --- | --- | --- |
| List the app(s) | `pulsar.home.contentLibraryTabs` | Document Id(s) of the `.pulsarapp` file(s) |
| Style each tab | `pulsar.home.contentLibraryTabs.<DocumentID>` | `R,G,B` integer tuple for tab background (e.g. `52,17,85`); after saving, **attach a 64×64 px icon** to the setting |
| Position the tabs | `pulsar.home.topPositions` | Ordered list of home-screen icons, e.g. `user, calendar, tasks, documents, contentlibrarytabs` |

## 2. Record-detail button (doclist)

Launches the app from a record's toolbar, passing the record Id as the `ref_id` URL query
parameter (`new URLSearchParams(window.location.search).get('ref_id')`).

| Purpose | Setting key | Value |
| --- | --- | --- |
| Show on all records of an object | `pulsar.layout.<ObjectAPIName>.doclist` | Document Id(s), e.g. `069i0000001i3wP;069E00000024nI0` |
| Restrict to a record type | `pulsar.layout.<ObjectAPIName>.<RecordTypeDeveloperName>.doclist` | Document Id(s) |
| Custom button icon (optional) | `pulsar.layout.<ObjectAPIName>.doclist.icon` | Attach a square PNG ≈50×50 px to the setting |

Icon guidance (verbatim-adjacent from wiki): use a simplified design — iOS transforms the image
into a monochromatic icon; it should have transparency, anti-aliasing, and no drop shadow that
uses a mask to define its shape.

Finding a Document Id: open the document in the Salesforce content libraries and read
`selectedDocumentId` from the browser URL, e.g.
`https://na15.salesforce.com/sfc/#version?selectedDocumentId=069i0000001i3wP`.

## 3. Full home-page replacement

| Setting key | Value |
| --- | --- |
| `pulsar.home.webContent` | Document Id of the `.pulsarapp` to show instead of the Pulsar home page |
| `pulsar.home.toolbar.enableAppBrowser` | `TRUE`/`FALSE` — show a bottom-toolbar button opening the Salesforce app/tab browser |

Behavior and obligations for home apps (wiki "Home Screen App Best Practices", verbatim
bullets):

- "Don't assume that your organization is fully synced when your app first starts"
- "Note that Pulsar may need to initiate a sync to get the document specified, and that sync
  may still be ongoing"
- "When starting, your app should check for an ongoing sync or if sync is needed"
- "We highly recommend that your app blocks your own UI when sync is running"
- Pulsar draws **no top toolbar** for a home app — provide your own (e.g. a refresh action).
  The default bottom toolbar (online status, settings) remains.

## 4. Deep link (`launchdocument`)

Since Pulsar 13.0.0, deep links open a Content Library document directly:
`pulsar://launchdocument/<DocumentId>` or
`https://www.luminixinc.com/pulsarapp/launchdocument/<DocumentId>`. For HTML/web content, **all
extra deep-link parameters are forwarded to the document as URL parameters** — a supported way
to pass arguments into a .pulsarapp from outside (email links, other apps). Only works for
Content Library documents. Details: `pulsar-native-ui` skill.

Note: the wiki's "Pulsar Widget" page is about the native FSL **Appointments Widget** (a
home-screen widget showing today's ServiceAppointments), not a custom-app launch surface — it
is not a way to embed your web app.

## Reminder

After changing any of these settings, users must sync (or Refresh Settings) to see the change.
