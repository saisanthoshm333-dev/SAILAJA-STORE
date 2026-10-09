const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");

const requireWbm = createRequire(require.resolve("wbm"));
const puppeteerInstallScript = requireWbm.resolve("puppeteer/install.mjs");
async function installAndVerifyBrowser() {
    const puppeteer = requireWbm("puppeteer");
    let executablePath = puppeteer.executablePath({ headless: true });

    if (!fs.existsSync(executablePath)) {
        const result = spawnSync(process.execPath, [puppeteerInstallScript], {
            stdio: "inherit"
        });

        if (result.error) {
            throw result.error;
        }

        if (result.status !== 0) {
            throw new Error(
                `Puppeteer browser installation exited with status ${result.status}.`
            );
        }

        executablePath = puppeteer.executablePath({ headless: true });
    }

    if (!fs.existsSync(executablePath)) {
        throw new Error(
            `Puppeteer browser installation completed without an executable at ${executablePath}.`
        );
    }

    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"]
    });

    try {
        console.log(
            `Puppeteer browser verified: ${await browser.version()} (${executablePath})`
        );
    } finally {
        await browser.close();
    }
}

installAndVerifyBrowser().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
        "Puppeteer browser installation or verification failed:",
        message.replace(
            /\b((?:mongodb(?:\+srv)?|https?):\/\/)[^/@\s]+@/gi,
            "$1[REDACTED]@"
        )
    );
    process.exitCode = 1;
});
