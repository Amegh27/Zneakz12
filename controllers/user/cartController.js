const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Category = require('../../models/categorySchema')
const User = require('../../models/userSchema')

const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.json({ redirect: "/login" });

    const { productId, size, quantity } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.json({ success: false, message: "Product not found" });

    // Find the selected size
    const sizeIndex = product.sizes.findIndex(s => s.size === size);
    if (sizeIndex === -1) return res.json({ success: false, message: "Size not found" });

    // Check stock
    if (product.sizes[sizeIndex].stock < quantity) {
      return res.json({ success: false, message: "Not enough stock" });
    }

    // Reduce stock for that size
    product.sizes[sizeIndex].stock -= quantity;
    await product.save();

    // Add to cart
    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = new Cart({ user: userId, items: [] });

    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId && item.size === size
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += parseInt(quantity);
    } else {
      cart.items.push({
        product: productId,
        quantity: parseInt(quantity),
        price: product.discountPrice || product.price,
        size // use size from req.body
      });
    }

    // Update total
    cart.total = cart.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    await cart.save();

    res.json({
      success: true,
      message: `${product.productName} added to cart!`,
      cartCount: cart.items.length
    });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Server error" });
  }
};



const viewCart = async (req, res) => {
  try {
    const userId = req.session.user;
    let cart = null;
    let cartCount = 0;

    if (userId) {
      cart = await Cart.findOne({ user: userId }).populate('items.product');

      if (cart && cart.items.length > 0) {
        cartCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);
      }
    }

    res.render('cart', {
      cart,
      cartCount,   // pass the count here
      user: userId ? await User.findById(userId) : null
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};








const loadCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ user: userId }).populate("items.product");

    res.render("cart", { user: req.session.user, cart });
  } catch (error) {
    console.error("Error loading cart:", error);
    res.redirect("/pageNotFound");
  }
};

const updateCart = async (req, res) => {
  try {
    const { productId, action } = req.body;
    const userId = req.session.user;

    let cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart) return res.status(400).json({ error: "Cart not found" });

    const itemIndex = cart.items.findIndex(item => item.product._id.equals(productId));
    if (itemIndex > -1) {
      if (action === "increase") {
        cart.items[itemIndex].quantity++;
      } else if (action === "decrease") {
        cart.items[itemIndex].quantity--;
        if (cart.items[itemIndex].quantity <= 0) {
          cart.items.splice(itemIndex, 1);
        }
      }
    }

    cart.total = cart.items.reduce((sum, item) => {
      const productPrice = item.product.discountPrice || item.product.price;
      return sum + item.quantity * productPrice;
    }, 0);

    await cart.save();
    res.json({ success: true, total: cart.total });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ error: "Server Error" });
  }
};


const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, size } = req.body;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.json({ success: false, message: "Cart not found" });

    // Find item in cart by productId AND size
    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId && item.size === size
    );
    if (itemIndex === -1) return res.json({ success: false, message: "Item not found in cart" });

    const item = cart.items[itemIndex];

    // Restore stock for the correct size
    const product = await Product.findById(productId);
    if (!product) return res.json({ success: false, message: "Product not found" });

    const sizeIndex = product.sizes.findIndex(s => s.size === size);
    if (sizeIndex !== -1) {
      product.sizes[sizeIndex].stock += item.quantity;
      await product.save();
    }

    // Remove from cart
    cart.items.splice(itemIndex, 1);
    cart.total = cart.items.reduce((acc, i) => acc + i.price * i.quantity, 0);
    await cart.save();

    res.json({ success: true, message: "Item removed from cart", cartCount: cart.items.length });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Server error" });
  }
};







module.exports = { 
    addToCart, 
    viewCart,
    loadCart, 
    updateCart, 
    removeFromCart 
};
