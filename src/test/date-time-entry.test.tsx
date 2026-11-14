import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { TimeInput, DateTimeInput } from "@/components/ui/time-input";
import { DateInput } from "@/components/ui/date-input";
import { displayDate, parseDateEntry, parseTimeEntry } from "@/lib/date-time-entry";
afterEach(cleanup);
function Form() {
  const [time, setTime] = useState("20:15");
  const [date, setDate] = useState("2026-11-14");
  return (
    <form aria-label="Schedule">
      <DateInput
        name="date"
        aria-label="Date"
        value={date}
        min="2026-11-10"
        max="2026-11-20"
        onChange={(e) => setDate(e.target.value)}
      />
      <TimeInput
        name="time"
        aria-label="Time"
        required
        value={time}
        onChange={(e) => setTime(e.target.value)}
      />
    </form>
  );
}
describe("Outlook-style date and time entry", () => {
  it("normalizes supported entries without accepting impossible dates or times", () => {
    expect(parseDateEntry("14-Nov-26")).toBe("2026-11-14");
    expect(parseDateEntry("14-Νοε-26")).toBe("2026-11-14");
    expect(displayDate("2026-11-14", "el")).toBe("14-Νοε-26");
    expect(parseDateEntry("31-Feb-26")).toBeNull();
    expect(parseDateEntry("14-Nov-2")).toBeNull();
    expect(parseTimeEntry("8:30 PM")).toBe("20:30");
    expect(parseTimeEntry("12:00 AM")).toBe("00:00");
    expect(parseTimeEntry("12:00 PM")).toBe("12:00");
    expect(parseTimeEntry("23:17")).toBe("23:17");
    expect(parseTimeEntry("13:00 PM")).toBeNull();
    expect(parseTimeEntry("8:60 PM")).toBeNull();
  });
  it("shows readable values but submits ISO dates and 24-hour precise times", () => {
    render(<Form />);
    expect(screen.getByLabelText("Date")).toHaveValue("14-Nov-26");
    expect(screen.getByRole("combobox")).toHaveValue("8:15 PM");
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "9:17 PM" } });
    fireEvent.blur(screen.getByLabelText("Time"));
    const data = new FormData(screen.getByRole("form") as HTMLFormElement);
    expect(data.get("time")).toBe("21:17");
    expect(data.get("date")).toBe("2026-11-14");
  });
  it("provides half-hour choices plus a saved off-grid time and supports keyboard selection", () => {
    render(<Form />);
    fireEvent.click(screen.getByRole("button", { name: "Show times for Time" }));
    expect(screen.getByRole("option", { name: "8:15 PM" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "8:30 PM" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(screen.getByRole("combobox")).toHaveValue("8:30 PM");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("blocks invalid or out-of-range entries and allows correction through the calendar", () => {
    render(<Form />);
    const date = screen.getByLabelText("Date");
    fireEvent.change(date, { target: { value: "31-Feb-26" } });
    expect(date).toBeInvalid();
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    fireEvent.click(screen.getByRole("button", { name: /November 15th, 2026/ }));
    expect(date).toBeValid();
    fireEvent.change(date, { target: { value: "21-Nov-26" } });
    expect(date).toBeInvalid();
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "25:00" } });
    expect(screen.getByLabelText("Time")).toBeInvalid();
  });
  it("combines separate date and time edits into a local ISO datetime", () => {
    function Example() {
      const [value, setValue] = useState("");
      return (
        <form aria-label="Expiry">
          <DateTimeInput
            required
            name="expires"
            aria-label="Expires"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <output>{value}</output>
        </form>
      );
    }
    render(<Example />);
    fireEvent.change(screen.getByLabelText("Expires date"), { target: { value: "14-Nov-26" } });
    fireEvent.change(screen.getByLabelText("Expires time"), { target: { value: "8:30 PM" } });
    expect(screen.getByRole("status")).toHaveTextContent("2026-11-14T20:30");
    expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("expires")).toBe(
      "2026-11-14T20:30",
    );
  });
});
