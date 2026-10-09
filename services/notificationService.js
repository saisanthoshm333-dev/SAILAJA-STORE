const Notification = require("../models/whatsappNotification");
const whatsappService = require("./whatsappService");

function formatAmount(amount) {
    return Number(amount || 0).toLocaleString("en-IN");
}

function buildBillMessage(customer, bill) {
    return [
        "🏪 SAILAJA STORE",
        "",
        "🧾 Today's Bill",
        "",
        `Customer: ${customer.name}`,
        "",
        `Bill Amount: ₹${formatAmount(bill.amount)}`,
        `Previous Balance: ₹${formatAmount(bill.previousBalance)}`,
        "",
        `Total Balance: ₹${formatAmount(bill.balanceAfter)}`,
        "",
        "Thank you 🙏"
    ].join("\n");
}

function buildPaymentMessage(customer, payment) {
    return [
        "🏪 SAILAJA STORE",
        "",
        "💰 Payment Received",
        "",
        `Customer: ${customer.name}`,
        "",
        `Paid Today: ₹${formatAmount(payment.amount)}`,
        `Previous Balance: ₹${formatAmount(payment.previousBalance)}`,
        "",
        `Remaining Balance: ₹${formatAmount(payment.balanceAfter)}`,
        "",
        "Thank you 🙏"
    ].join("\n");
}

function buildReminderMessage(customer) {
    return [
        "🏪 SAILAJA STORE",
        "",
        "🔔 Payment Reminder",
        "",
        `Hello ${customer.name},`,
        "",
        "Your pending balance is:",
        "",
        `₹${formatAmount(customer.currentBalance)}`,
        "",
        "Please clear the pending amount when convenient.",
        "",
        "Thank you 🙏"
    ].join("\n");
}

function buildSupplierPurchaseMessage(supplier, transaction) {
    return [
        "🏪 SAILAJA STORE",
        "",
        "📦 Goods / Purchase Recorded",
        "",
        `Supplier: ${supplier.name}${supplier.companyName ? ` (${supplier.companyName})` : ""}`,
        "",
        `Purchase Amount: ₹${formatAmount(transaction.amount)}`,
        `Previous Balance: ₹${formatAmount(transaction.previousBalance)}`,
        "",
        `Outstanding Payable: ₹${formatAmount(transaction.balanceAfter)}`,
        "",
        "Thank you 🙏"
    ].join("\n");
}

function buildSupplierPaymentMessage(supplier, transaction) {
    return [
        "🏪 SAILAJA STORE",
        "",
        "💰 Payment Made to Supplier",
        "",
        `Supplier: ${supplier.name}${supplier.companyName ? ` (${supplier.companyName})` : ""}`,
        "",
        `Paid: ₹${formatAmount(transaction.amount)}`,
        `Payment Mode: ${transaction.paymentMethod || "CASH"}`,
        `Previous Payable: ₹${formatAmount(transaction.previousBalance)}`,
        "",
        `Remaining Payable: ₹${formatAmount(transaction.balanceAfter)}`,
        "",
        "Thank you 🙏"
    ].join("\n");
}

async function createNotification({ type, customer, supplier, transaction, message }) {
    const party = customer || supplier;
    if (!party) {
        return {
            notification: null,
            reason: "Recipient party not provided."
        };
    }

    if (!party.whatsappEnabled) {
        return {
            notification: null,
            reason: `WhatsApp notifications are not enabled for this ${customer ? "customer" : "supplier"}.`
        };
    }

    const rawPhone = party.phone || party.mobile;
    const phone = whatsappService.normalizePhoneNumber(rawPhone);
    const transactionId = transaction?._id;
    const notificationKey = transactionId
        ? `${type}:${transactionId}`
        : undefined;

    if (notificationKey) {
        const existingNotification = await Notification.findOne({
            notificationKey
        });
        if (existingNotification) {
            return {
                notification: null,
                reason: "A notification already exists for this transaction."
            };
        }
    }

    const notification = new Notification({
        type,
        notificationKey,
        transactionId,
        customerId: customer?._id,
        supplierId: supplier?._id,
        recipientName: party.name,
        phone: phone || String(rawPhone || ""),
        message,
        status: phone ? "pending" : "failed",
        error: phone ? undefined : "Missing or invalid Indian WhatsApp number"
    });

    try {
        await notification.save();
    } catch (error) {
        if (error.code === 11000 && notificationKey) {
            return {
                notification: null,
                reason: "A notification already exists for this transaction."
            };
        }
        throw error;
    }

    return {
        notification: phone ? notification : null,
        reason: phone ? null : notification.error
    };
}

async function deliverNotification(notificationId) {
    const notification = await Notification.findOneAndUpdate(
        {
            _id: notificationId,
            status: "pending"
        },
        {
            $set: {
                status: "sending"
            }
        },
        {
            new: true
        }
    );

    if (!notification) {
        return;
    }

    try {
        await whatsappService.sendMessage(
            notification.phone,
            notification.message
        );
        notification.status = "sent";
        notification.sentAt = new Date();
        notification.error = undefined;
        await notification.save();
    } catch (error) {
        console.error("WhatsApp notification failed:", error);
        notification.status = "failed";
        notification.error = String(error.message || error).slice(0, 500);
        await notification.save();
    }
}

function scheduleNotification(notification) {
    if (!notification) {
        return;
    }

    setImmediate(() => {
        deliverNotification(notification._id).catch(async (error) => {
            console.error("Could not process WhatsApp notification:", error);
            try {
                await Notification.updateOne(
                    {
                        _id: notification._id,
                        status: "sending"
                    },
                    {
                        $set: {
                            status: "failed",
                            error: String(error.message || error).slice(0, 500)
                        }
                    }
                );
            } catch (updateError) {
                console.error(
                    "Could not update failed WhatsApp notification status:",
                    updateError
                );
            }
        });
    });
}

module.exports = {
    buildBillMessage,
    buildPaymentMessage,
    buildReminderMessage,
    buildSupplierPurchaseMessage,
    buildSupplierPaymentMessage,
    createNotification,
    deliverNotification,
    scheduleNotification
};
