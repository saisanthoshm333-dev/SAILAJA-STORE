function shouldShowWhatsAppBrowser(env = process.env) {
    const isRender = env.RENDER === "true" || Boolean(env.RENDER_SERVICE_ID);
    const isProduction = env.NODE_ENV === "production";

    return (
        env.WHATSAPP_SHOW_BROWSER === "true" &&
        !isRender &&
        !isProduction
    );
}

module.exports = {
    shouldShowWhatsAppBrowser
};
