const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const test = require("node:test");
const wbm = require("wbm");
const whatsappService = require("./whatsappService");
const requireWbm = createRequire(require.resolve("wbm"));
const puppeteer = requireWbm("puppeteer");

test("WhatsApp startup logs failures and stays headless on Render", async () => {
    const originalStart = wbm.start;
    const originalExecutablePath = puppeteer.executablePath;
    const originalExistsSync = fs.existsSync;
    const originalError = console.error;
    const originalEnvironment = {
        RENDER: process.env.RENDER,
        RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID,
        NODE_ENV: process.env.NODE_ENV,
        WHATSAPP_SHOW_BROWSER: process.env.WHATSAPP_SHOW_BROWSER
    };
    let loggedErrors = [];
    let receivedOptions;
    let startCalled = false;

    console.error = (...args) => loggedErrors.push(args.join(" "));

    try {
        wbm.start = async () => {
            throw new Error(
                "Could not launch browser from mongodb://user:password@cluster.example"
            );
        };
        assert.equal(await whatsappService.initializeWhatsApp(), false);
        assert.equal(whatsappService.isWhatsAppConnected(), false);
        assert.match(loggedErrors.join("\n"), /WhatsApp initialization failed/);
        assert.match(loggedErrors.join("\n"), /mongodb:\/\/\[REDACTED\]@/);
        assert.doesNotMatch(loggedErrors.join("\n"), /user:password/);

        loggedErrors = [];
        startCalled = false;
        puppeteer.executablePath = () => "missing-test-browser";
        wbm.start = async () => {
            startCalled = true;
        };
        assert.equal(await whatsappService.initializeWhatsApp(), false);
        assert.equal(startCalled, false);
        assert.match(loggedErrors.join("\n"), /browser executable is missing/);

        process.env.RENDER = "true";
        process.env.RENDER_SERVICE_ID = "test-render-service";
        delete process.env.NODE_ENV;
        process.env.WHATSAPP_SHOW_BROWSER = "true";
        puppeteer.executablePath = () => "test-browser-executable";
        fs.existsSync = (filePath) =>
            filePath === "test-browser-executable" || originalExistsSync(filePath);
        wbm.start = async (options) => {
            receivedOptions = options;
            throw new Error("Expected test launch failure");
        };
        assert.equal(await whatsappService.initializeWhatsApp(), false);
        assert.ok(receivedOptions, loggedErrors.join("\n"));
        assert.equal(receivedOptions.showBrowser, false);
        assert.equal(receivedOptions.session, true);
        assert.equal(whatsappService.isWhatsAppConnected(), false);
    } finally {
        wbm.start = originalStart;
        puppeteer.executablePath = originalExecutablePath;
        fs.existsSync = originalExistsSync;
        console.error = originalError;
        for (const [name, value] of Object.entries(originalEnvironment)) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
    }
});

test("concurrent WhatsApp initialization shares one readiness attempt", async () => {
    const originalStart = wbm.start;
    const originalEnd = wbm.end;
    let resolveStart;
    let startCalls = 0;
    let signalStart;
    const started = new Promise((resolve) => {
        signalStart = resolve;
    });
    const startResult = new Promise((resolve) => {
        resolveStart = resolve;
    });

    wbm.start = async () => {
        startCalls += 1;
        signalStart();
        await startResult;
    };
    wbm.end = async () => {};

    try {
        const firstAttempt = whatsappService.initializeWhatsApp();
        const secondAttempt = whatsappService.initializeWhatsApp();

        assert.strictEqual(firstAttempt, secondAttempt);
        await started;
        assert.equal(startCalls, 1);
        assert.equal(whatsappService.isWhatsAppConnected(), false);

        resolveStart();
        assert.equal(await firstAttempt, true);
        assert.equal(whatsappService.isWhatsAppConnected(), true);

        await whatsappService.disconnectWhatsApp();
        assert.equal(whatsappService.isWhatsAppConnected(), false);
    } finally {
        wbm.start = originalStart;
        wbm.end = originalEnd;
    }
});
