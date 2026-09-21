# Media, Content Library, Chatter & PDF reference

Sources: pulsar-sdk `src/pulsar.js` (commit `eddf62d`) and wiki "Pulsar Content Library API",
"Pulsar Images API", "Pulsar Chatter API", "Generating Your Own PDFs - Some best practices".
Verified 2026-07-03. Line numbers refer to `src/pulsar.js`.

## Camera & pickers — capture WITHOUT creating a Salesforce File

These three return device-file **metadata only**; nothing is uploaded or attached. They are the
front-end to `createSFFileFromFilePath(Batch)` (see the sibling `files-api-reference.md`).

| Method | Native UI | Returns |
| --- | --- | --- |
| `cameraPhoto(quality = 'medium')` | Camera capture | `PhotoFileMetadata` (one photo) — lines 2309-2314 |
| `cameraPhotoPicker()` | Device gallery, multi-select | `PhotoFileMetadata[]` — lines 2321-2326 |
| `filePicker()` | File dialog, arbitrary files | array of file metadata objects — lines 2333-2338 |

- `PhotoFileMetadata`: `{ ContentType, FileName, FilePath, FileURL, RelativeFilePath }`.
  `filePicker` results carry the same path/URL/content-type style fields.
- `quality` is one of the strings `'high' | 'medium' | 'low'` (unvalidated by the SDK).
- Contrast `createSFFileFromCamera(parentId, opts)`: that one DOES create a Salesforce File in
  the same step. Choose it for one-shot "photo → attached File"; choose `cameraPhoto`/pickers
  when you want to collect several files first and attach them in ONE batch call:

```js
try {
  const photos = await pulsar.cameraPhotoPicker();          // user multi-selects
  if (photos.length === 0) return;                          // nothing chosen
  const res = await pulsar.createSFFileFromFilePathBatch(
    photos.map((p) => ({ ParentId: recordId, FilePath: p.FilePath, ContentType: p.ContentType })),
  );
  if (res.summary.success !== 'TRUE') { /* inspect Object.entries(res.results) */ }
} catch (err) { console.error('Photo attach failed:', err.message); }
```

Adjacent image helpers: `userPhoto()` (lines 1678-1683) resolves `{ smallphoto, fullphoto }`
local URL strings for the current user's photo; `getSettingAttachment(key)` (lines 1578-1587)
resolves `{ FileName, FilePath, key }` (`key` = the setting key requested) for a file attached
to a Pulsar Setting.

## saveAs — generate a PDF/image from your HTML

```js
const filePath = await pulsar.saveAs({
  filename: 'report.pdf',            // REQUIRED — SDK throws 'saveAs requires a filename.'
  displayresult: 0,                  // number: >0 shows the result UI, 0 = silent save
  docnode: 'window.document',        // omit to save the entire current document
  headernode: "document.getElementById('header')",
  footernode: "document.getElementById('footer')",
  printoptions: {
    topmargin: 36, leftmargin: 36, bottommargin: 36, rightmargin: 36,  // points (1in = 72pt)
    papersize: 'a4',                 // e.g. 'a4', 'letter'
    headerheight: 50, footerheight: 40,   // points
    useEdge: true,                   // Chromium PDF renderer — recommended on Windows 15.0+
  },
});
```

- Lines 956-970. Sends `{ type: 'saveAs', data: options }` and resolves `response.FilePath` —
  the device path of the saved file (throws `'Unexpected response from saveAs.'` if `FilePath`
  is missing from the response).
- `docnode`/`headernode`/`footernode` are **string DOM expressions** that Pulsar evaluates —
  not element references. Passing an actual node breaks serialization.
- Whole-document PDF needs only `filename` (omit `docnode`). To capture an **iframe's**
  content instead, point `docnode` at its document (field-tested):
  `docnode: "document.getElementById('myframeId').contentDocument"`.
- `datauri` (string) saves a base64 image/PDF data URI directly instead of capturing the page.
- `displayresult` is a **number** and `printoptions.useEdge` a **real boolean** — unlike the
  `'TRUE'`/`'FALSE'` strings used in batch responses and field data.
- The PDF best-practices wiki page never names this endpoint — `saveAs` (SDK) is the actual
  generation call.

Attach the result:

```js
// As a Salesforce File:
const r = await pulsar.createSFFileFromFilePath(recordId, filePath,
  { name: 'report.pdf', contentType: 'application/pdf' });
// Or as an FSL Service Report (lines 2003-2030; see the `pulsar-sfs-embedded` skill):
const reportId = await pulsar.createServiceReportFromFilePath(
  parentId, filePath, templateId, 'report.pdf', 'application/pdf');
```

`createServiceReportFromFilePath` validates all five params as non-empty strings and resolves
the new ServiceReport Id; its JSDoc explicitly pairs it with `saveAs`.

