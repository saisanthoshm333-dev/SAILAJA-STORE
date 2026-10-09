const AUTH_STATE_TIMEOUT_MS = 90000;
const NAVIGATION_RETRY_DELAY_MS = 250;
const TRANSIENT_NAVIGATION_ERROR =
    /frame got detached|execution context was destroyed|cannot find context with specified id|context was destroyed/i;

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForWhatsAppPageState(
    page,
    { chatSelector, qrSelector },
    { expectedState, timeoutMs = AUTH_STATE_TIMEOUT_MS } = {}
) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (page.isClosed()) {
            throw new Error("WhatsApp page closed during authentication.");
        }

        try {
            const stateHandle = await page.waitForFunction(
                (chat, qr, expected) => {
                    const chatVisible = Boolean(document.querySelector(chat));
                    const qrVisible = Boolean(document.querySelector(qr));
                    if (expected === "chat") {
                        return chatVisible ? "chat" : false;
                    }
                    if (expected === "qr") {
                        return qrVisible ? "qr" : false;
                    }
                    if (chatVisible) {
                        return "chat";
                    }
                    if (qrVisible) {
                        return "qr";
                    }
                    return false;
                },
                {
                    timeout: Math.max(1, deadline - Date.now())
                },
                chatSelector,
                qrSelector,
                expectedState
            );
            const state = await stateHandle.jsonValue();
            await stateHandle.dispose();
            return state;
        } catch (error) {
            if (
                !TRANSIENT_NAVIGATION_ERROR.test(
                    error instanceof Error ? error.message : String(error)
                )
            ) {
                throw error;
            }
            if (page.isClosed()) {
                throw new Error(
                    "WhatsApp page closed during authentication navigation."
                );
            }

            await delay(
                Math.min(
                    NAVIGATION_RETRY_DELAY_MS,
                    Math.max(0, deadline - Date.now())
                )
            );
        }
    }

    throw new Error(
        "WhatsApp page kept navigating during authentication detection."
    );
}

module.exports = {
    waitForWhatsAppPageState
};
