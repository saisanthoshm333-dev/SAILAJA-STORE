const assert = require("node:assert/strict");
const test = require("node:test");
const {
    shouldPrintWhatsAppQr,
    shouldShowWhatsAppBrowser
} = require("./whatsappConfig");

test("browser visibility is opt-in for local development only", () => {
    assert.equal(
        shouldShowWhatsAppBrowser({ WHATSAPP_SHOW_BROWSER: "true" }),
        true
    );
    assert.equal(
        shouldShowWhatsAppBrowser({ WHATSAPP_SHOW_BROWSER: "false" }),
        false
    );
});

test("browser visibility is disabled on Render and production", () => {
    assert.equal(
        shouldShowWhatsAppBrowser({
            RENDER: "true",
            WHATSAPP_SHOW_BROWSER: "true"
        }),
        false
    );
    assert.equal(
        shouldShowWhatsAppBrowser({
            RENDER_SERVICE_ID: "srv-test",
            WHATSAPP_SHOW_BROWSER: "true"
        }),
        false
    );
    assert.equal(
        shouldShowWhatsAppBrowser({
            NODE_ENV: "production",
            WHATSAPP_SHOW_BROWSER: "true"
        }),
        false
    );
});

test("QR output is disabled on Render and production logs", () => {
    assert.equal(shouldPrintWhatsAppQr({}), true);
    assert.equal(shouldPrintWhatsAppQr({ RENDER: "true" }), false);
    assert.equal(
        shouldPrintWhatsAppQr({ RENDER_SERVICE_ID: "srv-test" }),
        false
    );
    assert.equal(shouldPrintWhatsAppQr({ NODE_ENV: "production" }), false);
});
