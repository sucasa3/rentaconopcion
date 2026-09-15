# sucasa.com production cutover runbook

Status: **prepared, not activated.** No DNS, domain, canonical or base-URL value has
been changed. `homes.sucasa.com` is live and serving Lofty IDX.

Source of truth for what moves where: `docs/domain-migration-matrix.md`.

## 1. Where the redirects execute

In the app's own edge request handler (`src/server.ts`), before the React router runs.
Rules live in `src/lib/legacy-redirects.ts`.

- Real HTTP **301** with a `Location` header and no body. No JavaScript involved, so
  search engines and crawlers see the redirect on the first response.
- Rules are scoped to `Host: sucasa.com` and `Host: www.sucasa.com`. On the current
  Lovable hosts and on localhost they are a no-op — the code is already deployed and
  inert, and starts working the moment DNS points the domain at this app.
- Full path and query string are preserved on every rule (`/listing?key=...&page=2`
  arrives at `homes.sucasa.com` byte-identical). Commas and percent-encoding pass through.
- Redirects are cacheable for one hour (`Cache-Control: public, max-age=3600`), short
  enough to correct a mistake quickly.

Families redirected to the identical path on `https://homes.sucasa.com`:

| Rule | Pattern |
| --- | --- |
| 1 | `/neighborhood`, `/neighborhood/*` |
| 2 | `/neighborhoods`, `/neighborhoods/*` |
| 3 | `/listing-detail/*` |
| 4 | `/listing`, `/listing?*` |
| 5 | `/available-homes`, `/available-homes?*` |
| 6 | `/agents/<segment>...` only — bare `/agents` stays on the platform |
| 7 | `/<ST>/<something>` for the 50 state codes plus `DC` |
| 8 | Named market/browse paths (matrix section B) |
| 9 | The 5 single-property paths (matrix section C) |

Per-page decisions from the matrix that are also implemented:

- `/precalificacion`, `/landing-de-precalificacion`, `/calificacion` → `sucasa.com/preaprobacion`
- `/cita`, `/fb-live` → `sucasa.com/onboarding`
- `/blog`, `/blog/*` and the section A rebuild paths are **not** redirected — they are
  served by this platform at the same path.
- Retire candidates (`/new-page2`, `/test2`, `/orlan-copy`, …) return a normal 404.
  410 stays deferred until Search Console review, per the matrix.
- `/api/*`, `/robots.txt`, `/sitemap.xml`, `/favicon.png` are never redirected.

## 2. How they were tested

`src/lib/legacy-redirects.test.ts` — 13 cases run in the suite:

- inert on `rentaconopcion.lovable.app` and `localhost`
- `www` → apex, path and query preserved, single hop
- every wildcard IDX family lands on the identical IDX path
- a real `/listing?key=%20330%20McGill%20Place&keywordType=neighborhood&page=2` URL
  keeps its full query string
- bare `/agents` is not redirected; `/agents/SuCasa-Real-Estate-Team-Team/8351857` is
- `/IL/Rock-Falls`, `/FL/Naples,Naples`, `/AZ/Village-At-Litchfield-Park,Litchfield-Park`
- `/CA` (state code, no city segment) is **not** redirected
- funnel redirects, platform paths, infrastructure paths, unknown paths, trailing slash

After DNS cutover, re-verify live with one request per family:
`curl -sSI https://sucasa.com/<path>` and confirm `HTTP/2 301` plus the exact
`location:` value; then load the target to confirm Lofty serves it.

## 3. www.sucasa.com behaviour

`www.sucasa.com/*` → `301 https://sucasa.com/<same path><same query>`, one hop, then the
apex rules apply. So `www.sucasa.com/neighborhood/x` reaches
`homes.sucasa.com/neighborhood/x` in two hops total. If you prefer a single hop for
IDX paths from `www`, that is a one-line change — two hops is acceptable to Google but
one is marginally better; say the word.

Note: `www` is today's canonical host, so this is where most existing link equity
arrives.

## 4. Routes that cannot be handled safely yet

- **Section A rebuild pages** (`/sell`, `/evaluation`, `/mortgage-calculator`, the
  Spanish education pages, `/documentos`, …) do not exist on this platform yet. After
  cutover they would 404. They must either be built first or be temporarily redirected
  to the closest live page. This is the largest open item.
- **`/blog` and `/blog/*`** — routes not built, and the 19 post bodies are still
  blocked by the firewall in front of the current site. Without content these 20 URLs
  404 after cutover.
