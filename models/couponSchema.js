const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true,
    unique: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'flat'],
    default: 'percentage'
  },
  discountValue: {
    type: Number,
    required: true
  },
  minPurchase: {
    type: Number,
    required: true
  },
  expiryDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
   usageLimit: { type: Number, default: 0 }, 
  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

module.exports = mongoose.model('Coupon', couponSchema);
