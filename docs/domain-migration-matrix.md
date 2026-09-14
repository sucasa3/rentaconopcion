# SuCasa domain migration — final matrix

Status: **planning artefact only.** No DNS, domain, redirect, canonical or routing
change has been made. Blocked on Lofty confirming that `homes.sucasa.com` can serve the
existing IDX paths identically.

Target architecture:

```text
sucasa.com          -> new SuCasa platform (this app), primary
www.sucasa.com      -> 301 to sucasa.com  (note: www is TODAY's canonical host)
homes.sucasa.com    -> existing Lofty IDX / search / listings
```

All redirects are 301, apply from **both** `sucasa.com` and `www.sucasa.com`, and
preserve query strings.

## Evidence base

- Sitemap pulled 2026-09-14: 1,087 URLs.
- Page HTML is unreachable from any automated client (firewall "Robot Validate",
  IP-based, blocks plain requests and a real headless browser alike). So page bodies,
  titles and meta descriptions could not be read. Anything requiring page content is
  flagged VERIFY or BLOCKED below.
- Google Search Console: **no connected account**, so impressions/clicks per URL are
  unavailable. Ranking and backlink evidence below comes from third-party estimates.
- Domain backlink profile: authority 7/100, 913 backlinks / 263 referring domains, and
  the profile is dominated by directory and PBN spam with domain-level anchors
  (`sucasa.com`, `yourcasa.com`). No page-level link equity was found on any of the
  retire candidates.
- Ranking pages (estimated, top 25 keywords): all organic traffic sits on
  `/neighborhood/*`, `/neighborhoods/*`, `/listing-detail/*`, `/listing?key=...`,
  `/<ST>/<City>` pages, the homepage, and one blog post
  (`/blog/que-es-el-programa-de-compra-de-arrendamiento`, position ~24).

### New URL families found that are NOT in the sitemap

These rank in Google and must be in the redirect map:

| Family | Example | Action |
| --- | --- | --- |
| `/listing-detail/<id>/<slug>` | `/listing-detail/1176284951/3505-Benson-LN-North-Las-Vegas-NV` | 301 wildcard -> homes.sucasa.com |
| `/listing?key=...` | `/listing?key=%20330%20McGill%20Place...&keywordType=neighborhood` | 301 -> homes.sucasa.com, **query string mandatory** |
| `/<ST>/<City>` | `/IL/Rock-Falls` | 301 wildcard -> homes.sucasa.com |
| `/<ST>/<Neighborhood>,<City>` | `/FL/Naples,Naples`, `/AZ/Village-At-Litchfield-Park,Litchfield-Park` | 301 wildcard -> homes.sucasa.com |

The `/<ST>/...` family is a two-letter state prefix at the top level. It must be
excluded from any future top-level route on the new platform.

## A. REBUILD on sucasa.com — same path, no renaming

Per the approved adjustment, every rebuilt page keeps its existing slug.

| Current URL | Destination | Action | Reason | Value flag |
| --- | --- | --- | --- | --- |
| /about | /about | 301 | Brand page. | Brand |
| /sell | /sell | 301 | Seller resource, current. | SEO |
| /evaluation | /evaluation | 301 | Home-value request = our Home Report. Same path; render our report flow there. | High intent |
| /atlanta-home-evaluation | /atlanta-home-evaluation | 301 | Same intent, Atlanta-specific. Stale (Apr 2025) but intent is valuable. | Possible links |
| /mortgage-calculator | /mortgage-calculator | 301 | Core tool. | SEO |
| /calculadora-de-hipotecas | same path | 301 | Spanish mortgage calculator. | Spanish SEO |
| /calculadora-de-asequibilidad | same path | 301 | Affordability calculator. | Spanish SEO |
| /calculadora-de-venta-de-viviendas | same path | 301 | Seller net-proceeds calculator. | Spanish SEO |
| /rentarvscomprar | same path | 301 | Rent-vs-buy education, updated daily. | Spanish SEO |
| /cuanto-es-el-pago-inicial-de-una-casa | same path | 301 | Down-payment education. | Spanish SEO |
| /que-es-el-indice-de-deuda-a-ingreso | same path | 301 | DTI education. | Spanish SEO |
| /que-es-un-codeudor-de-prestamo-co-borrower | same path | 301 | Co-borrower education. | Spanish SEO |
| /los-4-componentes-de-un-pago-mensual-de-una-casa | same path | 301 | Monthly-payment education. | Spanish SEO |
| /necesitas-arreglar-tu-credito | same path | 301 | Credit education. | Spanish SEO |
| /prestamo | same path | 301 | Financing education. | Spanish SEO |
| /preaprobacion | same path | 301 | Pre-approval education + lead capture. | High intent |
| /dueno-de-negocio-o-sub-contratista | same path | 301 | Self-employed borrower education. | Niche Spanish SEO |
| /documentos | same path | 301 | **VERIFY** before implementation: public document guidance, or a signed-in client area? Classification holds only if it is public content. | Moderate |
| /blog | /blog | 301 | Blog index, rebuilt here (see section E). | Yes |

