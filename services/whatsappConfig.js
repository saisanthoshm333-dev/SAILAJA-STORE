function shouldShowWhatsAppBrowser(env = process.env) {
    return (
        env.WHATSAPP_SHOW_BROWSER === "true" &&
        !isWhatsAppProductionEnvironment(env)
    );
}

function shouldPrintWhatsAppQr(env = process.env) {
    return !isWhatsAppProductionEnvironment(env);
}

function isWhatsAppProductionEnvironment(env) {
    return env.RENDER === "true" ||
        Boolean(env.RENDER_SERVICE_ID) ||
        env.NODE_ENV === "production";
}

module.exports = {
    shouldPrintWhatsAppQr,
    shouldShowWhatsAppBrowser
};
