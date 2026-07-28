
## Scope

Two features shipped together:

1. **Document viewer** — click any uploaded doc (homeowner card + admin drawer) to preview inline via a signed URL.
2. **Inspection report AI pipeline** — when a homeowner uploads a doc of kind `inspection_report`, parse it, extract structured findings with Lovable AI, store them, and surface them on the homeowner dashboard and admin drawer.

Everything else (routing, lender flows, ATTOM, GHL) stays untouched.

---

## 1. Document viewer

- New `getDocumentSignedUrl` server fn (`src/lib/documents.functions.ts`), auth-required, validates the caller owns the doc OR has `admin` role, returns a 10‑min signed URL from the `home-documents` bucket.
- New `<DocumentViewerDialog>` component: renders PDFs in an `<iframe>`, images in `<img>`, everything else shows a Download button. Opens from:
  - Homeowner documents card (existing list on dashboard)
  - Admin drawer documents list

No storage or bucket changes — `home-documents` stays private, access is signed-URL only.

---

## 2. Inspection report AI extraction

### Data

New table `public.home_inspection_findings` (migration + GRANTs + RLS):

```
id uuid pk
document_id uuid fk home_documents on delete cascade
user_id uuid not null
system text not null           -- roof, hvac, plumbing, electrical, foundation, water_heater, etc.
condition text                 -- good | fair | poor | end_of_life
remaining_life_years int
urgency text                   -- immediate | 12_months | 1_3_years | monitor
defects text[]                 -- short bullet strings
recommended_action text
recommended_category text      -- maps to one of the 12 service categories, nullable
source_excerpt text            -- short quote from the report for provenance
created_at timestamptz
```

Plus on `home_documents`: `extraction_status text` (`pending` | `processing` | `ready` | `failed` | `not_applicable`), `extraction_error text`, `extracted_at timestamptz`.

RLS: homeowners read/delete their own; admins read all; service_role full. Insert only via server fn (service role).

### Extraction pipeline

- New `extractInspectionReport(documentId)` server fn (`src/lib/inspection.functions.ts`, auth + admin-or-owner):
  1. Signed URL → download bytes from storage.
  2. `document--parse_document`-style parse (use existing doc parse helper; PDF → text). Cap at ~40 pages of text.
  3. Call Lovable AI via existing `ai-gateway.server` helper, model `google/gemini-3.6-flash`, with `Output.object` schema matching the findings shape (array of systems). Small schema, no bounds — clamp/validate in code.
  4. Upsert findings rows in a transaction (delete existing findings for this doc, insert new).
  5. Update `home_documents.extraction_status`.
- Auto-trigger: on successful upload of a doc with `kind = 'inspection_report'`, the upload path calls `extractInspectionReport` (fire-and-forget from the client after upload succeeds; server fn is idempotent).
- Manual trigger: "Re-analyze" button in admin drawer for any inspection report.

### UI

- **Homeowner dashboard** — new `<InspectionFindingsPanel>` shown when at least one finding exists:
  - Grouped by system, sorted by urgency
  - Each row: condition badge, remaining life, one-line recommendation, and (if `recommended_category` set) a "Request this service" button that pre-fills the existing service request flow
  - Feeds the existing maintenance timeline + suggested services panels (they read findings when present, fall back to age-based logic otherwise)
- **Admin drawer** — new "Inspection findings" section under the documents list, plus a "Re-analyze" button and visible `extraction_status`.

---

## Technical notes

- Model: `google/gemini-3.6-flash` — big context, cheap, handles multi-page PDFs. Prompt lives server-side; system prompt tells it to only extract what's actually stated and quote a short excerpt per finding.
- Cost control: extraction runs once per upload; findings persisted, so dashboard reads are free. Manual re-analyze is admin-only.
- Failure handling: parse or model errors set `extraction_status = 'failed'` with the error; the doc still previews normally in the viewer.
- No changes to storage buckets, GHL sync, ATTOM, or lender flows.

---

## Files touched

- New: `src/lib/documents.functions.ts`, `src/lib/inspection.functions.ts`, `src/lib/inspection.server.ts` (parser + AI call), `src/components/document-viewer-dialog.tsx`, `src/components/inspection-findings-panel.tsx`
- Edit: homeowner dashboard route, admin drawer component, home documents card, upload handler
- Migration: `home_inspection_findings` table + `home_documents` extraction columns + RLS + GRANTs
