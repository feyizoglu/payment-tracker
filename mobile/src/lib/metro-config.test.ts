import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";
import path from "path";

const mobileRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(mobileRoot, "..");
const config = createRequire(__filename)(path.join(mobileRoot, "metro.config.js"));

function resolveFromShared(moduleName: string) {
  const spy = vi.fn(() => ({ type: "sourceFile", filePath: "/resolved/index.js" }));
  const context = {
    originModulePath: path.join(repoRoot, "shared", "i18n", "index.ts"),
    resolveRequest: spy,
  };
  config.resolver.resolveRequest(context, moduleName, "android");
  return spy;
}

describe("metro resolveRequest", () => {
  it("resolves react imported from shared/ as if it came from the mobile project", () => {
    const spy = resolveFromShared("react");
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ originModulePath: path.join(mobileRoot, "package.json") }),
      "react",
      "android",
    );
  });

  it("resolves a package subpath imported from shared/ from the mobile project", () => {
    const spy = resolveFromShared("react/jsx-runtime");
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ originModulePath: path.join(mobileRoot, "package.json") }),
      "react/jsx-runtime",
      "android",
    );
  });
});
