# Mockups & screenshots — authoring and presenting previews

## Tier 1: static mockup authoring (the propose step)

A tier-1 mockup is a **self-contained HTML file** (`mockups/<view>.html`) that opens from
disk anywhere — no server, no SDK, no mock. It exists to get a design approved cheaply
before code is written, and it is only honest if it reuses the app's reality:

1. **Inline the app's actual stylesheet** (copy the CSS file's contents into a `<style>`
   block — don't link it, self-containment is the point). Keep the app's real class names on
   the mocked markup so the mockup demonstrates what that CSS actually does.
2. **New styles the change would introduce** go in a clearly-marked second `<style>` block
   (`/* proposed additions */`) — after approval, this block is what you port into the real
   stylesheet.
3. **Realistic sample data**, same rules as fixtures (see `fixtures-reference.md`): real
   names, string-typed values, long-name/empty-field/edge cases so wrapping and truncation
   are visible. 5–10 rows is enough for a list mockup.
4. **One view per file**, named for the view: `account-list-v2.html`,
   `account-detail-files-card.html`. Keep every iteration (v2, v3…) — the user may want to
   compare.
5. Mark it visibly as a mockup (small banner or footer note) so a screenshot is never
   mistaken for the real app.
6. Mobile-first: author at ~390px content width unless the user targets tablet/desktop
   (Pulsar runs on phones, tablets, and Windows).

## Tier 2: serving the live preview

```bash
node <skill-dir>/scripts/serve.mjs <app-root>    # app-root = parent of mockups/, contains index.html
# → serving /path/to/app at http://localhost:PORT/
# open  http://localhost:PORT/mockups/preview.html
```

- `?app=../index.html` — which page to load (default `../index.html`).
- `?debug=1` — live traffic panel (every request/response through the mock).
- `?clean=1` — hides the MOCK badge (used by screenshots).
- Any other query param is **forwarded to the app** — e.g.
  `preview.html?ref_id=001MOCK00000000001` exercises a record-button launch.
- `preview.html` honors the FSL iframe-resize contract (`postMessage {type:'refresh',
  height}`), so SFS-style apps size correctly.

## Tier 3: screenshot recipes

```bash
# list view (waits for rows to render)
node <skill-dir>/scripts/screenshot.mjs <app-root> mockups/preview.html \
  --out <app-root>/mockups/screenshots/list.png --wait-for '.rowitem'

# detail view via launch param
node <skill-dir>/scripts/screenshot.mjs <app-root> mockups/preview.html \
  --param ref_id=001MOCK00000000001 --wait-for '.detail' \
  --out <app-root>/mockups/screenshots/detail.png

# a tier-1 static mockup (no mock bridge involved — still fine to screenshot)
node <skill-dir>/scripts/screenshot.mjs <app-root> mockups/account-list-v2.html \
  --out <app-root>/mockups/screenshots/account-list-v2.png

# tablet / desktop / full-height
  --width 820 --height 1180     |     --width 1280 --height 800     |     --full-page
# NOTE: --full-page only helps tier-1 static pages; preview.html's iframe fills the
# viewport, so capture tall APP views by increasing --height.
```

- puppeteer resolution: the app project's own `node_modules`, else `$PUPPETEER_DIR`. Exit
  code 2 = not available → **degrade to tier 2**: tell the user the serve command and URL.
  Ask before installing anything.
- The script prints `[pulsar-mock]` page warnings to stderr — treat them as missing fixtures
  (see the fixtures loop) before trusting the image.
- `--wait-for` a selector that only exists when the view is truly rendered; async apps
  otherwise screenshot their loading state.

## Presenting previews

Match the harness's capability, not its name:

- **If it can attach files or render images in the conversation** (Claude Code, for example):
  send the PNG — it is the most reliable across devices — or the static mockup HTML, which
  also renders well. The user may be reading on a phone; a path helps them none.
- **If it cannot** (most terminal agents, including Codex CLI, Qwen Code and Gemini CLI):
  print the absolute file path(s), plus the serve command and URL for tier 2.
- **Always look at the artifact before presenting it.** Read the PNG / open the HTML and
  confirm it shows what you claim (rows present, no unstyled content, no mock warnings). A
  preview that misrepresents the change is worse than none.

## The propose → confirm loop in practice

1. Propose: tier-1 mockup(s) of the intended change → present → iterate until approved.
   Record what was approved (file name + version) in your working notes for the change.
2. Implement the change with the relevant skills (`pulsar-metadata` for layout-driven UI,
   `pulsar-data-access` for queries, …).
3. Confirm: tier-2/3 preview of the REAL app. Compare against the approved mockup — same
   structure, same data states — and explicitly call out anything that differs and why.
4. If fixtures needed changing to render the new UI (new fields, new queries), commit the
   fixture updates alongside the app change — fixtures are part of the app repo.
5. Remind the user (once, not every time) that previews approximate device rendering; final
   validation happens on device or the local dev server (`pulsar-dev-debug`).
