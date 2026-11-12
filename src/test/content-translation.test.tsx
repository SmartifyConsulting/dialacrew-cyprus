import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/i18n";
import { AutoTranslatedText } from "@/components/AutoTranslatedText";

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string }; access_token: string } | null,
  translate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useSession: () => ({ session: mocks.session }) }));
vi.mock("@/lib/translation.functions", () => ({ translateContent: mocks.translate }));

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});
beforeEach(() => {
  mocks.session = { user: { id: "test-crew" }, access_token: "test-token" };
  mocks.translate.mockReset().mockResolvedValue("Καλημέρα");
});

async function mount(text = "Good morning") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const i18n = createAppI18n();
  await i18n.changeLanguage("el");
  const view = () => (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AutoTranslatedText text={text} />
      </I18nextProvider>
    </QueryClientProvider>
  );
  return { ...render(view()), view, client, i18n };
}

describe("content translation workflow (mocked service)", () => {
  it("keeps the original visible while loading, then toggles without another request", async () => {
    let resolve!: (value: string) => void;
    mocks.translate.mockReturnValueOnce(
      new Promise<string>((done) => {
        resolve = done;
      }),
    );
    const { i18n } = await mount();
    expect(screen.getByText("Good morning")).toBeInTheDocument();
    await act(async () => {
      resolve("Καλημέρα");
    });
    expect(await screen.findByText("Καλημέρα")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("content.showOriginal") }));
    expect(screen.getByText("Good morning")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("content.showTranslation") }));
    expect(screen.getByText("Καλημέρα")).toBeInTheDocument();
    expect(mocks.translate).toHaveBeenCalledTimes(1);
    expect(mocks.translate).toHaveBeenCalledWith({
      data: { text: "Good morning", language: "el" },
      headers: { Authorization: "Bearer test-token" },
    });
  });

  it("keeps the original on service failure without an automatic retry loop", async () => {
    mocks.translate.mockRejectedValue(new Error("Test provider failure"));
    const { i18n } = await mount();
    expect(await screen.findByText(i18n.t("content.unavailable"))).toBeInTheDocument();
    expect(screen.getByText("Good morning")).toBeInTheDocument();
    expect(mocks.translate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([null, { user: { id: "test-crew" }, access_token: "test-token" }])(
    "skips unsigned-in or blank content",
    async (session) => {
      mocks.session = session;
      await mount(session ? "   " : "Good morning");
      expect(mocks.translate).not.toHaveBeenCalled();
    },
  );

  it("reuses cached text but isolates translations between accounts and languages", async () => {
    const { rerender, view, i18n } = await mount();
    await screen.findByText("Καλημέρα");
    rerender(view());
    expect(mocks.translate).toHaveBeenCalledTimes(1);
    mocks.session = { user: { id: "another-crew" }, access_token: "another-token" };
    mocks.translate.mockResolvedValue("Δεύτερη μετάφραση");
    rerender(view());
    expect(await screen.findByText("Δεύτερη μετάφραση")).toBeInTheDocument();
    expect(mocks.translate).toHaveBeenCalledTimes(2);
    mocks.translate.mockResolvedValue("Bonjour");
    await act(async () => {
      await i18n.changeLanguage("fr");
    });
    expect(await screen.findByText("Bonjour")).toBeInTheDocument();
    await waitFor(() => expect(mocks.translate).toHaveBeenCalledTimes(3));
  });
});
