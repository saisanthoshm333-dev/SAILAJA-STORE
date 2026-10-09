const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const test = require("node:test");
const wbm = require("wbm");
const whatsappService = require("./whatsappService");
const requireWbm = createRequire(require.resolve("wbm"));
const puppeteer = requireWbm("puppeteer");

test("WhatsApp initialization failure is logged and does not reject", async () => {
    const originalStart = wbm.start;
    const originalError = console.error;
    const loggedErrors = [];

    wbm.start = async () => {
        throw new Error(
            "Could not launch browser from mongodb://user:password@cluster.example"
        );
    };
    console.error = (...args) => loggedErrors.push(args.join(" "));

    try {
        assert.equal(await whatsappService.initializeWhatsApp(), false);
        assert.equal(whatsappService.isWhatsAppConnected(), false);
        assert.match(loggedErrors.join("\n"), /WhatsApp initialization failed/);
        assert.match(loggedErrors.join("\n"), /mongodb:\/\/\[REDACTED\]@/);
        assert.doesNotMatch(loggedErrors.join("\n"), /user:password/);
    } finally {
        wbm.start = originalStart;
        console.error = originalError;
    }
});

test("a missing browser executable is reported without starting WBM", async () => {
    const originalExecutablePath = puppeteer.executablePath;
    const originalCacheDirectory = process.env.PUPPETEER_CACHE_DIR;
    const originalStart = wbm.start;
    const originalError = console.error;
    const loggedErrors = [];

    puppeteer.executablePath = () => "missing-test-browser";
    wbm.start = async () => {
        throw new Error("WBM should not start without its browser executable");
    };
    console.error = (...args) => loggedErrors.push(args.join(" "));

    try {
        assert.equal(await whatsappService.initializeWhatsApp(), false);
        assert.equal(whatsappService.isWhatsAppConnected(), false);
        assert.match(loggedErrors.join("\n"), /browser executable is missing/);
        assert.doesNotMatch(
            loggedErrors.join("\n"),
            /WBM should not start without/
        );
    } finally {
        puppeteer.executablePath = originalExecutablePath;
        if (originalCacheDirectory === undefined) {
            delete process.env.PUPPETEER_CACHE_DIR;
        } else {
            process.env.PUPPETEER_CACHE_DIR = originalCacheDirectory;
        }
        wbm.start = originalStart;
        console.error = originalError;
    }
});
