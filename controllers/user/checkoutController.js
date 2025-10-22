
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

    // ✅ Use the correct field from your schema
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

    // Get cart
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

    const newOrder = new Order({
      user: user._id,
      items: orderItems,
      address: selectedAddress,
      paymentMethod: "Cash on Delivery",
      totalAmount,
      status: "Placed",
    });

    await newOrder.save();

    // Clear cart
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



const viewOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const order = await Order.findOne({ _id: orderId, user: userId }).populate('items.product');
    if (!order) return res.redirect('/orders');

    res.render('orders', { order });
  } catch (err) {
    console.error('Error loading order details:', err);
    res.redirect('/orders');
  }
};


module.exports = {
     checkoutPage,
     placeOrder,
     orderSuccessPage,
     viewOrderDetails
    };
