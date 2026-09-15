# Home Profile — Light Reference with Hero Intelligence Strip

## Goal
Keep the approved light-mode Home Profile as the primary design and add one compact premium moment where the property photo meets the homeowner information.

## Proposed mobile layout

```text
┌──────────────────────────────────┐
│ SuCasa logo          Account     │
├──────────────────────────────────┤
│                                  │
│        PROPERTY PHOTO            │
│                                  │
│  Your home                       │
│  Real homeowner address          │
│                                  │
├─ translucent overlap ────────────┤
│ Estimated     Estimated    Home  │
│ Value         Equity       Score │
│ $canonical    $canonical   82/—  │
└──────────────────────────────────┘

┌──────────────┐ ┌────────────────┐
│ Home Score   │ │ Home Systems   │
│ ring +       │ │ compact rows   │
│ explanation  │ │ evidence only  │
└──────────────┘ └────────────────┘

┌──────────────────────────────────┐
│ Value & Equity                   │
│ existing compact detail card    │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ Home Care                        │
│ To do | Documents | History     │
│ compact current preview          │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ Home Team                        │
│ compact Agent + Lender tiles    │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ Ask SuCasa          [ Ask ]      │
└──────────────────────────────────┘

 Home      Care      Docs     …
```

## Component treatment

### Property photo hero
- Keep the existing photo, crop, vignette, rounded container, “Your home” label, and real address.
- Preserve the photo as the largest and strongest element at the top.
- Give the hero enough bottom room for the address so the strip never obscures it.

### Hero intelligence strip
- Add a single shallow strip that overlaps the lower edge of the photo and extends slightly into the light page below.
- Use three equal, shrink-safe columns: **Estimated Value**, **Estimated Equity**, and **Home Score**.
- Read only the canonical values already supplied to the Home Profile; show a neutral unavailable mark when a value or score is absent.
- Use the requested translucent deep navy background, subtle backdrop blur, fine border, and restrained shadow.
- Use small muted labels, white tabular numbers, hairline separators, and only a minimal blue accent.
- Show green movement only when a real canonical positive movement value exists. Do not derive or invent movement.
- Keep the strip non-interactive and approximately one compact row; it will not become another card or add explanatory copy.

### Content below the hero
- Preserve the existing side-by-side Home Score and Home Systems composition.
- Preserve Value & Equity, Home Care tabs, Home Team states, Ask SuCasa, and mobile navigation.
- Retain the current light homeowner palette, white/simple cards, compact gaps, and information density.
- Do not introduce new sections, charts, large colored surfaces, decorative gradients, or unsupported status claims.

## Visual bridge
The strip will sit partly over the image and partly over the page background. This creates a clear transition from “this is my home” to “this is what SuCasa knows,” while the rest of the screen remains light and quiet.

## Technical details
- Extend the existing photo component to render the three canonical metrics rather than creating a separate data source.
- Add homeowner-scoped semantic tokens for the translucent strip, its border, labels, dividers, and foreground colors.
- Keep the existing detailed Value & Equity and Home Score sections; the strip is a concise orientation summary, not a replacement.
- Ensure long currency values remain legible at 320–430px through compact formatting, tabular numerals, and shrink-safe columns.
- Preserve all calculations, freshness rules, score explainability, relationship semantics, permissions, and navigation.

## Verification
- Review the signed-in Home Profile at 320, 375, 390, and 430px plus desktop.
- Confirm the address remains readable and is never covered by the strip.
- Verify present, partial, and unavailable value/equity/score combinations.
- Check that the strip stays shallow, does not create horizontal overflow, and does not overpower the photo.
- Confirm the remaining sections and mobile navigation retain their current order and behavior.
