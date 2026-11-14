import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DateInput } from "@/components/ui/date-input";
afterEach(cleanup);
function Form(){const [value,setValue]=useState("2026-11-13");return <><DateInput aria-label="Shoot date" value={value} min="2026-11-10" max="2026-11-20" onChange={e=>setValue(e.target.value)}/><output>{value}</output></>;}
describe("shared date input",()=>{
 it("allows direct entry without opening a calendar",()=>{render(<Form/>);fireEvent.change(screen.getByLabelText("Shoot date"),{target:{value:"2026-11-15"}});expect(screen.getByRole("status")).toHaveTextContent("2026-11-15");});
 it("updates the controlled value from the calendar and honors date bounds",()=>{render(<Form/>);fireEvent.click(screen.getByRole("button",{name:"Open calendar"}));expect(screen.getByRole("button",{name:/November 9th, 2026/})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:/November 14th, 2026/}));expect(screen.getByRole("status")).toHaveTextContent("2026-11-14");});
});
