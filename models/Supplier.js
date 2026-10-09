const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        mobile: {
            type: String,
            required: true,
            trim: true
        },
        phone: {
            type: String,
            trim: true
        },
        companyName: {
            type: String,
            trim: true
        },
        currentBalance: {
            type: Number,
            default: 0,
            min: 0
        },
        whatsappEnabled: {
            type: Boolean,
            default: false
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

supplierSchema.index({ mobile: 1 });
supplierSchema.index({ name: 1, active: 1 });

module.exports = mongoose.model("Supplier", supplierSchema);
