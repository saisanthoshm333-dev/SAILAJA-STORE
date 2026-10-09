const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        mobile: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        phone: {
            type: String,
            trim: true
        },

        whatsappEnabled: {
            type: Boolean,
            default: false
        },

        currentBalance: {
            type: Number,
            default: 0,
            min: 0
        },

        creditLimit: {
            type: Number,
            default: 0,
            min: 0
        },

        isCreditEnabled: {
            type: Boolean,
            default: true
        },

        village: {
            type: String,
            trim: true
        },

        notes: {
            type: String,
            trim: true
        },

        active: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Customer", customerSchema);