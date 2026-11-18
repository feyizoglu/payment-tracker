import { describe, it, expect } from "vitest";
import { translationsFor } from "@/lib/i18n";
import { responseErrorText } from "@/lib/api-error";

const res = (body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 409 });

describe("responseErrorText", () => {
  it("shows a known event error in the user's language", async () => {
    expect(await responseErrorText(res({ error: "Event is closed" }), translationsFor("tr"), "x")).toBe(
      translationsFor("tr").eventIsClosed
    );
  });

  it("passes any other message through, and falls back when there is none", async () => {
    const t = translationsFor("en");
    expect(await responseErrorText(res({ error: "Not found" }), t, "fallback")).toBe("Not found");
    expect(await responseErrorText(res("not json"), t, "fallback")).toBe("fallback");
    expect(await responseErrorText(res({ error: 42 }), t, "fallback")).toBe("fallback");
  });
});
