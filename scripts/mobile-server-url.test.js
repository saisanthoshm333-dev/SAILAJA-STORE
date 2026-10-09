const assert = require("node:assert/strict");
const test = require("node:test");
const { getMobileServerUrl } = require("./mobile-server-url");

function withServerUrl(value, callback) {
    const previousValue = process.env.CAPACITOR_SERVER_URL;

    if (value === undefined) {
        delete process.env.CAPACITOR_SERVER_URL;
    } else {
        process.env.CAPACITOR_SERVER_URL = value;
    }

    try {
        callback();
    } finally {
        if (previousValue === undefined) {
            delete process.env.CAPACITOR_SERVER_URL;
        } else {
            process.env.CAPACITOR_SERVER_URL = previousValue;
        }
    }
}

test("allows an unset URL only when it is optional", () => {
    withServerUrl(undefined, () => {
        assert.equal(getMobileServerUrl({ required: false }), null);
        assert.throws(() => getMobileServerUrl(), /Set CAPACITOR_SERVER_URL/);
    });
});

test("returns the HTTPS origin", () => {
    withServerUrl(" https://store.example.com/ ", () => {
        assert.equal(getMobileServerUrl(), "https://store.example.com");
    });
});

test("rejects malformed and non-HTTPS URLs", () => {
    for (const value of ["not-a-url", "http://store.example.com"]) {
        withServerUrl(value, () => {
            assert.throws(() => getMobileServerUrl(), /valid HTTPS URL|HTTPS origin/);
        });
    }
});

test("rejects URL credentials and non-origin components", () => {
    for (const value of [
        "https://user:pass@store.example.com",
        "https://store.example.com/path",
        "https://store.example.com/?query=1",
        "https://store.example.com/#fragment"
    ]) {
        withServerUrl(value, () => {
            assert.throws(() => getMobileServerUrl(), /HTTPS origin/);
        });
    }
});
