# Bundling and deploying a .pulsarapp — full reference

Source: wiki "Pulsar as a Platform" (Bundling and deploying / Global shared resources
sections), verified against the live wiki export 2026-07-03. Rules marked *verbatim* are quoted
from the wiki.

## Bundle format

- A `.pulsarapp` is an ordinary zip with the extension renamed. Requirements:
  1. File name ends in `.pulsarapp` (e.g. `MyApp.pulsarapp`). One command:
     `cd <appdir> && zip -r ../MyApp.pulsarapp .`
  2. `index.html` exists at the top level of the zip — the single entry point.
- On device, Pulsar unzips the bundle and **renames the top-level `index.html` to
  `<DocumentId>.html`** (the bundle's Salesforce document Id). Consequences:
  - Never hard-code links to `index.html` (yours or another app's).
  - The document Id is discoverable at runtime from the page URL if needed.
- Everything the app uses at runtime must be inside the bundle (or in Global Shared
  Resources): scripts, styles, fonts, images, and `pulsar.js` itself. Reference all of it with
  **relative paths**.

## Windows path-length warning (verbatim)

> WARNING: The Windows platform imposes severe restrictions on total file path length! If you
> deploy on Pulsar for Windows and run into problems loading some of your resources, you may
> need to reduce file name lengths and/or reduce the depth of your folder hierarchies.

## Multiple webapps and namespacing

All `.pulsarapp` bundles for a given login user unzip into the **same top-level directory**.
*Verbatim:* "multiple .pulsarapp webapps need to ensure that zipped file path names are unique
between them (except for the toplevel `index.html`) to avoid file path name collisions."

The wiki's failure taxonomy for two apps that both bundle `js/lib.js`:

1. Different libraries → whichever app unzips first breaks when the other overwrites the file.
2. Different versions of the same library → subtle bugs (one app expects 1.0, the other 1.1).
3. Identical versions → "a ticking timebomb": the next time one app updates the library and the
   other doesn't, you're back to case 2.

Mitigations: prefix every asset path with an app-unique directory (`myapp/…`), or move shared
libraries into Global Shared Resources (below).

## Global Shared Resources

Share common assets (JS libs, fonts, CSS, images) across all of your org's apps:

| Setting | Value |
| --- | --- |
| `pulsar.docs.enableHTMLResources` | `TRUE`, with a zip file **attached to the setting** |

- The attached zip must contain the **contents** of the `resources/` directory, not a
  `resources/` folder itself. Bundled `js/global.js` becomes accessible at
  `resources/js/global.js` from your apps.
- Global resource paths must not collide with paths inside any `.pulsarapp`.
- *Verbatim:* "If you are replacing or updating the attachment/file, please make sure you edit
  and save the actual Pulsar setting to change the last modified date, so Pulsar knows to now
  download the latest file." — re-attaching alone leaves devices on the stale zip.

## Deployment

1. Upload the `.pulsarapp` to a Salesforce Content Library folder.
2. Control access via Content Library folder permissions.
3. Users pick up new/changed bundles on their next sync.

## Troubleshooting

- App doesn't load after upload → verify the File Detail page lists File Extension as
  `pulsarapp` (not `zip`); verify `index.html` is at the zip root (a common mistake is zipping
  the parent folder so everything sits under `myapp/`).
- Some resources fail to load on Windows only → path length; shorten names / flatten dirs.
- To inspect a deployed app: download the `.pulsarapp` from the content library, rename to
  `.zip`, unzip.
- Embedding one .pulsarapp inside another (iframe) is mentioned by the wiki but explicitly
  undocumented ("Document soon") — don't rely on it.
