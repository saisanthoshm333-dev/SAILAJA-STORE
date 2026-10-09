const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");

dotenv.config();

const Customer = require("./models/Customer");
const Bill = require("./models/Bill");
const Payment = require("./models/Payment");
const Item = require("./models/Item");
const Expense = require("./models/Expense");
const whatsappService = require("./services/whatsappService");
const notificationService = require("./services/notificationService");

const app = express();
app.locals.toDateInputValue = toDateInputValue;

const PORT = Number(process.env.PORT) || 3000;

const MONGO_URL = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lekko";

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests. Please try again in a minute."
    }
});

const allowedOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== "*");

function sanitizeText(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function validateText(value, fieldName, maxLength, required = false) {
    if (value === undefined || value === null) {
        value = "";
    }

    if (typeof value !== "string") {
        const error = new Error(`${fieldName} must be text.`);
        error.status = 400;
        throw error;
    }

    const text = value.trim();

    if ((required && !text) || text.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
        const error = new Error(`${fieldName} is invalid.`);
        error.status = 400;
        throw error;
    }

    return text;
}

function isValidObjectId(value) {
    return typeof value === "string" && mongoose.isObjectIdOrHexString(value);
}

function parsePositiveNumber(value, fieldName = "Amount") {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1000000000 || !/^\d+(\.\d{1,2})?$/.test(String(value).trim())) {
        const error = new Error(`${fieldName} must be a valid positive amount.`);
        error.status = 400;
        throw error;
    }

    return parsed;
}

function normalizeDate(value, fallback = new Date()) {
    if (!value) {
        value = fallback;
    }

    if (typeof value !== "string" && !(value instanceof Date)) {
        const error = new Error("Invalid date value.");
        error.status = 400;
        throw error;
    }

    if (typeof value === "string") {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

        if (!match) {
            const error = new Error("Invalid date value.");
            error.status = 400;
            throw error;
        }

        const [, yearText, monthText, dayText] = match;
        const year = Number(yearText);
        const month = Number(monthText);
        const day = Number(dayText);
        const date = new Date(year, month - 1, day);

        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            const error = new Error("Invalid date value.");
            error.status = 400;
            throw error;
        }

        return date;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        const error = new Error("Invalid date value.");
        error.status = 400;
        throw error;
    }

    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDateRange(fromValue, toValue) {
    const from = normalizeDate(fromValue);
    const to = normalizeDate(toValue, from);

    if (to < from) {
        const error = new Error("The end date must be on or after the start date.");
        error.status = 400;
        throw error;
    }

    const endExclusive = new Date(to);
    endExclusive.setDate(endExclusive.getDate() + 1);

    return {
        from,
        to,
        endExclusive
    };
}

function toDateInputValue(dateValue) {
    const date = new Date(dateValue);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

async function getMonthlyStats() {

    const now = new Date();
    const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
    );
    const startOfNextMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1
    );

    const [thisMonthAppu] = await Bill.aggregate([
        {
            $match: {
                type: "CREDIT",
                createdAt: {
                    $gte: startOfMonth,
                    $lt: startOfNextMonth
                }
            }
        },
        {
            $group: {
                _id: null,
                total: {
                    $sum: "$amount"
                }
            }
        }
    ]);

    const [thisMonthJama] = await Payment.aggregate([
        {
            $match: {
                createdAt: {
                    $gte: startOfMonth,
                    $lt: startOfNextMonth
                }
            }
        },
        {
            $group: {
                _id: null,
                total: {
                    $sum: "$amount"
                }
            }
        }
    ]);

    const [pendingResult] = await Customer.aggregate([
        {
            $group: {
                _id: null,
                total: {
                    $sum: "$currentBalance"
                }
            }
        }
    ]);

    return {
        totalAppu: thisMonthAppu?.total || 0,
        totalJama: thisMonthJama?.total || 0,
        totalPending: pendingResult?.total || 0
    };

}


// =========================
// MONGODB CONNECTION
// =========================

mongoose
    .connect(MONGO_URL)
    .then(() => {
        console.log("MongoDB connected successfully ✅");
    })
    .catch((err) => {
        console.error("MongoDB connection failed ❌");
        console.error(err);
    });


// =========================
// EXPRESS SETUP
// =========================

app.set("view engine", "ejs");

app.set(
    "views",
    path.join(__dirname, "views")
);

