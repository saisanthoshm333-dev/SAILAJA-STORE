const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { getMobileServerUrl } = require("./mobile-server-url");

const projectRoot = path.resolve(__dirname, "..");
const androidRoot = path.join(projectRoot, "android");

function run(command, args, cwd) {
    const executable = process.platform === "win32" && command === "npx"
        ? "npx.cmd"
        : command;
    const result = spawnSync(executable, args, {
        cwd,
        stdio: "inherit",
        shell: process.platform === "win32"
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

function main() {
    const action = process.argv[2];
    if (action !== "sync" && action !== "build") {
        throw new Error("Usage: node scripts/android.js <sync|build>");
    }

    getMobileServerUrl();

    if (!fs.existsSync(androidRoot)) {
        throw new Error("Android project not found. Run npm run android:add first.");
    }

    run("npx", ["cap", "sync", "android"], projectRoot);

    if (action === "build") {
        const gradleWrapper = process.platform === "win32"
            ? "gradlew.bat"
            : "./gradlew";
        run(gradleWrapper, ["assembleDebug"], androidRoot);

        const apkPath = path.join(
            androidRoot,
            "app",
            "build",
            "outputs",
            "apk",
            "debug",
            "app-debug.apk"
        );
        if (!fs.existsSync(apkPath)) {
            throw new Error(`Android build completed without producing ${apkPath}`);
        }

        console.log(`Debug APK created at ${apkPath}`);
    }
}

main();
