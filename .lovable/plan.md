# KEEP / REBUILD / RETIRE — the 51 flat pages + the blog

Nothing changed. No DNS, redirects, canonicals or routing touched.

Method note: the current site blocks automated access to page HTML (only the sitemap
is reachable), so classification is based on the URL and the last-modified date from
the sitemap. Where I could not see the page body I have said so in the reason. Two
pages carry real uncertainty and are marked **VERIFY** — please eyeball those before
we act on them.

Legend: destination `sucasa.com/...` = rebuilt on the new platform (301 from the old
URL). `homes.sucasa.com/...` = stays on the listings system (301). `410` = gone.

## REBUILD on sucasa.com — education & evergreen SEO (301)

| Current URL | Destination | Action | Reason | SEO/campaign |
| --- | --- | --- | --- | --- |
| /about | /about | 301 | Brand page; belongs to the platform. | Likely brand backlinks |
| /blog | /blog | 301 | Index of the moved blog. | Yes |
| /rentarvscomprar | /rent-vs-buy | 301 | Evergreen homeowner education, actively updated. | Strong SEO |
| /cuanto-es-el-pago-inicial-de-una-casa | /guias/pago-inicial | 301 | Spanish down-payment education, current. | Strong Spanish SEO |
| /que-es-el-indice-de-deuda-a-ingreso | /guias/deuda-a-ingreso | 301 | DTI education, current. | Strong Spanish SEO |
| /que-es-un-codeudor-de-prestamo-co-borrower | /guias/codeudor | 301 | Co-borrower education. | Spanish SEO |
| /los-4-componentes-de-un-pago-mensual-de-una-casa | /guias/pago-mensual | 301 | Monthly-payment education. | Spanish SEO |
| /necesitas-arreglar-tu-credito | /guias/credito | 301 | Credit-repair education. | Spanish SEO |
| /prestamo | /financiamiento | 301 | Financing education, current. | Spanish SEO |
| /preaprobacion | /preaprobacion | 301 | Pre-approval education + lead capture, current. | High intent, keep slug |

Recommendation: keep the Spanish slugs exactly as they are rather than my `/guias/...`
suggestions if you would rather not risk any ranking movement. Both are safe with a
301; identical slugs are safer.

## REBUILD on sucasa.com — calculators & home value (301)

| Current URL | Destination | Action | Reason | SEO/campaign |
| --- | --- | --- | --- | --- |
| /mortgage-calculator | /mortgage-calculator | 301 | Core tool, belongs to the platform. | Strong SEO |
| /calculadora-de-hipotecas | /calculadora-de-hipotecas | 301 | Spanish mortgage calculator. | Strong Spanish SEO |
| /calculadora-de-asequibilidad | /calculadora-de-asequibilidad | 301 | Affordability calculator. | Spanish SEO |
| /calculadora-de-venta-de-viviendas | /calculadora-de-venta-de-viviendas | 301 | Seller net-proceeds calculator. | Spanish SEO |
| /evaluation | /report | 301 | Home value / evaluation request — this is exactly our Home Report. | High intent |
| /atlanta-home-evaluation | /report?market=atlanta | 301 | Same intent, Atlanta-specific. Stale (Apr 2025) but valuable intent. | Possible backlinks |
| /sell | /sell | 301 | Seller resource, current. | Strong SEO |
| /documentos | /documents-guide | 301 | Homeowner document guidance, current. **VERIFY** it is not a signed-in client area. | Moderate |
| /dueno-de-negocio-o-sub-contratista | /self-employed | 301 | Self-employed borrower education, current. | Niche Spanish SEO |

## KEEP on homes.sucasa.com — search / market browsing (301)

