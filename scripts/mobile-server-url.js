function getMobileServerUrl({ required = true } = {}) {
    const configuredUrl = process.env.CAPACITOR_SERVER_URL?.trim();

    if (!configuredUrl) {
        if (required) {
            throw new Error(
                "Set CAPACITOR_SERVER_URL to the deployed HTTPS app origin before syncing or building Android."
            );
        }

        return null;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(configuredUrl);
    } catch {
        throw new Error("CAPACITOR_SERVER_URL must be a valid HTTPS URL.");
    }

    if (
        parsedUrl.protocol !== "https:" ||
        !parsedUrl.hostname ||
        parsedUrl.username ||
        parsedUrl.password ||
        parsedUrl.pathname !== "/" ||
        parsedUrl.search ||
        parsedUrl.hash
    ) {
        throw new Error(
            "CAPACITOR_SERVER_URL must be an HTTPS origin with no credentials, path, query, or fragment."
        );
    }

    return parsedUrl.origin;
}

module.exports = { getMobileServerUrl };