- **`/documentos`** — unclassified (public content vs signed-in client area).
- **`/atlantaflips`** — currently sent to the IDX host; still needs the inventory check.
- **Unknown IDX families not in the sitemap** — the wildcards cover the known shapes,
  but only Search Console or server access logs can prove the inventory. Any family
  found later needs its own rule.
- **Active ad spend** on the four funnel URLs is unverified; if a campaign is live,
  remove those four rules until it ends.

## 5. Exact DNS changes needed

At the registrar (GoDaddy nameservers today), when you approve:

| Type | Name | Value | Note |
| --- | --- | --- | --- |
| A | `@` | `185.158.133.1` | replaces the existing Lofty A records `52.52.24.52` and `52.9.101.47` |
| A | `www` | `185.158.133.1` | replaces the existing Lofty record |
| TXT | `_lovable` | value shown in the connect-domain flow | ownership verification |

Leave alone: `homes` (points at Lofty — this is the whole plan), and all MX / SPF /
DKIM / DMARC mail records. Remove any CAA record that blocks Let's Encrypt.

In Lovable: connect `sucasa.com` and `www.sucasa.com` as two entries, set
`sucasa.com` as primary.

## 6. Exact cutover order

1. Lofty confirms `homes.sucasa.com` serves the identical IDX paths — **done**.
2. Close the remaining blockers in matrix section I (`/documentos`, `/atlantaflips`,
   ad check, Search Console review).
3. Build the section A pages and `/blog` + `/blog/$slug` on the platform, at their
   existing paths, with real content.
4. Point canonical tags on IDX pages at `homes.sucasa.com` (Lofty side), while both
   hosts still answer.
5. Deploy this platform with the redirect rules in place (already merged, inert).
6. Flip the three prepared values (section 7) and publish.
7. Connect `sucasa.com` + `www.sucasa.com` in Lovable and change the two A records.
8. Watch propagation; as each resolves, curl one URL per redirect family.
9. Publish the platform sitemap covering every public route; keep the old sitemap
   live; submit both hosts in Search Console.
10. Monitor 404s and index coverage per host for two weeks; execute the 410s only after
    that window is clean.

## 7. Production URL configuration (prepared, NOT active)

To activate at step 6:

```text
PLATFORM_BASE_URL = https://sucasa.com        # src/lib/site-urls.ts
PUBLIC_SITE_URL   = https://sucasa.com        # environment variable (overrides the constant)
IDX_BASE_URL      = https://homes.sucasa.com  # src/lib/site-urls.ts
```

`src/lib/site-urls.ts` still holds the current live values, plus
`PLANNED_PLATFORM_BASE_URL` and `PLANNED_IDX_BASE_URL` with the target values. Setting
`PUBLIC_SITE_URL` alone switches every server-generated link (invitations, tracking)
without a code deploy. `IDX_BASE_URL` drives the "Browse Homes" links and can be flipped
independently, any time now that `homes.sucasa.com` is live.

Already-delivered invitation and claim links keep working: the Lovable host keeps
resolving, and the token lives in the path/query which every redirect preserves.

## 8. Rollback

Rollback is per-layer and each layer is independent.

1. **Redirect rules misbehave** — remove the two lines in `src/server.ts` that call
   `resolveLegacyRedirect` (or narrow a single rule in `src/lib/legacy-redirects.ts`)
   and publish. Effect is immediate for new requests; browsers that cached a 301 clear
   within one hour thanks to the short `Cache-Control`.
2. **Platform not ready / traffic loss** — restore the two A records for `@` and `www`
   to `52.52.24.52` and `52.9.101.47`. sucasa.com returns to Lofty exactly as today.
   `homes.sucasa.com` is unaffected either way, so nothing IDX breaks during rollback.
   Allow up to the record TTL to propagate — lower both TTLs to 300 seconds at least
   24 hours before cutover so rollback is minutes, not hours.
3. **Links pointing at the wrong host** — unset `PUBLIC_SITE_URL` (no deploy) and, if
   needed, revert the two constants in `src/lib/site-urls.ts`.
4. **Full abort** — do 2 then 3; the redirect code can stay in place because it is
   inert on any host other than sucasa.com/www.sucasa.com.

Do not delete the old Lofty sitemap or execute any 410 until the two-week monitoring
window in step 10 is clean; both are irreversible in practice.
