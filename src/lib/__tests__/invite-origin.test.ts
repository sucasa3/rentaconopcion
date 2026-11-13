import { describe, it, expect } from "vitest";
import { resolveInviteOrigin } from "../invite-origin";
const C = "https://sucasa.com";
const P = "https://id-preview--94429f0c-1687-4b34-81a7-6195279589c3.lovable.app";
describe("invite origin", () => {
  it("hosted preview uses the project's preview origin, not internal localhost", () => {
    expect(resolveInviteOrigin("http://localhost:8080/_serverFn/x", P, C)).toBe(P);
    expect(resolveInviteOrigin("http://localhost:8080/x", "https://id-preview-6--94429f0c-1687-4b34-81a7-6195279589c3.lovable.app", C)).not.toBe(C);
  });
  it("production and untrusted hosts get the canonical origin", () => {
    expect(resolveInviteOrigin("https://sucasa.com/x", "https://sucasa.com", C)).toBe(C);
    expect(resolveInviteOrigin("http://localhost:8080/x", "https://id-preview--other-project.lovable.app", C)).toBe(C);
    expect(resolveInviteOrigin("http://localhost:8080/x", "https://evil.com", C)).toBe(C);
    expect(resolveInviteOrigin("https://sucasa.com/x", "http://localhost:8080", C)).toBe(C);
    expect(resolveInviteOrigin("https://sucasa.com/x", undefined, C)).toBe(C);
  });
});
