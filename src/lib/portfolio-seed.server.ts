// Server-only: 76 real homeowner rows from the original CSV roster export
// (2026-07-27). Used to seed a starter portfolio for the lender and agent
// dashboards. This is a frozen file — not a live provider integration.
import raw from "./data/portfolio-seed.json";

export type SeedHomeowner = {
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
};

export function getSeedHomeowners(): SeedHomeowner[] {
  return raw as SeedHomeowner[];
}
