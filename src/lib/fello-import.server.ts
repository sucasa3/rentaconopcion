// Server-only: 76 real homeowners imported from Fello Expired Seller export
// (2026-07-27). Used to seed a "Fello Import · 76 Homeowners" portfolio for
// testing the lender dashboard and downstream reports.
import raw from "./data/fello-homeowners.json";

export type FelloHomeowner = {
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
};

export function getFelloHomeowners(): FelloHomeowner[] {
  return raw as FelloHomeowner[];
}
