---
name: pulsar-files
description: Salesforce Files, media and documents in a .pulsarapp. Use for ContentDocument/ContentVersion create/read/query/delete, camera and file pickers, offline Content Library URLs, rich-text images, Chatter feeds, or PDFs via saveAs.
---

# Files, media, Chatter & PDFs in a .pulsarapp

Prerequisites: `await pulsar.init()` exactly once (see `create-pulsarapp`), and **Salesforce
Files support enabled in Pulsar** — verbatim wiki: "In order to use the below APIs, you must
enable Salesforce Files support within Pulsar." (Salesforce Files API, verified 2026-07-03).
Wrap every call in `try/catch`; the Always rules above apply.

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

## Choosing an API

| Need | Use |
| --- | --- |
| Upload many files | `createSFFileBatch(files)` (base64) / `createSFFileFromFilePathBatch(files)` (device paths) — **always over loops** |
| Upload one file from base64 | `createSFFile(parentId, name, body, opts)` → ContentDocument Id string |
| Upload one device file | `createSFFileFromFilePath(parentId, filePath, opts)` |
| Camera photo → Salesforce File in one step | `createSFFileFromCamera(parentId, opts)` |
| Camera/gallery/file dialog **without** creating a File | `cameraPhoto(quality)` / `cameraPhotoPicker()` / `filePicker()` — return metadata with `FilePath` to feed the FromFilePath APIs |
| Read one File (URL or base64) | `readSFFile(fileId, returnBase64Data, downloadVersionData)` — result is an **array** |
| List/filter cached Files | `queryContent(filter, downloadVersionData)` — SQLite WHERE over ContentVersion; URLs/paths only, never data |
| Delete / remove Files (the ONLY removal path) | `deleteSFFile(documentIdList)` — array of 069 Ids, even for one |
| Offline URL for a Content Library doc | `getContentUrl({ Id })` or `({ Title })` → `{ url, title }` |
| Rich-text field images offline | `getRTFImages` — **no SDK wrapper**, raw `_send` (below) |
| Legacy Document object (015 Ids) | `readDocument` — **no SDK wrapper**, raw `_send` (below) |
| Generate PDF/image from HTML | `saveAs(options)` → device FilePath, then attach via a create API |
| Chatter read/post | `chatterGetFeed(parentId, opts)` / `chatterPostFeed(message, parentId, parentFeedItemId?)` |

This table is the documented Files surface — **if an operation isn't listed, don't invent
one**. In particular there is no link/unlink operation: `ContentDocumentLink` appears in this
API only as a `queryContent` filter target, never as a CRUD object, so "remove this file from
the record" means `deleteSFFile` (deletes the ContentDocument). Code that writes/deletes
`ContentDocumentLink` records directly is undocumented behavior — expect it to silently do
nothing.

## Headline rule: batch, never loop

Verbatim wiki: "Multiple create or delete requests MUST NOT run concurrently, and should
instead be run sequentially." For multiple files the wiki recommends the batch endpoints
(v14+) over chaining singles. Never `Promise.all` over file writes; if a single-call loop is
unavoidable, sequential `for...of` with `await`. Delete many with ONE `deleteSFFile` call.

```js
try {
  const res = await pulsar.createSFFileFromFilePathBatch([
    { ParentId: recordId, FilePath: photo1.FilePath, ContentType: 'image/jpeg' },
    { ParentId: recordId, FilePath: photo2.FilePath, Name: 'after.jpg' },
  ]);
  if (res.summary.success !== 'TRUE') {                    // STRING, not boolean
    for (const [i, r] of Object.entries(res.results)) {    // object keyed '0','1',... NOT an array
      if (r.success === 'FALSE') console.error(`file ${i} failed: ${r.error}`);
    }
  }
} catch (err) { console.error('Batch create failed:', err.message); }
```

Batch response gotchas (`src/pulsar.js:1104-1183`, wiki `createbatchResponse`, verified 2026-07-03):

- `summary.success` and per-entry `success` are `'TRUE'`/`'FALSE'` **strings**.
- `results` is an **object keyed by numeric-string index** (`'0'`, `'1'`, …), not an array.
- Offline creates return placeholder `objectId` like `CURIUM_1111111111_1` (real `069…` Id only
  after sync, or when created online). Never persist a `CURIUM_` id as a permanent reference.
- Batch entries use raw **PascalCase** keys (`ParentId`, `Name`, `Body`, `FilePath`,
  `ContentType`, `Description`, `NetworkId`) — unlike single-call `options`, which are
  camelCase (`{ name, contentType, networkId }`) and mapped by the SDK.

## Creating files — shared rules

- Custom ContentVersion fields spread straight into the create payload/options with their
  **exact Salesforce API names** (`My_Field__c: 'x'`); they may be required by org config.
- `NetworkId` (0DB-prefixed Experience Cloud site Id) is required **only for Community users**.
- Return-shape drift: `createSFFile` resolves the new ContentDocument Id string;
  `createSFFileFromFilePath` resolves an object
  `{ AttachmentId, ContentDocumentId, ContentVersionId, FileURL }` per current SDK JSDoc/tests
  but a bare Id string per the (older) wiki; `createSFFileFromCamera`'s shape is inconsistent
  even within the current SDK (typedef says object; JSDoc prose and SDK tests show a bare Id
  string) — always write
  `const id = typeof r === 'string' ? r : r.ContentDocumentId;`
- `cameraPhoto`/`cameraPhotoPicker`/`filePicker` do **NOT** create Salesforce Files — they
  return `{ ContentType, FileName, FilePath, FileURL, RelativeFilePath }` metadata. Pattern:
  pick → collect `FilePath`s → one `createSFFileFromFilePathBatch`.

