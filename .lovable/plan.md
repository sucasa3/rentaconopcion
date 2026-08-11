# Fix: "Create Profile" doesn't actually create an account

## What I found

Neither Sandra Davis nor Jeff Davis exists in the system — no accounts, no profiles. The most recent signups are your own and the test lender/agent accounts.

The reason: the public "Create Profile" flow (`/onboarding`) collects name, email, phone, address, home type and goals, but it never creates a login. It only saves a profile **if someone is already signed in**. For a brand-new visitor it saves nothing, then sends them to the dashboard, which is protected — so they bounce to the sign-in screen. That is exactly the behavior you saw.

## The fix

Turn onboarding into a real signup flow:

1. Add a password step (password + confirm) to the "About you" step, shown only when nobody is signed in.
2. On "Create Profile", create the account first (email + password, full name), then save the home profile to that new account, then continue to the dashboard.
3. If the email already exists, show a clear inline message with a "Sign in instead" link rather than failing silently.
4. Keep the existing behavior for people who are already signed in — no password step, just profile save.
5. Only warm up property data after the session exists (already the case), so no more auth errors.
6. Send new signups to the dashboard once the session is confirmed, so there's no redirect back to sign-in.

## Note on email confirmation

If email confirmation is required, new users can't reach the dashboard until they click a confirmation link. For testing, I'd enable auto-confirm so Sandra and Jeff land in the dashboard immediately; we can switch confirmation back on before launch. Tell me if you'd rather keep confirmation on.

## Also worth doing (say the word)

Create Sandra Davis and Jeff Davis directly as confirmed test homeowners with a shared test password so you can log in as them right away.

## Technical notes

- `src/routes/onboarding.tsx`: add password fields + validation; call `supabase.auth.signUp` with `emailRedirectTo: window.location.origin` and `data.full_name`; on success upsert `profiles` for the returned user id; surface `AuthApiError` messages inline.
- Keep `getMyHomeIntel` prewarm behind the existing session check.
- Auth settings: enable auto-confirm for testing via the auth configuration tool.
