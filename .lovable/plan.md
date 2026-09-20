# Dependency security audit — findings and staged remediation (no changes yet)

The scanner reports 25 vulnerability rows across 8 named packages. Every row was traced to the
actual installed copy in the lockfile. Nothing has been modified.

Headline: none of the 25 rows are the May 2026 compromised TanStack releases. `@tanstack/react-start`
and `@tanstack/router-plugin` are flagged **only** because they pull in older copies of
`browserslist`, `js-yaml`, and `baseline-browser-mapping` — all build-time tooling, not shipped code.

## Remediation table

| # | Package / installed | Advisory (as reported) | Sev | Direct? | Path that introduces it | Vulnerable range → first safe | Exercised in production? | Recommended action |
|---|---|---|---|---|---|---|---|---|
| 1-2 | xlsx 0.18.5 | Prototype Pollution in SheetJS; SheetJS ReDoS | high | direct | `xlsx` → `src/components/bulk-client-upload.tsx` (dynamic import) | ≤0.18.5 → 0.19.3 / 0.20.2 | **Yes** — parses .xls/.xlsx a signed-in agent/lender uploads in the browser | Replace (see below). The fixed versions are not published on npm, so a version bump is not available |
| 3-4 | @tanstack/react-start 1.168.26 | Browserslist OOM cache growth; Browserslist normalizeStats prototype write | high | direct | react-start → babel toolchain → `browserslist@4.28.2` (nested copy; root copy is already 4.28.9/safe) | ≤4.28.6 → >4.28.6 | No — build-time only, inputs are our own config | Mitigate with a lockfile override pinning browserslist ≥4.28.9 everywhere |
| 5-7, 16 | @tanstack/react-start 1.168.26 | 4× js-yaml quadratic-CPU / merge-key DoS | high/mod | direct | react-start → eslintrc + xmlbuilder2 → `js-yaml@4.1.1` (root `js-yaml` is 5.4.1/safe) | 4.x <4.3.2 → 4.3.2 | No — YAML is never parsed at runtime; these copies are lint/build tooling | Mitigate with an override to js-yaml 4.3.2 for nested copies, or accept as build-time-only |
| 8-9 | @tanstack/router-plugin 1.168.18 | same 2 browserslist advisories | high | direct | router-plugin → babel toolchain → `browserslist@4.28.2` | ≤4.28.6 → >4.28.6 | No — build-time | Same override as #3-4 |
| 10 | @react-three/drei 10.7.7 | fflate ZIP64 infinite loop | mod | direct | drei → three-stdlib → `fflate@0.6.10` | <0.6.11 → 0.6.11 | **No — drei is not imported anywhere** in the codebase (only `@react-three/fiber` is) | **Remove `@react-three/drei`** — highest value, lowest risk fix |
| 11, 20, 21 | @streamdown/mermaid 1.0.2, mermaid 11.17.2, streamdown 2.5.0 | DOMPurify detached-subtree XSS | mod | direct | streamdown / @streamdown/mermaid → `mermaid@11.16.0` → `dompurify@3.4.12` (root dompurify is 3.4.14/safe) | ≤3.4.12 → >3.4.12 | **Potentially** — Streamdown renders AI assistant output in Ask SuCasa (`home-assistant-card.tsx`); XSS needs a hook using `IN_PLACE`, which mermaid does not use today | Mitigate with an override pinning dompurify ≥3.4.14 for nested copies |
| 12-15, 22-25 | @streamdown/mermaid, streamdown | Mermaid architecture prototype pollution; XY-chart infinite loop; CSS injection; radar DoS | mod | direct (via the two streamdown packages) | streamdown & @streamdown/mermaid → `mermaid@11.16.0` | <11.16.1 → 11.16.1 | Only if the assistant emits mermaid diagrams — the plugin is registered but SuCasa's assistant produces prose, not diagrams | Either drop the mermaid plugin from `streamdownPlugins` (removes the whole class), or override nested mermaid to ≥11.17.2 |
| 17-19 | @tanstack/react-start, @tanstack/router-plugin, browserslist 4.28.9 | baseline-browser-mapping termination DoS | mod | direct | nested `browserslist@4.28.2` → `baseline-browser-mapping@2.10.21` (root copy is 2.11.21/safe) | <2.11.0 → 2.11.0 | No — build-time | Resolved automatically by the browserslist override (#3-4) |

## xlsx@0.18.5 — priority item

Usage is exactly one place: `BulkClientUpload` dynamically imports `xlsx`, reads the uploaded
workbook in the browser, converts sheet 1 to CSV, and hands the CSV to the caller. There is no
server-side spreadsheet parsing, no formula evaluation, no HTML output. Untrusted input exists
(any file the professional picks), but it runs client-side in the uploader's own tab.

SheetJS stopped publishing to npm after 0.18.5, so `xlsx@0.19.3` / `0.20.2` cannot be installed from
npm. Three viable options, in order of preference:

1. **Replace with a maintained parser** (e.g. `exceljs`, or a small `.xlsx`-only reader built on the
   `fflate` we already depend on). Keeps the feature, removes both advisories. Medium effort.
2. **Pin the official SheetJS CDN tarball** (`xlsx@https://cdn.sheetjs.com/xlsx-0.20.x/...`). Fast,
   but adds a non-npm dependency source.
3. **Drop Excel support** and accept CSV only (the template we hand out is already CSV). Zero
   dependency risk; small feature regression for professionals uploading .xlsx books.

Recommendation: option 1, decided together before implementation.

## Staged remediation plan (ranked by real risk, then regression risk)

**Stage 0 — free wins, near-zero regression risk**
- Remove `@react-three/drei` (unused). Clears finding 10.
- Remove the unused direct `browserslist` and `js-yaml` entries from `package.json` if nothing
  imports them (verify first) — they exist only to force safe root versions.

**Stage 1 — nested-copy overrides (clears 14 of 25 rows, no app code touched)**
Add lockfile overrides: `browserslist ≥4.28.9`, `baseline-browser-mapping ≥2.11.21`,
`js-yaml 4.3.2` (nested 4.x only), `dompurify ≥3.4.14`, `mermaid ≥11.17.2`.

**Stage 2 — assistant rendering surface**
Decide whether Ask SuCasa needs mermaid diagrams. If not, drop the mermaid plugin (and
`@streamdown/mermaid`) entirely — that removes 8 rows at the source rather than by version pinning.

**Stage 3 — xlsx**
Implement the chosen option above, with a focused test covering a real .xlsx upload, a malformed
file, and CSV fallback.

Each stage lands separately with typecheck, the full test suite, a production build, and an
authenticated smoke test (agent import flow, Ask SuCasa, homepage 3D hero) before anything is
published.

## Technical notes
- The scanner attributes nested advisories to the nearest direct dependency, which is why
  `@tanstack/*` appears "high" for issues that are actually in build tooling.
- Root copies of `browserslist`, `js-yaml`, `dompurify`, `fflate`, and `baseline-browser-mapping`
  are already at safe versions; only the duplicated nested copies are vulnerable.
- No database, RLS, auth, permission, or Today/View-homeowner behavior is touched by any stage.
