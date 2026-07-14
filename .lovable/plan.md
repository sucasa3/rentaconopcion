## Goal

Let homeowners log a service request they arranged **outside** SuCasa (e.g. a plumber a neighbor recommended) so their dashboard reflects the full picture of home activity — not just requests routed through our pro network.

## Why it matters

- Keeps the dashboard honest: today "Recent service requests" only shows things booked through SuCasa, so the home history looks thinner than reality.
- Feeds the AI assistant and Home Intelligence Report better maintenance data (when the roof was last inspected, who did the HVAC tune-up, cost paid).
- Creates a soft on-ramp to convert future work to SuCasa pros ("You used an outside plumber last month — want us to match one next time?").

## What the user sees

In the **Recent service requests** card on `/dashboard`:

1. A new secondary button next to "New request" → **"Log outside service"**.
2. Clicking it opens a modal titled "Log a service you booked yourself" with:
   - Category (dropdown, same 12 categories)
   - Vendor name (optional, free text)
   - Date completed (date picker, defaults to today)
   - Amount paid (optional, USD)
   - Notes (optional textarea — "what was done")
   - Attach receipt/invoice (optional file upload, images + PDF)
3. On save, it appears in the same list, styled subtly differently:
   - Small **"External"** chip next to the status pill
   - Status defaults to **Completed** (with option to pick "Scheduled" or "In Progress")
   - Vendor name shown under the category if provided
4. Empty-state hint under the list on first use: "Track work done outside SuCasa to build your full home history."

## Technical section

- **Schema (`service_requests`)** — add three nullable columns via migration:
  - `source` text default `'sucasa'` (values: `'sucasa' | 'external'`)
  - `vendor_name` text
  - `amount_cents` integer
  - `completed_at` timestamptz
  - `notes` text
  - `receipt_path` text (points to Storage object)
  - Update RLS: homeowners can insert/update rows where `source = 'external'` and `homeowner_id = auth.uid()`; the existing SuCasa-routed flow keeps its policies. GRANTs unchanged (already covers authenticated).
- **Storage** — new private bucket `service-receipts`, RLS: owner can read/write objects under `${auth.uid()}/…`.
- **Server function** — `src/lib/service-requests.functions.ts`:
  - `logExternalService({ category, vendorName?, completedAt, amountCents?, notes?, receiptPath? })` — Zod-validated, uses `requireSupabaseAuth`, inserts with `source='external'`, returns the new row.
  - Kept separate from the existing new-request flow so validation and lifecycle-stage triggers stay clean.
- **Client**:
  - New component `src/components/log-external-service-dialog.tsx` — shadcn `Dialog` + `Form` + Zod resolver, file input hits Supabase Storage directly (signed upload), then calls the server fn.
  - `src/routes/dashboard.tsx` — add the "Log outside service" button to the card header, render the dialog, invalidate the `recent-requests` query on success. Update the row renderer to show the "External" chip and vendor name when present.
  - `src/lib/mock-data.ts` — extend the `RECENT_REQUESTS` mock shape with the new optional fields so the redesign renders correctly before real data lands.
- **GHL sync** — external service logs count as activity: the existing `tg_service_request_lifecycle` trigger already bumps `last_activity_at`, so no new sync work; just verify it fires for `source='external'` inserts.
- **Not touched**: pro matching, claims, admin queue, request routing — external logs never enter the pro pipeline.

## Out of scope this pass

- Editing/deleting an external log after save (add later).
- OCR-parsing the uploaded receipt to auto-fill amount/vendor (nice future add for the AI assistant).
- Converting an external log into a SuCasa-routed request.

## Verification

- Migration applies cleanly; homeowner can insert an `external` row from the UI, cannot insert one for another user (RLS).
- Dashboard list shows the new entry with "External" chip and vendor name; existing SuCasa requests unchanged.
- Receipt upload lands in `service-receipts/${uid}/…`; other users get 403 on the object.
- Mobile (420px): dialog is scrollable, buttons don't overflow, category select is tappable.
