const Coupon = require('../../models/couponSchema');

const getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.render('coupons', { coupons });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching coupons');
  }
};

const createCoupon = async (req, res) => {
  try {
    const {
      name,
      code,
      discountType,
      discountValue,
      minPurchase,
      maxDiscount,
      expiryDate,
    } = req.body;

    const existing = await Coupon.findOne({ code });
    if (existing) return res.status(400).send('Coupon code already exists');

    const coupon = new Coupon({
      name,
      code,
      discountType,
      discountValue,
      minPurchase,
      maxDiscount,
      expiryDate,
    });

    await coupon.save();
    res.redirect('/admin/coupons');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error creating coupon');
  }
};

const deleteCoupon = async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.redirect('/admin/coupons');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error deleting coupon');
  }
};

const toggleCouponStatus = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.redirect('/admin/coupons');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error updating coupon status');
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { code, totalAmount } = req.body;

    const coupon = await Coupon.findOne({ code, isActive: true });
    if (!coupon) return res.json({ success: false, message: 'Invalid coupon code' });

    const now = new Date();
    if (coupon.expiryDate < now)
      return res.json({ success: false, message: 'Coupon expired' });

    if (totalAmount < coupon.minPurchase)
      return res.json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required`,
      });

    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = (coupon.discountValue / 100) * totalAmount;
    } else if (coupon.discountType === 'flat') {
      discount = coupon.discountValue;
    }

    if (discount > coupon.maxDiscount) discount = coupon.maxDiscount;

    const newTotal = totalAmount - discount;

    return res.json({
      success: true,
      code: coupon.code,
      discount,
      newTotal,
      message: 'Coupon applied successfully',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getAllCoupons,
  createCoupon,
  deleteCoupon,
  toggleCouponStatus,
  applyCoupon,
};
