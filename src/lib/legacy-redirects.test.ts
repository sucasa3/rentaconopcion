import { describe, expect, it } from "vitest";
import { resolveLegacyRedirect } from "./legacy-redirects";

const at = (url: string) => resolveLegacyRedirect(url);

describe("legacy redirects", () => {
  it("is inert on the current Lovable hosts", () => {
    expect(at("https://rentaconopcion.lovable.app/neighborhood/foo")).toBeNull();
    expect(at("http://localhost:8080/listing?key=abc")).toBeNull();
  });

  it("sends www to the apex preserving path and query", () => {
    expect(at("https://www.sucasa.com/blog/post-a?utm_source=x")).toEqual({
      status: 301,
      location: "https://sucasa.com/blog/post-a?utm_source=x",
    });
  });

  it("redirects wildcard IDX families to the identical path on the IDX host", () => {
    for (const path of [
      "/available-homes",
      "/listing",
      "/listing-detail/1176284951/3505-Benson-LN-North-Las-Vegas-NV",
      "/neighborhood/druid-hills",
      "/neighborhoods/atlanta",
    ]) {
      expect(at(`https://sucasa.com${path}`)).toEqual({
        status: 301,
        location: `https://homes.sucasa.com${path}`,
      });
    }
  });

  it("preserves query strings on search URLs", () => {
    const q = "?key=%20330%20McGill%20Place&keywordType=neighborhood&page=2";
    expect(at(`https://sucasa.com/listing${q}`)?.location).toBe(
      `https://homes.sucasa.com/listing${q}`,
    );
  });

  it("keeps bare /agents but moves deep agent pages", () => {
    expect(at("https://sucasa.com/agents")).toBeNull();
    expect(at("https://sucasa.com/agents/SuCasa-Real-Estate-Team-Team/8351857")?.location).toBe(
      "https://homes.sucasa.com/agents/SuCasa-Real-Estate-Team-Team/8351857",
    );
  });

  it("moves state/city IDX geography, including commas", () => {
    expect(at("https://sucasa.com/IL/Rock-Falls")?.location).toBe(
      "https://homes.sucasa.com/IL/Rock-Falls",
    );
    expect(at("https://sucasa.com/FL/Naples,Naples")?.location).toBe(
      "https://homes.sucasa.com/FL/Naples,Naples",
    );
    expect(at("https://sucasa.com/AZ/Village-At-Litchfield-Park,Litchfield-Park")?.location).toBe(
      "https://homes.sucasa.com/AZ/Village-At-Litchfield-Park,Litchfield-Park",
    );
  });

  it("does not treat a two-letter path without a city segment as IDX", () => {
    expect(at("https://sucasa.com/CA")).toBeNull();
  });

  it("moves named market and single-property pages", () => {
    expect(at("https://sucasa.com/metro-atlanta")?.location).toBe(
      "https://homes.sucasa.com/metro-atlanta",
    );
    expect(at("https://sucasa.com/1290-shallowford-rd")?.location).toBe(
      "https://homes.sucasa.com/1290-shallowford-rd",
    );
  });

  it("redirects superseded funnels to their live replacements", () => {
    expect(at("https://sucasa.com/precalificacion")?.location).toBe(
      "https://sucasa.com/preaprobacion",
    );
    expect(at("https://sucasa.com/cita")?.location).toBe("https://sucasa.com/onboarding");
    expect(at("https://sucasa.com/fb-live")?.location).toBe("https://sucasa.com/onboarding");
  });

  it("serves platform paths itself instead of redirecting", () => {
    for (const path of ["/", "/blog", "/blog/como-saber-si-puedo-costear-una-casa", "/dashboard", "/professional-invite", "/sell", "/evaluation"]) {
      expect(at(`https://sucasa.com${path}`)).toBeNull();
    }
  });

  it("never redirects infrastructure paths", () => {
    expect(at("https://sucasa.com/api/public/webhooks/stripe")).toBeNull();
    expect(at("https://sucasa.com/robots.txt")).toBeNull();
    expect(at("https://sucasa.com/sitemap.xml")).toBeNull();
  });

  it("lets unknown paths 404 rather than redirecting to the homepage", () => {
    expect(at("https://sucasa.com/new-page2")).toBeNull();
    expect(at("https://sucasa.com/whatever-unknown")).toBeNull();
  });

  it("normalizes a trailing slash", () => {
    expect(at("https://sucasa.com/neighborhood/druid-hills/")?.location).toBe(
      "https://homes.sucasa.com/neighborhood/druid-hills",
    );
  });
});
