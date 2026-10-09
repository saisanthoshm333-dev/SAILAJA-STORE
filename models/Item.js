const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            unique: true,
            minlength: 1,
            maxlength: 60
        },
        icon: {
            type: String,
            default: "🧾",
            trim: true,
            maxlength: 8
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

itemSchema.index({ name: 1, active: 1 });

module.exports = mongoose.model("Item", itemSchema);
