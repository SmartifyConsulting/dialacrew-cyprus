import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ detail: false }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useMatch: () => (mocks.detail ? { id: "test-invoice" } : undefined),
  Outlet: () => <div>Invoice detail outlet</div>,
}));
vi.mock("@/components/AppShell", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Badge: () => null,
}));
vi.mock("@/components/CrewInvoiceSettings", () => ({
  CrewInvoiceSettings: () => <div>Invoice settings</div>,
}));
vi.mock("@/lib/site", () => ({ useMyCrewId: () => ({ data: undefined }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "el" } }),
}));

import { Route } from "@/routes/_authenticated/invoices";

afterEach(cleanup);
describe("invoice navigation", () => {
  it.each([false, true])(
    "renders the list or detail according to the matched route: %s",
    (detail) => {
      mocks.detail = detail;
      const Component = Route.options.component as React.ComponentType;
      const client = new QueryClient();
      const { unmount } = render(
        <QueryClientProvider client={client}>
          <Component />
        </QueryClientProvider>,
      );
      if (detail) {
        expect(screen.getByText("Invoice detail outlet")).toBeInTheDocument();
        expect(screen.queryByText("Invoice settings")).not.toBeInTheDocument();
      } else {
        expect(screen.getByText("Invoice settings")).toBeInTheDocument();
        expect(screen.queryByText("Invoice detail outlet")).not.toBeInTheDocument();
      }
      unmount();
      client.clear();
    },
  );
});
