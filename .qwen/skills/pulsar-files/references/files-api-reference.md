# Salesforce Files API reference (SDK signatures + JSAPI shapes)

Sources: pulsar-sdk `src/pulsar.js` (commit `eddf62d`, the authority for signatures/behavior)
and wiki "Salesforce Files API" (authority for request/response shapes and platform behavior).
Verified 2026-07-03. Line numbers refer to `src/pulsar.js`.

Prerequisite for everything on this page — verbatim wiki: "In order to use the below APIs, you
must enable Salesforce Files support within Pulsar. Please see 'Enable Salesforce Files' for
instructions for doing this."

## Concurrency rule (verbatim, stated four times on the wiki page)

> Multiple create or delete requests MUST NOT run concurrently, and should instead be run
> sequentially.

And under the single-file create sections:

> Multiple create or delete requests MUST NOT run concurrently. If you need to create multiple
> salesforce files, it is recommend you using the createSFFileBatch endpoint to avoid the
> effort of using callbacks and/or promises with .then() for continuations.

Modern reading: use the batch endpoints; if a loop over single calls is unavoidable, sequential
`for...of` with `await`. Never `Promise.all` over any create/delete. The SDK does not enforce
this — it is on your code.

## Shared create-payload rules

- **Custom ContentVersion fields**: extra keys pass through verbatim into the create payload —
  wiki: "You can also pass other additional parameters like custom fields in the data when
  creating files." Use exact Salesforce API names (`My_Field__c`). Depending on org config they
  may be required — a missing required custom field surfaces as a create error.
- **NetworkId** (`0DB…` Experience Cloud site Id) — wiki: "this would be required only for your
  Salesforce Community Users." Omit for standard users. Available on every create variant.
- **Image size**: wiki — "Refer to Image Quality and Max Pixel side settings to understand how
  you can control the image sizes." Thumbnails are governed by the Pulsar Setting
  `pulsar.attachment.thumbnailMaxSidePixels`. (The settings pages are separate wiki docs; the
  setting names above are the ones the Files page cites.)

## createSFFile — one file from base64

```js
const contentDocumentId = await pulsar.createSFFile(parentId, name, base64Body, {
  contentType: 'application/pdf',   // optional, MIME type
  networkId: '0DB…',                // optional, Community users only
  My_Field__c: 'value',             // custom fields pass through verbatim
});
```

- Lines 992-1017. Sends `{ type: 'createSFFile', data: { ParentId, Name, Body, ContentType?,
  NetworkId?, ...customFields } }`. `parentId`/`name`/`body` validated as non-empty strings.
- Resolves the **new ContentDocument Id string** (wiki `createSFFileResponse`; SDK test agrees).
- `options` has no dedicated `Description` key on this single-file wrapper (the batch variant
  documents one) — pass `Description: '…'` as a passthrough key if needed.

## createSFFileFromFilePath — one file from a device path

```js
const result = await pulsar.createSFFileFromFilePath(parentId, filePath, {
  name: 'report.pdf',               // optional — defaults to the file's own name
  contentType: 'application/pdf',   // optional
  networkId: '0DB…',                // optional, Community users only
});
const id = typeof result === 'string' ? result : result.ContentDocumentId;
```

- Lines 1045-1067. Sends `{ type: 'createSFFileFromFilePath', data: { ParentId, FilePath,
  Name?, ContentType?, NetworkId?, ...custom } }`. FilePath must be a valid, accessible device
  path (e.g. from `saveAs`, `cameraPhoto`, `filePicker`).
- **Return-shape discrepancy**: SDK JSDoc/tests resolve an `SFFileResult` object
  `{ AttachmentId, ContentDocumentId, ContentVersionId, FileURL }`; the wiki (older Pulsar)
  documents a bare ContentDocumentId string. Handle both as above.

## createSFFileFromCamera — camera capture → Salesforce File (native UI)

```js
const result = await pulsar.createSFFileFromCamera(parentId, {
  name: 'site-photo.jpg',           // optional
  networkId: '0DB…',                // optional, Community users only
});
```

- Lines 1084-1101. Sends `{ type: 'createSFFileFromCamera', data: { ParentId, Name?,
  NetworkId?, ...custom } }`. Launches the native camera; creates the File on success.
- Same return-shape discrepancy as `createSFFileFromFilePath` (object vs Id string) — handle
  both. User-cancel behavior is undocumented on the wiki — treat a rejection as either error
  or cancel unless you can distinguish by message.
- Photo dimensions/compression follow the org's Image Quality / Max Pixel Side settings.
- To capture WITHOUT creating a File (e.g. to batch several photos), use `cameraPhoto` +
  `createSFFileFromFilePathBatch` instead — see the sibling `media-and-pdf-reference.md`.

