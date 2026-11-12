import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(), update: vi.fn(), navigate: vi.fn(), error: vi.fn(),
  production: { id: "existing", name: "Shoot", client: "Client", type: "Film", location: "Nicosia", date: "2026-11-12", endDate: "2026-11-12", budget: 100, days: 1, status: "Draft", currency: "EUR" },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: mocks.insert, update: mocks.update }) } }));
vi.mock("@/lib/db", () => ({ useProductions: () => ({ data: [mocks.production] }), useProductionTypes: () => ({ data: ["Film"] }), useCreateProductionType: () => ({}) }));
vi.mock("@/lib/auth", () => ({ useSession: () => ({ session: { user: { id: "producer" } } }), useRole: () => ({ data: "producer" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/components/AppShell", () => ({
  Page: ({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) => <div>{actions}{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Badge: () => null, ClientBadge: () => null,
}));
vi.mock("@/lib/site", () => ({ useSignedUrl: () => ({}), uploadFile: vi.fn() }));
vi.mock("@/components/site/ProductionCover", () => ({ ProductionAvatar: () => null }));
vi.mock("@/components/site/PolishDescription", () => ({ PolishDescription: () => null }));
vi.mock("@/components/site/ImageCropDialog", () => ({ ImageCropDialog: () => null }));
vi.mock("@/components/site/SiteTabs", () => ({ AmPmTimePicker: () => null }));
vi.mock("@/components/ConfirmDialog", () => ({ confirmDialog: vi.fn() }));
import { Route } from "@/routes/_authenticated/productions.index";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const renderPage = () => {
  const Component = Route.options.component as React.ComponentType;
  return render(<Component />);
};

describe("explicit production saves", () => {
  it("opens Upcoming by default and makes drafts accessible through All", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "productionViews.Upcoming" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByLabelText("Edit Shoot")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "productionViews.All" }));
    expect(screen.getAllByLabelText("Edit Shoot").length).toBeGreaterThan(0);
  });
  it("does not insert when opening or cancelling creation, and still validates submission", () => {
    renderPage();
    fireEvent.click(screen.getByText(/\+ dashboard.newProduction/));
    expect(mocks.insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("productionModal.createDraft"));
    expect(mocks.error).toHaveBeenCalledWith("Client is required");
    expect(mocks.insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("common.cancel"));
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("inserts a duplicate only after its explicit save", async () => {
    mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "copy" }, error: null }) }) });
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "productionViews.All" }));
    fireEvent.click(screen.getAllByLabelText("Duplicate Shoot")[0]!);
    expect(mocks.insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("productionModal.createDraft"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "Shoot (copy)", status: "Draft", budget: 100 }));
  });

  it("keeps edits on the update path and preserves the existing status", async () => {
    const eq = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: "existing" }, error: null }) }) }));
    mocks.update.mockReturnValue({ eq });
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "productionViews.All" }));
    fireEvent.click(screen.getAllByLabelText("Edit Shoot")[0]!);
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("productionModal.saveChanges"));
    await waitFor(() => expect(eq).toHaveBeenCalledWith("id", "existing"));
    expect(mocks.update.mock.calls[0]![0]).not.toHaveProperty("status");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
