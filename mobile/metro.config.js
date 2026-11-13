const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
// Watch the repo-root shared/ folder (in addition to the implicit project root)
// so `@shared/*` imports resolve, without crawling root node_modules/.next/.git.
config.watchFolders = [path.resolve(repoRoot, "shared")];

// Files under shared/ are compiled by this project's babel config, so the NativeWind
// preset injects a react-native-css-interop import into them. Node resolution from
// shared/ would look in the repo root's node_modules (web deps only) and fail, so
// mobile's node_modules is added as an explicit search root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];

// Imports made from shared/ are resolved as if they came from this project. Otherwise a
// checkout that also has the web app installed finds the repo root's `react` first and the
// bundle ships two Reacts: hooks in shared/ then run against a renderer-less copy and throw.
const sharedRoot = path.resolve(repoRoot, "shared") + path.sep;
const projectOrigin = path.join(projectRoot, "package.json");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromShared = context.originModulePath.startsWith(sharedRoot);
  const isPackage = !moduleName.startsWith(".") && !path.isAbsolute(moduleName);
  if (fromShared && isPackage) {
    return context.resolveRequest({ ...context, originModulePath: projectOrigin }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Tailwind entry is named tailwind.css (not global.css) to avoid a basename
// collision with the template's src/global.css font-vars file.
module.exports = withNativeWind(config, { input: "./tailwind.css" });
