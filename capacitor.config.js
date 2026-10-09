const { getMobileServerUrl } = require("./scripts/mobile-server-url");

const mobileServerUrl = getMobileServerUrl({ required: false });

const config = {
    appId: "com.sailajastore.app",
    appName: "SAILAJA STORE",
    webDir: "mobile",
    bundledWebRuntime: false
};

if (mobileServerUrl) {
    const hostname = new URL(mobileServerUrl).hostname;
    config.server = {
        url: mobileServerUrl,
        cleartext: false,
        allowNavigation: [hostname]
    };
}

module.exports = config;
