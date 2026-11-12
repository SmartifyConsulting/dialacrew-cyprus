import { describe, it, expect } from "vitest";
import { validationFieldName } from "@/lib/form-validation";
describe("validation field names", () => {
  it("uses a readable label without concatenating dropdown options", () => {
    const label = document.createElement("label");
    label.innerHTML = 'Department *<select><option>Camera</option><option>Sound</option></select>';
    expect(validationFieldName(label.querySelector("select")!)).toBe("Department");
  });
  it("prefers the accessible field name", () => {
    const field = document.createElement("input");
    field.setAttribute("aria-label", "Contact phone");
    expect(validationFieldName(field)).toBe("Contact phone");
  });
  it("falls back to the placeholder for an unlabelled control", () => {
    const field = document.createElement("input"); field.placeholder = "Production name";
    expect(validationFieldName(field)).toBe("Production name");
  });
});
