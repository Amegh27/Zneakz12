const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Category = require('../../models/categorySchema')
const User = require('../../models/userSchema')

const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, size } = req.body;
    const userId = req.session.user;
    if (!userId) return res.status(401).json({ success: false, message: "Login required" });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    let cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart) {
      cart = new Cart({ user: userId, items: [], total: 0 });
    }

    const totalItemsInCart = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalItemsInCart + quantity > 10) {
      return res.json({ success: false, message: "Cart limit reached (10 items max)" });
    }

    const itemIndex = cart.items.findIndex(item => item.product._id.equals(productId) && item.size === size);

    const itemPrice = product.discountPrice || product.price; 

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity;
    } else {
      cart.items.push({
        product: product._id,
        quantity,
        size,
        price: itemPrice,
      });
    }

    cart.total = cart.items.reduce((sum, item) => {
      const price = item.price || 0;
      return sum + item.quantity * price;
    }, 0);

    await cart.save();
    res.json({ success: true, message: "Added to cart", total: cart.total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
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
      cartCount,   
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

    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart) return res.status(400).json({ success: false, message: "Cart not found" });

    const itemIndex = cart.items.findIndex(item => item.product._id.equals(productId));
    if (itemIndex === -1) return res.status(400).json({ success: false, message: "Item not in cart" });

    const totalItemsInCart = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    if (action === "increase") {
      if (totalItemsInCart >= 10) {
        return res.json({ success: false, message: "Cart limit reached (10 items max)" });
      }
      cart.items[itemIndex].quantity++;
    } else if (action === "decrease") {
      cart.items[itemIndex].quantity--;
      if (cart.items[itemIndex].quantity <= 0) {
        cart.items.splice(itemIndex, 1);
      }
    }

    cart.total = cart.items.reduce((sum, item) => {
      const price = item.product.discountPrice || item.product.price;
      return sum + item.quantity * price;
    }, 0);

    await cart.save();
    res.json({ success: true, total: cart.total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, size } = req.body;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.json({ success: false, message: "Cart not found" });

    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId && item.size === size
    );
    if (itemIndex === -1) return res.json({ success: false, message: "Item not found in cart" });

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
