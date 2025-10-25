const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");

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
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const q = req.query.q || "";
    const status = req.query.status || "";

    const filter = {};
    if (q) filter.orderID = { $regex: q, $options: "i" };
    if (status) filter.status = status;

    const total = await Order.countDocuments(filter);
    const pages = Math.ceil(total / limit);

    const orders = await Order.find(filter)
      .populate("user", "name email")
      .populate("items.product", "productName productImage sizes")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.render("orderController", {
      orders,
      q,
      status,
      page,
      pages,
      total,
      statuses: ALLOWED_STATUSES,
    });
  } catch (err) {
    console.error("Error fetching admin orders:", err);
    res.status(500).send("Server error");
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

    // Update individual item statuses based on new order status
    order.items.forEach(item => {
      if (item.status !== "Cancelled") item.status = status;
    });

    // If any item is cancelled but others are active → Partially Cancelled
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
    const returns = await Order.find({ 'items.returnStatus': { $ne: 'None' } })
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

const approveReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    // Populate product info for email or display
    const order = await Order.findById(orderId).populate('items.product').populate('user', 'email name');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    if (item.returnStatus !== 'Requested')
      return res.status(400).json({ success: false, message: 'Return is not in requested state' });

    item.returnStatus = 'Approved';
    item.returnDate = new Date();

    const anyRequested = order.items.some(i => i.returnStatus === 'Requested');
    if (!anyRequested) {
      const hasAnyApproved = order.items.some(i => i.returnStatus === 'Approved');
      order.status = hasAnyApproved ? 'Returned' : 'Delivered';
    }

    await order.save();

    res.json({ success: true, message: 'Return approved successfully' });
  } catch (err) {
    console.error('Error approving return:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
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
  updateOrderStatus,
  updateItemStatus,
  viewReturns,
  viewReturnDetails,
  approveReturn,
  rejectReturn
};
