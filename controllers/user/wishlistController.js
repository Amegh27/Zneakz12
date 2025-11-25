const mongoose = require('mongoose');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');

const addToWishlist = async (req, res) => {
  try {
    if (!req.session.user) {
      return res
        .status(401)
        .json({ success: false, message: 'Please login to add items to your wishlist.' });
    }

    const userId = req.session.user;
    const productId = req.params.productId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!Array.isArray(user.wishlist)) user.wishlist = [];

    if (user.wishlist.includes(productId)) {
      return res
        .status(200)
        .json({ success: false, message: 'Product already in wishlist.' });
    }

    user.wishlist.push(productId);
    await user.save();

    return res.status(200).json({ success: true, message: 'Added to wishlist.' });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Server error while adding to wishlist.' });
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
      return res.status(401).json({ success: false, message: 'Please log in.' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    let chosenSize = null;

    if (Array.isArray(product.sizes) && product.sizes.length > 0) {
      const sortedSizes = [...product.sizes].sort((a, b) => {
        const aNum = parseFloat(a.size);
        const bNum = parseFloat(b.size);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.size.localeCompare(b.size);
      });

      const availableSize = sortedSizes.find(s => s.stock > 0);
      if (!availableSize) {
        return res
          .status(400)
          .json({ success: false, message: 'All sizes are out of stock.' });
      }
      chosenSize = availableSize.size;
    } else {
      return res
        .status(400)
        .json({ success: false, message: 'This product has no sizes configured.' });
    }

    const itemPrice = product.discountPrice > 0 ? product.discountPrice : product.price;

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    const existingItem = cart.items.find(
      item => item.product.toString() === productId && item.size === chosenSize
    );

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.items.push({
        product: productId,
        quantity: 1,
        price: itemPrice,
        size: chosenSize,
      });
    }

    cart.total = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    await cart.save();

    await User.findByIdAndUpdate(userId, { $pull: { wishlist: productId } });

    return res.json({
      success: true,
      message: `Moved to cart (Size ${chosenSize}) and removed from wishlist.`,
    });
  } catch (error) {
    console.error('Error moving item to cart:', error);
    return res.status(500).json({ success: false, message: 'Server error occurred.' });
  }
};

const wishlistCount = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.json({ count: 0 });
    }

    // If wishlist stored inside USER document:
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
