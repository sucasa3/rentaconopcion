# BatchData API — capability notes (testing only)

Status: working notes from live calls made by the SuCasa test harness. Anything
not confirmed by an actual response or BatchData's docs is marked UNVERIFIED.

## Endpoint in use

- `POST https://api.batchdata.com/api/v1/property/lookup/all-attributes`
- Auth: `Authorization: Bearer <BATCHDATA_API_KEY>` (key stored as a Lovable
  secret, read server-side only, never sent to the browser).
- Body: `{ "requests": [ { "address": { "street", "city", "state", "zip" } } ] }`
- Response: `results.properties[]` — one object per matched address, bundling
  address, building, lot, owner, valuation, assessment, mortgage/open-lien,
  sales history, and quick-list flags.

## Inputs required

Street line plus at least one of city / state / ZIP. The harness rejects
anything less before spending a call (HTTP 422 recorded locally, no API hit).

## Datasets returned (mapped by `normalizeBatchdataProperty`)

| SuCasa dataset | BatchData source | Confidence |
| --- | --- | --- |
| Property detail | `building`, `lot`, `general` | Confirmed on live responses |
| Valuation / AVM | `valuation` | Confirmed |
| Assessment / tax | `assessment` | UNVERIFIED field names |
| Ownership | `owner`, `quickLists.ownerOccupied` | Partially confirmed |
| Mortgage | `mortgage`, `openLien` | UNVERIFIED which is authoritative |
| Sales history | `sale`, `salesHistory` | Partially confirmed |
| Permits | `permits` | UNVERIFIED — not seen populated yet |
| Contact (phone/email) | `phoneNumbers`, `emails` | UNVERIFIED — may need skip-trace entitlement |

The normalizer tolerates several key spellings per field and returns `null`
rather than guessing.

## Batching, rate limits, pagination

- The endpoint accepts an array under `requests`, so true multi-address
  batching is likely supported. UNVERIFIED: the maximum array length. The
  harness currently sends one address per request at concurrency 3.
- Rate limits: UNVERIFIED — not documented in what we have. No 429s observed
  so far.
- Pagination: not applicable for address lookup.

## Billing unit

UNVERIFIED. The code assumes a flat estimate of **10 cents per successful
lookup** (`BATCHDATA_EST_COST_CENTS`). Whether BatchData bills per request,
per match, or per returned record must be confirmed with the account rep
before any cost comparison against ATTOM is meaningful.

## Isolation

BatchData is not wired into `getPropertyIntel()`, the enrichment worker, the
ATTOM budget cap, or `property_intel`. It is reachable only through
`/batchdata-test` (admin-only) and writes only to `batchdata_test_runs` and
`batchdata_test_results`, which retain the full raw response.
