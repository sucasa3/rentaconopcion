
## Goal

Make `neilterc@hotmail.com` (Neil Terc, 678-485-3054) a single sign-in that can browse SuCasa as a homeowner, a pro, and a lender — then land on a fully-populated lender dashboard.

## Steps

1. **Create / reuse the auth user** (`supabase--insert`)
   - If `neilterc@hotmail.com` doesn't exist in `auth.users`, create it via `auth.admin` (email confirmed, password we set — e.g. a temporary one shown to Neil once). If it exists, reuse the id.
   - Upsert `public.profiles` with full_name "Neil Terc", phone "678-485-3054", email, and the Stone Mountain test address (`2138 Gunstock Dr, Stone Mountain, GA 30087`) so the homeowner dashboard renders real ATTOM data.

2. **Grant all three roles** in `public.user_roles`
   - Insert rows for `homeowner`, `pro`, `lender` (ON CONFLICT DO NOTHING). Admin panel + role-gated UIs then all light up for the same login.

3. **Seed the pro side**
   - Insert a `public.pros` row owned by Neil (business_name "Neil Terc — Test Pro", category "general", founding partner pricing, accepting_leads true) plus a couple of `pro_coverage` rows for Atlanta metro zips so the pro inbox has context.

4. **Seed the lender side**
   - Ensure the "SuCasa Demo Lender" org exists; add Neil as an `owner` in `lender_members`.
   - Create a portfolio "Neil's Test Book" and run the existing 250-client demo seeder against it so the dashboard has segments, refi opportunities, and paginated clients ready.
   - Also attach him to the "Fello Import · 76 Homeowners" portfolio if present.

5. **Deliver credentials + entry points**
   - Return the temp password once in chat.
   - Nav targets after sign-in: `/dashboard` (homeowner), `/pro` (pro), `/lender` → click into "Neil's Test Book" (lender). No new routes needed — existing role-gated pages already handle all three.

## Technical notes

- All work is data-only (`supabase--insert` + one call to the existing `seedDemoPortfolio` logic replicated inline as SQL/insert calls). No schema migration, no code changes.
- `handle_new_user` trigger auto-creates a `homeowner` role row; we add `pro` and `lender` on top.
- Address fields on `profiles` will trigger `tg_refresh_lifecycle_stage` → `active_homeowner` once a service request exists; optional to insert one demo `service_requests` row so the homeowner dashboard shows activity.
- No RLS changes — Neil's `admin`-adjacent visibility comes only from having the three roles, not from bypassing policies.

## Open question

Do you want me to also grant the `admin` role so you can see the Admin dashboard with the same login, or keep admin separate?