## PDF best practices (wiki "Generating Your Own PDFs - Some best practices")

Wiki: "comprehensive conversion from the browser while offline is not something to be taken
for granted!" — budget for per-platform testing. Start from the official example:
<https://github.com/luminixinc/PulsarForSalesforceAdvancedJSExamples> (`example-report.pulsarapp`
— upload it as a File to your org and open from the Content Library; it uses a Strategy
Pattern per platform; explore its per-platform `strategies` and `htmlFragments`).

| Platform | Engine | Page numbers | Notes |
| --- | --- | --- | --- |
| iOS | UIPrintPageRenderer | Provided by default, in the footer | "a number of confusing nuances… Many of these relate to identifying the header and footer regions and calculating their height" |
| Windows | IronPDF | Add your own in HTML via handlebars-style variables: `{page} {total-pages} {url} {date} {time} {html-title} & {pdf-title}` | Limited font set (below); `printoptions.useEdge: true` selects the Chromium renderer on 15.0+ |
| Android | Native Chrome browser | — | Verbatim: "This is achieved in a completely different way and we recommend that you have different HTML templates for handling Android and iOS/Windows." |

- **Images/canvas/fonts → base64 data URIs.** Verbatim: "it is possible to run into issues when
  attempting to generate PDF files, due to CORS rules or similar access restrictions imposed by
  the webview environment. Our recommendation is to convert each of these resources to a 'data
  URI' format with Base64 encoding." Convert canvases at runtime with `toDataURL()`; convert
  images by drawing them into a canvas and calling `toDataURL()`.
- **Remove canvases before generating.** Verbatim: "Prior to generating the PDF or printing the
  HTML, we recommend removing the canvas from the DOM… as we cannot guarantee the PDF engine
  will render canvas elements properly at this time." (Replace each canvas with an `<img>` of
  its `toDataURL()` output first.)
- **Fonts**: "Embedding Fonts as base64 data urls works best." On Windows specifically, the PDF
  "rendering engine environment only has access to a limited set of fonts, and these are not
  guaranteed to match the operating system installed fonts" — bundle font files in your
  `.pulsarapp` and declare them via `@font-face` with relative URLs.
- Rich-text images inside PDFs: on Pulsar for Windows **prior to 18.0**, IronPDF runs as an
  external process without access to Pulsar's local web server, so Pulsar automatically
  translates `getRTFImages` relative URLs into local file paths during PDF generation (wiki
  "Pulsar Images API"; what 18.0+ uses instead is not documented in that page).

## getRTFImages — rich-text images offline (NO SDK wrapper)

Raw rich-text field data contains **Salesforce** image URLs that will not load offline.
`getRTFImages` rewrites them to Pulsar's local web-server URLs. Requires the org to be
configured to sync rich text images.

```js
// SDK gap: no wrapper for 'getRTFImages' as of commit eddf62d.
// NOTE: 'object' is a TOP-LEVEL request key, not inside data.
const rtf = await pulsar._send({
  type: 'getRTFImages',
  object: 'Some_Custom_Object__c',
  data: { Id: recordId, Fields: ['RichText_Field1__c', 'Rich_Text_2__c'] },
});
// rtf is a dictionary: field API name -> rewritten rich-text HTML
for (const f of ['RichText_Field1__c', 'Rich_Text_2__c']) {
  if (!(f in rtf)) console.warn(`getRTFImages returned no data for ${f}`);
}
```

- Failure modes differ by argument (wiki): missing `Id` → error (rejected promise); missing
  `Fields` → **NO error, just no data** — a silent failure. Always verify every requested field
  key exists in the result.
- `_send` resolves `response.data` and rejects on `type === 'error'` — never string-match the
  raw response type (`'getrtfimagesResponse'`, all-lowercase, is raw-bridge trivia only).

## getContentUrl — offline Content Library URLs

```js
const { url, title } = await pulsar.getContentUrl({ Id: '069…' });     // by Id
const alt           = await pulsar.getContentUrl({ Title: 'Doc Title' }); // or by Title
```

- Lines 1610-1623. Sends `{ type: 'getContentUrl', data: { Id?, Title? } }` including only the
  keys you provide; throws `'getContentUrl requires at least one of Id or Title.'` if neither.
  SDK bug: there is no default parameter, so `pulsar.getContentUrl()` with NO argument throws a
  raw `TypeError` instead of the friendly error — always pass an object.
- Resolves `{ url, title }` — the `url` is a local, offline URI loadable directly in the
  browser session (HTML navigation chains, PDFs, video and other multimedia).
- Title-based lookup is fragile when titles aren't unique, and behavior with BOTH Id and Title
  supplied is undocumented — prefer Id lookup.

**Verbatim wiki warning** (Pulsar Content Library API):

