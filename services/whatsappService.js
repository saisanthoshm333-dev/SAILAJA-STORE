let wbm;

try {
    wbm = require("wbm");
} catch (error) {
    console.error("WhatsApp WBM could not be loaded:", error);
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

    initializationPromise = (async () => {
        console.log("WhatsApp initialization started.");

        try {
            if (!wbm) {
                throw new Error("The WBM package is unavailable");
            }

            // WBM automates WhatsApp Web unofficially. Use a dedicated shop account;
            // never put a personal number or QR/session credentials in application data.
            console.log("Launching browser...");
            console.log("Waiting for WhatsApp Web...");
            await wbm.start({
                showBrowser: process.env.WHATSAPP_SHOW_BROWSER !== "false",
                session: true
            });
            connected = true;
            console.log("WhatsApp authenticated.");
            console.log("WhatsApp client ready.");
            return true;
        } catch (error) {
            connected = false;
            console.error("WhatsApp authentication failure:", error);
            return false;
        } finally {
            initializationPromise = null;
        }
    })();

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
