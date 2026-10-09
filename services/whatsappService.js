const fs = require("node:fs");
const { createRequire } = require("node:module");
const { configurePuppeteerCache } = require("./puppeteerConfig");
const { shouldShowWhatsAppBrowser } = require("./whatsappConfig");

let wbm;
let puppeteer;
configurePuppeteerCache();

function describeError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(
        /\b((?:mongodb(?:\+srv)?|https?):\/\/)[^/@\s]+@/gi,
        "$1[REDACTED]@"
    );
}

try {
    const requireWbm = createRequire(require.resolve("wbm"));
    wbm = require("wbm");
    puppeteer = requireWbm("puppeteer");
} catch (error) {
    console.error("WhatsApp WBM could not be loaded:", describeError(error));
}

let connected = false;
let initializationPromise = null;
let sendQueue = Promise.resolve();

function normalizePhoneNumber(phoneNumber) {
    const digits = String(phoneNumber || "").replace(/\D/g, "");

    if (/^\d{10}$/.test(digits)) {
        return `91${digits}`;
    }

    if (/^91\d{10}$/.test(digits)) {
        return digits;
    }

    return null;
}

function initializeWhatsApp() {
    if (connected) {
        return Promise.resolve(true);
    }

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = Promise.resolve().then(async () => {
        console.log("WhatsApp initialization started.");

        try {
            if (!wbm) {
                throw new Error("The WBM package is unavailable");
            }

            if (!puppeteer) {
                throw new Error("The WBM Puppeteer package is unavailable");
            }

            const showBrowser = shouldShowWhatsAppBrowser();
            const executablePath = puppeteer.executablePath({
                headless: !showBrowser
            });
            if (!fs.existsSync(executablePath)) {
                throw new Error(
                    `Puppeteer browser executable is missing at ${executablePath}. Run npm run install:browser during deployment.`
                );
            }

            // WBM automates WhatsApp Web unofficially. Use a dedicated shop account;
            // never put a personal number or QR/session credentials in application data.
            console.log("Launching browser...");
            console.log("Waiting for WhatsApp Web...");
            await wbm.start({
                showBrowser,
                session: true
            });
            connected = true;
            console.log("WhatsApp authenticated.");
            console.log("WhatsApp client ready.");
            return true;
        } catch (error) {
            connected = false;
            console.error("WhatsApp initialization failed:", describeError(error));
            return false;
        } finally {
            initializationPromise = null;
        }
    });

    return initializationPromise;
}

async function sendMessage(phoneNumber, message) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!normalizedPhone) {
        throw new Error("Missing or invalid Indian WhatsApp number");
    }

    if (initializationPromise) {
        await initializationPromise;
    }

    if (!connected) {
        throw new Error("WhatsApp is not connected");
    }

    const sendTask = sendQueue.then(() =>
        wbm.sendTo(normalizedPhone, message)
    );
    sendQueue = sendTask.catch(() => {});
    return sendTask;
}

function isWhatsAppConnected() {
    return connected;
}

async function disconnectWhatsApp() {
    if (initializationPromise) {
        await initializationPromise;
    }

    if (connected && wbm) {
        await sendQueue;
        await wbm.end();
    }

    connected = false;
}

module.exports = {
    initializeWhatsApp,
    sendMessage,
    isWhatsAppConnected,
    disconnectWhatsApp,
    normalizePhoneNumber
};
