const mongoose = require('mongoose');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');

const addToWishlist = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Please login to continue.' });
    }

    const userId = req.session.user;
    const productId = req.params.productId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const cart = await Cart.findOne({ user: userId });

    // ✅ CHECK IF PRODUCT EXISTS IN CART FIRST
    const inCart = cart?.items.some(item => item.product.toString() === productId);

    if (inCart) {
      return res.json({
        success: false,
        message: "Product already in cart"
      });
    }

    // Wishlist array safe check
    if (!Array.isArray(user.wishlist)) user.wishlist = [];

    // ❌ If product already in wishlist
    if (user.wishlist.includes(productId)) {
      return res.json({
        success: false,
        message: "Product already in wishlist"
      });
    }

    // Add to wishlist
    user.wishlist.push(productId);
    await user.save();

    return res.json({
      success: true,
      message: "Added to wishlist"
    });

  } catch (error) {
    console.error("Wishlist add error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};



const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in.' });
    }

    await User.findByIdAndUpdate(userId, {
      $pull: { wishlist: new mongoose.Types.ObjectId(productId) },
    });

    return res.json({ success: true, message: 'Removed from wishlist.' });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getWishlistPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId).populate('wishlist');
    if (!user) return res.redirect('/login');

    const products = user.wishlist || [];

    const wishlistCount = products.length;

    return res.render('wishlist', { 
      user, 
      products,
      wishlistCount  
    });

  } catch (error) {
    console.error('Error loading wishlist page:', error);
    return res.status(500).send('Server Error');
  }
};


const moveToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in." });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    
    let chosenSize = null;
    let chosenStock = 0;

    if (product.sizes && product.sizes.length > 0) {
      const availableSize = product.sizes.find(s => s.stock > 0);

      if (!availableSize) {
        return res.json({
          success: false,
          message: "This product is out of stock."
        });
      }

      chosenSize = availableSize.size;
      chosenStock = availableSize.stock;
    } else {
      return res.json({ success: false, message: "Product has no sizes." });
    }


    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = new Cart({ user: userId, items: [] });

    const existingItem = cart.items.find(
      item => item.product.toString() === productId && item.size === chosenSize
    );

    if (existingItem) {
      if (existingItem.quantity >= chosenStock) {
        return res.json({
          success: false,
          message: `No more stock available for size ${chosenSize}.`
        });
      }

      existingItem.quantity += 1;
    } else {
      if (chosenStock <= 0) {
        return res.json({
          success: false,
          message: "This size is out of stock"
        });
      }

      const itemPrice = product.discountPrice > 0 ? product.discountPrice : product.price;

      cart.items.push({
        product: productId,
        size: chosenSize,
        quantity: 1,
        price: itemPrice
      });
    }

    cart.total = cart.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    await cart.save();

    await User.findByIdAndUpdate(userId, { $pull: { wishlist: productId } });

    return res.json({
      success: true,
      message: `Added to cart (Size ${chosenSize}) and removed from wishlist.`,
    });

  } catch (error) {
    console.error("Error moving item to cart:", error);
    return res.status(500).json({ success: false, message: "Server error occurred." });
  }
};



const wishlistCount = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.json({ count: 0 });
    }

    const user = await User.findById(userId).select("wishlist");

    let count = 0;

    if (user && user.wishlist && user.wishlist.length > 0) {
      count = user.wishlist.length;
    }

    return res.json({ count });
  } catch (err) {
    console.error("Error in wishlistCount:", err);
    res.status(500).json({ count: 0 });
  }
};


module.exports = {
  addToWishlist,
  removeFromWishlist,
  getWishlistPage,
  moveToCart,
  wishlistCount
};
