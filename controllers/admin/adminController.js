const User = require("../../models/userSchema")
const Product = require("../../models/productSchema");
const mongoose = require('mongoose')
const bcrypt = require("bcrypt");
const Order = require("../../models/orderSchema");
const ExcelJS = require("exceljs");
const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable").default;
const fs = require("fs");
const path = require("path");
const { getDateFilter } = require("../../helpers/reportHelper");





const pageError = async(req,res)=>{
    res.render("error")
}

const loadLogin = (req,res)=>{
    if(req.session.admin){
        return res.redirect("/admin")
    }
    res.render('admin-login',{message:null})
}


const login = async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });

    if (!admin) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    req.session.admin = true;
    req.session.adminId = admin._id.toString();

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      return res.status(200).json({ message: "Login successful" });
    });

  } catch (error) {
    console.error("Login error", error);
    return res.status(500).json({ message: "Server error" });
  }
};





const loadDashboard = async(req,res)=>{
    if(req.session.admin){
       
        try {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.render('dashboard')
        } catch (error) {
            res.redirect('/pageError')
        }
    }else {
        return res.redirect('/admin/login')
    }
}

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log("Session destruction error:", err);
        return res.redirect('/pageError');
      }

      res.clearCookie('connect.sid'); 
      res.redirect('/admin/login');
    });
  } catch (error) {
    console.log("Unexpected error during logout", error);
    res.redirect('/pageError');
  }
};

const blockUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId === req.session.adminId) {
      req.flash('error', 'Cannot block yourself');
      return res.redirect('/admin/users');
    }
    const user = await User.findByIdAndUpdate(userId, { isBlocked: true }, { new: true });
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/admin/users');
    }
    const store = req.app.get('sessionStore');
    await destroyUserSessions(userId, store);
    req.flash('success', 'User blocked and all sessions terminated');
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Block user error:', error);
    req.flash('error', 'Failed to block user');
    res.redirect('/admin/users');
  }
};


const getSalesReport = async (req, res) => {
  try {
    let { start, end } = getDateFilter(req);
    const query = {};

    if (!start || !end) {
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    query.createdAt = { $gte: start, $lte: end };

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const totalOrdersCount = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate("items.product")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalSales = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const totalDiscount = orders.reduce(
      (sum, o) => sum + Number(o.coupon?.discountAmount || 0),
      0
    );

    const userIds = await Order.distinct("user", query);
    const totalUsers = userIds.length;

    const productSales = await Order.aggregate([
      { $match: query },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 1 },
    ]);

    let mostSoldProduct = null;
    if (productSales.length > 0) {
      const product = await Product.findById(productSales[0]._id);
      mostSoldProduct = {
        name: product ? product.productName : "Unknown",
        quantity: productSales[0].totalQuantity,
      };
    }

    const averageOrderValue = totalOrdersCount
      ? (totalSales / totalOrdersCount).toFixed(2)
      : 0;

    res.render("sales-report", {
      orders,
      totalOrders: totalOrdersCount,
      totalSales: Number(totalSales),
      totalDiscount: Number(totalDiscount),
      totalUsers,
      mostSoldProduct,
      averageOrderValue,
      filter: req.query.filter || "today",
      from: req.query.from || "",
      to: req.query.to || "",
      currentPage: page,
      totalPages: Math.ceil(totalOrdersCount / limit),
    });
  } catch (error) {
    console.error(" Error generating sales report:", error);
    res.status(500).send("Error generating sales report");
  }
};






