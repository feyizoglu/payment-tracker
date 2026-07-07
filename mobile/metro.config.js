const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
// Watch the repo-root shared/ folder (in addition to the implicit project root)
// so `@shared/*` imports resolve, without crawling root node_modules/.next/.git.
config.watchFolders = [path.resolve(repoRoot, "shared")];

// Tailwind entry is named tailwind.css (not global.css) to avoid a basename
// collision with the template's src/global.css font-vars file.
module.exports = withNativeWind(config, { input: "./tailwind.css" });
