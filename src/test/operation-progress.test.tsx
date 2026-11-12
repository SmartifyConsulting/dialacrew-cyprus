import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OperationProgress } from "@/components/site/OperationProgress";
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("shows continuing estimated work without claiming completion before the provider confirms", () => {
  vi.useFakeTimers();
  render(<OperationProgress label="Generating" />);
  const first = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
  act(() => { vi.advanceTimersByTime(120000); });
  const later = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
  expect(later).toBeGreaterThan(first);
  expect(later).toBeLessThan(100);
  expect(screen.getByText(/estimated progress/)).toBeInTheDocument();
});
it("keeps the finished count visible while estimating work on the next panel", () => {
  render(<OperationProgress label="Panels" completed={2} total={4} />);
  expect(screen.getByText(/2 \/ 4 finished/)).toBeInTheDocument();
  expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeLessThan(75);
});
