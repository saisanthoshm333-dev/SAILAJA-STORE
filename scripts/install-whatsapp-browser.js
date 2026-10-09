const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");

const requireWbm = createRequire(require.resolve("wbm"));
const puppeteerInstallScript = requireWbm.resolve("puppeteer/install.mjs");
const result = spawnSync(process.execPath, [puppeteerInstallScript], {
    stdio: "inherit"
});

if (result.error) {
    throw result.error;
}

if (result.status !== 0) {
    process.exit(result.status || 1);
}