## createSFFileBatch / createSFFileFromFilePathBatch — the recommended multi-file path (v14+)

```js
const res = await pulsar.createSFFileBatch([
  { ParentId: id, Name: 'a.jpg', Body: base64A, ContentType: 'image/jpeg', Description: '…' },
  { ParentId: id, Name: 'b.jpg', Body: base64B },
]);
const res2 = await pulsar.createSFFileFromFilePathBatch([
  { ParentId: id, FilePath: '/path/a.jpg' },                    // Name optional here
  { ParentId: id, FilePath: '/path/b.jpg', Name: 'renamed.jpg' },
]);
```

- Lines 1173-1183 and 1242-1252. Send `{ type: 'createSFFileBatch'|'createSFFileFromFilePathBatch',
  data: files }` — `data` is an **array** (unique in the SDK).
- Entries use **raw PascalCase keys** (no camelCase mapping, unlike the single-file wrappers):
  `ParentId` (required), plus for the base64 variant `Name` + `Body` (required) and for the
  file-path variant `FilePath` (required) with `Name` **optional** (defaults to the file name
  from the path — the wiki prose claiming "Name and Body are required" for the FilePath batch
  is a copy-paste error; the wiki's own example marks Name optional and has no Body).
  Optional on both: `ContentType`, `Description`, `NetworkId`, custom fields.
- SDK validation is weak (`non-empty array of objects`; `null` entries slip through) — missing
  required per-file fields surface as per-entry `success: 'FALSE'` in the response.
- The wiki labels these "recommended v14+"; on older Pulsar clients fall back to sequential
  single-file calls.

### Batch response envelope (`createbatchResponse`)

Wiki (verbatim JSON, partial-success case) — the SDK resolves the `data` portion only:

```json
{
    "type": "createbatchResponse",
    "object": "ContentDocument",
    "data": {
        "summary": { "success": "FALSE" },
        "results": {
            "0": {
                "objectId": "CURIUM_1111111111_1",
                "success": "TRUE",
                "FileURL": "http://127.0.0.1:17014/datacache/FileName.jpg"
            },
            "1": {
                "success": "FALSE",
                "error": "...error message from API for this file..."
            }
        }
    }
}
```

- `summary.success` is `'TRUE'` only if ALL entries succeeded — a **string**, not a boolean
  (`if (res.summary.success)` is always truthy; compare `=== 'TRUE'`).
- `results` is an **object keyed by numeric-string index** (`'0'`, `'1'`, … matching your input
  array order), NOT an array — iterate `Object.entries(res.results)`.
- Successful entries carry `objectId` + `success: 'TRUE'` + `FileURL`; failed entries carry
  `success: 'FALSE'` + `error` and **no** objectId/FileURL.
- **Offline id semantics**: `objectId` is a local placeholder like `CURIUM_1111111111_1` when
  the create happens offline; the same call online can return a real `069…` ContentDocumentId.
  CURIUM ids map to real ids only after sync — tolerate both forms and never persist a
  `CURIUM_` id as a durable reference.
- Partial failure resolves normally (no promise rejection) — you MUST check the payload.
- (Trivia: the wiki section header spells it `createBatchResponse` but every wire example uses
  lowercase `createbatchResponse`. Irrelevant via the SDK — never string-match response types.)

## readSFFile — one file's metadata / URL / base64

```js
const [file] = await pulsar.readSFFile(fileId, /*returnBase64Data*/ false, /*downloadVersionData*/ true);
console.log(file.FileURL);
```

- Lines 1282-1296. Sends `{ type: 'readSFFile', data: { Id, ReturnBase64Data,
  DownloadVersionData } }`. Both flags are **real JS booleans** here (contrast the batch
  response's string booleans). `fileId` may be a **ContentDocument (069) or ContentVersion
  (068) Id**; the result is the matching ContentVersion object.
- Resolves an **array even for a single file** — destructure `[file]`.
- Returned fields (wiki):
  - `FileURL` — local URL to the file (always present).
  - `ThumbURL` — local URL to the thumbnail; **empty string** if the file is not an image.
  - `VersionData` — base64 file data, only when `returnBase64Data` is `true`.
  - `ThumbBody` — base64 thumbnail, only when `returnBase64Data` is `true` AND file is an image.
  - Plus the other ContentVersion fields.
- `returnBase64Data` default `false` — wiki: "If false you will still have access to URL of
  file." Prefer `FileURL` over base64 payloads.
- `downloadVersionData` default `true` — wiki: "If true and online, Pulsar will attempt to
  download the file from the server to ensure it has the latest version." That is a network
  round-trip per call when online; pass `false` to use only locally cached data.
- Wiki note: "Normal data reads through 'select' API will not contain Base64 file data in the
  VersionData field unless that field has previously been queried from Salesforce or otherwise
  populated" — don't expect `pulsar.select` on ContentVersion to return file bodies.

## queryContent — list/filter cached files

```js
const files = await pulsar.queryContent(
  "ContentDocumentId in (SELECT ContentDocumentId FROM ContentDocumentLink " +
  "WHERE LinkedEntityId = '001abc012345678ABC')",   // SQLite WHERE clause, NOT SOQL
  false,                                            // downloadVersionData: local-only
);
```

- Lines 1397-1410. Sends `{ type: 'queryContent', data: { filter, DownloadVersionData } }`.
- `filter` is **SQLite WHERE-clause syntax** applied to the local ContentVersion table only;
  subqueries against e.g. ContentDocumentLink are allowed (as above). Escape user-supplied `'`
  as `''`.
- Resolves an array of ContentVersion dictionaries with `FileURL`, `ThumbURL` (empty string for
  non-images), `FilePath`, and `ThumbPath` (path to the **thumbnail** — the wiki's field list
  mislabels it "path to the file"; the SDK typedef has the correct wording).
- Explicitly will **NOT** return base64 `VersionData` or thumbnail data — call `readSFFile` per
  file when you need contents.
- `downloadVersionData` defaults `true` and applies to **all matching files** when online —
  potentially expensive for broad filters; pass `false` unless freshness matters.
- `FileURL` values point at Pulsar's local web server (`http://127.0.0.1:17014/datacache/…`) —
  valid only inside the current Pulsar session; never persist or share them.

## deleteSFFile — delete by ContentDocument Id list

```js
const ok = await pulsar.deleteSFFile(['069…', '069…']);   // ALWAYS an array, even for one
```

- Lines 1423-1446. Sends `{ type: 'deleteSFFile', data: { documentIdList } }`. Validates a
  non-empty all-string array of ContentDocument (069) Ids.
- Resolves boolean `true` on success; otherwise **throws**, including
  `'Unexpected response from deleteSFFile.'` when the payload isn't `{ success: true }` or the
  legacy string `'success'` — stricter than the wiki, which defines success by response type
  alone. Treat that specific error with suspicion (the delete may have succeeded on a Pulsar
  version with a different success payload) — verify with `queryContent` if it matters.
- No partial-failure shape is documented for this endpoint (unlike the create batches). Wiki
  key is `documentIdList`; the generic record `deleteBatch` uses `objectIdList` — don't mix
  them up (see the `pulsar-data-access` skill for `deleteBatch`).
- Same concurrency rule as creates: one call with the full list; never concurrent deletes.

## readDocument — legacy Document object (NO SDK wrapper)

The legacy `Document` SObject (Ids starting `015`) is a separate API path from Salesforce
Files (`069`). No wrapper exists in the SDK (commit `eddf62d`) — use the raw escape hatch:

```js
// SDK gap: no wrapper for 'readDocument' as of commit eddf62d.
const docs = await pulsar._send({
  type: 'readDocument',
  args: { Id: '015Do000000rUdgIAE', ReturnBase64Data: false },
});
console.log(docs[0].FileURL);   // response data is an ARRAY, like readSFFile
```

- The wiki example nests the parameters under **`args` instead of `data`** — unlike every other
  endpoint on the page. This is unverified (possible wiki typo); if `args` returns an error or
  empty data on your Pulsar version, retry with `data` and keep whichever works, with a
  comment.
- Default response contains all Document fields **except `Body`** ("as this can be fairly
  large (up to 5 MB)") plus `FileURL` and a thumbnail link where applicable. Only set
  `ReturnBase64Data: true` when you truly need the base64 body.
- `_send` (lines 2514-2526) still gives promise semantics: resolves `response.data`, rejects
  `Error` on `type === 'error'`.

## Settings that affect this domain

| Setting / org config | Effect |
| --- | --- |
| "Enable Salesforce Files" (Pulsar setup) | Prerequisite for ALL endpoints on this page |
| `pulsar.attachment.thumbnailMaxSidePixels` | Max thumbnail side length for `ThumbURL`/`ThumbBody` |
| Image Quality / Max Pixel Side settings | Dimensions/compression of images created via camera/file APIs |
| Org "sync rich text images" config | Required for `getRTFImages` content to resolve offline (see media reference) |

## Error handling recap

- All SDK methods reject with `Error` on JSAPI `error` responses — `try/catch` everything;
  never string-match response types (`'createSFFileResponse'`, `'createbatchResponse'`, …) —
  that is legacy raw-bridge style.
- Batch partial failure resolves normally — check `summary.success === 'TRUE'` (string) and
  per-entry `results['N'].success`/`.error`.
- Synchronous parameter validation (bad/missing strings) also surfaces as a rejected promise.
