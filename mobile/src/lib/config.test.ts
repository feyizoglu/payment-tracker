import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("config", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.example.com";
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = "web-client-id";
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("exposes API_URL without a trailing slash", async () => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.example.com/";
    const { getApiUrl } = await import("./config");
    expect(getApiUrl()).toBe("https://api.example.com");
  });

  it("throws a clear error when EXPO_PUBLIC_API_URL is missing", async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    const { getApiUrl } = await import("./config");
    expect(() => getApiUrl()).toThrow("EXPO_PUBLIC_API_URL");
  });

  it("exposes the Google client id", async () => {
    const { getGoogleClientId } = await import("./config");
    expect(getGoogleClientId()).toBe("web-client-id");
  });
});
