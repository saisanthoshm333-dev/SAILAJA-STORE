const express = require("express");
const mongoose = require("mongoose");
const Customer = require("../models/customer");
const Bill = require("../models/bill");
const Payment = require("../models/payment");
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

// Calculate monthly stats for customers
async function getCustomerStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [thisMonthAppu] = await Bill.aggregate([
        {
            $match: {
                type: "CREDIT",
                createdAt: { $gte: startOfMonth, $lt: startOfNextMonth }
            }
        },
        {
            $group: { _id: null, total: { $sum: "$amount" } }
        }
    ]);

    const [thisMonthJama] = await Payment.aggregate([
        {
            $match: {
                createdAt: { $gte: startOfMonth, $lt: startOfNextMonth }
            }
        },
        {
            $group: { _id: null, total: { $sum: "$amount" } }
        }
    ]);

    const [pendingResult] = await Customer.aggregate([
        { $match: { active: { $ne: false } } },
        {
            $group: { _id: null, total: { $sum: "$currentBalance" } }
        }
    ]);

    return {
        totalAppu: thisMonthAppu?.total || 0,
        totalJama: thisMonthJama?.total || 0,
        totalPending: pendingResult?.total || 0
    };
}

/**
 * GET /api/customers
 * List all active customers with search and stats
 */
router.get("/", async (req, res, next) => {
    try {
        const { search, includeArchived } = req.query;
        const query = includeArchived === "true" ? {} : { active: { $ne: false } };

        if (search && typeof search === "string" && search.trim()) {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            query.$or = [{ name: regex }, { mobile: regex }, { village: regex }];
        }

        const [customers, stats] = await Promise.all([
            Customer.find(query).sort({ currentBalance: -1, updatedAt: -1 }),
            getCustomerStats()
        ]);

        res.json({
            success: true,
            customers,
            stats: {
                ...stats,
                customerCount: customers.length
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/customers/:id
 * Get single customer details
 */
router.get("/:id", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid customer ID." });
        }

        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found." });
        }

        res.json({ success: true, customer });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/customers
 * Add customer
 */
router.post("/", async (req, res, next) => {
    try {
        const { name, mobile, creditLimit, village, notes, whatsappEnabled } = req.body || {};

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ success: false, message: "Customer name is required." });
        }
        if (!mobile || typeof mobile !== "string" || !mobile.trim()) {
            return res.status(400).json({ success: false, message: "Mobile number is required." });
        }

        const cleanMobile = mobile.trim();
        const existing = await Customer.findOne({ mobile: cleanMobile });
        if (existing) {
            if (existing.active === false) {
                existing.active = true;
                existing.name = name.trim();
                existing.village = (village || "").trim();
                existing.notes = (notes || "").trim();
                existing.creditLimit = Number(creditLimit) || 0;
                existing.whatsappEnabled = Boolean(whatsappEnabled);
                await existing.save();
                return res.status(200).json({ success: true, customer: existing, message: "Existing archived customer reactivated." });
            }
            return res.status(409).json({ success: false, message: "A customer with this mobile number already exists." });
        }

        const customer = new Customer({
            name: name.trim(),
            mobile: cleanMobile,
            phone: cleanMobile,
            village: (village || "").trim(),
            notes: (notes || "").trim(),
            creditLimit: Number(creditLimit) || 0,
            whatsappEnabled: Boolean(whatsappEnabled),
            active: true
        });

        await customer.save();
        res.status(201).json({ success: true, customer });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/customers/:id
 * Update customer
 */
router.put("/:id", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid customer ID." });
        }

        const { name, mobile, creditLimit, village, notes, whatsappEnabled } = req.body || {};

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Customer name is required." });
        }
        if (!mobile || !mobile.trim()) {
            return res.status(400).json({ success: false, message: "Mobile number is required." });
        }

        const cleanMobile = mobile.trim();
        const conflict = await Customer.findOne({
            _id: { $ne: req.params.id },
            mobile: cleanMobile
        });
        if (conflict) {
            return res.status(409).json({ success: false, message: "Another customer is already using this mobile number." });
        }

        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    name: name.trim(),
                    mobile: cleanMobile,
                    phone: cleanMobile,
                    village: (village || "").trim(),
                    notes: (notes || "").trim(),
                    creditLimit: Number(creditLimit) || 0,
                    whatsappEnabled: Boolean(whatsappEnabled)
                }
            },
            { new: true, runValidators: true }
        );

        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found." });
        }

        res.json({ success: true, customer });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/customers/:id
 * Safe delete: if customer has transactions or balance, archive it; else delete.
 */
