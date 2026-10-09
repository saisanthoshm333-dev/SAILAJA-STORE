const express = require("express");
const mongoose = require("mongoose");
const Supplier = require("../models/Supplier");
const SupplierTransaction = require("../models/SupplierTransaction");
const notificationService = require("../services/notificationService");
const pdfService = require("../services/pdfService");

const router = express.Router();

function isValidObjectId(id) {
    return typeof id === "string" && mongoose.isObjectIdOrHexString(id);
}

function parsePositiveAmount(val, field = "Amount") {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0 || num > 1000000000) {
        const err = new Error(`${field} must be a valid positive amount.`);
        err.status = 400;
        throw err;
    }
    return Math.round(num * 100) / 100;
}

// Monthly stats for suppliers
async function getSupplierStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [thisMonthPurchases] = await SupplierTransaction.aggregate([
        {
            $match: {
                type: "PURCHASE",
                createdAt: { $gte: startOfMonth, $lt: startOfNextMonth }
            }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const [thisMonthPayments] = await SupplierTransaction.aggregate([
        {
            $match: {
                type: "PAYMENT",
                createdAt: { $gte: startOfMonth, $lt: startOfNextMonth }
            }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const [payableResult] = await Supplier.aggregate([
        { $match: { active: { $ne: false } } },
        { $group: { _id: null, total: { $sum: "$currentBalance" } } }
    ]);

    return {
        totalPurchases: thisMonthPurchases?.total || 0,
        totalPayments: thisMonthPayments?.total || 0,
        totalPayable: payableResult?.total || 0
    };
}

/**
 * GET /api/suppliers
 * List suppliers with search and balance stats
 */
router.get("/", async (req, res, next) => {
    try {
        const { search, includeArchived } = req.query;
        const query = includeArchived === "true" ? {} : { active: { $ne: false } };

        if (search && typeof search === "string" && search.trim()) {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            query.$or = [{ name: regex }, { mobile: regex }, { companyName: regex }];
        }

        const [suppliers, stats] = await Promise.all([
            Supplier.find(query).sort({ currentBalance: -1, updatedAt: -1 }),
            getSupplierStats()
        ]);

        res.json({
            success: true,
            suppliers,
            stats: {
                ...stats,
                supplierCount: suppliers.length
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/suppliers/:id
 * Single supplier details
 */
router.get("/:id", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid supplier ID." });
        }

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found." });
        }

        res.json({ success: true, supplier });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/suppliers
 * Create new supplier
 */
router.post("/", async (req, res, next) => {
    try {
        const { name, mobile, companyName, notes, whatsappEnabled } = req.body || {};

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ success: false, message: "Supplier name is required." });
        }
        if (!mobile || typeof mobile !== "string" || !mobile.trim()) {
            return res.status(400).json({ success: false, message: "Mobile number is required." });
        }

        const cleanMobile = mobile.trim();
        const existing = await Supplier.findOne({ mobile: cleanMobile });
        if (existing) {
            if (existing.active === false) {
                existing.active = true;
                existing.name = name.trim();
                existing.companyName = (companyName || "").trim();
                existing.notes = (notes || "").trim();
                existing.whatsappEnabled = Boolean(whatsappEnabled);
                await existing.save();
                return res.status(200).json({ success: true, supplier: existing, message: "Archived supplier reactivated." });
            }
            return res.status(409).json({ success: false, message: "A supplier with this mobile number already exists." });
        }

        const supplier = new Supplier({
            name: name.trim(),
            mobile: cleanMobile,
            phone: cleanMobile,
            companyName: (companyName || "").trim(),
            notes: (notes || "").trim(),
            whatsappEnabled: Boolean(whatsappEnabled),
            active: true
        });

        await supplier.save();
        res.status(201).json({ success: true, supplier });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/suppliers/:id
 * Update supplier
 */
router.put("/:id", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid supplier ID." });
        }

        const { name, mobile, companyName, notes, whatsappEnabled } = req.body || {};

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Supplier name is required." });
        }
        if (!mobile || !mobile.trim()) {
            return res.status(400).json({ success: false, message: "Mobile number is required." });
        }

        const cleanMobile = mobile.trim();
        const conflict = await Supplier.findOne({
            _id: { $ne: req.params.id },
            mobile: cleanMobile
        });
        if (conflict) {
            return res.status(409).json({ success: false, message: "Another supplier has this mobile number." });
        }

        const supplier = await Supplier.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    name: name.trim(),
                    mobile: cleanMobile,
                    phone: cleanMobile,
                    companyName: (companyName || "").trim(),
                    notes: (notes || "").trim(),
                    whatsappEnabled: Boolean(whatsappEnabled)
                }
            },
            { new: true, runValidators: true }
        );

        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found." });
        }

        res.json({ success: true, supplier });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/suppliers/:id
 * Safe delete / archive
 */
router.delete("/:id", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid supplier ID." });
        }

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found." });
        }

        const txCount = await SupplierTransaction.countDocuments({ supplier: supplier._id });

        if (supplier.currentBalance > 0 || txCount > 0) {
            supplier.active = false;
            await supplier.save();
            return res.json({
                success: true,
                archived: true,
                message: "Supplier has transaction history and has been safely archived."
            });
        }

        await supplier.deleteOne();
        res.json({ success: true, archived: false, message: "Supplier deleted successfully." });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/suppliers/:id/history
 * Transaction history
 */
router.get("/:id/history", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid supplier ID." });
        }

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found." });
        }

        const transactions = await SupplierTransaction.find({ supplier: supplier._id }).sort({ createdAt: -1 });

        const totalPurchases = transactions
            .filter((t) => t.type === "PURCHASE")
            .reduce((sum, t) => sum + t.amount, 0);

        const totalPayments = transactions
            .filter((t) => t.type === "PAYMENT")
            .reduce((sum, t) => sum + t.amount, 0);

        res.json({
            success: true,
            supplier,
            transactions,
            totalPurchases,
            totalPayments,
            currentBalance: supplier.currentBalance
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/suppliers/:id/purchases
 * Record purchase from supplier (creates payable)
 */
router.post("/:id/purchases", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid supplier ID." });
        }

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found." });
        }

        const { billNumber, notes, items } = req.body || {};
        let finalAmount = 0;
        let formattedItems = [];

        if (Array.isArray(items) && items.length > 0) {
            formattedItems = items.map((item, idx) => {
                const name = typeof item.name === "string" ? item.name.trim() : "";
                if (!name) {
                    throw new Error(`Item #${idx + 1} must have a name.`);
                }
                const qty = Number(item.quantity);
                if (!Number.isFinite(qty) || qty <= 0) {
                    throw new Error(`Item "${name}" must have a valid quantity.`);
                }
                const price = Number(item.price);
                if (!Number.isFinite(price) || price < 0) {
                    throw new Error(`Item "${name}" must have a valid price.`);
                }
                const total = Math.round(qty * price * 100) / 100;
                return { name, quantity: qty, price, total };
            });

            finalAmount = formattedItems.reduce((acc, it) => acc + it.total, 0);
            finalAmount = Math.round(finalAmount * 100) / 100;
        } else {
            finalAmount = parsePositiveAmount(req.body.amount, "Purchase amount");
        }

        if (finalAmount <= 0) {
            return res.status(400).json({ success: false, message: "Purchase amount must be greater than zero." });
        }

        // Concurrency-safe atomic update
        const previousBalance = supplier.currentBalance || 0;
        const updatedSupplier = await Supplier.findOneAndUpdate(
            { _id: supplier._id },
            { $inc: { currentBalance: finalAmount } },
            { new: true }
        );

        const transaction = new SupplierTransaction({
            supplier: supplier._id,
            type: "PURCHASE",
            amount: finalAmount,
            items: formattedItems,
            billNumber: (billNumber || "").trim(),
            previousBalance,
            balanceAfter: updatedSupplier.currentBalance,
            notes: (notes || "").trim(),
            date: new Date()
        });

        await transaction.save();

        // Queue WhatsApp notification if enabled
        if (supplier.whatsappEnabled) {
            notificationService.createNotification({
                type: "SUPPLIER_PURCHASE",
                supplier: updatedSupplier,
                transaction,
                message: notificationService.buildSupplierPurchaseMessage(updatedSupplier, transaction)
            }).then((notifRes) => {
                if (notifRes?.notification) {
                    notificationService.scheduleNotification(notifRes.notification);
                }
            }).catch((err) => {
                console.error("Failed to queue supplier purchase WhatsApp notification:", err);
            });
        }

        res.status(201).json({
            success: true,
            transaction,
            supplier: updatedSupplier,
            message: "Supplier purchase recorded successfully."
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/suppliers/:id/payments
 * Record payment made to supplier (decreases payable)
 */
router.post("/:id/payments", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid supplier ID." });
        }

        const amount = parsePositiveAmount(req.body.amount, "Payment amount");
        const paymentMethod = ["UPI", "BANK_TRANSFER", "CHEQUE"].includes(req.body.paymentMethod)
            ? req.body.paymentMethod
            : "CASH";
        const notes = (req.body.notes || req.body.note || "").trim();

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found." });
        }

        const previousBalance = supplier.currentBalance || 0;
        if (amount > previousBalance) {
            return res.status(400).json({
                success: false,
                message: `Payment amount (₹${amount}) cannot exceed current payable balance (₹${previousBalance}).`
            });
        }

        // Concurrency-safe atomic decrement
        const updatedSupplier = await Supplier.findOneAndUpdate(
            { _id: supplier._id, currentBalance: { $gte: amount } },
            { $inc: { currentBalance: -amount } },
            { new: true }
        );

        if (!updatedSupplier) {
            return res.status(400).json({
                success: false,
                message: "Unable to record payment: payable balance changed concurrently."
            });
        }

        const transaction = new SupplierTransaction({
            supplier: supplier._id,
            type: "PAYMENT",
            amount,
            paymentMethod,
            previousBalance,
            balanceAfter: updatedSupplier.currentBalance,
            notes,
            date: new Date()
        });

        await transaction.save();

        // Queue WhatsApp notification if enabled
        if (supplier.whatsappEnabled) {
            notificationService.createNotification({
                type: "SUPPLIER_PAYMENT",
                supplier: updatedSupplier,
                transaction,
                message: notificationService.buildSupplierPaymentMessage(updatedSupplier, transaction)
            }).then((notifRes) => {
                if (notifRes?.notification) {
                    notificationService.scheduleNotification(notifRes.notification);
                }
            }).catch((err) => {
                console.error("Failed to queue supplier payment WhatsApp notification:", err);
            });
        }

        res.status(201).json({
            success: true,
            transaction,
            supplier: updatedSupplier,
            message: "Payment to supplier recorded successfully."
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/suppliers/:id/whatsapp
 * Toggle supplier WhatsApp preference
 */
router.put("/:id/whatsapp", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid supplier ID." });
        }

        const { enabled } = req.body;
        if (typeof enabled !== "boolean") {
            return res.status(400).json({ success: false, message: "Enabled flag must be a boolean." });
        }

        const supplier = await Supplier.findByIdAndUpdate(
            req.params.id,
            { $set: { whatsappEnabled: enabled } },
            { new: true }
        );

        if (!supplier) {
            return res.status(404).json({ success: false, message: "Supplier not found." });
        }

        res.json({ success: true, supplier, whatsappEnabled: supplier.whatsappEnabled });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/suppliers/:id/pdf
 * Export supplier statement PDF
 */
router.get("/:id/pdf", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).send("Invalid supplier ID.");
        }

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).send("Supplier not found.");
        }

        let filter = { supplier: supplier._id };
        let fromDate = null;
        let toDate = null;

        if (req.query.from && req.query.to) {
            fromDate = new Date(req.query.from);
            toDate = new Date(req.query.to);
            toDate.setHours(23, 59, 59, 999);

            filter.createdAt = { $gte: fromDate, $lte: toDate };
        }

        const transactions = await SupplierTransaction.find(filter).sort({ createdAt: 1 });

        pdfService.generateSupplierPdf(supplier, { transactions, from: fromDate, to: toDate }, res);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
