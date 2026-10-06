import { describe, expect, it } from "vitest";
import { mapAuthError, passwordChecks } from "@/lib/auth";

const failing = (pw: string, email = "jane@x.com") => passwordChecks(pw, email).filter((c) => !c.ok).map((c) => c.id);

describe("password rules", () => {
  it("requires at least 8 characters", () => expect(failing("abc123")).toContain("len"));
  it("requires a letter and a number", () => expect(failing("abcdefgh")).toContain("mix"));
  it("rejects the email name as password", () => expect(failing("jane1234", "jane1234@x.com")).toContain("email"));
  it("accepts a valid password", () => expect(failing("crewcall9")).toEqual([]));
});

describe("auth errors", () => {
  it("hides whether the account exists", () =>
    expect(mapAuthError({ code: "invalid_credentials", message: "Invalid login credentials" }).message).toBe("Email or password is incorrect."));
});
