# Online status & network status reference

Sources: pulsar-sdk `src/pulsar.js` (commit `eddf62d`) and wiki "Pulsar Online Status API".
Verified 2026-07-03. Line numbers refer to `src/pulsar.js`.

## The core distinction

Verbatim (wiki): "Online Status refers to Pulsar's current 'online' status, not the device's
network status. The app has a set of rules it follows to determine the status, rather than a
simple check for a network connection (data or WiFi). If your custom code requires a simple
check like that to connect to a URL, just use the Javascript built-in check. For example,
window.navigator.onLine would probably give you the result you are looking for."

Three different questions, three different APIs:

| Question | API | SDK return type |
| --- | --- | --- |
| Is Pulsar operating in online mode? | `getOnlineStatus()` | **real boolean** |
| Does the device have connectivity, as far as Pulsar may use it? | `getNetworkStatus()` | object of **strings** |
| Is the WebView's own network up? | `window.navigator.onLine` | boolean (no bridge call) |

## getOnlineStatus

```js
const online = await pulsar.getOnlineStatus();   // lines 2369-2373 → REAL boolean
```

- JSAPI request: `{ type: 'getOnlineStatus', data: {} }` — the wiki says the empty `data` object
  is "required in the current API", but the SDK sends **no** `data` key and works; safest in raw
  calls is to include `data: {}`.
- Semantics: `false` when the user works offline (network disconnected OR the "Work Offline"
  toggle) — **and also**, verbatim: "It will also return "FALSE" if there are pending changes
  that need to be pushed to the server." So `online === false` on a connected device usually
  means unpushed local edits, not a network problem. `numUnpushedChanges > 0` forces
  `isOnline = "FALSE"`.
- The SDK converts the `'TRUE'`/`'FALSE'` string to a real boolean (`result === 'TRUE'`). (Its
  inline JSDoc claims an `{ online }` object — wrong; it is a bare boolean.)

### The discarded `args` diagnostics block (raw bridge escape hatch)

The native response carries an `args` object **outside** `response.data`. The SDK's `_send`
resolves only `response.data` (lines 2514-2526), so `pulsar.getOnlineStatus()` **discards all of
it**. To read the diagnostics, use the raw bridge callback API on the initialized instance:

```js
// SDK gap: getOnlineStatus() discards response.args — raw bridge.send required.
function getOnlineDiagnostics(pulsar) {
  return new Promise((resolve, reject) => {
    pulsar.bridge.send({ type: 'getOnlineStatus', data: {} }, (res) => {
      if (res.type === 'error') reject(new Error(res.data));
      else resolve(res.args);          // every value is a STRING
    });
  });
}

try {
  const d = await getOnlineDiagnostics(pulsar);
  if (d.canSync === 'TRUE' && Number(d.numUnpushedChanges) > 0) offerSyncNow();
  if (d.syncUserInteractionNeeded === 'TRUE') tellUserToResolveConflictsInPulsar();
} catch (err) { console.error(err.message); }
```

| `args` field | Meaning (all values are STRINGS) |
| --- | --- |
| `canSync` | `'TRUE'` if the app is able to sync at the time of the call |
| `hasConnectivity` | `'TRUE'` if connected to a network (WiFi or Cellular) |
| `isOnline` | Offline vs online mode — mirrors the response's `data` value |
| `numUnpushedChanges` | Numeric string; if positive, `isOnline` is `'FALSE'` |
| `onlineEnabled` | User/admin explicit mode request; modified by `setOnlineStatus`. (The wiki's description is self-contradictory — "'FALSE' if the user … has explicitly requested the app to work in offline or online mode" — read it as "requested offline mode") |
| `offlineWithSync` | `'TRUE'` only if the admin configured the "force offline permanently" setting |
| `autosyncEnabled` | `'TRUE'` if automatic syncing is enabled; modified by `setAutosyncStatus` (see `sync-api-reference.md`) |
| `syncUserInteractionNeeded` | `'TRUE'` if the user must resolve a conflict/validation error before syncing can proceed |

Diagnosing "why does Pulsar say offline?": `hasConnectivity === 'FALSE'` → no network;
`numUnpushedChanges > 0` → pending local edits; `onlineEnabled === 'FALSE'` → Work Offline
toggle/setting; `offlineWithSync === 'TRUE'` → admin forced offline permanently.

## setOnlineStatus

```js
const resulting = await pulsar.setOnlineStatus(false);  // lines 2384-2393 → REAL boolean
```

- **Requires a real boolean** — any other type throws `'setOnlineStatus requires a boolean
  parameter.'` Never pass `'TRUE'` strings here (opposite convention to the CRUD args).
- JSAPI request: `{ type: 'setOnlineStatus', data: 'FALSE' }` — `data` is a bare string, not an
  object (the SDK builds it).
- Resolves to the **resulting** online state, not a success flag: a successful
  `setOnlineStatus(false)` resolves `false` — easy to misread as failure. A `false` result after
  requesting `true` means the switch failed (e.g. network disconnected) and Pulsar stayed
  offline.
- Also flips the `onlineEnabled` diagnostic reported by getOnlineStatus's `args`.
- Useful for testing offline behavior of your app without touching device radios.

## getNetworkStatus

```js
const net = await pulsar.getNetworkStatus();   // lines 2409-2413
if (net.isConnected === 'TRUE') { /* connectionType: compare case-insensitively */ }
```

- JSAPI request: `{ type: 'getNetworkStatus' }` — no `data` key (matches both wiki example and
  SDK).
- Response data (returned by the SDK **unparsed**):
  - `isConnected` — STRING `'TRUE'`/`'FALSE'`, never a boolean.
  - `connectionType` — STRING. Value-set conflict: the wiki documents `'Wifi'`/`'Cellular'`/
    `'Unknown'` (capitalized; `'Unknown'` = connectivity present but type undetermined) while the
    SDK JSDoc/tests use `'wifi'`/`'cellular'`/`'none'` (lowercase). Unresolved — **compare
    case-insensitively** and treat unknown values gracefully:
    `String(net.connectionType).toLowerCase() === 'wifi'`.
- Pulsar-permission caveat, verbatim (wiki): "If wifi is off, cell data is enabled on the device,
  but the Pulsar App itself is not enabled for cell data, the return 'isConnected' value will
  show "FALSE"." — i.e. `isConnected` reflects connectivity **Pulsar is allowed to use**, not raw
  OS state. `window.navigator.onLine` may simultaneously be `true`.

## Choosing the right check (recipes)

| Situation | Check |
| --- | --- |
| Before an online-only JSAPI call (`soqlquery`, some file downloads) | `getNetworkStatus()` → `isConnected === 'TRUE'`; provide an offline fallback (see `pulsar-data-access`) |
| Deciding whether a sync could run now | raw `getOnlineStatus` `args.canSync === 'TRUE'` |
| Showing an online/offline badge that matches Pulsar's own toolbar | `getOnlineStatus()` (boolean) |
| Explaining *why* offline / prompting "you have N unsynced changes" | raw `getOnlineStatus` `args` (`numUnpushedChanges`, `onlineEnabled`, `offlineWithSync`, `syncUserInteractionNeeded`) |
| Fetching an external URL from your own JS | `window.navigator.onLine` (Pulsar's modes don't gate your own fetches; the WebView's network does) |

Remember: a device can be fully connected while `getOnlineStatus()` is `false` (unpushed
changes), and `navigator.onLine` can be `true` while `getNetworkStatus().isConnected` is
`'FALSE'` (Pulsar denied cell data). Never substitute one check for another.
