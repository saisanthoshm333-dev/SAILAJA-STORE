const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
    {
        itemId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Item",
            required: true,
            index: true
        },
        itemName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 60
        },
        amount: {
            type: Number,
            required: true,
            min: 0.01,
            max: 1000000000
        },
        date: {
            type: Date,
            required: true,
            index: true
        },
        notes: {
            type: String,
            trim: true,
            default: "",
            maxlength: 250
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

expenseSchema.index({ itemId: 1, date: 1, createdAt: 1 });
expenseSchema.index({ createdAt: 1 });

module.exports = mongoose.model("Expense", expenseSchema);
