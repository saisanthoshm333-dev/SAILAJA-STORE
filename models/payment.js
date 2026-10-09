const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
    {
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: true
        },

        amount: {
            type: Number,
            required: true,
            min: 1
        },

        paymentMethod: {
            type: String,
            enum: ["CASH", "UPI"],
            default: "CASH"
        },

        previousBalance: {
            type: Number,
            required: true,
            min: 0
        },

        balanceAfter: {
            type: Number,
            required: true,
            min: 0
        },

        note: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Payment", paymentSchema);