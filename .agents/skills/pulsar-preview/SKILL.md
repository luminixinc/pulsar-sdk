---
name: pulsar-preview
description: Produce visual previews of Pulsar .pulsarapp UI work — static HTML mockups, the real app running in a normal desktop browser via a bundled mock Pulsar bridge, and headless screenshots. Use when the user asks for a mockup/preview/screenshot/"show me", before implementing non-trivial UI changes (propose-first), or to confirm UI work after implementing it. Previews are opt-in per project; respect the visual-previews preference recorded in the project's AGENTS.md.
---

# Visual previews for .pulsarapp work

A `.pulsarapp` cannot render outside Pulsar — `pulsar.init()` rejects after 5 seconds without
a bridge. This skill gives the user eyes on UI work anyway, three ways. Previews approximate
device rendering: **the device / local dev server (`pulsar-dev-debug`) remains the truth.**

## Is this project using previews? (ask once)

Check the project's AGENTS.md for a `## Project preferences` section with a
`visual-previews:` line. If absent and you're about to do UI work, ask once:
*"Want visual previews of UI changes (mockups/screenshots in the session), or do you watch
changes live on the dev server?"* — then append to the project's AGENTS.md:

```markdown
## Project preferences

<!-- Recorded by coding agents. Ask the user before changing. -->
- visual-previews: mockups   <!-- mockups | dev-server | none -->
```

- `mockups` → follow the workflow below for every UI change.
- `dev-server` / `none` → skip previews; the user watches live (or doesn't want them).
- An explicit request ("show me a mockup…") always runs this skill regardless.

## The three tiers — pick the highest that fits

| Tier | What | When |
| --- | --- | --- |
| 1. Static mockup | Hand-built, self-contained `mockups/<view>.html` reusing the app's real CSS + realistic sample data | UI that doesn't exist yet (propose-first); no tooling at all |
| 2. Live preview | The REAL app in any browser via `assets/pulsar-browser-mock.js` + `preview.html` + app-specific `fixtures.js` | App exists; user has Node (for the tiny static server) |
| 3. Screenshots | Headless PNGs of tier 1/2 pages via `scripts/screenshot.mjs` | puppeteer resolves (project or `$PUPPETEER_DIR`); pushes images into the session — best for remote/mobile |

Presenting: in Claude Code, send/attach the HTML or PNG so it renders in the session (this is
what remote-control users see on web/mobile). In other harnesses, print the absolute path and
the serve command. **Never describe a screenshot you haven't looked at.**

## Workflow: propose → implement → confirm

1. **Propose** (non-trivial UI changes): build a tier-1 mockup of the intended result — or a
   tier-2/3 preview of a prototype branch when the app already exists — and show it. Iterate
   until the user approves the direction.
2. **Implement** the real change (other skills govern the code).
3. **Confirm**: tier-2/3 preview of the actual app (tier 1 acceptable if tooling is missing).
   Compare against the approved mockup; call out deviations.

Trivial changes skip step 1 but still confirm: copy/label text, colors/spacing/typography,
reordering existing elements, adding one field to an existing pattern. Non-trivial: new
views/screens, layout restructures, new interaction flows, anything the user asked to
"design".

## Tier 1 — static mockups (zero dependencies)

- One self-contained file per view: `mockups/<view>.html` — inline the app's **actual** CSS
  (copy it in; keep class names identical so the mockup is honest about what CSS will do).
- Use realistic sample data obeying platform rules: string values, 18-char IDs, real-looking
  names/dates. Details: `references/mockups-and-screenshots.md`.
- Works over `file://` — openable anywhere, sendable as-is.

## Tier 2 — the real app on mock data

```bash
# once per app repo: copy from this skill's assets/
mockups/pulsar-browser-mock.js   # the mock bridge (verbatim copy)
mockups/preview.html             # wiring page (adapt ?app= default if needed)
mockups/fixtures.js              # app-specific sample data — YOU author this
# then serve the APP ROOT (parent of mockups/) and open the preview:
node <this-skill>/scripts/serve.mjs <app-root>      # prints http://localhost:<port>/
# → open /mockups/preview.html   (?debug=1 = traffic panel; ?ref_id=… forwarded to the app)
```

How it works: `preview.html` installs the mock as `window.pulsar` on **its own** window and
loads the real `index.html` in an iframe — the SDK's embedded-context detection
(`window.parent.pulsar.bridge`, src/pulsar.js:23) resolves instantly; the app runs
unmodified. Caveat: the SDK instance has `this.pulsar` set, so apps that branch on
embedded-vs-native take the embedded path.

- Fixtures: see `references/fixtures-reference.md` (schema of every key + sample-data rules).
  Start minimal — the mock synthesizes schemas/layouts from your rows.
- Unhandled request types and unsupported SQL **fail loudly** (console warning + rejected
  promise). Fix by adding `fixtures.queryOverrides` / `fixtures.responses` entries — the
  loop is: load preview → read warnings → add one fixture per warning. Coverage table and
  SQL subset: `references/mock-bridge-reference.md`.
- Simulate platform behavior from the console: `__pulsarMock.startSync()`,
  `__pulsarMock.setOnline(false)`, `__pulsarMock.fireHandler('invalidateLayout', {})`.

## Tier 3 — screenshots into the session

```bash
node <this-skill>/scripts/screenshot.mjs <app-root> mockups/preview.html \
  --out <app-root>/mockups/screenshots/list.png --wait-for '.rowitem' \
  --param ref_id=001MOCK00000000001        # any extra params reach the app
```

- Default viewport 390×844 (phone), `--width/--height` for tablet/desktop. `--full-page` only
  helps tier-1 pages — `preview.html`'s iframe fills the viewport, so for tall app views
  increase `--height` instead. `clean=1` is added automatically (hides the MOCK badge).
- puppeteer is resolved from the **current working directory** (run the script from the app
  project) or `$PUPPETEER_DIR`; when missing the script exits with code 2 and a message —
  degrade to tier 2 and tell the user what to open. Never `npm install` without asking.
- Read each PNG yourself before sending; verify it shows what you claim.

## Bundle exclusion — MUST

`mockups/` must NEVER ship inside the `.pulsarapp`:

- Preferred: keep `mockups/` a **sibling** of the bundle directory (impossible to ship).
- If it must sit inside the app root (single-dir repos):
  `cd <app-root> && zip -r ../MyApp.pulsarapp . -x "mockups/*"` — then verify:
  `unzip -l ../MyApp.pulsarapp | grep -c mockups` → must print `0`.
- The mock file's header warns about this too. A shipped mock would shadow real bridge
  behavior on device — treat any `mockups/` path in a bundle listing as a release blocker.

## References

- `references/mock-bridge-reference.md` — mock public surface (`window.__pulsarMock`),
  request-type coverage table, the SQL subset spec, troubleshooting, future work.
- `references/fixtures-reference.md` — every fixture key, generation workflow (synthesize
  from the app's field usage; refine with real device JSON), sample-data rules.
- `references/mockups-and-screenshots.md` — tier-1 authoring guide, serving, screenshot
  recipes, per-harness presentation, propose→confirm details.
