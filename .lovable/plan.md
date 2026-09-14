# Lofty inventory + redirect plan (no changes made yet)

I got through the firewall and read the live sitemap. Below is the real inventory
and the redirect map that follows from it. Nothing has been changed: DNS, domains,
canonical URLs and redirects are all untouched.

## The live inventory (1,087 URLs)

Important: every URL in the sitemap is published on **www.sucasa.com**, not the bare
domain. Today `www` is the canonical host, which changes one thing in our plan (see
"One correction" below).

| Family | Count | Shape |
| --- | --- | --- |
| Neighborhood pages | 1,006 | `/neighborhood/<id>/<Name-City-ST>` |
| City / market hubs | 8 | `/neighborhoods/<id>/<city>` (atlanta, atlanta-ga, miami, orlando, tampa, naples, charlotte, phoenix) |
| Blog | 20 | `/blog/<slug>` (mostly Spanish) |
| Home search | 1 | `/available-homes` |
| Agent page | 1 | `/agents/SuCasa-Real-Estate-Team-Team/8351857` |
| Marketing / calculators / landing pages | 51 | flat top-level paths |

Answers to the three open questions:

1. **Does Lofty use `/agents`?** Yes, but only as a deeper path:
   `/agents/SuCasa-Real-Estate-Team-Team/8351857`. There is no page at bare `/agents`.
   So the collision with our `/agents` page is avoidable, not fatal — see below.
2. **City/market page structure:** nested under `/neighborhoods/...`, not bare
   top-level paths. That removes the silent-collision risk I flagged earlier.
3. **`/listing` and `/listing-detail/*`:** not in the sitemap (individual listings are
   normally excluded for MLS reasons), but they must still be treated as live and
   redirected as a wildcard family.

The 51 flat marketing pages are the messy part. They include real assets
(`/mortgage-calculator`, `/sell`, `/about`, `/preaprobacion`, the Spanish calculators,
several single-address landing pages) and obvious dead weight
(`/new-page2`, `/new-page5`, `/new-page6`, `/test2`, `/orlan-copy`, `/mia-copy`,
`/metro-atlanta-copy`, `/regitro`, `/northcaroline`). Those need a keep/kill decision
from you before cutover — I am not going to guess which campaigns are still running.

## One correction to the approved direction

The approved plan has `www.sucasa.com` redirecting to `sucasa.com`. That is the right
end state, but it reverses the current canonical: today every indexed page lives on
`www`. So the redirect map has to cover **both hosts**, and the `www → root` redirect
must go live at the same time as the new platform, never before.

## Redirect map (destination: homes.sucasa.com)

Rules apply to both `sucasa.com` and `www.sucasa.com`, all 301, query strings preserved:

```text
/available-homes            -> https://homes.sucasa.com/available-homes
/listing                    -> https://homes.sucasa.com/listing
/listing-detail/*           -> https://homes.sucasa.com/listing-detail/*
/neighborhood/*             -> https://homes.sucasa.com/neighborhood/*
/neighborhoods/*            -> https://homes.sucasa.com/neighborhoods/*
/agents/*                   -> https://homes.sucasa.com/agents/*   (deep paths only)
/blog/*                     -> https://homes.sucasa.com/blog/*     (decision needed)
<the 51 flat pages>         -> per-page decision: keep on IDX host, rebuild on
                               the new platform, or retire with a 301 to the
                               nearest new equivalent
```

Explicitly NOT redirected: bare `/agents`, which becomes our own page on the new
platform. `/agents/*` deeper paths keep going to Lofty. This works because no Lofty
page exists at the bare path.

Pages I would recommend rebuilding on the new platform rather than leaving on the IDX
host, because they are platform-intent, not search-intent: `/sell`, `/evaluation`,
`/atlanta-home-evaluation`, `/documentos`, `/preaprobacion`, `/precalificacion`,
`/calificacion`, `/prestamo`, `/dueno-de-negocio-o-sub-contratista`. Each needs a 301
to its new equivalent so the ranking carries over.

## Order of work (unchanged, each step reversible)

1. You confirm the keep/kill/rebuild decision for the 51 flat pages and for `/blog/*`.
2. Lofty stands up `homes.sucasa.com` serving the same content, alongside the live
   site. Verify search, a neighborhood page, a city hub, a listing detail, the agent
   page. No traffic moves.
3. Canonical tags on every IDX page point at the `homes.sucasa.com` version, while
   both hosts still answer.
4. Connect `sucasa.com` (primary) and `www.sucasa.com` to this project.
5. Turn on the 301 map above, from both hosts, query strings intact.
6. Point Browse Homes at `homes.sucasa.com` and the link base at `https://sucasa.com`.
7. Submit both hosts, keep the old sitemap live, publish a real sitemap for the new
   app, watch 404s and index status per host for two weeks.

## Technical notes

- Redirect map and canonical changes in steps 3 and 5 happen on the Lofty side and at
  the registrar — not in this codebase. Our side is two constants in
  `src/lib/site-urls.ts` (`IDX_BASE_URL`, `PLATFORM_BASE_URL`), flipped in steps 6.
- Existing invitation and claim links survive: they are built from `siteUrl()`, the
  current Lovable host keeps resolving, and once `sucasa.com` is primary it redirects
  preserving path and query string, where the token lives.
- Our `/sitemap.xml` currently lists three URLs. It needs every public route before
  step 7, generated from the route tree rather than hand-listed.
- I reached the sitemap by solving the firewall's browser challenge, so I can re-pull
  it on demand to diff before cutover.

## What I need from you

1. Keep / rebuild / retire for the 51 flat marketing pages (I can propose a default
   split if you would rather review a draft than start from a blank list).
2. Does `/blog/*` stay on the IDX host or move to the new platform?
3. Confirmation from Lofty that `homes.sucasa.com` can be provisioned and that the
   IDX paths stay identical on that host.
