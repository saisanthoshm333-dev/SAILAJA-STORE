const express = require("express");
const mongoose = require("mongoose");
const Notification = require("../models/whatsappNotification");
const whatsappService = require("../services/whatsappService");
const notificationService = require("../services/notificationService");

const router = express.Router();

function isValidObjectId(id) {
    return typeof id === "string" && mongoose.isObjectIdOrHexString(id);
}

/**
 * GET /api/notifications
 * List recent notifications and summary statuses
 */
router.get("/", async (req, res, next) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 100);

        const [notifications, statusCounts] = await Promise.all([
            Notification.find().sort({ createdAt: -1 }).limit(limit),
            Notification.aggregate([
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ])
        ]);

        const counts = { pending: 0, sending: 0, sent: 0, failed: 0 };
        statusCounts.forEach((s) => {
            if (counts[s._id] !== undefined) counts[s._id] = s.count;
        });

        res.json({
            success: true,
            whatsappConnected: whatsappService.isWhatsAppConnected(),
            counts,
            notifications
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/notifications/status
 * Get WhatsApp connection status
 */
router.get("/status", (req, res) => {
    res.json({
        success: true,
        connected: whatsappService.isWhatsAppConnected(),
        timestamp: new Date()
    });
});

/**
 * POST /api/notifications/:id/retry
 * Safely retry failed notification
 */
router.post("/:id/retry", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid notification ID." });
        }

        const notification = await Notification.findById(req.params.id);
        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found." });
        }

        if (notification.status === "sent") {
            return res.status(400).json({ success: false, message: "Notification was already sent." });
        }

        // Reset status to pending so deliverNotification can process it
        notification.status = "pending";
        notification.error = undefined;
        await notification.save();

        // Deliver notification
        notificationService.deliverNotification(notification._id).catch((err) => {
            console.error("Retry delivery failed:", err);
        });

        res.json({
            success: true,
            message: "Notification retry scheduled.",
            notification
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