## Reading & querying

- `readSFFile` resolves an **array even for one file**: `const [file] = await
  pulsar.readSFFile(id);`. `id` may be a ContentDocument (069) or ContentVersion (068) Id.
  Defaults `returnBase64Data = false` — **prefer the returned `FileURL` over base64** for
  display and download (`VersionData`/`ThumbBody` only when `true`); default
  `downloadVersionData = true` (when online Pulsar re-downloads from the server for freshness —
  pass `false` for local-only, faster).
- **Never store file bytes in record fields or in any state you persist.** Persist
  ContentDocument Ids only; re-read bytes on demand (`readSFFile`) or display via `FileURL`.
  Base64 cached onto an object that later gets serialized into a record field silently bloats
  the record, the sync payload, and can overflow the field — and truncating to fit destroys
  the user's file. Keep any byte cache in memory only, keyed by Id, never on persisted objects.
- `ThumbURL` is an **empty string** (not null) for non-image files.
- `queryContent(filter)` filter is a **SQLite WHERE clause** over the local ContentVersion
  table (subselects on ContentDocumentLink allowed) — NOT SOQL. Returns
  `FileURL`/`ThumbURL`/`FilePath`/`ThumbPath` only; call `readSFFile` per file for base64.
- Plain `select` reads of ContentVersion will NOT contain `VersionData` unless previously
  populated — use `readSFFile` or `FileURL`.
- `FileURL` points at Pulsar's local web server (`http://127.0.0.1:17014/…`) — session-local;
  never persist or share it.
- Deletes: `deleteSFFile(idList)` resolves `true` or throws. (Non-file records: `deleteBatch`
  — see `pulsar-data-access`.)

## Content Library URLs

```js
const { url, title } = await pulsar.getContentUrl({ Id: contentDocumentId }); // or { Title: '...' }
```

Verbatim wiki warning: "getContentUrl returns a valid URL that **may include query parameters**
that are used by Pulsar. … Appending a query string to the URL returned by this request without
checking for any pre-existing query parameters may result in undesired behavior." Load the URL
as-is; never strip params, and check for an existing `?` before appending. An HTML document
loaded this way that needs the JSAPI must **reuse the already-initialized bridge** (from an
iframe: the parent window's instance) — never re-run `new Pulsar().init()` there (wiki: Pulsar
Content Library API; details in `references/media-and-pdf-reference.md`).

## PDF generation → attach

```js
const filePath = await pulsar.saveAs({
  filename: 'report.pdf',                                   // REQUIRED
  docnode: 'window.document',                               // string DOM EXPRESSIONS, not nodes
  headernode: "document.getElementById('header')",
  footernode: "document.getElementById('footer')",
  printoptions: { papersize: 'a4', topmargin: 36 },         // points; useEdge: true on Windows 15+
});
const result = await pulsar.createSFFileFromFilePath(recordId, filePath,
  { name: 'report.pdf', contentType: 'application/pdf' });
```

`saveAs` resolves the saved file's device path (`src/pulsar.js:956-970`). For FSL Service
Reports use `createServiceReportFromFilePath(parentId, filePath, templateId, documentName,
contentType)` instead (see `pulsar-sfs-embedded`). PDF engines differ per platform — verbatim
wiki: Android renders "in a completely different way and we recommend that you have different
HTML templates for handling Android and iOS/Windows." Convert images/canvas/fonts to base64
data URIs, remove canvases from the DOM first, bundle fonts on Windows — full best practices in
`references/media-and-pdf-reference.md`.

## Chatter

- `chatterGetFeed(parentId, { afterDate, beforeDate, orderBy })` → FeedItem array. Dates are
  SFDC format with `+0000` offset (`'2017-07-11T04:31:06.000+0000'`) — the SDK maps them to the
  literal JSAPI keys `'@@after_date'`/`'@@before_date'`. `orderBy` is a SQL fragment WITHOUT
  the words `ORDER BY`, over local FeedItem fields. Empty feed may just mean not synced.
- `chatterPostFeed(message, parentId, parentFeedItemId?)` — message FIRST; the SDK maps
  `parentId` to the raw key `Parent` (the raw API inconsistently uses `Parent` here vs
  `ParentId` in gets). Pass `parentFeedItemId` to post a **comment**. **Resolves `undefined`**
  on success — no FeedItem/Id comes back. Attachments are NOT supported.

## SDK gaps — raw escape hatch only

```js
// SDK gap: no wrapper for 'getRTFImages' (commit eddf62d). NOTE top-level 'object' key.
const rtf = await pulsar._send({ type: 'getRTFImages', object: 'Account',
                                 data: { Id: recordId, Fields: ['Rich_Text__c'] } });
if (!('Rich_Text__c' in rtf)) { /* missing Fields fails SILENTLY — always verify keys */ }
// SDK gap: no wrapper for 'readDocument' (legacy Document, 015 Ids).
const doc = await pulsar._send({ type: 'readDocument',
                                 args: { Id: documentId, ReturnBase64Data: false } }); // wiki shows 'args' not 'data' — unverified; test both
```

## References

- `references/files-api-reference.md` — full create/read/query/delete request+response shapes,
  batch envelope, CURIUM semantics, readDocument, settings (thumbnail/image quality).
- `references/media-and-pdf-reference.md` — camera/pickers, saveAs options, per-platform PDF
  best practices, getRTFImages, getContentUrl details, Chatter shapes.
