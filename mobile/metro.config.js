const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
// Watch the repo-root shared/ folder (in addition to the implicit project root)
// so `@shared/*` imports resolve, without crawling root node_modules/.next/.git.
config.watchFolders = [path.resolve(repoRoot, "shared")];

module.exports = config;
