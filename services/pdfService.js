const PDFDocument = require("pdfkit");

function formatInr(amount) {
    return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatDate(date) {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatDateTime(date) {
    if (!date) return "-";
    return new Date(date).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

/**
 * Generate Customer Ledger PDF
 */
function generateCustomerPdf(customer, { bills = [], payments = [], from, to }, res) {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    const filename = `sailaja-customer-${customer.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    doc.pipe(res);

    // Header
    doc.fontSize(22).font("Helvetica-Bold").text("SAILAJA STORE", { align: "center" });
    doc.fontSize(11).font("Helvetica").text("Customer Transaction Ledger", { align: "center" });
    doc.moveDown(0.5);

    // Customer info & date range
    doc.fontSize(12).font("Helvetica-Bold").text(`Customer: ${customer.name}`);
    doc.fontSize(10).font("Helvetica").text(`Mobile: ${customer.mobile || customer.phone || "-"}`);
    if (customer.village) doc.text(`Village: ${customer.village}`);
    doc.text(`Generated: ${formatDateTime(new Date())}`);
    if (from && to) {
        doc.text(`Period: ${formatDate(from)} to ${formatDate(to)}`);
    }

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#3b82f6").lineWidth(1.5).stroke();
    doc.strokeColor("#000000").lineWidth(1);
    doc.moveDown(0.8);

    // Combine transactions chronologically
    const allTransactions = [
        ...bills.map((b) => ({
            date: b.createdAt || b.date,
            type: "APPU (CREDIT)",
            amount: b.amount,
            notes: b.description || "Purchase",
            balanceAfter: b.balanceAfter,
            isCredit: true
        })),
        ...payments.map((p) => ({
            date: p.createdAt || p.date,
            type: `JAMA (${p.paymentMethod || "PAYMENT"})`,
            amount: p.amount,
            notes: p.note || "Payment received",
            balanceAfter: p.balanceAfter,
            isCredit: false
        }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Summary calculation
    const totalAppu = bills.reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalJama = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const pendingBalance = customer.currentBalance;

    doc.fontSize(12).font("Helvetica-Bold").text("TRANSACTION HISTORY");
    doc.moveDown(0.5);

    // Table Header
    const yHeader = doc.y;
    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Date & Time", 40, yHeader, { width: 110 });
    doc.text("Type", 155, yHeader, { width: 90 });
    doc.text("Details / Notes", 250, yHeader, { width: 140 });
    doc.text("Amount", 395, yHeader, { width: 75, align: "right" });
    doc.text("Balance", 475, yHeader, { width: 80, align: "right" });
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cbd5e1").stroke();
    doc.moveDown(0.4);

    if (allTransactions.length === 0) {
        doc.fontSize(10).font("Helvetica").text("No transactions found for the selected period.", 40, doc.y);
        doc.moveDown();
    } else {
        doc.font("Helvetica").fontSize(9);
        for (const tx of allTransactions) {
            if (doc.y > 720) {
                doc.addPage();
            }
            const yRow = doc.y;
            doc.text(formatDateTime(tx.date), 40, yRow, { width: 110 });
            doc.font(tx.isCredit ? "Helvetica-Bold" : "Helvetica");
            doc.text(tx.type, 155, yRow, { width: 90 });
            doc.font("Helvetica");
            doc.text(tx.notes || "-", 250, yRow, { width: 140, lineBreak: false, ellipsis: true });
            doc.text(formatInr(tx.amount), 395, yRow, { width: 75, align: "right" });
            doc.text(formatInr(tx.balanceAfter), 475, yRow, { width: 80, align: "right" });
            doc.moveDown(0.5);
        }
    }

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#3b82f6").lineWidth(1).stroke();
    doc.moveDown(0.8);

    // Summary Box
    doc.fontSize(11).font("Helvetica-Bold").text("SUMMARY");
    doc.fontSize(10).font("Helvetica");
    doc.text(`Total Appu (Credit given): ${formatInr(totalAppu)}`);
    doc.text(`Total Jama (Payment received): ${formatInr(totalJama)}`);
    doc.font("Helvetica-Bold").fontSize(11).text(`Current Pending Balance: ${formatInr(pendingBalance)}`);

    doc.moveDown(1.5);
    doc.fontSize(8).font("Helvetica").fillColor("#64748b").text("SAILAJA STORE • Simple Mobile Business Management", { align: "center" });

    doc.end();
}

/**
 * Generate Supplier Ledger PDF
 */
function generateSupplierPdf(supplier, { transactions = [], from, to }, res) {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    const filename = `sailaja-supplier-${supplier.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    doc.pipe(res);

    // Header
    doc.fontSize(22).font("Helvetica-Bold").text("SAILAJA STORE", { align: "center" });
    doc.fontSize(11).font("Helvetica").text("Supplier Account Statement", { align: "center" });
    doc.moveDown(0.5);

    // Supplier info
    doc.fontSize(12).font("Helvetica-Bold").text(`Supplier: ${supplier.name}`);
    if (supplier.companyName) doc.fontSize(10).font("Helvetica").text(`Company / Firm: ${supplier.companyName}`);
    doc.fontSize(10).font("Helvetica").text(`Mobile: ${supplier.mobile || supplier.phone || "-"}`);
    doc.text(`Generated: ${formatDateTime(new Date())}`);
    if (from && to) {
        doc.text(`Period: ${formatDate(from)} to ${formatDate(to)}`);
    }

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#2563eb").lineWidth(1.5).stroke();
    doc.strokeColor("#000000").lineWidth(1);
    doc.moveDown(0.8);

    // Totals
    let totalPurchases = 0;
    let totalPayments = 0;
    transactions.forEach((tx) => {
        if (tx.type === "PURCHASE") totalPurchases += tx.amount;
        if (tx.type === "PAYMENT") totalPayments += tx.amount;
    });

    doc.fontSize(12).font("Helvetica-Bold").text("PURCHASES & PAYMENTS");
    doc.moveDown(0.5);

    // Table Header
    const yHeader = doc.y;
    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Date & Time", 40, yHeader, { width: 110 });
    doc.text("Type / Ref", 155, yHeader, { width: 90 });
    doc.text("Details", 250, yHeader, { width: 140 });
    doc.text("Amount", 395, yHeader, { width: 75, align: "right" });
    doc.text("Payable", 475, yHeader, { width: 80, align: "right" });
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cbd5e1").stroke();
    doc.moveDown(0.4);

    if (transactions.length === 0) {
        doc.fontSize(10).font("Helvetica").text("No supplier transactions recorded for this period.", 40, doc.y);
        doc.moveDown();
    } else {
        doc.font("Helvetica").fontSize(9);
        for (const tx of transactions) {
            if (doc.y > 720) {
                doc.addPage();
            }
            const yRow = doc.y;
            doc.text(formatDateTime(tx.date || tx.createdAt), 40, yRow, { width: 110 });
            doc.font(tx.type === "PURCHASE" ? "Helvetica-Bold" : "Helvetica");
            const typeLabel = tx.type === "PURCHASE" ? `PURCHASE${tx.billNumber ? ` #${tx.billNumber}` : ""}` : `PAY (${tx.paymentMethod || "CASH"})`;
            doc.text(typeLabel, 155, yRow, { width: 90 });
            doc.font("Helvetica");
            doc.text(tx.notes || "-", 250, yRow, { width: 140, lineBreak: false, ellipsis: true });
            doc.text(formatInr(tx.amount), 395, yRow, { width: 75, align: "right" });
            doc.text(formatInr(tx.balanceAfter), 475, yRow, { width: 80, align: "right" });
            doc.moveDown(0.5);
        }
    }

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#2563eb").lineWidth(1).stroke();
    doc.moveDown(0.8);

    // Summary Box
    doc.fontSize(11).font("Helvetica-Bold").text("SUMMARY");
    doc.fontSize(10).font("Helvetica");
    doc.text(`Total Purchases (Goods Received): ${formatInr(totalPurchases)}`);
    doc.text(`Total Payments (Paid to Supplier): ${formatInr(totalPayments)}`);
    doc.font("Helvetica-Bold").fontSize(11).text(`Current Outstanding Payable: ${formatInr(supplier.currentBalance)}`);

    doc.moveDown(1.5);
    doc.fontSize(8).font("Helvetica").fillColor("#64748b").text("SAILAJA STORE • Simple Mobile Business Management", { align: "center" });

    doc.end();
}

/**
 * Generate Expenses Report PDF
 */
function generateExpensePdf({ expenses = [], from, to }, res) {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    const fromStr = from ? formatDate(from) : "All";
    const toStr = to ? formatDate(to) : "Present";
    const filename = `sailaja-expenses-${fromStr}-to-${toStr}.pdf`;
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    doc.pipe(res);

    // Header
    doc.fontSize(22).font("Helvetica-Bold").text("SAILAJA STORE", { align: "center" });
    doc.fontSize(11).font("Helvetica").text("Shop Expense Report", { align: "center" });
    doc.moveDown(0.5);

    doc.fontSize(10).font("Helvetica").text(`Report Period: ${fromStr} to ${toStr}`);
    doc.text(`Generated: ${formatDateTime(new Date())}`);
    doc.moveDown(0.5);

    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#3b82f6").lineWidth(1.5).stroke();
    doc.strokeColor("#000000").lineWidth(1);
    doc.moveDown(0.8);

    // Calculate totals by item
    const totalsByItem = new Map();
    let grandTotal = 0;
    expenses.forEach((e) => {
        const name = e.itemName || "General";
        totalsByItem.set(name, (totalsByItem.get(name) || 0) + e.amount);
        grandTotal += e.amount;
    });

    // Summary by item
    doc.fontSize(11).font("Helvetica-Bold").text("EXPENSE SUMMARY BY ITEM");
    doc.moveDown(0.4);

    Array.from(totalsByItem.entries()).forEach(([item, sum]) => {
        doc.fontSize(9).font("Helvetica").text(item, 50, doc.y, { width: 250, continued: true });
        doc.text(formatInr(sum), { align: "right" });
        doc.moveDown(0.3);
    });

    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("GRAND TOTAL", 50, doc.y, { width: 250, continued: true });
    doc.text(formatInr(grandTotal), { align: "right" });
    doc.font("Helvetica");
    doc.moveDown(0.8);

    // Detailed List
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cbd5e1").stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica-Bold").text("DETAILED EXPENSE ENTRIES");
    doc.moveDown(0.4);

    const yHeader = doc.y;
    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Date", 40, yHeader, { width: 100 });
    doc.text("Item Name", 145, yHeader, { width: 150 });
    doc.text("Notes", 300, yHeader, { width: 150 });
    doc.text("Amount", 455, yHeader, { width: 100, align: "right" });
    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#e2e8f0").stroke();
    doc.moveDown(0.4);

    if (expenses.length === 0) {
        doc.fontSize(10).font("Helvetica").text("No expenses found for this period.", 40, doc.y);
    } else {
        doc.font("Helvetica").fontSize(9);
        for (const exp of expenses) {
            if (doc.y > 720) {
                doc.addPage();
            }
            const yRow = doc.y;
            doc.text(formatDate(exp.date), 40, yRow, { width: 100 });
            doc.text(exp.itemName || "General", 145, yRow, { width: 150 });
            doc.text(exp.notes || "-", 300, yRow, { width: 150, lineBreak: false, ellipsis: true });
            doc.text(formatInr(exp.amount), 455, yRow, { width: 100, align: "right" });
            doc.moveDown(0.4);
        }
    }

    doc.moveDown(1.5);
    doc.fontSize(8).font("Helvetica").fillColor("#64748b").text("SAILAJA STORE • Simple Mobile Business Management", { align: "center" });

    doc.end();
}

module.exports = {
    generateCustomerPdf,
    generateSupplierPdf,
    generateExpensePdf
};
