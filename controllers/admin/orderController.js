const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");


const ALLOWED_STATUSES = [
  "Placed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
  "Partially Cancelled"
];

const getAllOrders = async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.trim() : "";
    const status = req.query.status || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const matchStage = {};
    if (status) matchStage.status = status;

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      {
        $addFields: {
          items: {
            $map: {
              input: "$items",
              as: "item",
              in: {
                _id: "$$item._id",
                quantity: "$$item.quantity",
                price: "$$item.price",
                size: "$$item.size",
                status: "$$item.status",
                returnStatus: "$$item.returnStatus",
                product: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$productDetails",
                        as: "prod",
                        cond: { $eq: ["$$prod._id", "$$item.product"] }
                      }
                    },
                    0
                  ]
                }
              }
            }
          },
          productNames: {
            $map: {
              input: "$productDetails",
              as: "prod",
              in: "$$prod.productName"
            }
          }
        }
      },
      ...(query
        ? [
            {
              $match: {
                productNames: { $regex: query, $options: "i" }
              }
            }
          ]
        : []),
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const orders = await Order.aggregate(pipeline);

    const totalPipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      {
        $addFields: {
          productNames: {
            $map: {
              input: "$productDetails",
              as: "prod",
              in: "$$prod.productName"
            }
          }
        }
      },
      ...(query
        ? [
            {
              $match: {
                productNames: { $regex: query, $options: "i" }
              }
            }
          ]
        : []),
      { $count: "total" }
    ];

    const totalResult = await Order.aggregate(totalPipeline);
    const totalOrders = totalResult[0]?.total || 0;
    const pages = Math.ceil(totalOrders / limit);

    await Order.populate(orders, { path: "user", select: "name email" });

    res.render("orderController", {
      orders,
      pages,
      page,
      q: query,
      status,
      statuses: ["Placed", "Shipped", "Delivered", "Cancelled", "Returned"]
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).send("Server error");
  }
};

const viewOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate("user", "name email phone")
      .populate("items.product");

    if (!order) return res.redirect("/admin/orders");

    let subtotal = 0;
    order.items.forEach(item => {
      if (item.status !== "Cancelled") {
        subtotal += item.price * item.quantity;
      }
    });

    const tax = subtotal * 0.05;
    const shipping = order.status === "Cancelled" ? 0 : 50;
    const discount = order.coupon?.discountAmount || 0;
    const total = subtotal + tax + shipping - discount;

    res.render("orderDetails", {
      order,
      subtotal,
      tax,
      shipping,
      discount,
      total,
    });

  } catch (err) {
    console.error("Admin viewOrderDetails error:", err);
    res.redirect("/admin/orders");
  }
};


