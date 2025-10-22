const { jsPDF } = require("jspdf");
const fs = require("fs");
const path = require("path");
const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require('../../models/productSchema')


const checkoutPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

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

    // Prepare order items
    const orderItems = cart.items.map((item) => ({
      product: item.product._id,
      quantity: item.quantity,
      size: item.size,
      price: item.product.discountPrice || item.product.price,
    }));

    const totalAmount = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // ✅ Reduce stock only when placing order
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

    const orders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("items.product"); 

    console.log("Fetched orders:", orders);

    res.render("orders", { orders });
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

    const order = await Order.findOne({ _id: orderId, user: userId }).populate("items.product");

    if (!order) return res.redirect("/orders");

    res.render("order-details", { order });
  } catch (err) {
    console.error("Error fetching order details:", err);
    res.redirect("/orders");
  }
};


const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).populate("items.product");

    if (!order) return res.status(404).send("Order not found");

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    // --- Header ---
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("ZNEAKZ", 105, 20, null, null, "center");
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Invoice", 105, 30, null, null, "center");
    
    // Draw a line under header
    doc.setLineWidth(0.5);
    doc.line(14, 34, 196, 34);

    // --- Order Info ---
    doc.setFontSize(10);
    doc.text(`Order ID: ${order.orderID}`, 14, 42);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 14, 48);
    doc.text(`Payment Method: ${order.paymentMethod}`, 14, 54);

    // --- Customer / Shipping Info ---
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Shipping Address:", 14, 64);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const shippingText = `${order.address.name}\n${order.address.city}, ${order.address.state} - ${order.address.pincode}`;
    doc.text(shippingText.split("\n"), 14, 70);

    // --- Products Table ---
    let y = 90;
    doc.setFont("helvetica", "bold");
    doc.setFillColor(220, 220, 220);
    doc.rect(14, y - 4, 182, 6, "F"); // shaded header background

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
      subtotal += total;

      doc.text(productName, 16, y);
      doc.text(String(qty), 110, y);
      doc.text(`₹${price}`, 140, y);
      doc.text(`₹${total}`, 170, y);

      y += 7;
    });

    // --- Summary ---
    const tax = subtotal * 0.05;
    const shipping = 50;
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

    // --- Footer ---
    y += 15;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("Thank you for shopping with ZNEAKZ!", 105, y, null, null, "center");

    // --- Save and send PDF ---
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





module.exports = {
     checkoutPage,
     placeOrder,
     orderSuccessPage,
     getUserOrders,
     viewOrderDetails,
     downloadInvoice
    };
