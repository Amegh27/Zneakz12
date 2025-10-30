const { jsPDF } = require("jspdf");
const fs = require("fs");
const path = require("path");
const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require('../../models/productSchema')


const checkoutPage = async (req, res) => {
  try {
    const userId = typeof req.session.user === "object" 
      ? req.session.user._id 
      : req.session.user;

    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

    const defaultAddress = user.address && user.address.length > 0 
      ? user.address[0] 
      : null;

    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    let subtotal = 0;
    cart.items.forEach(item => {
      const price = item.product.discountPrice || item.product.price;
      subtotal += price * item.quantity;
    });

    const taxRate = 0.05;
    const tax = subtotal * taxRate;
    const shipping = 50;
    const finalTotal = subtotal + tax + shipping;

    const addresses = user.address || [];

    res.render('checkout', {
      user,
      addresses,
      defaultAddress,
      cart,
      subtotal,
      tax,
      shipping,
      finalTotal
    });

  } catch (err) {
    console.error("Checkout Page Error:", err);
    res.redirect('/');
  }
};





const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.json({ success: false, message: "Login required" });

    const { addressIndex } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.address || user.address.length === 0) {
      return res.json({ success: false, message: "No address found" });
    }

    const selectedAddress = user.address[addressIndex];
    const cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart || !cart.items.length)
      return res.json({ success: false, message: "Cart is empty" });

    const orderItems = cart.items.map((item) => ({
      product: item.product._id,
      quantity: item.quantity,
      size: item.size,
      price: item.product.discountPrice || item.product.price,
    }));

    const totalAmount = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    for (let item of cart.items) {
      const product = await Product.findById(item.product._id);
      if (product) {
        const sizeIndex = product.sizes.findIndex(s => s.size === item.size);
        if (sizeIndex !== -1) {
          if (product.sizes[sizeIndex].stock < item.quantity) {
            return res.json({ success: false, message: `${product.productName} is out of stock` });
          }
          product.sizes[sizeIndex].stock -= item.quantity;
          await product.save();
        }
      }
    }

    const newOrder = new Order({
      user: user._id,
      items: orderItems,
      address: selectedAddress,
      paymentMethod: "Cash on Delivery",
      totalAmount,
      status: "Placed",
    });

    await newOrder.save();

    cart.items = [];
    cart.total = 0;
    await cart.save();

    res.json({ success: true, redirect: `/order-success?id=${newOrder._id}` });
  } catch (error) {
    console.error("Error placing order:", error);
    res.json({ success: false, message: "Unable to place order. Please try again" });
  }
};



const orderSuccessPage = async (req, res) => {
  try {
    const orderId = req.query.id;
    if (!orderId) return res.redirect('/');

    const order = await Order.findById(orderId).populate('items.product');
    if (!order) return res.redirect('/');

    res.render('order-success', { order });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};




const getUserOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const page = parseInt(req.query.page) || 1;
    const limit = 6; 
    const skip = (page - 1) * limit;

    const totalOrders = await Order.countDocuments({ user: userId });
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("items.product");

    console.log("Fetched orders:", orders);

    res.render("orders", { 
      orders, 
      currentPage: page,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages
    });
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res.status(500).send("Server Error");
  }
};


const viewOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const orderId = req.params.id;
    if (!orderId) return res.redirect("/orders");

    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate("items.product")
      .lean();

    if (!order) return res.redirect("/orders");

    if (!order.address || !order.address.name) {
      order.address = {
        name: "N/A",
        city: "N/A",
        state: "N/A",
        pincode: "N/A"
      };
    }

    let subtotal = 0;
    let cancelledCount = 0;

    order.items.forEach(item => {
      if (item.status === "Cancelled") {
        cancelledCount++;
      } else {
        subtotal += item.price * item.quantity;
      }
    });

    const tax = subtotal * 0.05;
    const shipping = 50;
    const total = subtotal + tax + shipping;

    let displayStatus = order.status;
    if (order.status === "Cancelled") {
      displayStatus = "Cancelled";
    } else if (cancelledCount > 0 && cancelledCount < order.items.length) {
      displayStatus = "Partially Cancelled";
    }

    order.items.forEach(item => {
      item.displayStatus = item.status === "Cancelled" ? "Cancelled" : displayStatus;
    });

    // ✅ Render page with full order + address
    res.render("order-details", {  
      order,
      subtotal,
      tax,
      shipping,
      total,
      displayStatus,
      user: req.session.user
    });

  } catch (err) {
    console.error("Error fetching order details:", err);
    res.redirect("/orders");
  }
};



const cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).populate("items.product");

    if (!order) return res.status(404).send("Order not found");
    if (order.status === "Cancelled")
      return res.status(400).send("Order already cancelled");

    for (const item of order.items) {
      const product = await Product.findById(item.product._id);
      if (product) {
        const sizeObj = product.sizes.find((s) => s.size === item.size);
        if (sizeObj) sizeObj.stock += item.quantity;

        product.status = "Available";
        await product.save();
      }
    }

    order.status = "Cancelled";
    order.items.forEach((i) => (i.status = "Cancelled"));
    await order.save();

    res.redirect("/orders");
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).send("Internal server error");
  }
};