const downloadExcel = async (req, res) => {
  try {
    const { start, end } = getDateFilter(req);
    const query = {};

    if (start && end) query.createdAt = { $gte: start, $lte: end };

    const orders = await Order.find(query)
      .populate("user", "name email")
      .populate("items.product", "productName price discountPrice")
      .sort({ createdAt: -1 });

    const totalOrders = orders.length;
    const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalDiscount = orders.reduce(
      (sum, o) => sum + (o.coupon?.discountAmount || 0),
      0
    );
    const totalUsers = (await Order.distinct("user", query)).length;
    const averageOrderValue = totalOrders
      ? (totalSales / totalOrders).toFixed(2)
      : 0;

    const productSales = await Order.aggregate([
      { $match: query },
      { $unwind: "$items" },
      { $group: { _id: "$items.product", totalQuantity: { $sum: "$items.quantity" } } },
      { $sort: { totalQuantity: -1 } },
      { $limit: 1 },
    ]);

    let mostSoldProduct = "N/A";
    if (productSales.length > 0) {
      const top = await Product.findById(productSales[0]._id);
      mostSoldProduct = top?.productName || "Unknown";
    }

    const workbook = new ExcelJS.Workbook();

    const summary = workbook.addWorksheet("Summary");
    summary.addRow(["ZNEAKZ - Sales Report"]);
    summary.getRow(1).font = { bold: true, size: 16 };
    summary.addRow([]);
    summary.addRows([
      ["Date Range", start && end ? `${start.toDateString()} → ${end.toDateString()}` : "All Time"],
      ["Total Orders", totalOrders],
      ["Total Sales (₹)", totalSales.toFixed(2)],
      ["Total Discount (₹)", totalDiscount.toFixed(2)],
      ["Unique Customers", totalUsers],
      ["Average Order Value (₹)", averageOrderValue],
      ["Most Sold Product", mostSoldProduct],
    ]);
    summary.columns = [{ width: 25 }, { width: 40 }];

    const sheet = workbook.addWorksheet("Order Details");
    sheet.columns = [
      { header: "Order ID", key: "orderID", width: 20 },
      { header: "User", key: "user", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Date", key: "date", width: 18 },
      { header: "Payment Method", key: "paymentMethod", width: 18 },
      { header: "Total (₹)", key: "totalAmount", width: 15 },
      { header: "Discount (₹)", key: "discount", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Items", key: "items", width: 50 },
    ];

    orders.forEach((o) => {
      const itemsList = o.items
        .map(
          (i) =>
            `${i.product?.productName || "Deleted Product"} (x${i.quantity}) ₹${
              i.product?.discountPrice || i.product?.price || 0
            }`
        )
        .join(", ");

      sheet.addRow({
        orderID: o.orderID,
        user: o.user?.name || "Guest",
        email: o.user?.email || "N/A",
        date: o.createdAt.toLocaleDateString(),
        paymentMethod: o.paymentMethod,
        totalAmount: o.totalAmount.toFixed(2),
        discount: (o.coupon?.discountAmount || 0).toFixed(2),
        status: o.status,
        items: itemsList,
      });
    });

    const filePath = path.join(__dirname, "../../public/reports/sales-report.xlsx");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await workbook.xlsx.writeFile(filePath);

    res.download(filePath);
  } catch (err) {
    console.error(" Excel download error:", err);
    res.status(500).send("Error generating Excel report.");
  }
};



const downloadPDF = async (req, res) => {
  try {
    const { start, end } = getDateFilter(req);
    const query = {};

    if (start && end) query.createdAt = { $gte: start, $lte: end };

    const orders = await Order.find(query)
      .populate("user", "name email")
      .populate("items.product", "productName price discountPrice")
      .sort({ createdAt: -1 });

    const totalOrders = orders.length;
    const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalDiscount = orders.reduce(
      (sum, o) => sum + (o.coupon?.discountAmount || 0),
      0
    );
    const totalUsers = (await Order.distinct("user", query)).length;
    const averageOrderValue = totalOrders ? (totalSales / totalOrders).toFixed(2) : 0;

    const productSales = await Order.aggregate([
      { $match: query },
      { $unwind: "$items" },
      { $group: { _id: "$items.product", totalQuantity: { $sum: "$items.quantity" } } },
      { $sort: { totalQuantity: -1 } },
      { $limit: 1 },
    ]);

    let mostSoldProduct = "N/A";
    if (productSales.length > 0) {
      const top = await Product.findById(productSales[0]._id);
      mostSoldProduct = top?.productName || "Unknown";
    }

    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(18);
    doc.text("ZNEAKZ - Sales Report", 14, 20);

    doc.setFontSize(11);
    doc.text(
      `Date Range: ${
        start ? start.toLocaleDateString() : "All"
      } → ${end ? end.toLocaleDateString() : "All"}`,
      14,
      28
    );
    doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 34);

    autoTable(doc, {
      startY: 40,
      head: [["Metric", "Value"]],
      body: [
        ["Total Orders", totalOrders],
        ["Total Sales (₹)", totalSales.toFixed(2)],
        ["Total Discounts (₹)", totalDiscount.toFixed(2)],
        ["Unique Customers", totalUsers],
        ["Average Order Value (₹)", averageOrderValue],
        ["Most Sold Product", mostSoldProduct],
      ],
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [
        [
          "Order ID",
          "Date",
          "User",
          "Email",
          "Payment",
          "Total (₹)",
          "Discount (₹)",
          "Status",
          "Items",
        ],
      ],
      body: orders.map((o) => [
        o.orderID,
        o.createdAt.toLocaleDateString(),
        o.user?.name || "Guest",
        o.user?.email || "-",
        o.paymentMethod,
        o.totalAmount.toFixed(2),
        (o.coupon?.discountAmount || 0).toFixed(2),
        o.status,
        o.items
          .map(
            (i) =>
              `${i.product?.productName || "Deleted"} (x${i.quantity}) ₹${
                i.product?.discountPrice || i.product?.price || 0
              }`
          )
          .join(", "),
      ]),
      styles: { fontSize: 8, cellWidth: "wrap" },
      columnStyles: {
        8: { cellWidth: 90 },
      },
    });

    const pdfPath = path.join(__dirname, "../../public/reports/sales-report.pdf");
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    doc.save(pdfPath);

    res.download(pdfPath);
  } catch (err) {
    console.error(" PDF generation error:", err);
    res.status(500).send("Error generating PDF report.");
  }
};

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageError,
    logout,
    blockUser,
    getSalesReport,
    downloadExcel,
    downloadPDF
}