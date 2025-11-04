const Offer = require('../models/offerSchema');

const applyBestOfferToProduct = async (product) => {
  try {
    const now = new Date();

    const productOffer = await Offer.findOne({
      offerType: 'product',
      product: product._id,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).lean();

    const categoryOffer = await Offer.findOne({
      offerType: 'category',
      category: product.category,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).lean();

    let finalPrice = product.price;
    let appliedOffer = null;

    const productDiscount = productOffer
      ? (productOffer.discountType === 'percentage'
          ? (product.price * productOffer.discountValue) / 100
          : productOffer.discountValue)
      : 0;

    const categoryDiscount = categoryOffer
      ? (categoryOffer.discountType === 'percentage'
          ? (product.price * categoryOffer.discountValue) / 100
          : categoryOffer.discountValue)
      : 0;

    const bestDiscount = Math.max(productDiscount, categoryDiscount);

    if (bestDiscount > 0) {
      finalPrice = Math.max(product.price - bestDiscount, 0);
      appliedOffer =
        bestDiscount === categoryDiscount && categoryOffer
          ? categoryOffer
          : productOffer;
    }

    product.finalPrice = finalPrice;
    product.appliedOffer = appliedOffer
      ? {
          title: appliedOffer.title,
          discountValue: appliedOffer.discountValue,
          discountType: appliedOffer.discountType,
          offerType: appliedOffer.offerType,
        }
      : null;

    return product;
  } catch (error) {
    console.error('Error applying offer to product:', error);
    return product;
  }
};

module.exports = { 
    applyBestOfferToProduct 
};
