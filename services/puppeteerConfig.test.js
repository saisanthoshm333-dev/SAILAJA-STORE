const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { configurePuppeteerCache } = require("./puppeteerConfig");

test("Puppeteer installation and runtime use the same project cache path", () => {
    const originalCacheDirectory = process.env.PUPPETEER_CACHE_DIR;
    const expectedCacheDirectory = path.resolve(
        __dirname,
        "..",
        ".cache",
        "puppeteer"
    );

    try {
        process.env.PUPPETEER_CACHE_DIR = "different-render-cache";
        assert.equal(configurePuppeteerCache(), expectedCacheDirectory);
        assert.equal(
            process.env.PUPPETEER_CACHE_DIR,
            expectedCacheDirectory
        );
    } finally {
        if (originalCacheDirectory === undefined) {
            delete process.env.PUPPETEER_CACHE_DIR;
        } else {
            process.env.PUPPETEER_CACHE_DIR = originalCacheDirectory;
        }
    }
});
