const assert = require("node:assert/strict");
const test = require("node:test");
const { waitForWhatsAppPageState } = require("./whatsappAuth");

function createStateHandle(value) {
    return {
        async jsonValue() {
            return value;
        },
        async dispose() {}
    };
}

test("authentication state detection retries a detached frame", async () => {
    let calls = 0;
    const page = {
        isClosed: () => false,
        async waitForFunction(predicate, options, chatSelector, qrSelector, expectedState) {
            calls += 1;
            assert.equal(options.timeout > 0, true);
            assert.equal(chatSelector, "#pane-side");
            assert.equal(qrSelector, "div[data-ref]");
            assert.equal(expectedState, undefined);
            if (calls === 1) {
                throw new Error("waitForFunction failed: frame got detached");
            }
            return createStateHandle("chat");
        }
    };

    assert.equal(
        await waitForWhatsAppPageState(page, {
            chatSelector: "#pane-side",
            qrSelector: "div[data-ref]"
        }),
        "chat"
    );
    assert.equal(calls, 2);
});

test("authentication state detection identifies an unpaired QR screen", async () => {
    const page = {
        isClosed: () => false,
        async waitForFunction() {
            return createStateHandle("qr");
        }
    };

    assert.equal(
        await waitForWhatsAppPageState(page, {
            chatSelector: "#pane-side",
            qrSelector: "div[data-ref]"
        }),
        "qr"
    );
});

test("QR authentication waits for the authenticated chat after frame navigation", async () => {
    let calls = 0;
    const page = {
        isClosed: () => false,
        async waitForFunction(predicate, options, chatSelector, qrSelector, expectedState) {
            calls += 1;
            assert.equal(expectedState, "chat");
            assert.equal(options.timeout > 0, true);
            if (calls === 1) {
                throw new Error("Execution context was destroyed by navigation");
            }
            return createStateHandle("chat");
        }
    };

    assert.equal(
        await waitForWhatsAppPageState(
            page,
            {
                chatSelector: "#pane-side",
                qrSelector: "div[data-ref]"
            },
            {
                expectedState: "chat",
                timeoutMs: 5000
            }
        ),
        "chat"
    );
    assert.equal(calls, 2);
});

test("authentication state detection propagates non-navigation failures", async () => {
    const page = {
        isClosed: () => false,
        async waitForFunction() {
            throw new Error("Browser process crashed");
        }
    };

    await assert.rejects(
        waitForWhatsAppPageState(page, {
            chatSelector: "#pane-side",
            qrSelector: "div[data-ref]"
        }),
        /Browser process crashed/
    );
});
