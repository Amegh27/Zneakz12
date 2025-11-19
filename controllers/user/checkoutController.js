const { jsPDF } = require("jspdf");
const fs = require("fs");
const path = require("path");
const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require('../../models/productSchema')
const Coupon = require('../../models/couponSchema')
const crypto = require("crypto");
const validateCoupon = require("../../helpers/validateCoupon");



const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});


const checkoutPage = async (req, res) => {
  try {
    const userId = typeof req.session.user === "object"
      ? req.session.user._id
      : req.session.user;

    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId);
    if (!user) return res.redirect("/login");

    const cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart || cart.items.length === 0) return res.redirect("/cart");

    let subtotal = cart.items.reduce((acc, item) => {
      const price = item.product.discountPrice || item.product.price;
      return acc + price * item.quantity;
    }, 0);

    const tax = subtotal * 0.05;
    const shipping = 50;

    let discountAmount = 0;
    let appliedCoupon = null;
    let couponError = null;

    // 🔥 Validate coupon with helper
    const validation = await validateCoupon(req.session.appliedCoupon, subtotal);

    if (!validation.valid) {
      req.session.appliedCoupon = null; // remove coupon
      couponError = validation.message;
    } else if (validation.coupon) {
      appliedCoupon = validation.coupon;

      if (appliedCoupon.discountType === "percentage") {
        discountAmount = (subtotal * appliedCoupon.discountValue) / 100;
      } else {
        discountAmount = appliedCoupon.discountValue;
      }

      if (discountAmount > subtotal) discountAmount = subtotal;
    }

    const finalTotal = subtotal + tax + shipping - discountAmount;
    req.session.cartSubtotal = subtotal; // used by other routes

    return res.render("checkout", {
      user,
      addresses: user.address,
      defaultAddress: user.address?.[0] || null,
      cart,
      subtotal,
      tax,
      shipping,
      finalTotal,
      appliedCoupon,
      discountAmount,
      couponError
    });
  } catch (err) {
    console.error("Checkout Page Error:", err);
    return res.redirect("/");
  }
};






const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId)
      return res.json({ success: false, message: "Login required" });

    const { addressId, useWallet } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.address || user.address.length === 0) {
      return res.json({ success: false, message: "No address found" });
    }

    const addr = user.address.find(
      (a) => a._id.toString() === addressId
    );
    if (!addr) {
      return res.json({
        success: false,
        message: "Selected address not found",
      });
    }

    const selectedAddress = {
      name: addr.name,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
    };

    const cart = await Cart.findOne({ user: userId }).populate(
      "items.product"
    );

    if (!cart || !cart.items.length)
      return res.json({
        success: false,
        message: "Cart is empty",
      });

    // -----------------------
    // 🔥 FIRST: CALCULATE SUBTOTAL
    // -----------------------
    const orderItems = cart.items.map((item) => ({
      product: item.product._id,
      quantity: item.quantity,
      size: item.size,
      price: item.product.discountPrice || item.product.price,
    }));

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // -----------------------
    // 🔥 SECOND: VALIDATE COUPON
    // -----------------------
    const validation = await validateCoupon(
      req.session.appliedCoupon,
      subtotal
    );

    if (!validation.valid) {
      req.session.appliedCoupon = null;

      return res.json({
        success: false,
        message: validation.message,
      });
    }

    // -----------------------
    // 🔥 APPLY COUPON
    // -----------------------
    let discountAmount = 0;
    let couponData = null;

    if (validation.coupon) {
      const c = validation.coupon;

      discountAmount =
        c.discountType === "percentage"
          ? (subtotal * c.discountValue) / 100
          : c.discountValue;

      if (c.maxDiscount && discountAmount > c.maxDiscount)
        discountAmount = c.maxDiscount;

      couponData = {
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountValue,
        discountAmount,
      };
    }

    // -----------------------
    // 🔥 FINAL AMOUNT
    // -----------------------
    const tax = subtotal * 0.05;
    const shipping = 50;

    let totalAmount = subtotal + tax + shipping - discountAmount;

    // COD validation
    if (!useWallet && totalAmount > 1000) {
      return res.json({
        success: false,
        message:
          "Cash on Delivery is not available for orders above ₹1000.",
      });
    }

    // -----------------------
    // 🔥 WALLET
    // -----------------------
    let walletUsed = 0;

    if (useWallet && user.wallet?.balance > 0) {
      walletUsed = Math.min(user.wallet.balance, totalAmount);
      totalAmount -= walletUsed;

      user.wallet.balance -= walletUsed;

      user.wallet.transactions.push({
        type: "debit",
        amount: walletUsed,
        description: `Used ₹${walletUsed} for COD payment`,
        date: new Date(),
      });

      await user.save();
    }

    // -----------------------
    // 🔥 STOCK REDUCTION
    // -----------------------
    for (let item of cart.items) {
      const product = await Product.findById(item.product._id);
      if (!product) continue;

      const sizeIndex = product.sizes.findIndex(
        (s) => s.size === item.size
      );

      if (sizeIndex === -1) continue;

      if (product.sizes[sizeIndex].stock < item.quantity) {
        return res.json({
          success: false,
          message: `${product.productName} is out of stock`,
        });
      }

      product.sizes[sizeIndex].stock -= item.quantity;
      await product.save();
    }

    // -----------------------
    // 🔥 CREATE ORDER
    // -----------------------
    const newOrder = new Order({
      user: user._id,
      items: orderItems,
      address: selectedAddress,
      paymentMethod:
        walletUsed > 0 && totalAmount === 0
          ? "Wallet"
          : "Cash on Delivery",
      totalAmount,
      status: "Placed",
      coupon: couponData || undefined,
    });

    await newOrder.save();

    // Clear cart
    cart.items = [];
    cart.total = 0;
    await cart.save();

    delete req.session.appliedCoupon;

    return res.json({
      success: true,
      redirect: `/order-success?id=${newOrder._id}`,
    });
  } catch (error) {
    console.error("Error placing order:", error);
    return res.json({
      success: false,
      message: "Unable to place order. Please try again",
    });
  }
};