> getContentUrl returns a valid URL that **may include query parameters** that are used by
> Pulsar. Should you need to include query parameters, please check for the existence of them
> on the URL returned by this request and ensure that they remain in place when you load the
> URL. Appending a query string to the URL returned by this request without checking for any
> pre-existing query parameters may result in undesired behavior.

To add your own params safely: `const u = new URL(url); u.searchParams.set('k', 'v');` —
never rebuild the URL from its path alone.

### Bridge reuse in documents loaded via getContentUrl

Verbatim wiki: "if using this feature to load other HTML documents that will use the API
bridge, it is recommended not to re-initialize the bridge. You must ensure that the bridge is
saved to the global state (window) in order to pass between files" — and from an iframe,
"you should be referencing the parent as each iFrame is a separate window."

SDK translation (the wiki's `window.mybridge = masterbridge` snippets are legacy raw-bridge
style — do not copy them):

- Never call `new Pulsar().init()` inside a document loaded from a `getContentUrl` URL
  expecting a fresh bridge; there is one bridge per session.
- Have the FIRST page stash its initialized instance globally (`window.pulsarApp = pulsar;`)
  and reach it from loaded documents — from an iframe that is `window.parent.pulsarApp`,
  because each iframe is a separate `window`.
- In embedded contexts the SDK's `init()` already adopts `window.parent.pulsar.bridge` when it
  exists (lines 22-28), but do not rely on that for getContentUrl-loaded documents — passing
  the initialized instance explicitly is the dependable pattern.

## Chatter

Both feeds depend on the Pulsar Chatter object sync configuration: `chatterGetFeed` only sees
FeedItems Pulsar has synced — an empty result may just mean "not synced", not "no posts".

### chatterGetFeed(parentId, options) — lines 1465-1490

```js
const feed = await pulsar.chatterGetFeed(recordId, {
  afterDate: '2017-07-11T04:31:06.000+0000',   // optional — SFDC datetime, +0000 offset
  beforeDate: '2017-07-12T04:31:06.000+0000',  // optional
  orderBy: 'CreatedDate ASC',                  // optional — SQL fragment WITHOUT 'ORDER BY'
});
```

- Bridge type is all-lowercase `'chattergetfeed'`; the SDK maps `afterDate`/`beforeDate` to the
  **literal JSAPI keys `'@@after_date'`/`'@@before_date'`** and passes `orderBy` through.
- Dates must be SFDC format with milliseconds and `+0000` offset (as above) — the SDK does not
  validate or convert. `orderBy` fields must exist in the local FeedItem table.
- Resolves an **array of FeedItem objects** (Body, Title, CommentCount, LikeCount, ParentId,
  RelatedRecordId, …); throws `'Unexpected response from chatterGetFeed…'` if the response
  isn't an array. Falsy date strings are silently dropped from the request.
- (The wiki page's own raw example is syntactically invalid JavaScript — `'type' =` instead of
  `'type' :` — never copy it.)

### chatterPostFeed(message, parentId, parentFeedItemId?) — lines 1504-1526

```js
await pulsar.chatterPostFeed('Job complete, photos attached.', recordId);        // post
await pulsar.chatterPostFeed('Agreed!', recordId, existingFeedItemId);           // comment
```

- Argument order: **message first**. Sends `{ type: 'chatterpostfeed', data: { Message,
  Parent, ParentFeedItem? } }` — the raw key is **`Parent`, not `ParentId`** (the raw API is
  inconsistent with `chattergetfeed`'s `ParentId`; the SDK hides this, but remember it if you
  ever read raw examples).
- A comment (reply) is just a post with `parentFeedItemId` — there is no separate endpoint.
- **Resolves `undefined` on success** — no FeedItem or Id is returned; refresh via
  `chatterGetFeed` if you need to show the new post. Rejects with `Error` on failure.
- Chatter **attachments are not supported** through this API (wiki, verbatim: "Chatter
  attachments are not currently supported through this API"). Offline queuing behavior for
  posts is undocumented — test before relying on offline posting.

## Booleans, numbers, strings in this domain

| Value | Type on the wire |
| --- | --- |
| `readSFFile`/`queryContent` flags `ReturnBase64Data`, `DownloadVersionData` (SDK params `returnBase64Data`, `downloadVersionData`) | real JS booleans |
| Batch response `summary.success`, `results['N'].success` | `'TRUE'`/`'FALSE'` **strings** |
| `deleteSFFile` resolved value | real boolean `true` (or throw) |
| `saveAs` `displayresult` | number (`0` = silent) |
| `saveAs` `printoptions` margins/heights | numbers, in points |
| `printoptions.useEdge` | real boolean |
| `cameraPhoto` quality | string `'high'|'medium'|'low'` |
| Checkbox-style custom fields in create payloads | `'TRUE'`/`'FALSE'` strings (field-data convention — every local-database value is a string) |
