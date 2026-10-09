const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const path = require("node:path");
const { configurePuppeteerCache } = require("../services/puppeteerConfig");

const cacheDirectory = configurePuppeteerCache();
const requireWbm = createRequire(require.resolve("wbm"));
const puppeteerPackagePath = requireWbm.resolve("puppeteer/package.json");
const puppeteerPackage = require(puppeteerPackagePath);
const puppeteerCliPath = path.join(
    path.dirname(puppeteerPackagePath),
    typeof puppeteerPackage.bin === "string"
        ? puppeteerPackage.bin
        : puppeteerPackage.bin.puppeteer
);

async function installAndVerifyBrowser() {
    const puppeteer = requireWbm("puppeteer");
    let executablePath = puppeteer.executablePath({ headless: true });

    if (!fs.existsSync(executablePath)) {
        console.log(`Installing Puppeteer Chrome into ${cacheDirectory}`);
        const result = spawnSync(
            process.execPath,
            [puppeteerCliPath, "browsers", "install", "chrome"],
            {
                stdio: "inherit"
            }
        );

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
            `Puppeteer Chrome was not installed at ${executablePath} (cache: ${cacheDirectory}).`
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
