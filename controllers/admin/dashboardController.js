const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const renderDashboard = async (req, res) => {
  try {
    res.render("dashboard", {
      title: "Admin Dashboard",
    });
  } catch (err) {
    console.error("Error rendering admin dashboard:", err);
    res.status(500).send("Error loading dashboard");
  }
};


const getSalesData = async (req, res) => {
  try {
    const { filter = "monthly" } = req.query;
    const now = new Date();
    let startDate, groupBy;

    if (filter === "yearly") {
      startDate = new Date(now.getFullYear(), 0, 1);
      groupBy = { $month: "$createdAt" };
    } else if (filter === "monthly") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      groupBy = { $dayOfMonth: "$createdAt" };
    } else if (filter === "weekly") {
      const weekStart = new Date();
      weekStart.setDate(now.getDate() - 7);
      startDate = weekStart;
      groupBy = { $dayOfWeek: "$createdAt" };
    } else if (filter === "daily") {
      startDate = new Date();
      startDate.setHours(now.getHours() - 24);

      groupBy = {
        $concat: [
          {
            $dateToString: {
              format: "%Y-%m-%d %H:",
              date: "$createdAt",
              timezone: "Asia/Kolkata" 
            }
          },
          {
            $cond: [
              { $lt: [{ $minute: "$createdAt" }, 30] },
              "00",
              "30"
            ]
          }
        ]
      };
    } else {
      startDate = new Date(0);
      groupBy = { $month: "$createdAt" };
    }

    const salesData = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate }, status: { $ne: "Cancelled" } } },
      {
        $group: {
          _id: groupBy,
          totalSales: { $sum: "$totalAmount" },
          totalOrders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ success: true, data: salesData });
  } catch (err) {
    console.error(" Error fetching sales data:", err);
    res.status(500).json({ success: false });
  }
};




const getBestSellingProducts = async (req, res) => {
  try {
    const result = await Order.aggregate([
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product._id",
          name: { $first: "$product.productName" },
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 },
    ]);

    res.json({ success: true, products: result });
  } catch (err) {
    console.error("Error fetching best products:", err);
    res.status(500).json({ success: false });
  }
};


const getBestSellingCategories = async (req, res) => {
  try {
    const result = await Order.aggregate([
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category", 
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ["$categoryDetails.name", "Unknown"] },
          totalQuantity: 1,
        },
      },
    ]);

    res.json({ success: true, categories: result });
  } catch (err) {
    console.error("Error fetching best categories:", err);
    res.status(500).json({ success: false });
  }
};







module.exports = {
  renderDashboard,
  getSalesData,
  getBestSellingProducts,
  getBestSellingCategories,
};
