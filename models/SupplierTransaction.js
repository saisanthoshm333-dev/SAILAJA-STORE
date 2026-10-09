const mongoose = require("mongoose");

const supplierTransactionSchema = new mongoose.Schema(
    {
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
            required: true,
            index: true
        },
        type: {
            type: String,
            enum: ["PURCHASE", "PAYMENT"],
            required: true
        },
        amount: {
            type: Number,
            required: true,
            min: 0.01
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
        billNumber: {
            type: String,
            trim: true
        },
        paymentMethod: {
            type: String,
            enum: ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"],
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
        notes: {
            type: String,
            trim: true
        },
        date: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

supplierTransactionSchema.index({ supplier: 1, createdAt: -1 });
supplierTransactionSchema.index({ supplier: 1, date: -1 });

module.exports = mongoose.model("SupplierTransaction", supplierTransactionSchema);