const orderSuccessPage = async (req, res) => {
  try {
    const orderId = req.query.id;
    if (!orderId) return res.redirect('/');

    const userId = req.session.user;  

    const user = await User.findById(userId); 
    const order = await Order.findById(orderId).populate('items.product');
    if (!order) return res.redirect('/');

    res.render('order-success', { 
      user,      
      order 
    });

  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};





const getUserOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");
    const user = await User.findById(userId); 

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
      user,
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

    const user = await User.findById(userId);

    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate("items.product");
    if (!order) return res.redirect("/orders");

    let subtotal = 0;
    let cancelledCount = 0;

    order.items.forEach(item => {
      if (item.status === "Cancelled") cancelledCount++;
      else subtotal += (item.price || 0) * (item.quantity || 0);
    });

    const tax = subtotal * 0.05;
    const shipping = order.status === "Cancelled" ? 0 : 50;

    let discount = 0;
    let couponCode = null;

    if (order.coupon) {
      couponCode = order.coupon.code || null;

      if (order.coupon.discountAmount)
        discount = order.coupon.discountAmount;

      else if (order.coupon.discountValue && order.coupon.discountType === "percentage") {
        discount = subtotal * (order.coupon.discountValue / 100);
        if (order.coupon.maxDiscount && discount > order.coupon.maxDiscount)
          discount = order.coupon.maxDiscount;
      }

      else if (order.coupon.discountValue)
        discount = order.coupon.discountValue;
    }

    const subtotalRounded = Math.round(subtotal * 100) / 100;
    const taxRounded = Math.round(tax * 100) / 100;
    const shippingRounded = Math.round(shipping * 100) / 100;
    const discountRounded = Math.round(discount * 100) / 100;

    const total = Math.round(
      (subtotalRounded + taxRounded + shippingRounded - discountRounded) * 100
    ) / 100;

    let displayStatus = order.status;
    if (order.status === "Cancelled") displayStatus = "Cancelled";
    else if (cancelledCount > 0 && cancelledCount < order.items.length)
      displayStatus = "Partially Cancelled";

    order.items.forEach(item => {
      item.displayStatus = item.status === "Cancelled"
        ? "Cancelled"
        : displayStatus;
    });

    res.render("order-details", {
      order,
      user, 
      subtotal: subtotalRounded,
      tax: taxRounded,
      shipping: shippingRounded,
      discount: discountRounded,
      couponCode,
      total,
      displayStatus
    });

  } catch (err) {
    console.error("Error fetching order details:", err);
    res.redirect("/orders");
  }
};






const cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.session.user;

    const order = await Order.findById(orderId)
      .populate("items.product")
      .populate("user");

    if (!order) return res.json({ success: false, message: "Order not found" });
    if (order.status === "Cancelled")
      return res.json({ success: false, message: "Order already cancelled" });

  
    for (const item of order.items) {
      const product = await Product.findById(item.product._id);
      if (product) {
        const sizeObj = product.sizes.find((s) => s.size === item.size);
        if (sizeObj) sizeObj.stock += item.quantity;
        await product.save();
      }
    }


    const user = await User.findById(order.user);

    if (!user.wallet) {
      user.wallet = { balance: 0, transactions: [] };
    }

    let refundAmount = 0;

    if (order.walletUsed && order.walletUsed > 0) {
      refundAmount += order.walletUsed;
    }

 
    if (order.paymentMethod === "Razorpay") {
      const razorpayRefund = order.totalAmount - order.walletUsed;
      if (razorpayRefund > 0) {
        refundAmount += razorpayRefund;
      }
    }

    if (refundAmount > 0) {
      user.wallet.balance += refundAmount;

      user.wallet.transactions.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund for cancelled order ${order._id}`,
        date: new Date(),
      });

      user.markModified("wallet");
      await user.save();
    }

 
    order.status = "Cancelled";
    order.items.forEach(i => i.status = "Cancelled");
    await order.save();

    return res.json({
      success: true,
      message: `Order cancelled. ₹${refundAmount} refunded to wallet.`,
    });

  } catch (error) {
    console.error(" Cancel Order Error:", error);
    return res.json({
      success: false,
      message: "Internal server error when cancelling order",
    });
  }
};




const cancelItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.user;

    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate("items.product")
      .populate("user");

    if (!order) {
      return res.json({ success: false, message: "Order not found" });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.json({ success: false, message: "Item not found" });
    }

    if (item.status === "Cancelled") {
      return res.json({ success: false, message: "Item already cancelled" });
    }

    const product = await Product.findById(item.product._id);
    if (product) {
      const sizeObj = product.sizes.find((s) => s.size === item.size);
      if (sizeObj) sizeObj.stock += item.quantity;
      await product.save();
    }


    const user = await User.findById(userId);

    if (!user.wallet) {
      user.wallet = { balance: 0, transactions: [] };
    }

    const itemRefundAmount = item.price * item.quantity;
    let refundAmount = 0;

    if (order.walletUsed > 0) {
      const proportion = itemRefundAmount / order.totalAmount;
      const walletPart = +(order.walletUsed * proportion).toFixed(2);

      refundAmount += walletPart;
    }

    if (order.paymentMethod === "Razorpay") {
      const razorpayPart = itemRefundAmount - refundAmount;
      if (razorpayPart > 0) refundAmount += razorpayPart;
    }

    if (refundAmount > 0) {
      user.wallet.balance += refundAmount;

      user.wallet.transactions.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund for cancelled item from order ${order._id}`,
        date: new Date(),
      });

      user.markModified("wallet");
      await user.save();
    }

   
    item.status = "Cancelled";

    const allCancelled = order.items.every(i => i.status === "Cancelled");
    if (allCancelled) {
      order.status = "Cancelled";
    }

    await order.save();

    return res.json({
      success: true,
      message: `Item cancelled. ₹${refundAmount} refunded to wallet.`,
      allCancelled
    });

  } catch (error) {
    console.error("Cancel Item Error:", error);
    return res.json({ success: false, message: "Error cancelling item" });
  }
};