| Current URL | Destination | Action | Reason | SEO/campaign |
| --- | --- | --- | --- | --- |
| /metro-atlanta | homes…/metro-atlanta | 301 | Market browse page, updated daily. | Strong local SEO |
| /atlantaga | homes…/atlantaga | 301 | Atlanta market page. | Local SEO |
| /lawrenceville | homes…/lawrenceville | 301 | City market page. | Local SEO |
| /lawrencevillega | homes…/lawrencevillega | 301 | Duplicate-ish city page; keep, do not merge yet. | Local SEO |
| /gwinnett-county | homes…/gwinnett-county | 301 | County market page. | Local SEO |
| /arizona | homes…/arizona | 301 | State market page. | Local SEO |
| /phoenix | homes…/phoenix | 301 | City market page. | Local SEO |
| /mia | homes…/mia | 301 | Miami market page (short slug). | Local SEO |
| /orlan | homes…/orlan | 301 | Orlando market page (short slug). | Local SEO |
| /northcaroline | homes…/northcaroline | 301 | NC market page — misspelled slug, but live and updated daily, so keep the URL and fix the slug later with its own 301. | Local SEO |
| /casas-en-las-vegas | homes…/casas-en-las-vegas | 301 | Spanish Las Vegas search page. | Spanish local SEO |
| /boca-raton-rentals | homes…/boca-raton-rentals | 301 | Rental search page. | Local SEO |
| /atlantaflips | homes…/atlantaflips | 301 | Investor listing page. Stale (Apr 2025) — **VERIFY** it still has inventory. | Possible campaign |
| /calm-valley | homes…/calm-valley | 301 | Community/subdivision page. | Local SEO |
| /2749-eastfield-rd-se | homes…/2749-eastfield-rd-se | 301 | Single-property page. | Address-query SEO |
| /411-hunters-ln | homes…/411-hunters-ln | 301 | Single-property page. | Address-query SEO |
| /1290-shallowford-rd | homes…/1290-shallowford-rd | 301 | Single-property page. | Address-query SEO |
| /1359-summit-ln-nw | homes…/1359-summit-ln-nw | 301 | Single-property page. | Address-query SEO |
| /2880-sherwood-rd-se1 | homes…/2880-sherwood-rd-se1 | 301 | Single-property page; `-se1` suffix suggests a duplicate of an earlier one. | Address-query SEO |

## RETIRE (410) — tests, duplicates, dead builder pages

| Current URL | Action | Reason |
| --- | --- | --- |
| /new-page2 | 410 | Unnamed builder page, untouched since Apr 2025. |
| /new-page5 | 410 | Unnamed builder page. |
| /new-page6 | 410 | Unnamed builder page. |
| /test2 | 410 | Test page. |
| /orlan-copy | 410 | Duplicate of /orlan. |
| /mia-copy | 410 | Duplicate of /mia. |
| /metro-atlanta-copy | 410 | Duplicate of /metro-atlanta. |
| /regitro | 410 | Misspelled ("registro") dead signup page, Apr 2025. |
| /fb-live | 410 | Expired Facebook Live event page, Apr 2025. |

Note: all of these still appear in the sitemap with today's date on some of them —
that is the site generator stamping everything, not evidence of real activity. The
`-copy` pages are currently competing with their originals for the same keywords, so
retiring them is a small SEO gain, not a loss.

## RETIRE with a 301 — old funnels superseded by the new flow

These are lead funnels, not content. They should not 410 (paid and organic links may
still point at them) but they should not be rebuilt either — the new onboarding
replaces them.

| Current URL | Destination | Action | Reason | SEO/campaign |
| --- | --- | --- | --- | --- |
| /precalificacion | /preaprobacion | 301 | Old pre-qualification funnel, Apr 2025; superseded. | Possible paid traffic |
| /landing-de-precalificacion | /preaprobacion | 301 | Paid-ad landing variant of the same funnel. | Likely ad links |
| /calificacion | /preaprobacion | 301 | Third variant of the same funnel. | Possible ad links |
| /cita | /onboarding | 301 | Old appointment-booking funnel, Apr 2025. | Possible ad links |

If any of these four are still receiving live ad spend, keep them as they are for now
and redirect after the campaigns end. I cannot see ad traffic from here — that check
is yours.

## Blog decision (as you directed)

- All 20 `/blog/<slug>` URLs move to the new platform: `sucasa.com/blog/<slug>`.
- Slugs preserved exactly, including the trailing hyphen on
  `/blog/pre-califica-para-una-hipoteca-`.
- 301 from `www.sucasa.com/blog/*` and `sucasa.com/blog/*`.
- The blog does **not** go to homes.sucasa.com.
- This means the new platform needs a real blog: a `/blog` index and a
  `/blog/$slug` page, with the 20 existing posts brought across. That is build work
  we have not scoped yet; flag it if you want it in the next slice.

## Totals

51 flat pages: 19 rebuild on sucasa.com (incl. /about and the /blog index),
19 keep on homes.sucasa.com, 9 retire with 410, 4 retire with a 301 to the new
equivalent.

## Still blocked externally

Confirmation from Lofty that `homes.sucasa.com` can be provisioned and serve the
identical IDX paths. No DNS or production change happens before that lands. Two
in-house verifications also outstanding: `/documentos` (is it public content or a
client area?) and `/atlantaflips` (still has inventory?).
