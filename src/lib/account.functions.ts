/**
 * Account settings: the signed-in person's own contact details, their home
 * address (handled as a property change, not a contact change), and their
 * personal privacy export.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Current account state for the settings screen. */
export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const authEmail = (context.claims as { email?: string }).email ?? null;

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name, email, phone, language, address, city, state, zip")
      .eq("id", context.userId)
      .maybeSingle();

    // A person who previously deleted an account and has now created and
    // verified a new one is giving fresh consent. Record that as a NEW consent
    // event and retire the old suppression, rather than letting the deleted
    // account's state silently govern the new one.
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { recordConsentAfterSuppression } = await import("@/lib/suppression.server");
      await recordConsentAfterSuppression(supabaseAdmin, {
        email: authEmail ?? profile?.email ?? null,
        phone: profile?.phone ?? null,
        userId: context.userId,
        source: "new_account_verified",
      });
    }

    // Keep the stored email aligned with the verified sign-in email, which is
    // the only one that ever changes through a confirmation flow. This is also
    // the point at which a confirmed email change is first observed, so the
    // security notification goes to the previous address here.
    if (authEmail && profile && profile.email !== authEmail) {
      const previousEmail = profile.email;
      await context.supabase
        .from("profiles")
        .update({ email: authEmail })
        .eq("id", context.userId);

      const { sendContactChangeAlert, recordAccountEvent } = await import("@/lib/account.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await recordAccountEvent(supabaseAdmin, {
        userId: context.userId,
        action: "email_changed",
        detail: "Email change confirmed; security notification sent to the previous address",
        metadata: { verification: "confirmation_link", notifiedPrevious: Boolean(previousEmail) },
      });
      await sendContactChangeAlert({
        previousEmail,
        changed: "email address",
        language: profile.language,
      });
    }

    const { data: pending } = await context.supabase
      .from("account_change_requests")
      .select("id, kind, new_value, expires_at, attempts")
      .eq("user_id", context.userId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    const roleNames = (roles ?? []).map((r) => r.role as string);

    // "Your home" is the signed-in person's OWN Home Profile. Agents and lenders
    // never reach client, portfolio, or organization-owned property records here.
    const { data: ownHome } = await context.supabase
      .from("home_profiles")
      .select("id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    // Their own home exists when they have a Home Profile record, or a personal
    // home address on their own profile. Role alone is not enough: every account
    // carries the homeowner role at signup.
    const hasOwnHome = Boolean(ownHome) || Boolean(profile?.address);

    const { maskPhone } = await import("@/lib/account.server");

    return {
      authEmail,
      fullName: profile?.full_name ?? "",
      phone: profile?.phone ?? null,
      language: profile?.language ?? "en",
      hasOwnHome,
      home: hasOwnHome
        ? {
            address: profile?.address ?? null,
            city: profile?.city ?? null,
            state: profile?.state ?? null,
            zip: profile?.zip ?? null,
          }
        : { address: null, city: null, state: null, zip: null },
      roles: roleNames,
      pendingPhone: pending
        ? { masked: maskPhone(pending.new_value), expiresAt: pending.expires_at }
        : null,
    };
  });


/** Name and language only — contact details and the home address have their own paths. */
export const updateMyAccountBasics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fullName: z.string().trim().min(1).max(120),
        language: z.enum(["en", "es"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.fullName, language: data.language })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Send a verification code to the NEW number. Nothing changes until it is entered. */
