const express = require("express");
const mongoose = require("mongoose");
const Item = require("../models/Item");

const router = express.Router();

function isValidObjectId(id) {
    return typeof id === "string" && mongoose.isObjectIdOrHexString(id);
}

function validateText(value, fieldName, maxLength, required = false) {
    if (value === undefined || value === null) value = "";
    if (typeof value !== "string") {
        const error = new Error(`${fieldName} must be text.`);
        error.status = 400;
        throw error;
    }
    const text = value.trim();
    if ((required && !text) || text.length > maxLength) {
        const error = new Error(`${fieldName} is invalid.`);
        error.status = 400;
        throw error;
    }
    return text;
}

/**
 * GET /api/items
 * List all active expense items
 */
router.get("/", async (req, res, next) => {
    try {
        const items = await Item.find({ active: { $ne: false } }).sort({ name: 1 });
        res.json({ success: true, items });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/items
 * Create new expense item
 */
router.post("/", async (req, res, next) => {
    try {
        const body = req.body || {};
        const name = validateText(body.name, "Item name", 60, true);
        const icon = validateText(body.icon || "🧾", "Item icon", 8, true);

        const itemExists = await Item.findOne({
            name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
        });

        if (itemExists) {
            if (!itemExists.active) {
                itemExists.active = true;
                itemExists.icon = icon;
                await itemExists.save();
                return res.json({ success: true, item: itemExists, message: "Archived item restored." });
            }
            return res.status(409).json({ success: false, message: "This item already exists." });
        }

        const item = await Item.create({ name, icon, active: true });
        res.status(201).json({ success: true, item });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/items/:id
 * Edit item
 */
router.put("/:id", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid item ID." });
        }

        const body = req.body || {};
        const name = validateText(body.name, "Item name", 60, true);
        const icon = validateText(body.icon || "🧾", "Item icon", 8, true);

        const duplicate = await Item.findOne({
            _id: { $ne: req.params.id },
            name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
        });

        if (duplicate) {
            return res.status(409).json({ success: false, message: "An item with this name already exists." });
        }

        const item = await Item.findByIdAndUpdate(
            req.params.id,
            { $set: { name, icon } },
            { new: true, runValidators: true }
        );

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found." });
        }

        res.json({ success: true, item });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/items/:id
 * Soft delete item
 */
router.delete("/:id", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid item ID." });
        }

        const item = await Item.findByIdAndUpdate(
            req.params.id,
            { $set: { active: false } },
            { new: true }
        );

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found." });
        }

        res.json({ success: true, message: "Item removed." });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
