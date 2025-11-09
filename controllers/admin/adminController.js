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

    // Default filter → today
    if (!start || !end) {
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    query.createdAt = { $gte: start, $lte: end };

    // Pagination setup
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Fetch filtered orders
    const totalOrdersCount = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate("items.product")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate totals
    const totalSales = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const totalDiscount = orders.reduce(
      (sum, o) => sum + Number(o.coupon?.discountAmount || 0),
      0
    );

    // 🧮 Total unique users who made orders
    const userIds = await Order.distinct("user", query);
    const totalUsers = userIds.length;

    // 🥇 Most Sold Product
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

    // 💰 Average Order Value (AOV)
    const averageOrderValue = totalOrdersCount
      ? (totalSales / totalOrdersCount).toFixed(2)
      : 0;

    // Render page
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
    console.error("❌ Error generating sales report:", error);
    res.status(500).send("Error generating sales report");
  }
};






const downloadExcel = async (req, res) => {
  try {
    const { start, end } = getDateFilter(req);
    const query = {};

    if (start && end) {
      query.createdAt = { $gte: start, $lte: end };
    }

    const orders = await Order.find(query);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.columns = [
      { header: "Order ID", key: "orderID", width: 25 },
      { header: "Date", key: "date", width: 15 },
      { header: "Total (₹)", key: "totalAmount", width: 15 },
      { header: "Discount (₹)", key: "discount", width: 15 },
    ];

    orders.forEach((o) => {
      worksheet.addRow({
        orderID: o.orderID,
        date: o.createdAt.toLocaleDateString(),
        totalAmount: o.totalAmount.toFixed(0),
        discount: (o.coupon?.discountAmount || 0).toFixed(0),
      });
    });

    const reportDir = path.join(__dirname, "../../public/reports");
    fs.mkdirSync(reportDir, { recursive: true });

    const filePath = path.join(reportDir, "sales-report.xlsx");
    await workbook.xlsx.writeFile(filePath);

    res.download(filePath);
  } catch (err) {
    console.error("❌ Excel download error:", err);
    res.status(500).send("Error generating Excel report.");
  }
};



const downloadPDF = async (req, res) => {
  try {
    const { start, end } = getDateFilter(req);
    const query = {};

    if (start && end) {
      query.createdAt = { $gte: start, $lte: end };
    }

    const orders = await Order.find(query);

    const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalDiscount = orders.reduce(
      (sum, o) => sum + (o.coupon?.discountAmount || 0),
      0
    );

    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Sales Report", 14, 20);

    let filterLabel = req.query.filter || "All Time";
    doc.setFontSize(10);
    doc.text(`Filter: ${filterLabel}`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [["Order ID", "Date", "Total (₹)", "Discount (₹)"]],
      body: orders.map((o) => [
        o.orderID,
        o.createdAt.toLocaleDateString(),
        o.totalAmount.toFixed(0),
        (o.coupon?.discountAmount || 0).toFixed(0),
      ]),
    });

    doc.text(`Total Sales: ₹${totalSales.toFixed(0)}`, 14, doc.lastAutoTable.finalY + 10);
    doc.text(`Total Discounts: ₹${totalDiscount.toFixed(0)}`, 14, doc.lastAutoTable.finalY + 16);

    const pdfPath = path.join(__dirname, "../../public/reports/sales-report.pdf");
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    doc.save(pdfPath);

    res.download(pdfPath);
  } catch (err) {
    console.error("❌ PDF generation error:", err);
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