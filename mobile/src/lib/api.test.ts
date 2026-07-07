import { describe, it, expect, vi } from "vitest";
import { createApiClient, ApiError } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createApiClient", () => {
  it("attaches a Bearer token and parses JSON on GET", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ id: "p1" }]));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => "tok-123",
      fetchImpl,
    });
    const data = await client.get<Array<{ id: string }>>("/api/payments");
    expect(data).toEqual([{ id: "p1" }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/payments");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok-123");
  });

  it("omits the Authorization header when there is no token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl,
    });
    await client.get("/api/payments");
    const init = fetchImpl.mock.calls[0][1];
    expect(new Headers(init.headers).get("authorization")).toBeNull();
  });

  it("serializes the body and sets content-type on POST", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ token: "t" }));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl,
    });
    await client.post("/api/auth/mobile", { id_token: "g" });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ id_token: "g" }));
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("calls onUnauthorized and throws ApiError(401) on a 401", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => "expired",
      onUnauthorized,
      fetchImpl,
    });
    await expect(client.get("/api/payments")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("extracts the { error } message from a non-ok JSON response (real API shape)", async () => {
    // This backend always returns errors as `{ error: "..." }` JSON.
    const onUnauthorized = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "Forbidden" }, 403));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => "t",
      onUnauthorized,
      fetchImpl,
    });
    await expect(client.get("/api/payments")).rejects.toMatchObject({
      status: 403,
      message: "Forbidden",
    });
    // onUnauthorized must fire ONLY on 401, never on other error statuses.
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("falls back to the raw body when a non-ok response is not JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl,
    });
    await expect(client.get("/api/payments")).rejects.toMatchObject({
      status: 500,
      message: "boom",
    });
  });

  it("serializes the body on PATCH", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl,
    });
    await client.patch("/api/payments/p1", { paid: true });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ paid: true }));
  });

  it("returns undefined for a 204 No Content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl,
    });
    await expect(client.del("/api/payments/p1")).resolves.toBeUndefined();
  });
});
