import { describe, it, expect } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  it("describes an installable standalone app that opens on the dashboard", () => {
    const m = manifest();
    expect(m).toMatchObject({
      name: "PayTrack",
      short_name: "PayTrack",
      start_url: "/dashboard",
      display: "standalone",
      theme_color: "#2563EB",
      background_color: "#ffffff",
    });
  });

  it("lists 192 and 512 PNG icons plus a maskable 512", () => {
    expect(manifest().icons).toEqual([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
  });
});
