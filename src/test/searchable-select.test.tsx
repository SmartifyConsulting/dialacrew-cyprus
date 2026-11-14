import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function mobile(matches:boolean){vi.spyOn(window,"matchMedia").mockReturnValue({matches,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as MediaQueryList);}
function Form(){const [value,setValue]=useState("");return <><SearchableSelect aria-label="Department" required value={value} onChange={e=>setValue(e.target.value)}><option value="">Choose department</option><option value="camera">Camera</option><option value="sound" disabled>Sound</option><optgroup label="Production"><option value="wardrobe">Wardrobe</option></optgroup></SearchableSelect><output>{value}</output></>;}
describe("searchable mobile choices",()=>{
 it("preserves the normal select on desktop",()=>{mobile(false);render(<Form/>);expect(screen.getByRole("combobox")).toBeInstanceOf(HTMLSelectElement);});
 it("filters by typing and updates the underlying controlled form value",async()=>{mobile(true);render(<Form/>);const input=screen.getByRole("combobox");expect(input).toBeInstanceOf(HTMLInputElement);fireEvent.focus(input);fireEvent.change(input,{target:{value:"ward"}});expect(screen.queryByRole("option",{name:"Camera"})).not.toBeInTheDocument();fireEvent.click(screen.getByRole("option",{name:"Wardrobe"}));await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("wardrobe"));});
 it("respects disabled options and shows an empty result",()=>{mobile(true);render(<Form/>);const input=screen.getByRole("combobox");fireEvent.focus(input);fireEvent.change(input,{target:{value:"sound"}});expect(screen.getByRole("option",{name:"Sound"})).toBeDisabled();fireEvent.change(input,{target:{value:"unknown"}});expect(screen.getByText("No matching choices")).toBeInTheDocument();});
});