router.delete("/:id", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid customer ID." });
        }

        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found." });
        }

        const [billCount, paymentCount] = await Promise.all([
            Bill.countDocuments({ customer: customer._id }),
            Payment.countDocuments({ customer: customer._id })
        ]);

        if (customer.currentBalance > 0 || billCount > 0 || paymentCount > 0) {
            // Soft delete to protect financial history
            customer.active = false;
            await customer.save();
            return res.json({
                success: true,
                archived: true,
                message: "Customer has transaction history and has been safely archived."
            });
        }

        await customer.deleteOne();
        res.json({ success: true, archived: false, message: "Customer deleted successfully." });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/customers/:id/history
 * Transaction history
 */
router.get("/:id/history", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid customer ID." });
        }

        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found." });
        }

        const [bills, payments] = await Promise.all([
            Bill.find({ customer: customer._id }).sort({ createdAt: -1 }),
            Payment.find({ customer: customer._id }).sort({ createdAt: -1 })
        ]);

        const totalAppu = bills.reduce((sum, b) => sum + (b.amount || 0), 0);
        const totalJama = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

        res.json({
            success: true,
            customer,
            bills,
            payments,
            totalAppu,
            totalJama,
            currentBalance: customer.currentBalance
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/customers/:id/bills
 * Add credit bill (Appu) with optional line items
 */
router.post("/:id/bills", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid customer ID." });
        }

        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found." });
        }

        const { description, items } = req.body || {};
        let finalAmount = 0;
        let formattedItems = [];

        // Support multiple line items with server calculation
        if (Array.isArray(items) && items.length > 0) {
            formattedItems = items.map((item, idx) => {
                const name = typeof item.name === "string" ? item.name.trim() : "";
                if (!name) {
                    throw new Error(`Item #${idx + 1} must have a name.`);
                }
                const qty = Number(item.quantity);
                if (!Number.isFinite(qty) || qty <= 0) {
                    throw new Error(`Item "${name}" must have a positive quantity.`);
                }
                const price = Number(item.price);
                if (!Number.isFinite(price) || price < 0) {
                    throw new Error(`Item "${name}" price cannot be negative.`);
                }
                const total = Math.round(qty * price * 100) / 100;
                return { name, quantity: qty, price, total };
            });

            finalAmount = formattedItems.reduce((acc, it) => acc + it.total, 0);
            finalAmount = Math.round(finalAmount * 100) / 100;
        } else {
            finalAmount = parsePositiveAmount(req.body.amount, "Bill amount");
        }

        if (finalAmount <= 0) {
            return res.status(400).json({ success: false, message: "Bill total must be greater than zero." });
        }

        // Concurrency-safe atomic balance update
        const previousBalance = customer.currentBalance || 0;
        const balanceAfter = Math.round((previousBalance + finalAmount) * 100) / 100;

        const updatedCustomer = await Customer.findOneAndUpdate(
            { _id: customer._id },
            { $inc: { currentBalance: finalAmount } },
            { new: true }
        );

        const bill = new Bill({
            customer: customer._id,
            amount: finalAmount,
            description: (description || "").trim(),
            items: formattedItems,
            type: "CREDIT",
            previousBalance,
            balanceAfter: updatedCustomer.currentBalance,
            source: "SHOP"
        });

        await bill.save();

        // Queue WhatsApp notification if enabled
        if (customer.whatsappEnabled) {
            notificationService.createNotification({
                type: "BILL",
                customer: updatedCustomer,
                transaction: bill,
                message: notificationService.buildBillMessage(updatedCustomer, bill)
            }).then((notifRes) => {
                if (notifRes?.notification) {
                    notificationService.scheduleNotification(notifRes.notification);
                }
            }).catch((err) => {
                console.error("Failed to queue bill WhatsApp notification:", err);
            });
        }

        res.status(201).json({
            success: true,
            bill,
            customer: updatedCustomer,
            message: "Bill created successfully."
        });
    } catch (error) {
        next(error);
    }
});

// Alias for backwards compatibility with old form posts: /customers/:id/appu
router.post("/:id/appu", (req, res, next) => {
    return router.handle(Object.assign(req, { url: `/${req.params.id}/bills` }), res, next);
});

/**
 * POST /api/customers/:id/payments
 * Record customer payment (Jama)
 */
