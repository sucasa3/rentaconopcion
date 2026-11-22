import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/business.functions", () => ({ getBusinessOverview: vi.fn() }));
vi.mock("@/components/account-menu", () => ({ AccountMenu: () => null, MobileTopBar: () => null }));
vi.mock("@/components/post-call-return-prompt", () => ({ PostCallReturnPrompt: () => null }));

import { resolveNavigationBook } from "./business-shell";

const books = [{ id: "agency" }, { id: "personal" }];

describe("workspace navigation book", () => {
  it("keeps an assigned agent's personal book ahead of a route book", () => {
    expect(resolveNavigationBook("agent", { books, personalBookId: "personal", isManager: true }, "agency")).toBe("personal");
  });
  it.each(["manager", "owner"])("gives a %s without a personal book an accessible agency book", () => {
    expect(resolveNavigationBook("agent", { books, personalBookId: null, isManager: true })).toBe("agency");
  });
  it("honors an accessible route fallback before the first agency book", () => {
    expect(resolveNavigationBook("agent", { books, personalBookId: null, isManager: true }, "personal")).toBe("personal");
  });
  it("rejects a route fallback outside the workspace", () => {
    expect(resolveNavigationBook("agent", { books, personalBookId: null, isManager: true }, "foreign")).toBe("agency");
    expect(resolveNavigationBook("agent", { books, personalBookId: null, isManager: false }, "foreign")).toBeNull();
  });
  it("does not invent a manager book for an unassigned ordinary agent", () => {
    expect(resolveNavigationBook("agent", { books, personalBookId: null, isManager: false })).toBeNull();
  });
  it("does not trust route props before the workspace is loaded", () => {
    expect(resolveNavigationBook("agent", undefined, "foreign")).toBeNull();
  });
  it("preserves lender personal-book priority and validated route fallback", () => {
    expect(resolveNavigationBook("lender", { books, personalBookId: "personal", isManager: true }, "agency")).toBe("personal");
    expect(resolveNavigationBook("lender", { books, personalBookId: null, isManager: true }, "agency")).toBe("agency");
    expect(resolveNavigationBook("lender", { books, personalBookId: null, isManager: true }, "foreign")).toBeNull();
  });
  it("handles a workspace with no accessible books", () => {
    expect(resolveNavigationBook("agent", { books: [], personalBookId: null, isManager: true }, "foreign")).toBeNull();
  });
});