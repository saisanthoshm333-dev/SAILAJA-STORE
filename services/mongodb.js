const mongoose = require("mongoose");

function getMongoUri(value = process.env.MONGODB_URI) {
    const uri = typeof value === "string" ? value.trim() : "";

    if (!uri) {
        throw new Error(
            "MONGODB_URI is not set. Copy .env.example to .env and add your MongoDB Atlas connection string."
        );
    }

    if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
        throw new Error(
            "MONGODB_URI must start with mongodb+srv:// (Atlas) or mongodb://."
        );
    }

    return uri;
}

async function connectToMongo(uri) {
    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000
        });
        console.log("MongoDB connected successfully.");
    } catch (error) {
        const message = String(error.message || "No additional details.")
            .replace(
                /(mongodb(?:\+srv)?:\/\/)[^@\s]+@/gi,
                "$1[REDACTED]@"
            );
        console.error(
            "MongoDB connection failed:",
            error.name || "Error",
            message
        );
        throw new Error(
            "Could not connect to MongoDB. Check MONGODB_URI, the Atlas database user, and the Network Access IP allowlist."
        );
    }
}

module.exports = {
    connectToMongo,
    getMongoUri
};
