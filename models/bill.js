const mongoose = require("mongoose");

const billSchema = new mongoose.Schema(
    {
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: true
        },

        amount: {
            type: Number,
            required: true,
            min: 0
        },

        description: {
            type: String,
            trim: true
        },

        items: [
            {
                name: {
                    type: String,
                    required: true,
                    trim: true
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1
                },
                price: {
                    type: Number,
                    required: true,
                    min: 0
                },
                total: {
                    type: Number,
                    required: true,
                    min: 0
                }
            }
        ],

        type: {
            type: String,
            enum: ["CREDIT", "PAID"],
            default: "CREDIT"
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

        source: {
            type: String,
            enum: ["SHOP", "ONLINE"],
            default: "SHOP"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Bill", billSchema);