19 pages including the blog index.

## B. KEEP on homes.sucasa.com — search / market browsing (301)

| Current URL | Reason | Value flag |
| --- | --- | --- |
| /available-homes | Main search entry. | Strong |
| /metro-atlanta | Market browse, daily updates. | Strong local |
| /atlantaga | Atlanta market page. | Local |
| /lawrenceville | City market page. | Local |
| /lawrencevillega | Duplicate-ish city page; keep as-is, do not merge during migration. | Local |
| /gwinnett-county | County market page. | Local |
| /arizona | State market page. | Local |
| /phoenix | City market page. | Local |
| /mia | Miami market page (short slug). | Local |
| /orlan | Orlando market page (short slug). | Local |
| /northcaroline | Misspelled but live and updated daily; keep the URL, fix the slug later with its own 301. | Local |
| /casas-en-las-vegas | Spanish Las Vegas search. | Spanish local |
| /boca-raton-rentals | Rental search. | Local |
| /calm-valley | Community / subdivision page. | Local |
| /agents/* (deep paths only) | `/agents/SuCasa-Real-Estate-Team-Team/8351857`. Bare `/agents` stays ours. | Brand |
| /neighborhood/* (1,006) | Highest-traffic family on the domain. | Strong |
| /neighborhoods/* (8) | City hubs. | Strong |
| /listing, /listing?key=... | Search results, query string preserved. | Ranking |
| /listing-detail/* | Individual listings. | Ranking |
| /<ST>/<City>, /<ST>/<Neighborhood>,<City> | Ranking IDX geography pages not in the sitemap. | Ranking |

Plus `/atlantaflips` — **VERIFY** before implementation: investor listing page, stale
since Apr 2025. Keep on the IDX host if it still has inventory; retire with a 301 to
`/available-homes` on the IDX host if it is empty.

## C. Single-property pages — reviewed individually

Page bodies are unreadable, so the read is based on last-modified dates. All five were
regenerated recently, which is consistent with live or recently-sold listings rather
than abandoned pages.

| Current URL | Last modified | Recommendation | Reason |
| --- | --- | --- | --- |
| /2749-eastfield-rd-se | 2026-07-01 | Keep on homes.sucasa.com (301) | Recent; address-query SEO. |
| /411-hunters-ln | 2026-07-20 | Keep on homes.sucasa.com (301) | Recent. |
| /1290-shallowford-rd | 2026-08-03 | Keep on homes.sucasa.com (301) | Recent. |
| /1359-summit-ln-nw | 2026-08-07 | Keep on homes.sucasa.com (301) | Recent. |
| /2880-sherwood-rd-se1 | 2026-09-09 | Keep, but **check for a duplicate** | The `-se1` suffix implies an earlier `/2880-sherwood-rd-se`. If both exist, 301 the loser into the winner rather than keeping two. |

None of the five appears in the estimated ranking set, so if any turns out to be a
closed listing with no content, a 301 to `/available-homes` on the IDX host is the
right answer instead of preserving it. Sold-listing pages held indefinitely are also a
common MLS display-rule problem — worth one question to Lofty.

## D. Retire candidates — value check first, no 410 executed

Nothing is retired yet. Findings for the nine candidates:

- **Search Console data: unavailable.** No Google account is connected to this
  project. If you connect one I can pull impressions and clicks per URL before we act.
- **Backlinks: none found at page level.** The domain's link profile is directory and
  PBN spam pointing at the root; no candidate page appears as a link target.
- **Rankings: none.** No candidate appears in the estimated ranking set.
- **Campaign references: unknown to me.** I cannot see ad accounts. `/fb-live` and the
  funnel pages are the plausible ones.

| Current URL | Last modified | Proposal | Reason |
| --- | --- | --- | --- |
| /new-page2 | 2025-04-07 | 410 | Unnamed builder page, no value found. |
| /new-page5 | (regenerated) | 410 | Unnamed builder page. |
| /new-page6 | 2025-04-07 | 410 | Unnamed builder page. |
| /test2 | (regenerated) | 410 | Test page. |
| /orlan-copy | (regenerated) | 410 | Duplicate of /orlan; currently competing with it. |
| /mia-copy | (regenerated) | 410 | Duplicate of /mia. |
| /metro-atlanta-copy | (regenerated) | 410 | Duplicate of /metro-atlanta. |
| /regitro | 2025-04-07 | 410 | Misspelled dead signup page. |
| /fb-live | 2025-04-07 | 301 -> /onboarding | Expired event page, but the likeliest to carry old social/ad links. Cheap insurance. |

Retiring the three `-copy` pages is a small SEO gain, not a loss: they duplicate their
originals.

### Old funnels — 301, never 410

| Current URL | Destination | Reason | Value flag |
| --- | --- | --- | --- |
| /precalificacion | /preaprobacion | Superseded pre-qualification funnel. | Possible paid traffic |
| /landing-de-precalificacion | /preaprobacion | Paid-ad landing variant. | Likely ad links |
| /calificacion | /preaprobacion | Third variant of the same funnel. | Possible ad links |
| /cita | /onboarding | Old appointment funnel. | Possible ad links |

If any of these four still receives live ad spend, leave it untouched until the
campaign ends. That check is not something I can do from here.

## E. Blog migration

Decision: the blog moves to the platform, not to the IDX host.

- New routes: `/blog` (index) and `/blog/$slug` (post) on sucasa.com.
- The sitemap lists **19** posts plus the `/blog` index (not 20). All 19 slugs
  preserved byte-for-byte, including the legacy trailing hyphen on
  `pre-califica-para-una-hipoteca-`.
- 301 from `www.sucasa.com/blog/*` and `sucasa.com/blog/*` to the same path.
- Per post: title, meta description, canonical `https://sucasa.com/blog/<slug>`,
  published date, `og:*` and `twitter:*` tags, and `Article` JSON-LD.
- Highest-value post to preserve exactly:
  `/blog/que-es-el-programa-de-compra-de-arrendamiento` (only blog URL with an
  estimated ranking, ~position 24 for "compras de arrendamientos").

**BLOCKED:** the post content cannot be retrieved. The firewall in front of the current
site refuses every automated request for page HTML — plain fetches and a real headless
browser both get "Robot Validate", by IP. The sitemap is the only readable resource.

To unblock, any one of these works:
1. A content export from Lofty (CMS export, CSV, or XML).
2. The posts pasted or uploaded as text/markdown.
3. Someone on a normal residential connection saving the 19 pages and sharing them.

The 19 slugs, ready to receive content:

```text
pre-califica-para-una-hipoteca-
que-es-el-programa-de-compra-de-arrendamiento
renta-con-opcion-a-compra-porque-es-es-la-mejor-opcion
renta-con-opcion-a-compra-nuevo-programa-beneficios-y-requisitos
no-te-quedes-sin-casa-la-razon-1-que-mantendra-las-casas-subiendo-de-precio
ultima-data-que-esta-pasando-y-va-a-pasar-con-los-intereses-y-precios-de-casas
consejos-para-comprar-una-casa-espero-que-los-precios-de-las-casas-bajen
mi-recomendacion-consejo-para-comprar-tu-casa-en-los-proximos-meses
aprovecha-la-oportunidad-compra-tu-casa-ahora
nuevos-programas-disponibles-cada-situacion-tiene-una-solucion
quiero-comprar-una-casa-y-no-tengo-la-inicial-que-puedo-hacer
no-compres-casa-ahora-lo-que-opinan-los-experos
es-necesario-un-social-security-number-para-comprar-una-casa-en-los-estados-unidos
cuales-son-las-ventajas-de-tener-un-agente-de-real-estate
no-se-deje-sorprender-por-los-costos-de-cierre
la-importancia-de-estar-pre-aprobado-por-el-banco
como-encontrar-la-mejor-hipoteca-para-mis-posibilidades
cual-es-el-proceso-para-comprar-una-casa
como-saber-si-puedo-costear-una-casa
```

Note the misspelling in `no-compres-casa-ahora-lo-que-opinan-los-experos`
("experos" should be "expertos"). Keep the slug exactly as-is; add the corrected slug
later as a new URL with its own 301 if you want it fixed.


I will not write placeholder or invented post bodies.

## F. Order of work

1. Lofty confirms `homes.sucasa.com` can serve identical IDX paths. **Nothing moves
   before this.**
2. You answer: `/documentos` public or client area; `/atlantaflips` inventory or empty;
   any live ad spend on the four funnel URLs.
3. Blog content supplied; `/blog` and `/blog/$slug` built and reviewed on the platform.
4. Rebuild the section A pages on the platform at their existing paths.
5. `homes.sucasa.com` stood up alongside the live site and fully tested (search, a
   neighborhood page, a city hub, a listing detail, a `/<ST>/<City>` page, the agent
   page, a `/listing?key=` URL with its query string).
6. Canonical tags on IDX pages point at `homes.sucasa.com`, while both hosts answer.
7. Connect `sucasa.com` (primary) and `www.sucasa.com` to this project.
8. Turn on the 301 map from both hosts, query strings intact.
9. Flip `IDX_BASE_URL` and `PLATFORM_BASE_URL` in `src/lib/site-urls.ts`.
10. Publish a real sitemap for the platform, keep the old sitemap live, submit both
    hosts, watch 404s and index status per host for two weeks. Execute the 410s only
    after step 10 confirms no traffic to them.

## G. Technical notes

- The redirect map and IDX canonicals are executed on the Lofty side and at the
  registrar, not in this codebase. Our side is two constants in
  `src/lib/site-urls.ts`.
- Existing invitation and claim links keep working: they are built from `siteUrl()`,
  the current Lovable host keeps resolving, and once `sucasa.com` is primary it
  redirects preserving path and query string, where the token lives.
- Our `/sitemap.xml` currently lists 3 URLs. It must cover every public route,
  generated from the route tree, before step 10.
- The `/<ST>/...` two-letter-state family is a permanent constraint on new top-level
  routes.
- The sitemap can be re-pulled on demand to diff before cutover.
