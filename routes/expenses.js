const express = require("express");
const mongoose = require("mongoose");
const Expense = require("../models/Expense");
const Item = require("../models/Item");
const pdfService = require("../services/pdfService");

const router = express.Router();

function isValidObjectId(id) {
    return typeof id === "string" && mongoose.isObjectIdOrHexString(id);
}

function parsePositiveNumber(value, fieldName = "Amount") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1000000000) {
        const error = new Error(`${fieldName} must be a valid positive amount.`);
        error.status = 400;
        throw error;
    }
    return Math.round(parsed * 100) / 100;
}

function normalizeDate(val, fallback = new Date()) {
    if (!val) return fallback;
    const d = new Date(val);
    if (isNaN(d.getTime())) return fallback;
    return d;
}

/**
 * GET /api/expenses
 * List expenses with optional date range or single date filter
 */
router.get("/", async (req, res, next) => {
    try {
        let filter = { active: { $ne: false } };

        if (req.query.date) {
            const start = new Date(req.query.date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            filter.date = { $gte: start, $lt: end };
        } else if (req.query.from && req.query.to) {
            const start = new Date(req.query.from);
            start.setHours(0, 0, 0, 0);
            const end = new Date(req.query.to);
            end.setHours(23, 59, 59, 999);
            filter.date = { $gte: start, $lte: end };
        }

        if (req.query.itemId && isValidObjectId(req.query.itemId)) {
            filter.itemId = req.query.itemId;
        }

        const expenses = await Expense.find(filter)
            .sort({ date: -1, createdAt: -1 })
            .populate("itemId", "name icon");

        const total = expenses.reduce((sum, e) => sum + e.amount, 0);

        res.json({
            success: true,
            expenses,
            total: Math.round(total * 100) / 100
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/expenses/today
 * Today's expense entries
 */
router.get("/today", async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const expenses = await Expense.find({
            date: { $gte: today, $lt: tomorrow },
            active: { $ne: false }
        }).sort({ createdAt: -1 }).populate("itemId", "name icon");

        const todayTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
        const distinctItemCount = new Set(expenses.map((e) => String(e.itemId?._id || e.itemId))).size;

        res.json({
            success: true,
            expenses,
            todayTotal: Math.round(todayTotal * 100) / 100,
            itemCount: distinctItemCount
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/expenses/monthly-summary
 * Current month total expenditure and breakdown calculated from actual records
 */
router.get("/monthly-summary", async (req, res, next) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const [monthlyTotalResult, itemWiseBreakdown] = await Promise.all([
            Expense.aggregate([
                {
                    $match: {
                        date: { $gte: startOfMonth, $lt: startOfNextMonth },
                        active: { $ne: false }
                    }
                },
                { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
            ]),
            Expense.aggregate([
                {
                    $match: {
                        date: { $gte: startOfMonth, $lt: startOfNextMonth },
                        active: { $ne: false }
                    }
                },
                {
                    $group: {
                        _id: "$itemName",
                        total: { $sum: "$amount" },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ])
        ]);

        const monthlyTotal = monthlyTotalResult[0]?.total || 0;
        const recordCount = monthlyTotalResult[0]?.count || 0;

        res.json({
            success: true,
            month: now.toLocaleString("en-IN", { month: "long", year: "numeric" }),
            monthlyTotal: Math.round(monthlyTotal * 100) / 100,
            recordCount,
            breakdown: itemWiseBreakdown
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/expenses/item/:itemId
 * Expenses for a specific item
 */
router.get("/item/:itemId", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.itemId)) {
            return res.status(400).json({ success: false, message: "Invalid item ID." });
        }

        const [item, expenses] = await Promise.all([
            Item.findById(req.params.itemId),
            Expense.find({ itemId: req.params.itemId, active: { $ne: false } }).sort({ date: -1, createdAt: -1 })
        ]);

        const total = expenses.reduce((sum, e) => sum + e.amount, 0);

        res.json({
            success: true,
            item,
            expenses,
            total: Math.round(total * 100) / 100
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/expenses
 * Create expense record
 */
router.post("/", async (req, res, next) => {
    try {
        const { itemId, amount, date, notes } = req.body || {};

        if (!isValidObjectId(itemId)) {
            return res.status(400).json({ success: false, message: "Please select a valid item." });
        }

        const item = await Item.findOne({ _id: itemId, active: { $ne: false } });
        if (!item) {
            return res.status(400).json({ success: false, message: "Selected item not found." });
        }

        const parsedAmount = parsePositiveNumber(amount, "Expense amount");
        const parsedDate = normalizeDate(date);
        const parsedNotes = typeof notes === "string" ? notes.trim() : "";

        const expense = await Expense.create({
            itemId: item._id,
            itemName: item.name,
            amount: parsedAmount,
            date: parsedDate,
            notes: parsedNotes,
            active: true
        });

        res.status(201).json({ success: true, expense, message: "Expense recorded successfully." });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/expenses/:id
 * Edit expense record
 */
router.put("/:id", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid expense ID." });
        }

        const { amount, date, notes, itemId } = req.body || {};
        const updateData = {};

        if (amount !== undefined) {
            updateData.amount = parsePositiveNumber(amount, "Expense amount");
        }
        if (date !== undefined) {
            updateData.date = normalizeDate(date);
        }
        if (notes !== undefined) {
            updateData.notes = typeof notes === "string" ? notes.trim() : "";
        }
        if (itemId && isValidObjectId(itemId)) {
            const item = await Item.findById(itemId);
            if (item) {
                updateData.itemId = item._id;
                updateData.itemName = item.name;
            }
        }

        const expense = await Expense.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!expense) {
            return res.status(404).json({ success: false, message: "Expense record not found." });
        }

        res.json({ success: true, expense, message: "Expense updated successfully." });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/expenses/:id
 * Delete expense record
 */
router.delete("/:id", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid expense ID." });
        }

        const expense = await Expense.findByIdAndDelete(req.params.id);
        if (!expense) {
            return res.status(404).json({ success: false, message: "Expense record not found." });
        }

        res.json({ success: true, message: "Expense record deleted successfully." });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/expenses/pdf
 * Export expense report PDF
 */
router.get("/pdf", async (req, res, next) => {
    try {
        let filter = { active: { $ne: false } };
        let fromDate = null;
        let toDate = null;

        if (req.query.from && req.query.to) {
            fromDate = new Date(req.query.from);
            fromDate.setHours(0, 0, 0, 0);
            toDate = new Date(req.query.to);
            toDate.setHours(23, 59, 59, 999);
            filter.date = { $gte: fromDate, $lte: toDate };
        }

        const expenses = await Expense.find(filter).sort({ date: 1, createdAt: 1 });
        pdfService.generateExpensePdf({ expenses, from: fromDate, to: toDate }, res);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
