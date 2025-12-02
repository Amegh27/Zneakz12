const Coupon = require('../../models/couponSchema');

const getAllCoupons = async (req, res) => {
  try {
    const now = new Date();

    await Coupon.updateMany(
      { expiryDate: { $lt: now }, isActive: true },
      { $set: { isActive: false } }
    );

    const coupons = await Coupon.find().sort({ createdAt: -1 });

    res.render('coupons', { coupons });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching coupons');
  }
};


const createCoupon = async (req, res) => {
  try {
    const { name, code, discountValue, minPurchase, expiryDate,maxAmount  } = req.body;

    if (!name || !code || !discountValue || !minPurchase || !expiryDate) {
      return res.json({ success: false, message: 'All fields are required' });
    }

    if (discountValue < 1 || discountValue > 80) {
      return res.json({
        success: false,
        message: 'Discount must be between 1% and 80%',
      });
    }
    if (!maxAmount || maxAmount < 1) {
  return res.json({ success: false, message: 'Max amount is required' });
}

    const existingCoupon = await Coupon.findOne({
      $or: [{ name: name.trim() }, { code: code.trim().toUpperCase() }]
    });
    if (existingCoupon) {
      return res.json({ success: false, message: 'Coupon with same name or code already exists' });
    }

      const exp = new Date(expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (exp < today) {
      return res.json({ success: false, message: 'Expiry date cannot be in the past' });
    }

    const coupon = new Coupon({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      discountType: 'percentage',
      discountValue,
      minPurchase,
      maxAmount,
      expiryDate
    });

    await coupon.save();
    res.json({ success: true, message: 'Coupon created successfully!' });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: 'Server error while creating coupon' });
  }
};

const editCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, discountValue, minPurchase, expiryDate,maxAmount  } = req.body;

    if (discountValue < 1 || discountValue > 80) {
  return res.json({
    success: false,
    message: 'Discount must be between 1% and 80%',
  });
}


    const existingCoupon = await Coupon.findOne({
      $or: [{ name: name.trim() }, { code: code.trim() }],
      _id: { $ne: id } 
    });
    if (existingCoupon) {
      return res.json({ success: false, message: 'Coupon with same name or code already exists' });
    }

    const now = new Date();
    const exp = new Date(expiryDate);
    if (exp < now.setHours(0, 0, 0, 0)) {
      return res.json({ success: false, message: 'Expiry date cannot be in the past' });
    }

    const updated = await Coupon.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        discountValue,
        minPurchase,
        maxAmount,
        expiryDate
      },
      { new: true }
    );

    if (!updated) return res.json({ success: false, message: 'Coupon not found' });

    return res.json({ success: true, message: 'Coupon updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error while updating coupon' });
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
    if (!coupon) return res.status(404).send('Coupon not found');

    coupon.isActive = !coupon.isActive;

    await coupon.save({ validateBeforeSave: false }); 

    res.redirect('/admin/coupons');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error updating coupon status');
  }
};


module.exports = {
  getAllCoupons,
  createCoupon,
  editCoupon,
  deleteCoupon,
  toggleCouponStatus
};
