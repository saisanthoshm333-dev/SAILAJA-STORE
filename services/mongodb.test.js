const assert = require("node:assert/strict");
const test = require("node:test");
const { getMongoUri } = require("./mongodb");

test("requires a configured MongoDB URI", () => {
    assert.throws(
        () => getMongoUri(""),
        /MONGODB_URI is not set/
    );
    assert.throws(
        () => getMongoUri(undefined),
        /MONGODB_URI is not set/
    );
});

test("accepts MongoDB Atlas SRV and standard connection URI schemes", () => {
    assert.equal(
        getMongoUri(" mongodb+srv://user:password@cluster.example/db "),
        "mongodb+srv://user:password@cluster.example/db"
    );
    assert.equal(
        getMongoUri("mongodb://127.0.0.1:27017/sailaja_store"),
        "mongodb://127.0.0.1:27017/sailaja_store"
    );
});

test("rejects values that are not MongoDB connection URIs", () => {
    assert.throws(
        () => getMongoUri("https://cluster.example"),
        /must start with mongodb/
    );
});