export const requestPhoneChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ phone: z.string().trim().min(7).max(24) }).parse(input))
  .handler(async ({ data, context }) => {
    const {
      normalizePhone,
      maskPhone,
      generateCode,
      hashCode,
      recordAccountEvent,
      CODE_TTL_MINUTES,
      MAX_CODES_PER_HOUR,
    } = await import("@/lib/account.server");

    const e164 = normalizePhone(data.phone);
    if (!e164) return { ok: false as const, error: "That doesn't look like a valid phone number." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("account_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= MAX_CODES_PER_HOUR) {
      return {
        ok: false as const,
        error: "Too many codes requested. Please try again in an hour.",
      };
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    // Supersede any earlier pending request for this account.
    await supabaseAdmin
      .from("account_change_requests")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("consumed_at", null);

    const { error } = await supabaseAdmin.from("account_change_requests").insert({
      user_id: context.userId,
      kind: "phone",
      new_value: e164,
      code_hash: hashCode(code, e164),
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    try {
      const { sendVerificationSms } = await import("@/lib/ghl.server");
      await sendVerificationSms(e164, `Your SuCasa verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`);
    } catch {
      // Nothing was sent, so leave no pending verification behind: the number
      // must not look like it is half-way through being changed.
      await supabaseAdmin
        .from("account_change_requests")
        .update({ consumed_at: new Date().toISOString() })
        .eq("user_id", context.userId)
        .is("consumed_at", null);
      await recordAccountEvent(supabaseAdmin, {
        userId: context.userId,
        action: "phone_change_send_failed",
        detail: "Verification code could not be sent; phone number unchanged",
        metadata: { channel: "sms", masked: maskPhone(e164), delivered: false },
      });
      return {
        ok: false as const,
        error:
          "We couldn't send the verification code. Your phone number has not been changed. Please try again or contact support.",
      };
    }


    await recordAccountEvent(supabaseAdmin, {
      userId: context.userId,
      action: "phone_change_requested",
      detail: `Verification code sent to ${maskPhone(e164)}`,
      metadata: { channel: "sms", masked: maskPhone(e164) },
    });

    return { ok: true as const, masked: maskPhone(e164), expiresAt };
  });

/** Apply the pending phone change once the code from that number is entered. */
export const confirmPhoneChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ code: z.string().trim().regex(/^\d{4,8}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { codeMatches, maskPhone, recordAccountEvent, MAX_CODE_ATTEMPTS } = await import(
      "@/lib/account.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pending } = await supabaseAdmin
      .from("account_change_requests")
      .select("id, new_value, code_hash, attempts, expires_at")
      .eq("user_id", context.userId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pending) {
      return { ok: false as const, error: "That code has expired. Please request a new one." };
    }
    if (pending.attempts >= MAX_CODE_ATTEMPTS) {
      return { ok: false as const, error: "Too many attempts. Please request a new code." };
    }
    if (!codeMatches(data.code, pending.new_value, pending.code_hash)) {
      await supabaseAdmin
        .from("account_change_requests")
        .update({ attempts: pending.attempts + 1 })
        .eq("id", pending.id);
      return { ok: false as const, error: "That code doesn't match. Please try again." };
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ phone: pending.new_value })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("account_change_requests")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", pending.id);

    await recordAccountEvent(supabaseAdmin, {
      userId: context.userId,
      action: "phone_changed",
      detail: `Phone verified and updated (${maskPhone(pending.new_value)})`,
      metadata: {
        channel: "sms",
        verification: "code_sent_to_new_number",
        masked: maskPhone(pending.new_value),
      },
    });

    // Tell the account's email address that contact details changed, without
    // repeating any code or the new number.
    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("email, language")
      .eq("id", context.userId)
      .maybeSingle();
    const { sendContactChangeAlert } = await import("@/lib/account.server");
    await sendContactChangeAlert({
      previousEmail: owner?.email ?? (context.claims as { email?: string }).email ?? null,
      changed: "phone number",
      language: owner?.language ?? null,
    });

    return { ok: true as const, phone: pending.new_value };
  });


/** Abandon a pending phone verification. */
export const cancelPhoneChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("account_change_requests")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("consumed_at", null);
    return { ok: true as const };
  });

/**
 * Change the home this account is about. This is a property change, not a
 * contact detail: it re-derives the whole Home Profile, so it requires an
 * explicit confirmation.
 */
export const updateMyHomeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        street: z.string().trim().min(3).max(160),
        city: z.string().trim().max(80).optional().default(""),
        state: z.string().trim().max(2).optional().default(""),
        zip: z.string().trim().max(10).optional().default(""),
        confirmed: z.literal(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Only the signed-in person's OWN Home Profile. An agent or lender with no
    // homeowner Home Profile of their own cannot use this path at all, so no
    // client, portfolio, or organization-owned property can be altered here.
    const { data: ownHome } = await context.supabase
      .from("home_profiles")
      .select("id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    const { data: ownProfile } = await context.supabase
      .from("profiles")
      .select("address")
      .eq("id", context.userId)
      .maybeSingle();
    if (!ownHome && !ownProfile?.address) {
      return {
        ok: false as const,
        error: "This account doesn't have its own home profile, so there's no home address to change here.",
      };
    }

    if (!((data.city && data.state) || data.zip)) {
      return {
        ok: false as const,
        error: "Please include a city and state, or a ZIP code, so we can match the property.",
      };
    }


    const { data: before } = await context.supabase
      .from("profiles")
      .select("address, city, state, zip")
      .eq("id", context.userId)
      .maybeSingle();

    const { error } = await context.supabase
      .from("profiles")
      .update({
        address: data.street,
        city: data.city || null,
        state: data.state ? data.state.toUpperCase() : null,
        zip: data.zip || null,
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordAccountEvent } = await import("@/lib/account.server");
    await recordAccountEvent(supabaseAdmin, {
      userId: context.userId,
      action: "home_address_changed",
      detail: "Home address changed from account settings with explicit confirmation",
      metadata: {
        changed: true,
        hadPreviousAddress: Boolean(before?.address),
        confirmed: true,
      },
    });

    return { ok: true as const };
  });

/**
 * Personal privacy export. Strictly the requester's own information — never
 * client records an agent or lender organization holds about other people.
 */
export const exportMyPersonalData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { buildPersonalExport, recordAccountEvent } = await import("@/lib/account.server");
    const authEmail = (context.claims as { email?: string }).email ?? null;

    const payload = await buildPersonalExport(context.supabase, context.userId, authEmail);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await recordAccountEvent(supabaseAdmin, {
      userId: context.userId,
      action: "personal_data_exported",
      detail: "Personal privacy export generated and downloaded",
      metadata: {
        tables: Object.keys(payload.data).length,
        documents: payload.documents.length,
        scope: "personal_only",
      },
    });

    return payload;
  });
