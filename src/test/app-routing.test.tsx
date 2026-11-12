import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it.each([
    ["/auth", "/auth"],
    ["/book", "/book"],
    ["/casting", "/casting"],
    ["/forgot-password", "/forgot-password"],
    ["/join", "/join"],
    ["/locations", "/locations"],
    ["/privacy", "/privacy"],
    ["/rates", "/rates"],
    ["/reset-password", "/reset-password"],
    ["/terms", "/terms"],
    ["/admin", "/_authenticated/admin"],
    ["/calendar", "/_authenticated/calendar"],
    ["/dashboard", "/_authenticated/dashboard"],
    ["/earnings", "/_authenticated/earnings"],
    ["/gigs", "/_authenticated/gigs"],
    ["/invoices", "/_authenticated/invoices"],
    ["/invoices/test-invoice", "/_authenticated/invoices/$id"],
    ["/memory", "/_authenticated/memory"],
    ["/mobile-setup", "/_authenticated/mobile-setup"],
    ["/payments", "/_authenticated/payments"],
    ["/profile", "/_authenticated/profile"],
    ["/reports", "/_authenticated/reports"],
    ["/crew", "/_authenticated/crew/"],
    ["/crew/test-crew", "/_authenticated/crew/$id"],
    ["/productions", "/_authenticated/productions/"],
    ["/productions/test-production", "/_authenticated/productions/$id"],
  ])("matches %s to its intended screen", (path, routeId) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes(path);
    expect(matches.at(-1)?.routeId).toBe(routeId);
    if (routeId.startsWith("/_authenticated/")) {
      expect(matches.some((match) => match.routeId === "/_authenticated")).toBe(true);
    }
  });
});