const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).populate("items.product");

    if (!order) return res.status(404).send("Order not found");

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    const mainFont = "helvetica";
    const mainSize = 11;
    doc.setFont(mainFont, "normal");
    doc.setFontSize(mainSize);

    doc.setFont(mainFont, "bold");
    doc.setFontSize(20);
    doc.text("ZNEAKZ", 105, 20, { align: "center" });

    doc.setFont(mainFont, "normal");
    doc.setFontSize(13);
    doc.text("Invoice", 105, 30, { align: "center" });

    doc.setLineWidth(0.5);
    doc.line(14, 34, 196, 34);

    doc.setFontSize(mainSize);
    doc.text(`Order ID: ${order.orderID}`, 14, 44);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 14, 50);
    doc.text(`Payment Method: ${order.paymentMethod}`, 14, 56);

    doc.setFont(mainFont, "bold");
    doc.text("Shipping Address:", 14, 68);
    doc.setFont(mainFont, "normal");

    const address = order.address || {};
    const recipient = address.name || "N/A";
    const shippingText = `${recipient}
${address.city || ""}, ${address.state || ""} - ${address.pincode || ""}`;
    doc.text(shippingText.split("\n"), 14, 74);

    let y = 95;
    doc.setFont(mainFont, "bold");
    doc.setFillColor(230, 230, 230);
    doc.rect(14, y - 5, 182, 7, "F");
    doc.text("Product", 16, y);
    doc.text("Qty", 110, y);
    doc.text("Price (Rs)", 140, y);
    doc.text("Total (Rs)", 170, y);

    doc.setFont(mainFont, "normal");
    y += 7;

    let subtotal = 0;
    order.items.forEach((item) => {
      const name = item.product?.productName || "Unnamed Product";
      const qty = item.quantity;
      const price = item.price;
      const total = qty * price;
      const displayName =
        item.status === "Cancelled" ? `${name} (Cancelled)` : name;

      if (item.status !== "Cancelled") subtotal += total;

      doc.text(displayName, 16, y);
      doc.text(String(qty), 110, y);
      doc.text(`Rs ${price.toFixed(2)}`, 140, y);
      doc.text(
        item.status === "Cancelled" ? "Rs 0.00" : `Rs ${total.toFixed(2)}`,
        170,
        y
      );
      y += 7;
    });

    const tax = subtotal * 0.05;
    const shipping = order.status === "Cancelled" ? 0 : 50;
    const discount = order.coupon?.discountAmount || 0;
    const grandTotal = subtotal + tax + shipping - discount;

    y += 6;
    doc.setFont(mainFont, "bold");
    doc.text("Summary", 14, y);
    y += 6;

    doc.setFont(mainFont, "normal");
    doc.text(`Subtotal: Rs ${subtotal.toFixed(2)}`, 14, y);
    y += 6;
    doc.text(`Tax (5%): Rs ${tax.toFixed(2)}`, 14, y);
    y += 6;
    doc.text(`Shipping: Rs ${shipping.toFixed(2)}`, 14, y);

    if (order.coupon?.code) {
      y += 6;
      doc.text(
        `Coupon (${order.coupon.code}): -Rs ${discount.toFixed(2)}`,
        14,
        y
      );
    }

    y += 7;
    doc.setFont(mainFont, "bold");
    doc.text(`Grand Total: Rs ${grandTotal.toFixed(2)}`, 14, y);

    y += 20;
    doc.setFont(mainFont, "italic");
    doc.setFontSize(10);
    doc.text("Thank you for shopping with ZNEAKZ!", 105, y, { align: "center" });

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
        const userId = req.session.user;

    const order = await Order.findById(orderId).populate('items.product');
    const item = order.items.id(itemId);
        const user = await User.findById(userId);

    if (!item) return res.status(404).send('Item not found');

    const reasons = [
      "Item damaged",
      "Wrong product delivered",
      "Product not as described",
      "Received late",
      "Other"
    ];

    res.render('returnItem', { order,user, item, reasons });
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


const requestReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.json({ success: false, message: "Order not found" });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.json({ success: false, message: "Item not found" });
    }

    if (item.returnStatus !== "None") {
      return res.json({ success: false, message: "Return already requested" });
    }

    item.returnStatus = "Requested";
    item.returnDate = new Date();

    await order.save();

    return res.json({
      success: true,
      message: "Return request sent successfully"
    });

  } catch (err) {
    console.error("Return request error:", err);
    return res.json({ success: false, message: "Server error" });
  }
};


const applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.session.user;

    const cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart || !cart.items.length)
      return res.json({ success: false, message: "Cart is empty." });

    let subtotal = 0;
    cart.items.forEach(item => {
      const price = item.product.discountPrice || item.product.price;
      subtotal += price * item.quantity;
    });

    const coupon = await Coupon.findOne({ code, isActive: true });
    if (!coupon) return res.json({ success: false, message: "Invalid coupon code." });

    if (coupon.usedBy.includes(userId)) {
      return res.json({
        success: false,
        message: "You’ve already used this coupon before.",
      });
    }

    if (new Date(coupon.expiryDate) < new Date())
      return res.json({ success: false, message: "Coupon expired." });

    if (subtotal < coupon.minPurchase)
      return res.json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required.`,
      });

    req.session.appliedCoupon = {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minPurchase: coupon.minPurchase,
      maxDiscount: coupon.maxDiscount,
    };

    res.json({ success: true, message: "Coupon applied successfully!" });
  } catch (err) {
    console.error("Apply Coupon Error:", err);
    res.json({ success: false, message: "Server error applying coupon." });
  }
};

const removeCoupon = (req, res) => {
  try {
    delete req.session.appliedCoupon;
    res.json({ success: true, message: "Coupon removed successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error removing coupon." });
  }
};

const availableCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: new Date() },
    }).lean();

    res.json({ success: true, coupons });
  } catch (err) {
    console.error("Available Coupons Error:", err);
    res.status(500).json({ success: false, message: "Error fetching coupons." });
  }
};

const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.status(401).json({ success: false, message: "Login required" });

    const { totalAmount } = req.body;
   const options = {
  amount: Math.round(totalAmount * 100), 
  currency: "INR",
  receipt: `order_rcptid_${Date.now()}`
};


    const order = await razorpay.orders.create(options);
    res.json({
      success: true,
      orderId: order.id,
      amount: totalAmount,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error("Razorpay order creation failed:", err);
    res.status(500).json({ success: false, message: "Payment initiation failed" });
  }
};


const verifyRazorpayPayment = async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      orderDetails 
    } = req.body;

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpay_signature) {
      console.error("Payment verification failed: Invalid signature");
      return res.json({ success: false, redirect: "/order-failure" });
    }

    const userId = req.session.user;
    if (!userId) {
      return res.json({ success: false, redirect: "/login" });
    }

    const items = orderDetails.items || [];
    const address = orderDetails.address || {};
    const totalAmount = Math.round(orderDetails.totalAmount); 

    for (let item of items) {
      const product = await Product.findById(item.productId);
      if (product) {
        const sizeIndex = product.sizes.findIndex(s => s.size === item.size);
        if (sizeIndex !== -1) {
          if (product.sizes[sizeIndex].stock < item.quantity) {
            console.error(`${product.productName} is out of stock.`);
            return res.json({
              success: false,
              redirect: "/order-failure",
              message: `${product.productName} is out of stock.`
            });
          }
          product.sizes[sizeIndex].stock -= item.quantity;
          await product.save();
        }
      }
    }

    const newOrder = new Order({
      user: userId,
      items: items.map(i => ({
        product: i.productId,
        quantity: i.quantity,
        size: i.size,
        price: i.price,
      })),
      address,
      paymentMethod: "Razorpay",
      totalAmount,
      status: "Placed",
    });

    await newOrder.save();

    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { items: [], total: 0 } }
    );

    console.log("✅ Payment verified & order saved:", newOrder._id);
    return res.json({
      success: true,
      redirect: `/order-success?id=${newOrder._id}`,
    });
  } catch (error) {
    console.error("Payment verification failed:", error);
    return res.json({ success: false, redirect: "/order-failure" });
  }
};

const orderFailurePage = async (req, res) => {
  try {
    const { id } = req.query; 
    let order = null;

    if (id) {
      order = await Order.findById(id).populate("items.product");
    }

    res.render("order-failure", {
      order,
      message: "Your payment was not completed. Please try again.",
    });
  } catch (err) {
    console.error("Error rendering order failure page:", err);
    res.redirect("/");
  }
};

const getWalletPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const page = parseInt(req.query.page) || 1;
    const limit = 10;  
    const skip = (page - 1) * limit;

    const user = await User.findById(userId).lean();
    if (!user) return res.redirect("/login");

    let transactions = user.wallet?.transactions || [];

    transactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    const paginated = transactions.slice(skip, skip + limit);

    const totalPages = Math.ceil(transactions.length / limit);

    res.render("wallet", { 
      balance: user.wallet.balance,
      transactions: paginated,
      page,
      user,
      totalPages
    });

  } catch (err) {
    console.error("Error loading wallet:", err);
    res.status(500).send("Error loading wallet");
  }
};


const getWalletBalance = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.status(401).json({ success: false, message: "Login required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const balance = user.wallet?.balance || 0;
    res.json({ success: true, balance });
  } catch (err) {
    console.error("Error fetching wallet balance:", err);
    res.status(500).json({ success: false, message: "Error fetching wallet" });
  }
};

const payWithWallet = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.body;

    const user = await User.findById(userId);
    const cart = await Cart.findOne({ user: userId }).populate("items.product");

    if (!user || !cart || cart.items.length === 0) {
      return res.json({ success: false, message: "Cart is empty." });
    }

    const selectedAddress = user.address.find(a => a._id.toString() === addressId);
    if (!selectedAddress) {
      return res.json({ success: false, message: "Address not found." });
    }

    const subtotal = cart.items.reduce(
      (sum, i) => sum + (i.product.discountPrice || i.product.price) * i.quantity,
      0
    );

    const tax = +(subtotal * 0.05).toFixed(2);  
    const shipping = 50;                       

    let couponDiscount = 0;
    if (req.session.appliedCoupon) {
      const c = req.session.appliedCoupon;
      couponDiscount =
        c.discountType === "percentage"
          ? (subtotal * c.discountValue) / 100
          : c.discountValue;

      if (c.maxDiscount)
        couponDiscount = Math.min(couponDiscount, c.maxDiscount);
    }

    const total = subtotal + tax + shipping - couponDiscount;

    if (user.wallet.balance < total) {
      return res.json({
        success: false,
        message: "Insufficient wallet balance."
      });
    }

    user.wallet.balance -= total;
    user.wallet.transactions.push({
      type: "debit",
      amount: total,
      description: "Wallet payment for order",
      date: new Date()
    });
    user.markModified("wallet");
    await user.save();

    for (let item of cart.items) {
      const product = await Product.findById(item.product._id);
      if (product) {
        const sizeObj = product.sizes.find(s => s.size === item.size);
        if (sizeObj) {
          if (sizeObj.stock < item.quantity) {
            return res.json({
              success: false,
              message: `${product.productName} is out of stock`
            });
          }
          sizeObj.stock -= item.quantity;
          await product.save();
        }
      }
    }

    const order = new Order({
      user: userId,
      orderID: `ZNK${Date.now()}${Math.floor(Math.random() * 100)}`,

      items: cart.items.map(i => ({
        product: i.product._id,
        quantity: i.quantity,
        size: i.size,
        price: i.product.discountPrice || i.product.price,

        tax: +(((i.product.discountPrice || i.product.price) * i.quantity) * 0.05).toFixed(2),

        shipping: +(shipping / cart.items.length).toFixed(2)
      })),

      address: {
        name: selectedAddress.name,
        city: selectedAddress.city,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode
      },

      totalAmount: total,
      paymentMethod: "Wallet",
      status: "Placed",
      walletUsed: total,

      tax: tax,
      shipping: shipping,

      coupon: req.session.appliedCoupon
        ? {
            code: req.session.appliedCoupon.code,
            discountAmount: couponDiscount
          }
        : null
    });

    await order.save();

    await Cart.deleteOne({ user: userId });
    delete req.session.appliedCoupon;

    return res.json({
      success: true,
      message: "Wallet payment successful.",
      redirect: `/order-success?id=${order._id}`
    });

  } catch (err) {
    console.error("WALLET PAYMENT ERROR:", err);
    return res.json({
      success: false,
      message: "Server error during wallet payment."
    });
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
     submitReturnItem,
     requestReturn ,
     applyCoupon,
     removeCoupon,
     availableCoupons,
     createRazorpayOrder,
     verifyRazorpayPayment,
     orderFailurePage,
     getWalletPage,
     getWalletBalance,
     payWithWallet
    };
