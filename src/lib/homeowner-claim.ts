// Pure helpers for the homeowner claim flow (shared by server and tests).

export function claimMessages(i: { firstName: string; agentName: string; address: string | null; url: string }) {
  const hi = i.firstName ? ` ${i.firstName}` : "";
  const who = i.agentName || "";
  const home = i.address ? ` for ${i.address}` : "";
  const casa = i.address ? ` de ${i.address}` : "";
  return {
    en: `Hi${hi}${who ? `, it's ${who}` : ""}. I set up a free SuCasa Home Record${home} so you can track your home's value and upkeep. Claim it here (link is just for you, expires in 14 days): ${i.url}`,
    es: `Hola${hi}${who ? `, soy ${who}` : ""}. Preparé un Registro de Hogar gratuito en SuCasa${casa} para que puedas seguir el valor y el mantenimiento de tu casa. Reclámalo aquí (el enlace es solo para ti y vence en 14 días): ${i.url}`,
  };
}

export type ClaimRow = {
  created_at: string; link_copied_at: string | null; expires_at: string; revoked_at: string | null;
  claimed_at: string | null; home_confirmed_at: string | null; home_corrected: boolean;
  connection_outcome: string | null; activated_at: string | null;
} | null;

/** Agent-facing status. Copying a link is never reported as "sent". */
export function claimStatus(r: ClaimRow, now = Date.now()) {
  if (!r) return { state: "none" as const, connection: null, activated: false, homeCorrected: false };
  const expired = !r.claimed_at && new Date(r.expires_at).getTime() < now;
  const state = r.claimed_at ? "claimed" : r.revoked_at ? "replaced" : expired ? "expired" : "link_copied";
  return {
    state: state as "claimed" | "replaced" | "expired" | "link_copied",
    connection: (r.connection_outcome ?? null) as "accepted" | "declined" | "conflict" | null,
    activated: Boolean(r.claimed_at && r.home_confirmed_at && r.activated_at),
    homeCorrected: r.home_corrected,
    copiedAt: r.link_copied_at,
    claimedAt: r.claimed_at,
  };
}