const updateOrderStatus = async (req, res) => {
  try {
    console.log("🔄 Received update request:", req.params.id, req.body.status);

    const id = req.params.id;
    const { status } = req.body;

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const order = await Order.findById(id).populate("items.product");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    order.items.forEach(item => {
      if (item.status !== "Cancelled") item.status = status;
    });

    const hasCancelled = order.items.some(i => i.status === "Cancelled");
    const hasActive = order.items.some(i => i.status !== "Cancelled");
    order.status = (hasCancelled && hasActive) ? "Partially Cancelled" : status;

    await order.save();

    console.log(" Order updated:", order.status);
    res.json({ success: true, message: "Order and item statuses updated successfully" });
  } catch (err) {
    console.error(" Error updating order status:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

const updateItemStatus = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { status } = req.body;

    if (!ALLOWED_STATUSES.includes(status) && status !== "Cancelled") {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    item.status = status;

    const hasCancelled = order.items.some(i => i.status === "Cancelled");
    const hasActive = order.items.some(i => i.status !== "Cancelled");
    order.status = (hasCancelled && hasActive) ? "Partially Cancelled" : status;

    await order.save();

    res.json({ success: true, message: "Item and order status updated successfully" });
  } catch (err) {
    console.error("Error updating item status:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};


const viewReturns = async (req, res) => {
  try {
 const returns = await Order.find({
  items: {
    $elemMatch: {
      returnStatus: { $ne: "None" }
    }
  }
})
.populate('user', 'name email')
.populate('items.product', 'productName productImage price brand category')
.sort({ createdAt: -1 });


    res.render('return', { returns });
  } catch (err) {
    console.error('Error fetching returns:', err);
    res.status(500).send('Server Error');
  }
};

const viewReturnDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('items.product', 'productName productImage');

    if (!order) return res.status(404).send('Order not found');

    const returnItems = order.items.filter(item => item.returnStatus && item.returnStatus !== 'None');

    res.render('returnDetails', { order, returnItems });
  } catch (err) {
    console.error('Error fetching return details:', err);
    res.status(500).send('Server Error');
  }
};

async function calculateRefund(order, item) {
  const toNum = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const qty = toNum(item.quantity);
  const itemPrice = toNum(item.price); 
  const itemPriceTotal = itemPrice * qty;

  if (item.finalPrice !== undefined && item.finalPrice !== null) {
    const finalUnit = toNum(item.finalPrice);
    return Number((finalUnit * qty).toFixed(2));
  }

  let totalBeforeDiscount = 0;
  if (typeof order.totalBeforeDiscount === "number") {
    totalBeforeDiscount = toNum(order.totalBeforeDiscount);
  } else {
    if (Array.isArray(order.items)) {
      totalBeforeDiscount = order.items.reduce((s, it) => s + (toNum(it.price) * toNum(it.quantity)), 0);
    } else {
      totalBeforeDiscount = itemPriceTotal; 
    }
  }

  const couponDiscount = toNum(order.coupon && order.coupon.discountAmount ? order.coupon.discountAmount : 0);

  let itemPaid = itemPriceTotal;
  if (couponDiscount > 0 && totalBeforeDiscount > 0) {
    const prop = (itemPriceTotal) / totalBeforeDiscount;
    const itemDiscount = +(couponDiscount * prop).toFixed(0);
    itemPaid = +(itemPriceTotal - itemDiscount).toFixed(0);
    if (itemPaid < 0) itemPaid = 0;
  }

  const orderTotalAmount = toNum(order.totalAmount); 
  const walletUsed = toNum(order.walletUsed || (order.wallet && order.wallet.balanceUsed ? order.wallet.balanceUsed : 0));

  if (orderTotalAmount <= 0) {
    return 0;
  }

  const walletPart = walletUsed > 0 ? +((walletUsed * (itemPaid / orderTotalAmount))).toFixed(2) : 0;

  const otherPart = +(itemPaid - walletPart).toFixed(0);

  const totalRefund = +(walletPart + otherPart).toFixed(0);

  if (!Number.isFinite(totalRefund) || Number.isNaN(totalRefund)) return 0;
  return totalRefund;
}


const approveReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    const order = await Order.findById(orderId).populate("items.product user");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    if (item.returnStatus === "Approved") {
      return res.json({ success: false, message: "Return already approved" });
    }

    const product = await Product.findById(item.product._id);
    if (product) {
      const sizeIndex = product.sizes.findIndex(s => s.size === item.size);
      if (sizeIndex !== -1) {
        product.sizes[sizeIndex].stock += item.quantity;
        await product.save();
      }
    }

    const itemBaseTotal = item.price * item.quantity;

    const subtotal = order.items
      .filter(i => i.status !== "Cancelled")
      .reduce((sum, i) => sum + i.price * i.quantity, 0);

    const safeSubtotal = subtotal > 0 ? subtotal : 1;

    const orderTax = +(safeSubtotal * 0.05).toFixed(0);

    const itemTaxShare = +((itemBaseTotal / safeSubtotal) * orderTax).toFixed(2);

    let couponRefund = 0;
    if (order.coupon && order.coupon.discountAmount > 0) {
      couponRefund = +((itemBaseTotal / safeSubtotal) * order.coupon.discountAmount).toFixed(2);
    }

    const refundAmount = +(itemBaseTotal + itemTaxShare - couponRefund).toFixed(2);

    const finalRefund = refundAmount > 0 ? refundAmount : 0;

    const user = await User.findById(order.user);
    if (user) {
      if (!user.wallet) {
        user.wallet = { balance: 0, transactions: [] };
      }

      user.wallet.balance = +(user.wallet.balance + finalRefund).toFixed(0);

      user.wallet.transactions.push({
        type: "credit",
        amount: finalRefund,
        date: new Date(),
        description: `Refund for returned item (${item.product.productName})`
      });

      user.markModified("wallet");
      await user.save();
    }

    item.returnStatus = "Approved";
    item.status = "Returned";

    await order.save();

    return res.json({
      success: true,
      message: `Return approved. Your amount will be credited to your wallet soon!`
    });

  } catch (error) {
    console.error("Error approving return:", error);
    return res.status(500).json({ success: false, message: "Error approving return" });
  }
};








const rejectReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    const order = await Order.findById(orderId).populate('items.product').populate('user', 'email name');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    if (item.returnStatus !== 'Requested')
      return res.status(400).json({ success: false, message: 'Return is not in requested state' });

    item.returnStatus = 'Rejected';
    item.returnDate = new Date();

    const anyRequested = order.items.some(i => i.returnStatus === 'Requested');
    if (!anyRequested) {
      const hasAnyApproved = order.items.some(i => i.returnStatus === 'Approved');
      order.status = hasAnyApproved ? 'Returned' : 'Delivered';
    }

    await order.save();

    
    res.json({ success: true, message: 'Return rejected successfully' });
  } catch (err) {
    console.error('Error rejecting return:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


module.exports = {
  getAllOrders,
  viewOrderDetails,
  updateOrderStatus,
  updateItemStatus,
  viewReturns,
  viewReturnDetails,
  approveReturn,
  rejectReturn
};