const cancelItem = async (req, res) => {
   try {
    const userId = req.session.user;
    const orderId = req.params.orderId;
    const itemId = req.params.itemId;

    const order = await Order.findOne({ _id: orderId, user: userId }).populate("items.product");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const item = order.items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });

    if (item.status === "Cancelled") {
      return res.json({ success: false, message: "Item already cancelled" });
    }

    const product = await Product.findById(item.product._id);
    if (product) {
      const sizeIndex = product.sizes.findIndex(s => s.size === item.size);
      if (sizeIndex !== -1) {
        product.sizes[sizeIndex].stock += item.quantity;
        await product.save();
      }
    }

    item.status = "Cancelled";

    const allCancelled = order.items.every(i => i.status === "Cancelled");
    if (allCancelled) order.status = "Cancelled";

    await order.save();

    res.json({ success: true, message: "Item cancelled successfully", allCancelled });
  } catch (error) {
    console.error("Error cancelling item:", error);
    res.status(500).json({ success: false, message: "Error cancelling item" });
  }
};





const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).populate("items.product");

    if (!order) return res.status(404).send("Order not found");

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("ZNEAKZ", 105, 20, null, null, "center");

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Invoice", 105, 30, null, null, "center");

    doc.setLineWidth(0.5);
    doc.line(14, 34, 196, 34);

    doc.setFontSize(10);
    doc.text(`Order ID: ${order.orderID}`, 14, 42);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 14, 48);
    doc.text(`Payment Method: ${order.paymentMethod}`, 14, 54);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Shipping Address:", 14, 64);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
const recipientName = order.address.name || "N/A";
const shippingText = `${recipientName}
${order.address.city}, ${order.address.state} - ${order.address.pincode}`;

doc.text(shippingText.split("\n"), 14, 70);

    let y = 90;
    doc.setFont("helvetica", "bold");
    doc.setFillColor(220, 220, 220);
    doc.rect(14, y - 4, 182, 6, "F"); 

    doc.text("Product", 16, y);
    doc.text("Qty", 110, y);
    doc.text("Price", 140, y);
    doc.text("Total", 170, y);
    doc.setFont("helvetica", "normal");

    y += 6;
    let subtotal = 0;

    order.items.forEach((item) => {
      const productName = item.product.productName;
      const qty = item.quantity;
      const price = item.price;
      const total = qty * price;

      const displayName = item.status === "Cancelled" ? `${productName} (Cancelled)` : productName;

      if (item.status !== "Cancelled") {
        subtotal += total; 
      }

      doc.text(displayName, 16, y);
      doc.text(String(qty), 110, y);
      doc.text(`₹${price}`, 140, y);
      doc.text(item.status === "Cancelled" ? "₹0" : `₹${total}`, 170, y);

      y += 7;
    });

    const tax = subtotal * 0.05;
    let shipping = (order.status === "Cancelled") ? 0 : 50;
    const grandTotal = subtotal + tax + shipping;

    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Summary", 14, y);
    doc.setFont("helvetica", "normal");
    y += 6;
    doc.text(`Subtotal: ₹${subtotal.toFixed(2)}`, 14, y);
    y += 5;
    doc.text(`Tax (5%): ₹${tax.toFixed(2)}`, 14, y);
    y += 5;
    doc.text(`Shipping: ₹${shipping.toFixed(2)}`, 14, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text(`Grand Total: ₹${grandTotal.toFixed(2)}`, 14, y);

    y += 15;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("Thank you for shopping with ZNEAKZ!", 105, y, null, null, "center");

    const filename = `invoice-${order.orderID}.pdf`;
    const filePath = path.join(__dirname, "../../public/invoices", filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    doc.save(filePath);

    res.download(filePath, filename, (err) => {
      if (err) console.error("Error sending file:", err);
      fs.unlinkSync(filePath);
    });

  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).send("Error generating invoice");
  }
};


const returnItemPage = async (req, res) => {
  const { orderId, itemId } = req.params;
  try {
    const order = await Order.findById(orderId).populate('items.product');
    const item = order.items.id(itemId);
    if (!item) return res.status(404).send('Item not found');

    const reasons = [
      "Item damaged",
      "Wrong product delivered",
      "Product not as described",
      "Received late",
      "Other"
    ];

    res.render('returnItem', { order, item, reasons });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

const submitReturnItem = async (req, res) => {
  const { orderId, itemId } = req.params;
  let { reason, otherReason } = req.body;

  if (reason === "Other") reason = otherReason; 
  if (!reason) return res.status(400).json({ success: false, message: 'Reason is required' });

  try {
    const order = await Order.findById(orderId);
    const item = order.items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    item.returnStatus = 'Requested';
    item.returnReason = reason;

    await order.save();
    res.json({ success: true, message: 'Return request submitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};







module.exports = {
     checkoutPage,
     placeOrder,
     orderSuccessPage,
     getUserOrders,
     viewOrderDetails,
     cancelOrder,
     cancelItem,
     downloadInvoice,
     returnItemPage,
     submitReturnItem
    };
