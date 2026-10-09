const path = require("node:path");

function configurePuppeteerCache() {
    const cacheDirectory = path.resolve(__dirname, "..", ".cache", "puppeteer");
    process.env.PUPPETEER_CACHE_DIR = cacheDirectory;
    return cacheDirectory;
}

module.exports = {
    configurePuppeteerCache
};
