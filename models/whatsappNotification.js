const mongoose = require("mongoose");

const whatsappNotificationSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["BILL", "PAYMENT", "REMINDER", "SUPPLIER_PURCHASE", "SUPPLIER_PAYMENT"],
            required: true
        },
        notificationKey: {
            type: String,
            unique: true,
            sparse: true
        },
        transactionId: {
            type: mongoose.Schema.Types.ObjectId
        },
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer"
        },
        supplierId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier"
        },
        recipientName: {
            type: String,
            trim: true
        },
        phone: {
            type: String,
            required: true
        },
        message: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ["pending", "sending", "sent", "failed"],
            default: "pending",
            required: true
        },
        error: {
            type: String
        },
        sentAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "WhatsAppNotification",
    whatsappNotificationSchema
);
