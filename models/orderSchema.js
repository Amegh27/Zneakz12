// models/orderSchema.js
const mongoose = require("mongoose");
const { nanoid } = require("nanoid");

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  size: {
    type: String,
  },
  price: {
    type: Number,
    required: true,
  },
  status: { 
    type: String, 
    enum: ["Ordered", "Cancelled", "Returned"], 
    default: "Ordered" 
  },
  cancelReason: String,
  returnReason: String
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  orderID: { type: String, default: () => nanoid(10), unique: true }, 
    items: [orderItemSchema],

    address: {
    name: String,
    city: String,
    state: String,
    pincode: String
    },

    paymentMethod: {
      type: String,
      enum: ["Cash on Delivery", "Razorpay", "Wallet"],
      default: "Cash on Delivery",
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["Placed", "Shipped", "Delivered", "Cancelled"],
      default: "Placed",
    },

    placedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