router.post("/:id/payments", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid customer ID." });
        }

        const amount = parsePositiveAmount(req.body.amount, "Payment amount");
        const paymentMethod = req.body.paymentMethod === "UPI" ? "UPI" : "CASH";
        const note = (req.body.note || req.body.description || "").trim();

        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found." });
        }

        const previousBalance = customer.currentBalance || 0;
        if (amount > previousBalance) {
            return res.status(400).json({
                success: false,
                message: `Payment amount (₹${amount}) cannot exceed pending balance (₹${previousBalance}).`
            });
        }

        // Concurrency-safe atomic update
        const updatedCustomer = await Customer.findOneAndUpdate(
            { _id: customer._id, currentBalance: { $gte: amount } },
            { $inc: { currentBalance: -amount } },
            { new: true }
        );

        if (!updatedCustomer) {
            return res.status(400).json({
                success: false,
                message: "Unable to process payment: balance changed concurrently."
            });
        }

        const payment = new Payment({
            customer: customer._id,
            amount,
            paymentMethod,
            previousBalance,
            balanceAfter: updatedCustomer.currentBalance,
            note
        });

        await payment.save();

        // Queue WhatsApp notification if enabled
        if (customer.whatsappEnabled) {
            notificationService.createNotification({
                type: "PAYMENT",
                customer: updatedCustomer,
                transaction: payment,
                message: notificationService.buildPaymentMessage(updatedCustomer, payment)
            }).then((notifRes) => {
                if (notifRes?.notification) {
                    notificationService.scheduleNotification(notifRes.notification);
                }
            }).catch((err) => {
                console.error("Failed to queue payment WhatsApp notification:", err);
            });
        }

        res.status(201).json({
            success: true,
            payment,
            customer: updatedCustomer,
            message: "Payment recorded successfully."
        });
    } catch (error) {
        next(error);
    }
});

// Alias for backwards compatibility: /customers/:id/jama
router.post("/:id/jama", (req, res, next) => {
    return router.handle(Object.assign(req, { url: `/${req.params.id}/payments` }), res, next);
});

/**
 * POST /api/customers/:id/reminder
 * Trigger payment reminder via WhatsApp
 */
router.post("/:id/reminder", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid customer ID." });
        }

        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found." });
        }

        if (!customer.whatsappEnabled) {
            return res.status(400).json({
                success: false,
                message: "WhatsApp notifications are disabled for this customer."
            });
        }

        if (!(customer.currentBalance > 0)) {
            return res.status(400).json({
                success: false,
                message: "This customer has no pending balance."
            });
        }

        const notifRes = await notificationService.createNotification({
            type: "REMINDER",
            customer,
            message: notificationService.buildReminderMessage(customer)
        });

        if (notifRes?.notification) {
            notificationService.scheduleNotification(notifRes.notification);
        }

        res.json({
            success: true,
            message: "Payment reminder queued successfully."
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/customers/:id/whatsapp
 * Toggle customer WhatsApp preference
 */
router.put("/:id/whatsapp", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid customer ID." });
        }

        const { enabled } = req.body;
        if (typeof enabled !== "boolean") {
            return res.status(400).json({ success: false, message: "Enabled flag must be a boolean." });
        }

        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            { $set: { whatsappEnabled: enabled } },
            { new: true }
        );

        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found." });
        }

        res.json({ success: true, customer, whatsappEnabled: customer.whatsappEnabled });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/customers/:id/pdf
 * Export customer transaction ledger PDF
 */
router.get("/:id/pdf", async (req, res, next) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).send("Invalid customer ID.");
        }

        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return res.status(404).send("Customer not found.");
        }

        let billFilter = { customer: customer._id };
        let paymentFilter = { customer: customer._id };

        let fromDate = null;
        let toDate = null;
        if (req.query.from && req.query.to) {
            fromDate = new Date(req.query.from);
            toDate = new Date(req.query.to);
            toDate.setHours(23, 59, 59, 999);

            billFilter.createdAt = { $gte: fromDate, $lte: toDate };
            paymentFilter.createdAt = { $gte: fromDate, $lte: toDate };
        }

        const [bills, payments] = await Promise.all([
            Bill.find(billFilter).sort({ createdAt: 1 }),
            Payment.find(paymentFilter).sort({ createdAt: 1 })
        ]);

        pdfService.generateCustomerPdf(customer, { bills, payments, from: fromDate, to: toDate }, res);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
