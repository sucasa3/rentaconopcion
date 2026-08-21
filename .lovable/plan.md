# AI expansion: document intelligence + business copilot search

Three pieces of work, in build order.

## 1. Document intelligence (homeowner side)

Today the AI only reads documents tagged "inspection". Everything else is marked
"not applicable" and never analyzed.

Extend the extraction pipeline so every uploaded document is read and turned into
structured facts and future actions:

- **Inspection reports** (already working) — systems, condition, urgency, defects,
  recommended action, remaining life.
- **Insurance policies** — carrier, coverage amounts, deductible, renewal date,
  named exclusions. Produces reminders ("policy renews in 30 days") and gap flags
  ("roof is 22 years old — carriers often non-renew at 25").
- **Warranties and appliance manuals** — covered system, brand/model, start and
  expiry date. Produces "warranty on your water heater expires in 60 days —
  service it while it's covered" and back-fills the home component log.
- **Permits and contractor invoices** — work performed, date, cost, contractor.
  Resets the maintenance clock for that system (a 2024 roof replacement should stop
  "roof is aging" nudges) and feeds improvement value.

Each extraction writes to a shared facts table plus a **predicted actions** list with
a due window, estimated cost range, urgency and the matching SuCasa service category.
The homeowner sees these as plain-language cards in Home Care ("Because your
inspection flagged the water heater and its warranty ends in March, plan a
replacement this spring — typically $1,400–$2,200"), and they feed the Home Score,
the assistant's context and the agent/lender opportunity signals.

Documents that don't match a known type are classified first, then routed to the
right extractor, so the homeowner never has to pick the correct kind.

## 2. Business copilot search (agent + lender dashboards)

A search bar at the top of the portfolio pages where an agent or MLO types a plain
question and gets back a client list:

- "give me all the clients with the name Alba"
- "who has high intent?"
- "clients in 30907 with more than $150k equity"
- "everyone I haven't contacted in 90 days"
- "refi candidates paying over 6.5%"

Results render as a stacked, mobile-friendly card list (name, email, and the columns
relevant to the question — intent, equity, rate, last touch), with a result count,
the plain-English filter that was applied so the user can trust it, and one tap into
the client detail page. Chips let them narrow further without retyping. No-match
questions come back with a suggestion rather than an empty screen.

Scope for this version: search and filtered lists only. Per-client Q&A and
AI-drafted outreach are deliberately left for later.

## 3. Cost and controls

Answer to "is this cost prohibitive?": no, at the volumes involved.

- **Copilot search** — each question is one small call on a low-cost model that only
  translates the question into filters; the actual client data is fetched by the
  database, not the model. Order of magnitude: a fraction of a cent per search, so a
  seat doing 200 searches a month lands in the tens of cents.
- **Document reading** — a full inspection PDF is the expensive one (a few cents per
  document) because the whole file is read; policies, warranties and permits are
  cheaper. It runs once per upload, never on page views.
- **Controls shipped with it**: a low-cost model, a monthly query cap per seat with a
  clear message when it's reached, caching of repeated questions, one extraction per
  document (re-runs only on explicit request), and an admin view of AI usage by org
  and by user so spend is visible before it grows.

## Technical notes

- Copilot never writes or runs SQL. One AI call with a strict schema turns the
  question into a typed filter object (name match, intent, equity/rate bands, zip,
  last-contact window, opportunity category, sort, limit). The app validates that
  object and runs an ordinary query through the existing org-scoped, RLS-protected
  portfolio path, so an agent can never reach another org's clients through phrasing.
- New server function `searchClients` in `src/lib/copilot.functions.ts` behind
  `requireSupabaseAuth`, with the filter-to-query mapping in a `.server.ts` helper.
- Document work extends `src/lib/inspection.server.ts` into a
  `documents-ai.server.ts` with one extractor per document kind, a `home_document_facts`
  table and a `home_predicted_actions` table (both org/user scoped with GRANTs and RLS),
  and removes the "not applicable" short-circuit in `extractInspectionReport`.
- New `ai_usage_log` table (org, user, feature, tokens, cost estimate) written on every
  call, with the per-seat monthly cap enforced before the model call.
- Models: cheap Gemini Flash tier for search and classification; the current Flash
  model for full document extraction.
