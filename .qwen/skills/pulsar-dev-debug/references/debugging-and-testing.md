# Debugging, logs, and automated testing — reference

Sources: wiki "Local Development Server" (Debugging section), "Best Practices for Developers",
"Retrieving Microsoft WebView2 Version", and the supplement page "Automated Testing of Pulsar"
(<https://luminix.atlassian.net/wiki/spaces/PD/pages/2817523749/Automated+Testing+of+Pulsar>).
Verified 2026-07-03. SDK line numbers refer to `src/pulsar.js` (commit `eddf62d`).

## Debugger availability matrix

| Platform | Debugger attach | Console output | Log file access |
| --- | --- | --- | --- |
| Android | No (by design — "Google fully restricts access to embedded WebViews running in released apps") | Yes — via logcat flag (below) | No direct path documented; use log emailing |
| iOS | No (by design — "Apple fully restricts access to embedded WebViews running in released apps") | No fallback documented by the wiki | No direct path documented; use log emailing |
| Windows | Yes — Edge DevTools remote debugging, Pulsar 11.0.0.0+ (below) | Via DevTools console | Yes — direct file path (below) |

## Android: JavaScript console → logcat

You cannot attach a debugger, but you can pipe `console.*` output to the Android logcat for
printf-style debugging:

1. Device/emulator already in developer mode with USB debugging enabled (same prerequisite as
   the dev server's `adb reverse`).
2. Launch **Android WebView DevTools** on the device (see
   <https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/developer-ui.md>).
3. Enable the **`webview-log-js-console-messages`** flag.
4. All JavaScript console logging is now sent to the Android logcat; view it with the ADB CLI,
   e.g. `adb logcat`.

## iOS: no attach, no console

The wiki offers no debugger or console fallback for iOS. Practical strategy:

- Do most debugging on Windows (full DevTools) or Android (logcat), then verify on iOS.
- Use `pulsar.logMessage()` for persistent diagnostics and a dev-mode-gated on-screen debug
  panel (`getDevServerEnabled() === 'TRUE'`) for live state.
- On an Apple-silicon Mac you can run the App Store Pulsar app locally, which at least makes
  the reproduce-and-relaunch loop fast.

## Windows: log file

Direct access to the Pulsar log on disk:

```
C:\Users\<YourUserName>\AppData\Local\Packages\E3D1A000.PulsarforSalesforce_ta6n8xy84gcpg\LocalState\Library\Application Support\log.txt
```

Equivalent Explorer path from "Best Practices for Developers" (directory form):
`%HOMEDRIVE%%HOMEPATH%\AppData\Local\Packages\E3D1A000.PulsarforSalesforce_ta6n8xy84gcpg\LocalState\Library\Application Support\`
— "Note that the `AppData` directory may itself be hidden from Windows Explorer".

## Windows: Edge DevTools remote debugging (Pulsar 11.0.0.0+)

Available "for any user/document combination authorized for local development server use (via
`pulsar.developer.users` setting)". The older Edge Developer Tools preview application no
longer works with Pulsar. Steps (condensed from the wiki; see also Microsoft's
[remote debugging docs](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/remote-debugging)):

1. *Before you start:* your Salesforce user is in `pulsar.developer.users` in the org you are
   debugging, and Pulsar has already loaded the content you wish to debug.
2. Enable Developer Mode: Windows 11 **Settings** → **System** → **For developers** → turn on
   the **Developer Mode** toggle.
3. On the same Settings page, turn on the **Device Portal** toggle (follow prompts to install
   developer packages if necessary).
4. Note the **Device Portal URL**: expand the **Device Portal** dropdown on that Settings page
   and choose the local URL, e.g. `http://localhost:50080`.
5. Install **Remote Tools for Microsoft Edge** from the Microsoft Store
   (<https://www.microsoft.com/store/productId/9P6CMFV44ZLT>). It is not necessary to open it.
6. In Edge, navigate to `edge://inspect`.
7. In **Connect to a remote Windows device**, enter the Device Portal URL (e.g.
   `http://localhost:50080`) and click **Connect to Device**.
   - *Verbatim tip:* "if nothing appears to happen, try opening another browser tab and
     navigating to `http://localhost:50080` on that tab. Then come back to your
     `edge://inspect` tab and **Connect to a remote Windows device** again."
8. Verify a section named **Edge** is listed; click **inspect** to open DevTools against your
   Pulsar content.

## Logging from app code: `logMessage`

```js
try {
  await pulsar.logMessage('Checkout step 3 reached, cart size ' + cart.length, 'info');
} catch (err) {
  console.error('logMessage failed:', err.message);
}
```

- Signature: `logMessage(message, level = 'info')` — src/pulsar.js:1763-1775. Bridge request
  type is `logMessage` (the wiki's Special Value Variables table calls the concept "logging";
  never send a `'logging'` or `'log'` type).
- `message` must be a non-empty string — the SDK throws
  `"logMessage requires a valid message string."` locally otherwise. Stringify objects
  yourself (`JSON.stringify`).
- `level` (unvalidated): `'info'` (default), `'warn'`, `'error'`, `'debug'` — note `'debug'`
  entries only appear when debug logging has been turned on in Pulsar (wiki: Pulsar General
  Information API), so prefer `'info'`/`'error'` unless you have enabled it — or `'Verbose'`
  (the capital-V spelling matches both the SDK JSDoc and the wiki's logMessage docs).
- Resolves `void`. JS-originated entries appear in the Pulsar log prefixed `JSAPI:` (PSL
  `Action=Log` entries are prefixed `[PSL] Log Action:` — useful for filtering).

## Getting logs off devices

| Channel | How |
| --- | --- |
| User-sent log emails | Users send logs from the app; add extra recipient addresses via the `pulsar.logs.email.cc` Pulsar Setting |
| Windows | Read `log.txt` directly (path above) |
| Automatic, org-side | After Sync Trigger + `SFCreate` with `AttachLogFile=TRUE` creates a record in Salesforce with the sync debug log attached — captures sync failures with no device access. Full PSL pattern: `pulsar-psl` skill; source page: <https://luminix.atlassian.net/wiki/spaces/PD/pages/4074668537/Sending+Debug+Logs+with+an+After+Sync+Trigger> |

## WebView2 version diagnostics (Windows)

Pulsar runs your code in each platform's system web view; on Windows that is **WebView2**,
whose version and runtime vary with the Windows OS version — so web-platform feature
availability differs per machine. When a feature works on one Windows device and not another,
check the WebView2 version (wiki "Retrieving Microsoft WebView2 Version"):

1. Search the Start Menu for **Task Manager**.
2. Find and expand **Pulsar for Salesforce** in the Processes list.
3. Right-click any **Microsoft Edge WebView2** entry.
4. Choose **Properties**.
5. Click the **Details** tab to see the WebView2 version.

More on WebView2: <https://developer.microsoft.com/en-us/microsoft-edge/webview2/>. In code,
branch on `await pulsar.getPlatform()` (`'windows'`/`'android'`/`'ios'`,
src/pulsar.js:1706-1711) rather than user-agent sniffing, and feature-detect web APIs instead
of assuming a WebView2 baseline.

## Automated testing with Appium

Luminix recommends [Appium](https://appium.io/): it "can automatically test Pulsar on Android,
iOS, and Windows devices from a single code base". Connection identifiers for attaching Appium
to Pulsar (verbatim from the supplement page, retrieved 2026-07-03):

| Platform | Identifier |
| --- | --- |
| iOS Bundle Id | `com.luminixinc.pulsar` |
| Android Base Package | `com.luminixinc.xpulsar` |
| Android Application Activity | `crc64f56b5e0720a30b83.MainActivity` |
| Windows Application | `E3D1A000.PulsarforSalesforce_ta6n8xy84gcpg!App` |

Note the Android package is `xpulsar`, not `pulsar`.

Test-data guidance ("Best Practices for Developers"): "We encourage the use of a Salesforce
Sandbox to test your code in the Pulsar environment." Combine with the dev-server org settings
in the sandbox so automated runs exercise your latest local build.

## Hiding Pulsar's chrome around your page

Both settings from "Best Practices for Developers"; values are the Pulsar Setting values
`TRUE`/`FALSE` (default `FALSE`), compatible with iOS, Windows, and Android:

| Key | Hides |
| --- | --- |
| `pulsar.docs.hideDoneButton` | The **Done** button that closes the custom HTML page (returns to the Pulsar home page or a record screen) |
| `pulsar.docs.hideNavigation` / `pulsar.docs.<docID>.hideNavigation` | The **Back, Forward, and Refresh** buttons (org-wide or per document) |

Caution for developers: the Refresh button that `hideNavigation` hides appears to be the same
page-refresh control the dev-server loop relies on — prefer the per-document form scoped to
production documents, or leave navigation visible while developing.

## iOS scrolling tip

*Verbatim ("Best Practices for Developers"):* any time you would use CSS `overflow: scroll;`
"Make sure to include: `-webkit-overflow-scrolling: touch;` This will ensure that your
scrolling performance is smooth."
