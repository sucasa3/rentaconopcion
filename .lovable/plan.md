# Homeowner mobile visual correction

## Scope

Refine only the presentation and composition of `/dashboard`. Keep all existing homeowner data reads, `HomeHero`, Home Record, Home Plan, valuation/equity, maintenance, documents, assistant, Premium, permissions, consent, alerts, onboarding behavior, and destination routes unchanged.

## Mobile first viewport

- Reduce the intro below the mobile top bar to roughly **90–120px total**.
- Remove the eyebrow, the large two-line state headline, and the longer monitoring paragraph from the mobile intro.
- Show one compact H1: **“Good evening, Neil.”** at approximately 24px, followed by one small line: **“Here’s what matters with your home today.”**
- Remove Setup Guide and Request from the mobile greeting row so the copy keeps the full width and does not wrap into a tall column.
- Render the unchanged `HomeHero` immediately after this compact intro, with tighter page spacing. At the current 393×526 viewport, the greeting and a meaningful upper portion of the home photograph should be visible before the first swipe.
- Desktop may retain a wider intro/action arrangement, but it will use the same shorter copy and keep the hero near the top.

## Actions outside the greeting

- Preserve Setup Guide and Request behavior, but move them out of the mobile headline area.
- Request remains directly available through the existing fixed bottom navigation and also appears as a small secondary action later on the page.
- Setup Guide moves to the same compact utility area after the primary Home Plan content; neither control competes with the home photograph.

## Page hierarchy

1. Compact greeting
2. Existing `HomeHero`, completely unchanged
3. Compact **What SuCasa sees** intelligence panel
4. One prominent **Coming up for your home** card, or the existing calm quiet-home alternative
5. Compact **Your Home Profile** destination rows
6. Small **Make SuCasa smarter** module only when useful
7. Compact utility actions for Setup Guide and Request

This restores the sequence: **beautiful home first, intelligence second, action third**.

## Remove duplication

- Remove the separate large **Your home's financial picture** card and its repeated value/equity figures. Add **Value & equity — Explore your home's financial picture** as a compact row linking to `/money`.
- Remove the standalone large **Home Health** card. Preserve its current status text as the first compact row linking to `/home-care`.
- Remove **What are you thinking about?** and all five chips from Home Today only. Existing homeowner routes and flows remain intact.
- Keep missing inspection/profile details in one primary place: **Make SuCasa smarter**. Do not also repeat the missing-inspection invitation in What SuCasa sees or another callout.
- Let What SuCasa sees state the overall care/plan condition once; let the Coming Up card contain the specific next item. Do not repeat the same maintenance message again in Home Health.

## Compact “What SuCasa sees”

- Keep the current deterministic Home Intelligence helper and truthful timestamp rules; change only selection and presentation.
- Limit the panel to **2–3 short, high-value observations**.
- Use a subtle brand-tinted band with modest padding, smaller radius, no heavy floating-card treatment, and concise bullet rows.
- Prefer distinct facts: overall care state, near-term Home Plan count, and a genuinely new timestamped update when available.
- Exclude observations already expressed by the Coming Up card and exclude missing-profile invitations that belong in Make SuCasa smarter.
- Keep genuine `HomeAlerts` behavior, but present an alert compactly and avoid restating the same fact in the summary.

## One primary next action

- Keep one visually prominent **Coming up for your home** card using the existing top Home Plan item, reason, cost band, and route.
- Simplify its internal nesting so it reads as one action rather than a card inside a card.
- Do not follow it with another large care card. On a quiet day, retain the calm reassurance and Home Plan link without inventing urgency.

## Compact lower dashboard

Create one restrained **Your Home Profile** group with dividers and icon/title/supporting-line/chevron rows:

- Home health — current truthful status
- Home vault — documents, warranties and inspection reports
- Ask SuCasa — ask anything about your home
- Your home's story — property and care history
- Value & equity — explore your home's financial picture
- Get help — you decide when to ask a professional

These rows replace separate large cards. Use whitespace, typography, dividers, and subtle surface changes rather than repeating large 28–30px rounded rectangles.

## Make SuCasa smarter

- Keep the existing completeness inputs and links, with no new query or scoring behavior.
- Render only meaningful missing items, capped to a short list, with inspection shown only here when missing.
- Use a small inline module and hide it completely when there is nothing useful to add.

## Responsive and safe-area behavior

- Mobile spacing and type are the priority; headings stay single-line where practical and no fixed action narrows the greeting column.
- Desktop retains the centered content width and may place compact utility actions alongside the greeting when enough width exists.
- Preserve the existing bottom navigation height and `pb-24`/safe-area clearance so the final rows are never covered.
- Do not modify `HomeHero` dimensions, controls, photography, data, or interaction logic.

## Verification

- Check `/dashboard` at **393×526**: header, compact greeting, and a meaningful portion of HomeHero are visible without a full swipe.
- Check that the first two mobile screens include the home, Home Score/value/equity, What SuCasa sees, and the primary Coming Up item.
- Check no repeated value/equity card, no repeated inspection invitation, no large Home Health card, and no thinking chips remain.
- Check Setup Guide, Request, all six destination rows, alerts, quiet state, address-completion state, and bilingual copy remain accessible and truthful.
- Check desktop layout remains balanced, and run the existing type and focused dashboard/helper tests.
