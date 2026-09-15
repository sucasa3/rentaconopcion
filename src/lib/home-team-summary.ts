export type HomeTeamMemberState = "confirmed" | "pending";

export interface HomeTeamMemberSummary {
  relationshipId: string;
  professionalId: string | null;
  displayName: string;
  organizationName: string | null;
  role: "agent" | "lender";
  state: HomeTeamMemberState;
}

export interface HomeTeamSummary {
  agent: HomeTeamMemberSummary | null;
  lender: HomeTeamMemberSummary | null;
}

/** Privacy-safe name for the homeowner surface: first name + last initial. */
export function homeownerProfessionalName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "Home professional";
  return `${parts[0]} ${parts.at(-1)?.charAt(0).toUpperCase()}.`;
}