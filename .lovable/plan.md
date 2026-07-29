## Problem

The Home Assistant card renders a fixed 320px `Conversation` area with an empty-state (icon + "Ask anything about your home" + description) even before any messages exist. That's the "big box" — it takes up the space the original card used for the three suggestion buttons stacked full-width.

## Fix (single file: `src/components/home-assistant-card.tsx`)

Match the original layout's proportions:

1. When `messages.length === 0` and not submitting:
   - Do NOT render the tall `Conversation` container / empty state.
   - Show the three suggestion prompts as full-width stacked buttons (like the original), each with the hover style, occupying the same vertical space the old card used.
2. Once the first message is sent (or while `submitted`):
   - Mount the `Conversation` area at a comfortable height (~320px) so the transcript + thinking shimmer render properly and auto-scroll works.
   - Hide the suggestion chips.
3. Keep the `PromptInput` (textarea + submit) pinned at the bottom in both states so the composer is always visible and focused.
4. Keep the "Beta" badge and header unchanged.

No backend / server function changes. No other files touched.
