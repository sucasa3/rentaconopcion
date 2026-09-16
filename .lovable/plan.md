# Add guidance to recurring Home Care tasks

## What will change

- Add a **How to handle this** button to each recurring/seasonal maintenance row in the Home Care list.
- Open the existing compact guidance pop-up for that specific task, showing:
  - why the task matters,
  - clear step-by-step instructions,
  - what is reasonable to do yourself versus when to use a professional,
  - the existing typical-cost guidance,
  - a request-service action when applicable.
- Keep **I did this** as a separate action so reading guidance never marks a task complete.
- Use the existing English and Spanish task guidance; do not invent property facts or change maintenance schedules, completion records, costs, permissions, or service-request behavior.

## Presentation

- Keep each maintenance row compact and mobile-friendly.
- Use the existing book icon and secondary button treatment so **How to handle this** is useful without competing with completion or service actions.
- Show the button only when guidance exists for that task.

## Technical details

- Reuse the shared DIY guide resolver and dialog already used by the suggested-step and home-plan experiences.
- Pass each recurring task's canonical `seasonal:<task>` key so the correct task-specific explanation opens.
- Move remaining visible dialog/button wording into the existing bilingual labels where needed.

## Verification

- Check every recurring task opens the matching explanation and closes cleanly.
- Confirm **I did this** still saves independently and request-service links retain the correct category.
- Verify English and Spanish at 320, 375, 390, and 430px plus desktop, with no overflow or console errors.
- Run the existing type and automated test suites.
