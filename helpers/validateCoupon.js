const Coupon = require("../models/couponSchema");

const validateCoupon = async (sessionCoupon, subtotal) => {
  if (!sessionCoupon) return { valid: true };

  const coupon = await Coupon.findOne({ code: sessionCoupon.code });

  if (!coupon) {
    return { valid: false, message: "Coupon does not exist." };
  }

  if (!coupon.isActive) {
    return { valid: false, message: "Coupon is no longer active." };
  }

  if (coupon.expiryDate && coupon.expiryDate < new Date()) {
    return { valid: false, message: "Coupon has expired." };
  }

  if (subtotal !== undefined && subtotal < coupon.minPurchase) {
    return {
      valid: false,
      message: `Minimum purchase required: ₹${coupon.minPurchase}.`,
    };
  }

  return { valid: true, coupon };
};

module.exports = validateCoupon;