app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(cors({
    origin: (origin, callback) => {
        callback(null, Boolean(origin && allowedOrigins.includes(origin)) ? origin : false);
    }
}));

app.use(
    express.urlencoded({
        extended: true,
        limit: "100kb"
    })
);

app.use(express.json({ limit: "100kb" }));
app.use("/api", apiLimiter);

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

app.get("/health", (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({
        status: databaseReady ? "ok" : "unavailable",
        database: databaseReady ? "connected" : "disconnected"
    });
});


// =========================
// HOME PAGE
// =========================

app.get("/", async (req, res) => {

    try {

        const [customers, monthlyStats] = await Promise.all([
            Customer
                .find()
                .sort({
                    createdAt: -1
                }),
            getMonthlyStats()
        ]);

        res.render("home", {
            customers,
            monthlyStats
        });

    } catch (error) {

        console.error(error);

        res.status(500).send(
            "Failed to load customers"
        );

    }

});


// =========================
// CUSTOMERS PAGE
// =========================

app.get("/suppliers", async (req, res, next) => {

    try {

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const tomorrow = new Date(todayStart);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [items, todayExpenses, itemTotals] = await Promise.all([
            Item.find({ active: { $ne: false } }).sort({ name: 1 }),
            Expense.find({
                date: {
                    $gte: todayStart,
                    $lt: tomorrow
                }
            }).sort({ createdAt: -1 }),
            Expense.aggregate([
                {
                    $group: {
                        _id: "$itemId",
                        total: { $sum: "$amount" },
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        const totalsByItem = new Map(
            itemTotals.map((entry) => [String(entry._id), entry])
        );
        const todayTotal = todayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        const todayItemCount = new Set(todayExpenses.map((expense) => String(expense.itemId))).size;

        res.render("suppliers", {
            currentSection: "suppliers",
            items,
            todayExpenses,
            todayTotal,
            todayItemCount,
            totalsByItem
        });

    } catch (error) {

        console.error("SUPPLIERS ERROR:", error);
        next(error);

    }

});

app.get("/suppliers/expenses/add", async (req, res, next) => {

    try {

        const selectedItemId = sanitizeText(req.query.itemId);

        if (selectedItemId && !isValidObjectId(selectedItemId)) {
            return res.status(400).send("Invalid item.");
        }

        const items = await Item.find({ active: { $ne: false } }).sort({ name: 1 });

        res.render("add-expense", {
            currentSection: "suppliers",
            items,
            selectedItemId,
            todayValue: toDateInputValue(new Date())
        });

    } catch (error) {
        next(error);
    }

});

app.get("/suppliers/reports", async (req, res) => {

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    res.render("report", {
        currentSection: "suppliers",
        from: toDateInputValue(startOfMonth),
        to: toDateInputValue(endOfMonth)
    });

});

app.get("/suppliers/today", async (req, res, next) => {

    try {

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const expenses = await Expense.find({
            date: {
                $gte: today,
                $lt: tomorrow
            }
        }).sort({ createdAt: -1 });

        const todayTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        const todayItemCount = new Set(expenses.map((expense) => String(expense.itemId))).size;

        res.render("today-expenses", {
            currentSection: "suppliers",
            expenses,
            todayTotal,
            todayItemCount
        });

    } catch (error) {
        next(error);
    }

});

app.get("/suppliers/items/:itemId", async (req, res, next) => {

    try {

        if (!isValidObjectId(req.params.itemId)) {
            return res.status(400).send("Invalid item.");
        }

        const item = await Item.findById(req.params.itemId);

        if (!item) {
            return res.status(404).send("Item not found");
        }

        const expenses = await Expense.find({ itemId: item._id }).sort({ date: -1, createdAt: -1 });
        const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

        res.render("item-history", {
            currentSection: "suppliers",
            item,
            expenses,
            total
        });

    } catch (error) {
        next(error);
    }

});

app.get("/suppliers/report/pdf", async (req, res, next) => {

    try {

        const { from, to, endExclusive } = getDateRange(req.query.from, req.query.to);
        const filter = {
            date: {
                $gte: from,
                $lt: endExclusive
            }
        };

        const expenses = await Expense.find(filter)
            .sort({ date: 1, createdAt: 1 })
            .populate("itemId");

        const totals = new Map();
        let grandTotal = 0;

        for (const expense of expenses) {
            const itemName = expense.itemName || expense.itemId?.name || "Unknown";
            const current = totals.get(itemName) || 0;
            const nextTotal = current + expense.amount;
            totals.set(itemName, nextTotal);
            grandTotal += expense.amount;
        }

        const doc = new PDFDocument({
            size: "A4",
            margin: 40
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="sailaja-expense-report-${toDateInputValue(from)}-to-${toDateInputValue(to)}.pdf"`);

        doc.pipe(res);

        doc.fontSize(22).text("SAILAJA STORE", { align: "center" });
        doc.moveDown();
        doc.fontSize(14).text("Expense Report");
        doc.fontSize(10).text(`Date range: ${from.toLocaleDateString("en-IN")} to ${to.toLocaleDateString("en-IN")}`);
        doc.moveDown();

        doc.fontSize(12).text("SUMMARY");
        doc.moveDown(0.5);
        doc.text("Item", 60, doc.y, { width: 220, continued: true });
        doc.text("Total", { align: "right" });
        doc.moveDown();

        Array.from(totals.entries()).forEach(([itemName, itemTotal]) => {
            doc.text(itemName, 60, doc.y, { width: 220, continued: true });
            doc.text(`Rs. ${itemTotal.toLocaleString("en-IN")}`, { align: "right" });
            doc.moveDown(0.5);
        });

        doc.moveDown();
        doc.font("Helvetica-Bold");
        doc.text("TOTAL", 60, doc.y, { width: 220, continued: true });
        doc.text(`Rs. ${grandTotal.toLocaleString("en-IN")}`, { align: "right" });
        doc.font("Helvetica");
        doc.moveDown();

        const itemGroups = [];
        for (const expense of expenses) {
            const itemName = expense.itemName || expense.itemId?.name || "Unknown";
            const group = itemGroups.find((entry) => entry.name === itemName);

            if (group) {
                group.items.push(expense);
            } else {
                itemGroups.push({ name: itemName, items: [expense] });
            }
        }

        doc.moveDown();
        doc.fontSize(12).text("ITEM-WISE DETAILS");
        doc.moveDown();

        itemGroups.forEach((group, index) => {
            const total = group.items.reduce((sum, expense) => sum + expense.amount, 0);

            doc.font("Helvetica-Bold");
            doc.text(`${index + 1}. ${group.name.toUpperCase()}`);
            doc.font("Helvetica");
            doc.text(`Total: Rs. ${total.toLocaleString("en-IN")}`);
            doc.moveDown(0.5);
            doc.text("Date", 60, doc.y, { width: 130, continued: true });
            doc.text("Amount", { width: 120, continued: true });
            doc.text("Notes");
            doc.moveDown(0.5);

            group.items.forEach((expense) => {
                doc.text(expense.date.toLocaleDateString("en-IN"), 60, doc.y, { width: 130, continued: true });
                doc.text(`Rs. ${expense.amount.toLocaleString("en-IN")}`, { width: 120, continued: true });
                doc.text(expense.notes || "-");
                doc.moveDown(0.4);
            });

            doc.moveDown();
            doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
            doc.moveDown();
        });

        doc.end();

    } catch (error) {

        console.error("REPORT PDF ERROR:", error);
        next(error);

    }

});

app.get("/api/items", async (req, res, next) => {

    try {

        const items = await Item.find({ active: { $ne: false } }).sort({ name: 1 });
        res.json({ success: true, items });

    } catch (error) {
        next(error);
    }

});

app.post("/api/items", async (req, res, next) => {

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
                await itemExists.save();
                return res.json({ success: true, item: itemExists });
            }

            return res.status(409).json({
                success: false,
                message: "This item already exists."
            });
        }

        const item = await Item.create({
            name,
            icon,
            active: true
        });

        res.status(201).json({ success: true, item });

    } catch (error) {
        next(error);
    }

});

app.put("/api/items/:id", async (req, res, next) => {

    try {

        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid item."
            });
        }

        const body = req.body || {};
        const name = validateText(body.name, "Item name", 60, true);
        const icon = validateText(body.icon || "🧾", "Item icon", 8, true);
        const duplicate = await Item.findOne({
            _id: { $ne: req.params.id },
            name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
        });

        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: "An item with this name already exists."
            });
        }

        const item = await Item.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    name,
                    icon
                }
            },
            {
                returnDocument: "after",
                runValidators: true
            }
        );

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Item not found."
            });
        }

        res.json({ success: true, item });

    } catch (error) {
        next(error);
    }

});

app.delete("/api/items/:id", async (req, res, next) => {

    try {

        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid item."
            });
        }

        const item = await Item.findByIdAndUpdate(
            req.params.id,
            { $set: { active: false } },
            { returnDocument: "after" }
        );

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Item not found."
            });
        }

        res.json({ success: true, message: "Item removed." });

    } catch (error) {
        next(error);
    }

});

app.get("/api/expenses", async (req, res, next) => {

    try {

        let dateFilter = {};

        if (req.query.date) {
            const date = normalizeDate(req.query.date);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);
            dateFilter = {
                date: {
                    $gte: date,
                    $lt: nextDate
                }
            };
        }

        const expenses = await Expense.find(dateFilter).sort({ date: -1, createdAt: -1 });
        res.json({ success: true, expenses });

    } catch (error) {
        next(error);
    }

});

app.get("/api/expenses/today", async (req, res, next) => {

    try {

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const expenses = await Expense.find({
            date: {
                $gte: today,
                $lt: tomorrow
            }
        }).sort({ createdAt: -1 });

        res.json({ success: true, expenses });

    } catch (error) {
        next(error);
    }

});

app.get("/api/expenses/item/:itemId", async (req, res, next) => {

    try {

        if (!isValidObjectId(req.params.itemId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid item."
            });
        }

        const expenses = await Expense.find({ itemId: req.params.itemId }).sort({ date: -1, createdAt: -1 });
        const item = await Item.findById(req.params.itemId);

        res.json({
            success: true,
            item: item || null,
            expenses
        });

    } catch (error) {
        next(error);
    }

});

app.post("/api/expenses", async (req, res, next) => {

    try {

        const body = req.body || {};
        const itemId = body.itemId;

        if (!isValidObjectId(itemId)) {
            return res.status(400).json({
                success: false,
                message: "Please select a valid item."
            });
        }

        const item = await Item.findOne({
            _id: itemId,
            active: { $ne: false }
        });

        if (!item) {
            return res.status(400).json({
                success: false,
                message: "Please select a valid item."
            });
        }

        const amount = parsePositiveNumber(body.amount, "Amount");
        const date = normalizeDate(body.date || new Date());
        const notes = validateText(body.notes, "Note", 250);

        const expense = await Expense.create({
            itemId: item._id,
            itemName: item.name,
            amount,
            date,
            notes,
            createdAt: new Date()
        });

        res.status(201).json({ success: true, expense });

    } catch (error) {
        next(error);
    }

});

app.put("/api/expenses/:id", async (req, res, next) => {

    try {

        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid expense."
            });
        }

        const body = req.body || {};
        const amount = parsePositiveNumber(body.amount, "Amount");
        const date = normalizeDate(body.date || new Date());
        const notes = validateText(body.notes, "Note", 250);

        const expense = await Expense.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    amount,
                    date,
                    notes
                }
            },
            { returnDocument: "after", runValidators: true }
        );

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found."
            });
        }

        res.json({ success: true, expense });

    } catch (error) {
        next(error);
    }

});

app.delete("/api/expenses/:id", async (req, res, next) => {

    try {

        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid expense."
            });
        }

        const expense = await Expense.findById(req.params.id);

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found."
            });
        }

        await expense.deleteOne();

        res.json({ success: true, message: "Expense deleted." });

    } catch (error) {
        next(error);
    }

});

app.get("/api/expenses/report", async (req, res, next) => {

    try {

        const { from, to, endExclusive } = getDateRange(req.query.from, req.query.to);

        const expenses = await Expense.find({
            date: {
                $gte: from,
                $lt: endExclusive
            }
        }).sort({ date: 1, createdAt: 1 });

        const summary = new Map();
        let grandTotal = 0;

        for (const expense of expenses) {
            const key = expense.itemName || "Unknown";
            summary.set(key, (summary.get(key) || 0) + expense.amount);
            grandTotal += expense.amount;
        }

        res.json({
            success: true,
            from,
            to,
            summary: Object.fromEntries(summary),
            total: grandTotal,
            expenses
        });

    } catch (error) {
        next(error);
    }

});

app.get("/customers", async (req, res) => {

    const monthlyStats = await getMonthlyStats();

    res.render("customer", {
        monthlyStats,
        currentSection: "customers"
    });

});


// =========================
// ADD CUSTOMER PAGE
// =========================

app.get("/customers/add", async (req, res) => {

    const monthlyStats = await getMonthlyStats();

    res.render("add", {
        monthlyStats
    });

});


// =========================
// ADD CUSTOMER
// =========================

app.post("/customers/add", async (req, res) => {

    try {

        const {
            name,
            mobile,
            creditLimit,
            village,
            notes,
            whatsappEnabled
        } = req.body;


        const newCustomer = new Customer({

            name,

            mobile,

            phone: mobile,

            whatsappEnabled: whatsappEnabled === "on",

            creditLimit:
                creditLimit || 0,

            village,

            notes

        });


        await newCustomer.save();


        res.redirect("/");


    } catch (error) {

        console.error(
            "CUSTOMER ERROR:",
            error
        );

        res.status(500).send(
            "Failed to add customer"
        );

    }

});


// =========================
// ADD APPU
// =========================

app.post(
    "/customers/:id/appu",
    async (req, res) => {

        try {

            const customerId =
                req.params.id;

            const amount =
                Number(req.body.amount);

            const description =
                req.body.description;


            // Validate amount

            if (!amount || amount <= 0) {

                return res.json({

                    success: false,

                    message:
                        "Enter a valid amount"

                });

            }


            // Find customer

            const customer =
                await Customer.findById(
                    customerId
                );


            if (!customer) {

                return res.json({

                    success: false,

                    message:
                        "Customer not found"

                });

            }


            // Current balance

            const previousBalance =
                customer.currentBalance || 0;


            // New balance

            const balanceAfter =
                previousBalance + amount;


            // Create Bill record

            const bill = new Bill({

                customer:
                    customer._id,

                amount:
                    amount,

                description:
                    description,

                type:
                    "CREDIT",

                previousBalance:
                    previousBalance,

                balanceAfter:
                    balanceAfter,

                source:
                    "SHOP"

            });


            await bill.save();


            // Update customer balance

            customer.currentBalance =
                balanceAfter;

            await customer.save();

            const notificationResult =
                await notificationService.createNotification({
                    type: "BILL",
                    customer,
                    transaction: bill,
                    message: notificationService.buildBillMessage(
                        customer,
                        bill
                    )
                }).catch((error) => {
                    console.error(
                        "Could not save bill WhatsApp notification:",
                        error
                    );
                    return null;
                });

            res.json({

                success: true

            });

            notificationService.scheduleNotification(
                notificationResult?.notification
            );


        } catch (error) {

            console.error(
                "APPU ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Failed to add Appu"

            });

        }

    }
);


// =========================
// ADD JAMA
// =========================

app.post(
    "/customers/:id/jama",
    async (req, res) => {

        try {

            const customerId =
                req.params.id;

            const amount =
                Number(req.body.amount);

            const paymentMethod =
                req.body.paymentMethod;

            const note =
                req.body.note;


            // Validate amount

            if (!amount || amount <= 0) {

                return res.json({

                    success: false,

                    message:
                        "Enter a valid amount"

                });

            }


            // Find customer

            const customer =
                await Customer.findById(
                    customerId
                );


            if (!customer) {

                return res.json({

                    success: false,

                    message:
                        "Customer not found"

                });

            }


            // Current balance

            const previousBalance =
                customer.currentBalance || 0;


            // Prevent overpayment

            if (amount > previousBalance) {

                return res.json({

                    success: false,

                    message:
                        "Jama amount cannot be greater than pending balance"

                });

            }


            // New balance

            const balanceAfter =
                previousBalance - amount;


            // Create Payment record

            const payment = new Payment({

                customer:
                    customer._id,

                amount:
                    amount,

                paymentMethod:
                    paymentMethod || "CASH",

                previousBalance:
                    previousBalance,

                balanceAfter:
                    balanceAfter,

                note:
                    note

            });


            await payment.save();


            // Update customer balance

            customer.currentBalance =
                balanceAfter;

            await customer.save();

            const notificationResult =
                await notificationService.createNotification({
                    type: "PAYMENT",
                    customer,
                    transaction: payment,
                    message: notificationService.buildPaymentMessage(
                        customer,
                        payment
                    )
                }).catch((error) => {
                    console.error(
                        "Could not save payment WhatsApp notification:",
                        error
                    );
                    return null;
                });

            res.json({

                success: true

            });

            notificationService.scheduleNotification(
                notificationResult?.notification
            );


        } catch (error) {

            console.error(
                "JAMA ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Failed to add Jama"

            });

        }

    }
);


// =========================
// PAYMENT REMINDER
// =========================

app.post(
    "/customers/:id/reminder",
    async (req, res) => {

        try {

            const customer =
                await Customer.findById(req.params.id);

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found"
                });
            }

            if (!customer.whatsappEnabled) {
                return res.json({
                    success: false,
                    message: "WhatsApp notifications are not enabled for this customer."
                });
            }

            if (!whatsappService.normalizePhoneNumber(customer.phone || customer.mobile)) {
                return res.json({
                    success: false,
                    message: "This customer does not have a valid Indian WhatsApp number."
                });
            }

            if (!(customer.currentBalance > 0)) {
                return res.json({
                    success: false,
                    message: "This customer has no pending balance."
                });
            }

            const { notification } =
                await notificationService.createNotification({
                    type: "REMINDER",
                    customer,
                    message: notificationService.buildReminderMessage(customer)
                });

            res.json({
                success: true,
                message: "Payment reminder queued."
            });

            notificationService.scheduleNotification(notification);

        } catch (error) {

            console.error("REMINDER ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Failed to queue payment reminder"
            });

        }

    }
);


// =========================
// WHATSAPP CUSTOMER PREFERENCE
// =========================

app.post(
    "/customers/:id/whatsapp-preference",
    async (req, res) => {

        try {

            if (typeof req.body.enabled !== "boolean") {
                return res.status(400).json({
                    success: false,
                    message: "WhatsApp preference must be enabled or disabled."
                });
            }

            const customer =
                await Customer.findByIdAndUpdate(
                    req.params.id,
                    {
                        $set: {
                            whatsappEnabled: req.body.enabled
                        }
                    },
                    {
                        new: true,
                        runValidators: true
                    }
                );

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found"
                });
            }

            res.json({
                success: true,
                enabled: customer.whatsappEnabled
            });

        } catch (error) {

            console.error("WHATSAPP PREFERENCE ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Failed to update WhatsApp preference"
            });

        }

    }
);


// =========================
// CUSTOMER HISTORY
// =========================

app.get(
    "/customers/:id/history",
    async (req, res) => {

        try {

            const customerId =
                req.params.id;

            const monthlyStats = await getMonthlyStats();


            // Find customer

            const customer =
                await Customer.findById(
                    customerId
                );


            if (!customer) {

                return res.status(404).send(
                    "Customer not found"
                );

            }


            // Get Appu history

            const appuHistory =
                await Bill
                    .find({
                        customer: customerId,
                        type: "CREDIT"
                    })
                    .sort({
                        createdAt: -1
                    });


            // Get Jama history

            const jamaHistory =
                await Payment
                    .find({
                        customer: customerId
                    })
                    .sort({
                        createdAt: -1
                    });


            // Total Appu

            const totalAppu =
                appuHistory.reduce(
                    (total, bill) => {

                        return total + bill.amount;

                    },
                    0
                );


            // Total Jama

            const totalJama =
                jamaHistory.reduce(
                    (total, payment) => {

                        return total + payment.amount;

                    },
                    0
                );


            // Render history page

            res.render("history", {

                customer,

                appuHistory,

                jamaHistory,

                totalAppu,

                totalJama,

                monthlyStats

            });


        } catch (error) {

            console.error(
                "HISTORY ERROR:",
                error
            );

            res.status(500).send(
                "Failed to load customer history"
            );

        }

    }
);


// =========================
// GENERATE CUSTOMER PDF
// =========================

app.get(
    "/customers/:id/history/pdf",
    async (req, res) => {

        try {

            const customerId =
                req.params.id;


            // =========================
            // FIND CUSTOMER
            // =========================

            const customer =
                await Customer.findById(
                    customerId
                );


            if (!customer) {

                return res.status(404).send(
                    "Customer not found"
                );

            }


            // =========================
            // GET APPU HISTORY
            // =========================

            const appuHistory =
                await Bill
                    .find({
                        customer: customerId,
                        type: "CREDIT"
                    })
                    .sort({
                        createdAt: 1
                    });


            // =========================
            // GET JAMA HISTORY
            // =========================

            const jamaHistory =
                await Payment
                    .find({
                        customer: customerId
                    })
                    .sort({
                        createdAt: 1
                    });


            // =========================
            // CALCULATE TOTALS
            // =========================

            const totalAppu =
                appuHistory.reduce(
                    (total, bill) => {

                        return total + bill.amount;

                    },
                    0
                );


            const totalJama =
                jamaHistory.reduce(
                    (total, payment) => {

                        return total + payment.amount;

                    },
                    0
                );


            const pending =
                totalAppu - totalJama;


            // =========================
            // CREATE PDF
            // =========================

            const doc =
                new PDFDocument({
                    size: "A4",
                    margin: 50
                });


            // =========================
            // RESPONSE HEADERS
            // =========================

            res.setHeader(
                "Content-Type",
                "application/pdf"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${customer.name}-ledger.pdf"`
            );


            // Connect PDF to response

            doc.pipe(res);


            // =========================
            // STORE HEADER
            // =========================

            doc
                .fontSize(22)
                .font("Helvetica-Bold")
                .text(
                    "SAILAJA STORE",
                    {
                        align: "center"
                    }
                );


            doc
                .fontSize(11)
                .font("Helvetica")
                .text(
                    "Digital Customer Ledger",
                    {
                        align: "center"
                    }
                );


            doc.moveDown();


            // =========================
            // CUSTOMER DETAILS
            // =========================

            doc
                .fontSize(14)
                .font("Helvetica-Bold")
                .text(
                    customer.name
                );


            doc
                .fontSize(10)
                .font("Helvetica")
                .text(
                    `Mobile: ${customer.mobile}`
                );


            doc.text(
                `Generated: ${new Date().toLocaleString("en-IN")}`
            );


            doc.moveDown();


            // Horizontal line

            doc
                .moveTo(50, doc.y)
                .lineTo(545, doc.y)
                .stroke();


            doc.moveDown();


            // =========================
            // APPU SECTION
            // =========================

            doc
                .fontSize(16)
                .font("Helvetica-Bold")
                .text(
                    "APPU / CREDIT"
                );


            doc.moveDown(0.5);


            if (appuHistory.length === 0) {

                doc
                    .fontSize(10)
                    .font("Helvetica")
                    .text(
                        "No Appu transactions."
                    );

            } else {

                appuHistory.forEach(
                    (bill) => {

                        const date =
                            new Date(
                                bill.createdAt
                            ).toLocaleDateString(
                                "en-IN"
                            );


                        const time =
                            new Date(
                                bill.createdAt
                            ).toLocaleTimeString(
                                "en-IN",
                                {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                }
                            );


                        doc
                            .fontSize(10)
                            .font("Helvetica-Bold")
                            .text(
                                `${date} ${time}`
                            );


                        doc
                            .fontSize(10)
                            .font("Helvetica")
                            .text(
                                `Description: ${
                                    bill.description ||
                                    "Shop purchase"
                                }`
                            );


                        doc.text(
                            `Amount: Rs. ${bill.amount.toLocaleString("en-IN")}`
                        );


                        doc.text(
                            `Balance after: Rs. ${bill.balanceAfter.toLocaleString("en-IN")}`
                        );


                        doc.moveDown(0.5);


                        doc
                            .moveTo(50, doc.y)
                            .lineTo(545, doc.y)
                            .strokeColor("#dddddd")
                            .stroke();


                        doc.strokeColor("#000000");


                        doc.moveDown(0.5);

                    }
                );

            }


            // Total Appu

            doc
                .fontSize(11)
                .font("Helvetica-Bold")
                .text(
                    `Total Appu: Rs. ${totalAppu.toLocaleString("en-IN")}`
                );


            doc.moveDown();


            // =========================
            // JAMA SECTION
            // =========================

            doc
                .fontSize(16)
                .font("Helvetica-Bold")
                .text(
                    "JAMA / PAYMENTS"
                );


            doc.moveDown(0.5);


            if (jamaHistory.length === 0) {

                doc
                    .fontSize(10)
                    .font("Helvetica")
                    .text(
                        "No Jama transactions."
                    );

            } else {

                jamaHistory.forEach(
                    (payment) => {

                        const date =
                            new Date(
                                payment.createdAt
                            ).toLocaleDateString(
                                "en-IN"
                            );


                        const time =
                            new Date(
                                payment.createdAt
                            ).toLocaleTimeString(
                                "en-IN",
                                {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                }
                            );


                        doc
                            .fontSize(10)
                            .font("Helvetica-Bold")
                            .text(
                                `${date} ${time}`
                            );


                        doc
                            .fontSize(10)
                            .font("Helvetica")
                            .text(
                                `Payment Method: ${
                                    payment.paymentMethod
                                }`
                            );


                        doc.text(
                            `Note: ${
                                payment.note ||
                                "Payment received"
                            }`
                        );


                        doc.text(
                            `Amount: Rs. ${payment.amount.toLocaleString("en-IN")}`
                        );


                        doc.text(
                            `Balance after: Rs. ${payment.balanceAfter.toLocaleString("en-IN")}`
                        );


                        doc.moveDown(0.5);


                        doc
                            .moveTo(50, doc.y)
                            .lineTo(545, doc.y)
                            .strokeColor("#dddddd")
                            .stroke();


                        doc.strokeColor("#000000");


                        doc.moveDown(0.5);

                    }
                );

            }


            // Total Jama

            doc
                .fontSize(11)
                .font("Helvetica-Bold")
                .text(
                    `Total Jama: Rs. ${totalJama.toLocaleString("en-IN")}`
                );


            doc.moveDown();


            // =========================
            // FINAL SUMMARY
            // =========================

            doc
                .moveTo(50, doc.y)
                .lineTo(545, doc.y)
                .stroke();


            doc.moveDown();


            doc
                .fontSize(16)
                .font("Helvetica-Bold")
                .text(
                    "FINAL SUMMARY"
                );


            doc.moveDown(0.5);


            doc
                .fontSize(11)
                .font("Helvetica")
                .text(
                    `Total Appu: Rs. ${totalAppu.toLocaleString("en-IN")}`
                );


            doc.text(
                `Total Jama: Rs. ${totalJama.toLocaleString("en-IN")}`
            );


            doc
                .font("Helvetica-Bold")
                .text(
                    `Pending: Rs. ${pending.toLocaleString("en-IN")}`
                );


            doc.moveDown();


            // =========================
            // FINAL CALCULATION
            // =========================

            doc
                .fontSize(12)
                .font("Helvetica-Bold")
                .text(
                    `Rs. ${totalAppu.toLocaleString("en-IN")} - Rs. ${totalJama.toLocaleString("en-IN")} = Rs. ${pending.toLocaleString("en-IN")}`,
                    {
                        align: "center"
                    }
                );


            doc.moveDown();


            // =========================
            // FOOTER
            // =========================

            doc
                .fontSize(9)
                .font("Helvetica")
                .fillColor("#777777")
                .text(
                    "Generated by LEKKO",
                    {
                        align: "center"
                    }
                );


            // Finish PDF

            doc.end();


        } catch (error) {

            console.error(
                "PDF ERROR:",
                error
            );

            res.status(500).send(
                "Failed to generate PDF"
            );

        }

    }
);


// =========================
// ERROR HANDLER
// =========================

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500
        ? err.status
        : (
        err.name === "ValidationError" || err.name === "CastError" || err.type === "entity.parse.failed"
            ? 400
            : err.code === 11000
                ? 409
                : 500
        );

    if (status >= 500) {
        console.error("UNHANDLED ERROR:", err);
    } else {
        console.warn("REQUEST REJECTED:", req.method, req.path, err.message);
    }

    const message = status === 400
        ? "Please check the information and try again."
        : status === 409
            ? "This item already exists."
            : "Something went wrong. Please try again.";

    res.status(status).json({
        success: false,
        message
    });
});

// =========================
// 404
// =========================

app.use((req, res) => {

    res.status(404).send(
        "Page not found"
    );

});


// =========================
// START SERVER
// =========================

app.listen(PORT, () => {

    console.log(
        `LEKKO running at http://localhost:${PORT}`
    );

    // WBM opens WhatsApp Web for QR pairing; connection failure must not stop billing.
        whatsappService.initializeWhatsApp().catch((error) => {
            console.error("WhatsApp initialization failed:", error);
        });

});