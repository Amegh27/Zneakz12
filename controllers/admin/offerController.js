const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

const createProductOffer = async (req, res) => {
  try {
    const { productId, title, discountType, discountValue, endDate } = req.body;

    if (!productId || !title || !discountType || !discountValue || !endDate) {
      return res.json({ success: false, message: 'All fields are required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.json({ success: false, message: 'Product not found' });
    }

    // Store the base discount before applying offer
    const baseDiscountPrice = product.discountPrice && product.discountPrice < product.price
      ? product.discountPrice
      : product.price;

    const newOffer = new Offer({
      title,
      offerType: 'product',
      discountType,
      discountValue,
      endDate,
      product: productId,
      isActive: true
    });
    await newOffer.save();

    // Calculate offer discount
    let offerDiscountedPrice =
      discountType === 'percentage'
        ? product.price - (product.price * discountValue / 100)
        : product.price - discountValue;

    // Take the better (lower) price between base and offer
    const finalPrice = Math.min(baseDiscountPrice, Math.floor(offerDiscountedPrice));

    product.previousDiscountPrice = baseDiscountPrice; // ✅ keep old discount
    product.discountPrice = Math.max(0, finalPrice);
    product.offerApplied = 'product';
    product.offer = newOffer._id;
    await product.save();

    return res.json({
      success: true,
      message: 'Product offer created and applied successfully',
    });
  } catch (error) {
    console.error('Error creating product offer:', error);
    return res.json({
      success: false,
      message: 'Server error while creating offer',
    });
  }
};


const createCategoryOffer = async (req, res) => {
  try {
    const { title, categoryId, discountType, discountValue, startDate, endDate } = req.body;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    const offer = new Offer({
      title,
      offerType: 'category',
      category: categoryId,
      discountType,
      discountValue,
      startDate,
      endDate,
    });
    await offer.save();

    const products = await Product.find({ category: categoryId });

    for (const product of products) {
      const basePrice = product.price;

      const categoryDiscount =
        discountType === 'percentage'
          ? (basePrice * discountValue) / 100
          : discountValue;

      const existingDiscount =
        product.discountPrice && product.discountPrice > 0
          ? basePrice - product.discountPrice
          : 0;

      const finalDiscount = Math.max(existingDiscount, categoryDiscount);
      const finalPrice = Math.max(basePrice - finalDiscount, 0);

      product.discountPrice = finalPrice;
      product.offerApplied = finalDiscount === categoryDiscount ? 'category' : product.offerApplied;

      await product.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Category offer applied successfully to all related products.',
    });
  } catch (error) {
    console.error(' Error creating category offer:', error);
    return res.status(500).json({ success: false, message: 'Server error while applying category offer.' });
  }
};

const removeOffer = async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await Offer.findById(offerId);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found.' });
    }

    if (offer.offerType === 'product') {
      const product = await Product.findById(offer.product);
      if (product) {
        product.discountPrice = 0;
        product.offerApplied = null;
        await product.save();
      }
    } else if (offer.offerType === 'category') {
      const products = await Product.find({ category: offer.category });
      for (const product of products) {
        product.discountPrice = 0;
        product.offerApplied = null;
        await product.save();
      }
    }

    await offer.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Offer removed successfully.',
    });
  } catch (error) {
    console.error(' Error removing offer:', error);
    return res.status(500).json({ success: false, message: 'Server error while removing offer.' });
  }
};


const assignProductOffer = async (req, res) => {
  try {
    const { productId } = req.params;
    const { offerId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(offerId)) {
      return res.status(400).json({ success: false, message: "Invalid product or offer ID." });
    }

    const offer = await Offer.findById(offerId);
    const product = await Product.findById(productId);

    if (!offer || !offer.isActive) {
      return res.status(404).json({ success: false, message: "Offer not found or inactive." });
    }

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    // ✅ Calculate the new discounted price based on offer type
    let discountedPrice = product.price;
    if (offer.discountType === 'percentage') {
      discountedPrice = product.price - (product.price * offer.discountValue / 100);
    } else {
      discountedPrice = product.price - offer.discountValue;
    }

    product.discountPrice = Math.max(0, Math.floor(discountedPrice));
    product.offerApplied = 'product';
    await product.save();

    return res.status(200).json({
      success: true,
      message: "Offer successfully assigned to product.",
    });
  } catch (error) {
    console.error(" Error assigning offer:", error);
    return res.status(500).json({ success: false, message: "Server error while assigning offer." });
  }
};


const removeProductOffer = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    // Find and delete the offer related to this product
    const offer = await Offer.findOne({ offerType: "product", product: productId });
    if (offer) {
      await offer.deleteOne();
    }

    // Restore previous discount if available
    if (product.previousDiscountPrice && product.previousDiscountPrice < product.price) {
      product.discountPrice = product.previousDiscountPrice;
    } else {
      product.discountPrice = product.price;
    }

    product.offerApplied = null;
    product.offer = null;
    product.previousDiscountPrice = undefined;
    await product.save();

    return res.status(200).json({
      success: true,
      message: "Product offer removed successfully.",
    });
  } catch (error) {
    console.error("Error removing product offer:", error);
    return res.status(500).json({ success: false, message: "Server error removing offer." });
  }
};


module.exports = {
  createProductOffer,
  createCategoryOffer,
  removeOffer,
  assignProductOffer,
  removeProductOffer
};
