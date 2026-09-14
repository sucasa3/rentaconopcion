# Domain and route migration audit — sucasa.com + Lofty IDX

Nothing was changed. DNS, domains, redirects and canonical URLs are untouched.

## What I could verify

**DNS / hosting today**
- `sucasa.com` nameservers: GoDaddy (`ns47/ns48.domaincontrol.com`).
- `sucasa.com` → A records `52.52.24.52`, `52.9.101.47`. `www.sucasa.com` → same host.
- `homes.sucasa.com` does not exist yet (no DNS record) — the subdomain is free.
- No custom domain is connected to this Lovable project. The app is published only at
  `rentaconopcion.lovable.app`.
- The live site sits behind a web firewall ("OpsAny Web Firewall" / openresty) that returns
  403 to non-residential traffic and serves a JavaScript proof-of-work challenge.

**Limitation you should know about:** because of that firewall, I could not enumerate the
Lofty routes from here — every request, including from a real browser session, was blocked by
IP. So the Lofty side of the inventory has to come from you or from Lofty. I am not going to
guess at it.

**Routes in the new SuCasa app (complete)**
- Public: `/`, `/services`, `/pricing`, `/partner`, `/pro`, `/agents`, `/lenders`, `/report`,
  `/request`, `/onboarding`, `/auth`, `/agent-invite`, `/professional-invite`
- Signed-in: `/dashboard`, `/home-plan`, `/home-care`, `/home-team`, `/documents`, `/money`,
  `/timeline`, `/assistant`, `/requests/:id`, `/admin`, plus the `agent/*` and `lender/*`
  workspaces
- Machine: `/sitemap.xml`, `/robots.txt`, and internal endpoints under `/api/public/*`

**Collisions found (against the families you listed)**
- `/available-homes`, `/listing`, `/listing-detail/*`, `/neighborhood/*`: no route of that
  name exists in the new app, so there is no hard collision today.
- `/agents` is the one real risk: the new app has a public `/agents` page, and Lofty sites
  commonly publish an agent-roster page at the same path. This needs confirming against the
  live site before any cutover.
- City/market listing routes are the open question. If Lofty serves them as bare top-level
  paths (e.g. `/austin-tx-homes-for-sale`), any future top-level page in the new app could
  collide silently. Confirmed list needed.

## Recommended architecture (safest)

Split by host, not by path:

```text
sucasa.com, www.sucasa.com   -> new SuCasa platform (Lovable)
homes.sucasa.com             -> existing Lofty IDX (unchanged system)
old IDX paths on sucasa.com   -> 301 redirect to the same path on homes.sucasa.com
```

Why not same-path proxying: Lovable hosting has no edge rewrite layer that can hand selected
path groups to another provider. It could be faked by having the app fetch Lofty server-side
and re-serve the HTML, but that breaks IDX in practice — the pages are JavaScript-heavy, they
set their own cookies, they carry MLS display and framing obligations, and they sit behind
that firewall which would see all traffic as one datacenter IP. I do not recommend it.

Putting Cloudflare in front of both is technically possible and is the only way to keep IDX
on the exact same paths. It adds a layer you then own and debug forever, and Lofty must accept
proxied traffic. Worth it only if preserving the exact IDX URLs is a hard business
requirement.

## Migration plan (in order, each step reversible)

1. **Complete the inventory.** You or Lofty supply the full list of URL families Lofty serves
   on sucasa.com, plus the sitemap. Nothing else starts until that list exists.
2. **Decide the `/agents` conflict** and any other overlap that list reveals — rename on our
   side, or move to the IDX host.
3. **Stand up `homes.sucasa.com` pointing at Lofty, alongside the live site.** Both hosts
   serve IDX during this window; no traffic moves, nothing breaks. Verify search, listing
   detail and neighbourhood pages on the new host.
4. **Set canonical URLs on the IDX pages to `homes.sucasa.com`** while it is still reachable
   at both hosts. Do this before any redirect, so search engines re-point without a gap.
5. **Connect sucasa.com + www to this project** in Lovable, with `sucasa.com` primary. This is
   the only step that changes what visitors see at the root, so it goes late and needs a
   scheduled window.
6. **Add 301 redirects** for the old IDX paths on sucasa.com to the same path on
   homes.sucasa.com. Preserve query strings — saved searches and ad links depend on them.
7. **SEO cleanup:** submit both hosts, keep old sitemaps live for a while, publish a real
   sitemap for the new app (today's is a three-URL stub and needs every public page), and add
   per-page canonicals.
8. **Watch for two weeks:** 404 logs, redirect coverage, index status per host.

## Authentication and cookies

- Sign-in cookies are host-scoped. With the subdomain split, the two systems cannot interfere
  — this is the main safety argument for the split.
- If you ever proxy both under one host, both systems' cookies land on the same domain and
  session bugs become likely. Another reason to avoid it.
- One thing to check before step 5: outbound links already sent to people (invitation and
  claim links) are built from a configured site address, currently the Lovable one. Those
  links must keep working through the switch — the base gets pointed at sucasa.com and links
  already in inboxes need to keep resolving.

## SEO implications, plainly

- Moving IDX pages to a subdomain temporarily softens their rankings. Correct canonicals plus
  301s recover it, typically weeks not months.
- Doing it in the other order (redirect first, canonical later) is what causes real losses.
- Everything currently ranking on sucasa.com under an IDX URL must be in the redirect map. A
  missing family becomes 404s at scale.

## Open questions I need answered before step 1 closes

1. The full Lofty URL family list and sitemap.
2. Does Lofty serve an agent page at `/agents`?
3. Are the city/market listing routes top-level paths, or nested under a prefix?
4. Is preserving the exact IDX URLs on sucasa.com a hard requirement (which forces the
   Cloudflare path), or is the `homes.sucasa.com` split acceptable?
